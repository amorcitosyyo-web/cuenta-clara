// Shared financial-agent orchestration.  Telegram and the web adviser call
// this module; this is intentionally the only place that lets a model request
// a write.  The model proposes a tool call, while this module applies policy,
// validates the action and records an auditable result.
const { executeAction } = require("./action-tools");
const { getCategories, makeId } = require("./_agent");
const { expensesByCategory } = require("./expense-allocations");
const { parseExpenseRequest, isExpenseRequest } = require("./expense-recorder");

const CONFIRMATION_REQUIRED = new Set([
  "record_income", "create_account", "update_account", "record_account_balance",
  "create_card", "update_card", "record_card_statement", "plan_transfer",
  "confirm_transfer", "create_monthly_plan", "update_monthly_plan", "apply_financial_plan", "set_budget",
  "create_category", "update_category", "delete_category", "create_saving_goal",
  "update_saving_goal", "delete_saving_goal", "transfer_saving", "create_scheduled_payment",
  "mark_scheduled_paid", "delete_scheduled_payment", "delete_movement", "delete_pending",
  "restore_trash", "apply_financial_plan",
]);

const WRITE_TOOLS = new Set([
  ...CONFIRMATION_REQUIRED, "create_movement", "update_movement", "accept_pending",
]);

// This schema is shared by the prompt builder and the Responses API caller.
// Keep it module-scoped: askModel runs independently of buildAgentMessages.
const FINANCIAL_ACTION_TOOL = {
  type: "function",
  name: "financial_action",
  description: "Proponer una acción usando datos financieros. Nunca usar para eliminar sin solicitud expresa.",
  parameters: {
    type: "object",
    properties: {
      type: { type: "string", enum: [...WRITE_TOOLS] },
      data: { type: "object" },
    },
    required: ["type", "data"],
  },
};

function normalizeText(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function costaRicaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function cycleFor(date = costaRicaDate()) {
  const [year, month, day] = date.split("-").map(Number);
  const start = day >= 7 ? new Date(Date.UTC(year, month - 1, 7)) : new Date(Date.UTC(year, month - 2, 7));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 6));
  const stamp = (value) => value.toISOString().slice(0, 10);
  return { id: `${stamp(start)}:${stamp(end)}`, start: stamp(start), end: stamp(end) };
}

function taskKey(channel, conversationId) { return `${channel}:${conversationId}`; }

function getTask(state, channel, conversationId) {
  return state.agentMemory?.activeTasks?.[taskKey(channel, conversationId)] || null;
}

function setTask(state, channel, conversationId, task) {
  state.agentMemory.activeTasks = state.agentMemory.activeTasks || {};
  const key = taskKey(channel, conversationId);
  if (task) state.agentMemory.activeTasks[key] = { ...task, updatedAt: new Date().toISOString() };
  else delete state.agentMemory.activeTasks[key];
}

function householdSnapshot(state) {
  const today = costaRicaDate();
  const month = today.slice(0, 7);
  const expenses = (state.movements || []).filter((item) => item.type === "expense" && String(item.date || "").startsWith(month));
  const income = (state.movements || []).filter((item) => item.type === "income" && String(item.date || "").startsWith(month));
  const sum = (items) => items.reduce((total, item) => total + Number(item.amount || 0), 0);
  const spendingByCategory = Object.entries(expensesByCategory(expenses, getCategories(state)))
    .sort(([, left], [, right]) => right - left).slice(0, 8).map(([category, amount]) => ({ category, amount }));
  return {
    today, month, cycle: cycleFor(today),
    totals: { income: sum(income), expense: sum(expenses), available: sum(income) - sum(expenses) },
    spendingByCategory,
    accounts: (state.accounts || []).map((item) => ({ id: item.id, name: item.name, purpose: item.purpose, operatingContext: item.operatingContext || {}, minimumBalance: item.minimumBalance, targetBalance: item.targetBalance })),
    cards: (state.cards || []).map((item) => ({ id: item.id, name: item.name, purpose: item.purpose, dueDay: item.dueDay, cutoffDay: item.cutoffDay, statement: (item.statements || []).slice(-1)[0] || null })),
    budgets: state.budgets || {}, goals: state.savingsAccounts || [], payments: state.scheduledPayments || [],
    pending: state.pendingMovements || [], recent: (state.movements || []).slice(0, 18),
    profile: state.agentMemory?.householdProfile || {},
  };
}

function menu() {
  return {
    text: ["📋 Menú de Cuenta Clara", "", "Puedes escribirme en tus propias palabras o elegir una opción.", "", "También puedo analizar fotos, PDF, Excel y CSV."].join("\n"),
    buttons: [
      [{ text: "🗓️ Planificar el mes", callback_data: "agent:plan" }],
      [{ text: "📬 Leer correo", callback_data: "menu:email" }, { text: "📊 Estado financiero", callback_data: "agent:status" }],
      [{ text: "➕ Registrar gasto", callback_data: "menu:add" }, { text: "💵 Registrar ingreso", callback_data: "agent:income" }],
      [{ text: "🏦 Cuentas y tarjetas", callback_data: "agent:accounts" }, { text: "📅 Pagos pendientes", callback_data: "menu:scheduled" }],
      [{ text: "🎯 Metas y ahorros", callback_data: "menu:goals" }, { text: "📑 Reportes", callback_data: "menu:reports" }],
    ],
  };
}

function isNewTopic(text, task) {
  if (!task?.kind) return false;
  const normalized = normalizeText(text);
  if (!normalized || /^(si|sí|no|cancelar|continuar|pausar|ok|dale)$/.test(normalized)) return false;
  const hints = { movement: /\b(reporte|correo|planificar|cuenta|tarjeta|meta|presupuesto)\b/, income: /\b(reporte|correo|planificar|gasto|cuenta|tarjeta)\b/, planning: /\b(reporte|correo|gasto|factura)\b/ };
  return Boolean(hints[task.kind]?.test(normalized));
}

function findDuplicate(state, data) {
  const merchant = normalizeText(data.merchant);
  const amount = Number(data.amount || 0);
  const date = String(data.date || "").slice(0, 10);
  return (state.movements || []).find((item) =>
    normalizeText(item.merchant) === merchant && Number(item.amount || 0) === amount && String(item.date || "").slice(0, 10) === date
  ) || null;
}

function clearAutomaticExpense(data) {
  return data.type === "expense" && ["gmail", "receipt", "document", "csv", "xlsx"].includes(String(data.source || "")) && Number(data.confidence || 0) >= 0.9;
}

function deleteMovementRequest(text, state) {
  const normalized = normalizeText(text);
  if (!/\b(elimina|eliminar|borra|borrar|quita|quitar)\b/.test(normalized)) return null;
  // Do not interpret a request about a category, goal, scheduled payment or
  // account as a movement deletion. Those have their own audited tools.
  if (/\b(categoria|meta|ahorro|cuenta|tarjeta|pago programado)\b/.test(normalized)) return null;
  const candidates = (state.movements || []).filter((movement) => {
    if (movement.type === "saving") return false;
    const merchant = normalizeText(movement.merchant);
    return merchant.length >= 3 && (normalized.includes(merchant) || merchant.includes(normalized.replace(/\b(elimina|eliminar|borra|borrar|quita|quitar|el|la|el gasto|movimiento|compra|transaccion|ingreso|de|por|crc)\b/g, "").replace(/\s+/g, " ").trim()));
  });
  if (candidates.length === 1) return { status: "ready", movement: candidates[0] };

  const numberTokens = String(text || "").match(/\d[\d.,]*/g) || [];
  const amounts = numberTokens.map(parseFinancialAmount).filter((amount) => amount !== null);
  const amount = amounts.length ? amounts.at(-1) : null;
  const byAmount = amount === null ? [] : (state.movements || []).filter((movement) => movement.type !== "saving" && Math.abs(Number(movement.amount || 0) - amount) < 0.01);
  if (byAmount.length === 1) return { status: "ready", movement: byAmount[0] };
  if (candidates.length > 1 || byAmount.length > 1) return { status: "ambiguous", text: "Encontré más de un movimiento parecido. Dime el comercio exacto o responde citando el movimiento que quieres eliminar." };
  return { status: "missing", text: "No encontré ese movimiento. Dime el comercio y el monto, por ejemplo: “elimina PriceSmart por ₡217.566,83”." };
}

function parseFinancialAmount(value) {
  const raw = String(value || "").replace(/[^\d.,-]/g, "");
  if (!raw) return null;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  const decimal = comma > dot ? "," : ".";
  const normalized = raw.replace(new RegExp(`\\${decimal === "," ? "." : ","}`, "g"), "").replace(decimal, ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function confirmation(state, channel, conversationId, action, label, actor) {
  const id = makeId();
  state.agentMemory.pendingActions = state.agentMemory.pendingActions || {};
  state.agentMemory.pendingActions[taskKey(channel, conversationId)] = {
    id, action: { ...action, actor, channel, idempotencyKey: id }, type: action.type, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 24 * 3600000).toISOString(),
  };
  return { text: `⚠️ Necesito confirmación antes de continuar.\n\n${label}\n\nHasta que confirmen o cancelen, esta acción no se ejecutará.`, buttons: [[{ text: "✅ Sí, confirmar", callback_data: `agent:confirm:${id}` }, { text: "❌ Cancelar", callback_data: `agent:cancel:${id}` }]] };
}

function executeProposedAction({ state, channel, conversationId, actor, action }) {
  const type = String(action?.type || "");
  if (!WRITE_TOOLS.has(type)) return { text: "No reconozco esa acción financiera." };
  const data = action.data || action;
  if (type === "create_movement") {
    const duplicate = findDuplicate(state, data);
    if (duplicate) return { text: `⚠️ Ya existe ${duplicate.merchant} por CRC ${Number(duplicate.amount).toFixed(2)} el ${duplicate.date}. ¿Es el mismo gasto?`, duplicateId: duplicate.id };
    if (!clearAutomaticExpense(data)) return confirmation(state, channel, conversationId, action, `Voy a registrar ${data.merchant || "un movimiento"} por CRC ${Number(data.amount || 0).toFixed(2)}.`, actor);
  }
  if (type === "update_movement" && !data.clearCorrection) return confirmation(state, channel, conversationId, action, "Voy a actualizar ese movimiento.", actor);
  if (CONFIRMATION_REQUIRED.has(type)) return confirmation(state, channel, conversationId, action, summaryForAction(action), actor);
  const { result } = executeAction(state, { ...action, actor, channel, idempotencyKey: makeId() });
  const undoId = rememberUndo(state, type, result, actor, channel);
  return { text: `✅ Listo. ${describeResult(type, result)}`, buttons: undoId ? [[{ text: "↩️ Deshacer", callback_data: `agent:undo:${undoId}` }, { text: "✏️ Editar", callback_data: `agent:edit:${result.id}` }]] : [] };
}

function rememberUndo(state, type, result, actor, channel) {
  if (!result?.id || !["create_movement", "update_movement", "accept_pending"].includes(type)) return null;
  const id = makeId();
  state.agentMemory.undoActions = state.agentMemory.undoActions || {};
  state.agentMemory.undoActions[id] = { id, type, targetId: result.id, actor, channel, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() };
  return id;
}

function undoAction(state, undoId, actor, channel) {
  const entry = state.agentMemory?.undoActions?.[undoId];
  if (!entry || entry.channel !== channel || Date.parse(entry.expiresAt) < Date.now()) return { text: "Ese cambio ya no se puede deshacer." };
  const movement = (state.movements || []).find((item) => item.id === entry.targetId);
  if (!movement) return { text: "Ese movimiento ya no existe." };
  executeAction(state, { type: "delete_movement", id: movement.id, actor, channel, idempotencyKey: makeId() });
  delete state.agentMemory.undoActions[undoId];
  return { text: `↩️ Deshice ${movement.merchant || "el movimiento"}. Quedó en papelera durante 30 días.` };
}

function summaryForAction(action) {
  const data = action.data || action;
  const names = { record_income: "Registrar el ingreso", plan_transfer: "Proponer la transferencia", confirm_transfer: "Confirmar la transferencia", set_budget: "Actualizar el presupuesto", create_saving_goal: "Crear la meta", update_saving_goal: "Actualizar la meta", delete_saving_goal: "Eliminar la meta", transfer_saving: "Mover dinero de ahorro", create_scheduled_payment: "Crear el pago programado", mark_scheduled_paid: "Marcar el pago como realizado", delete_movement: "Eliminar el movimiento", create_account: "Crear la cuenta", create_card: "Crear la tarjeta", create_monthly_plan: "Aplicar el plan mensual", apply_financial_plan: "Guardar la configuración y el borrador del plan" };
  return `${names[action.type] || "Aplicar este cambio"}${data.name ? `: ${data.name}` : ""}.`;
}

function describeResult(type, result) {
  if (type === "create_movement" || type === "record_income") return `${result.merchant || "El movimiento"} quedó registrado por CRC ${Number(result.amount || 0).toFixed(2)}.`;
  if (type === "update_movement") return `${result.merchant || "El movimiento"} quedó actualizado.`;
  return "Guardé el cambio.";
}

function planningPrompt(state, channel, conversationId) {
  const cycle = cycleFor();
  setTask(state, channel, conversationId, { kind: "planning", cycle, phase: "account_count", accounts: [], cards: [], startedAt: new Date().toISOString() });
  return { text: `🗓️ Organicemos el ciclo ${cycle.start} al ${cycle.end}. No registraré dinero ni transferencias hasta que aprueben el resumen final.\n\nEmpecemos por las cuentas. De cada una quiero entender: cómo se llama, para qué la usan, el saldo actual y cuánto prefieren dejar ahí. Puedes explicármelo con tus palabras y una por una; no hace falta que respondas en un formato ni que sepas todo desde el inicio.\n\n¿Cuál es la primera cuenta y cómo la manejan?` };
}

function planMoney(value) {
  const token = String(value || "").match(/-?\d[\d.,]*/)?.[0]; if (!token) return null;
  const clean = token.replace(/[^\d.,-]/g, ""); const comma = clean.lastIndexOf(","); const dot = clean.lastIndexOf("."); const decimal = comma > dot ? "," : ".";
  const result = Number(clean.replace(new RegExp(`\\${decimal === "," ? "." : ","}`, "g"), "").replace(decimal, ".")); return Number.isFinite(result) ? result : null;
}
function planCount(value) { const result = Number(String(value || "").match(/\b(10|[0-9])\b/)?.[1]); return Number.isInteger(result) && result >= 0 && result <= 10 ? result : null; }
function planName(value) {
  const parts = String(value || "").trim().split(/\s*(?:—|–|-|:|\bpara\b)\s*/i).filter(Boolean); const name = String(parts.shift() || "").trim();
  return name.length >= 2 ? { name, purpose: parts.join(" — ").trim() || "Sin propósito indicado" } : null;
}
function planAccountIntroduction(value) {
  const text = String(value || "").trim();
  const parts = text.split(/\s*(?:—|–|-|:)\s*/).filter(Boolean);
  const name = String(parts.shift() || "").trim();
  if (name.length < 2) return null;
  return { name, purpose: parts.join(" — ").trim() };
}
function accountOperatingContext(explanation) {
  const description = String(explanation || "").trim();
  const text = normalizeText(description);
  const includes = (...terms) => terms.some((term) => text.includes(term));
  return {
    description,
    roles: [
      includes("ingreso", "salario", "comision", "comisión", "recib") ? "recibe ingresos" : "",
      includes("pago", "pagam", "factura", "alquiler", "servicio", "debito", "débito") ? "paga compromisos" : "",
      includes("tarjeta", "corte") ? "respalda tarjetas" : "",
      includes("ahorro", "meta", "emergencia") ? "ahorro o reserva" : "",
      includes("transfer", "sinpe") ? "transferencias" : "",
    ].filter(Boolean),
    protectedFunds: includes("no tocar", "no se toca", "reserva", "minimo", "mínimo", "emergencia"),
  };
}
function planningQuestionReply(task, answer) {
  const text = normalizeText(answer);
  // Do not confuse ordinary narrative such as "lo que sale de esta cuenta"
  // with a question. That was making the planner ignore complete account
  // explanations merely because they contained the word "que".
  if (!/[?¿]/.test(answer) && !/^(por que|porque|que ocupas|que necesitas|como funciona|explicame|para que)/.test(text)) return null;
  if (task.phase === "account_count" || task.phase === "account_details" || task.phase === "account_purpose" || task.phase === "more_accounts") {
    return { text: "Quiero entender cómo se mueve el dinero entre sus cuentas para no asumir nada: nombre, para qué la usan, saldo actual y el mínimo que desean dejar. Sí: puedes darme primero el nombre y explicarme cómo funciona; después te pediré solo el dato que falte." };
  }
  if (task.phase === "account_balance") return { text: `El saldo actual de ${task.currentAccount?.name || "esa cuenta"} me permite comparar lo que hay con lo que esperan dejar y detectar diferencias. Si no lo sabes ahora, puedes decir “aún no sé”.` };
  if (task.phase === "account_minimum") return { text: "El mínimo es el dinero que no quieren tocar en esa cuenta. Si no tienen uno, responde 0; si prefieren decidirlo después, di “aún no sé”." };
  if (task.phase.startsWith("card")) return { text: "Las tarjetas se registran aparte porque una compra ya es gasto y pagar la tarjeta es una transferencia, no otro gasto. Por eso necesito distinguirlas de las cuentas." };
  if (task.phase === "salary" || task.phase === "commission") return { text: "Separo salario y comisión para no usar ingresos variables para cubrir pagos obligatorios. Si todavía no sabes el monto, puedes decir “aún no sé”; lo dejaremos pendiente, no inventado." };
  return { text: "Te explico lo que necesites antes de avanzar. No voy a guardar ni mover dinero hasta que vean y aprueben el resumen final." };
}
function accountFromStory(name, purpose) {
  return { name, purpose, operatingContext: accountOperatingContext(purpose), balance: 0, balanceKnown: false, minimumBalance: 0 };
}
function accountStoryFromNarrative(value) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  const text = normalizeText(raw);
  const accounts = [];
  const add = (name, purpose) => {
    const key = normalizeText(name);
    if (name && !accounts.some((item) => normalizeText(item.name) === key)) accounts.push(accountFromStory(name, purpose));
  };
  if (/(cuenta personal.*\bmulti\b|\bmulti\b.*cuenta personal)/.test(text)) {
    add("Cuenta personal Multi", "Aquí se manejan mis pagos de salario; al cierre del mes se transfiere dinero a la cuenta de la casa.");
  }
  if (/pareja|ahorro/.test(text) && /cuenta/.test(text)) {
    add("Cuenta en pareja / ahorro", "Aquí se mantienen los ahorros y el dinero de la casa para pagar a los propietarios.");
  }
  if (/\bbac\b/.test(text) && /kelia/.test(text)) {
    add("BAC — pagos de Kelia", "En esta cuenta entran únicamente los pagos de Kelia.");
  }
  if (/gastos? fijos?/.test(text)) add("Cuenta de gastos fijos", "Se usa para los gastos fijos del hogar.");
  if (/gastos? (?:variables?|bariables?)/.test(text)) add("Cuenta de gastos variables", "Se usa para los gastos variables del hogar.");
  return { raw, accounts };
}
function formatAccountStory(story) {
  const lines = story.accounts.map((item, index) => `${index + 1}. ${item.name}: ${item.purpose}`);
  const ambiguity = story.accounts.some((item) => item.name === "Cuenta en pareja / ahorro")
    ? "\n\nHay una cosa que quiero confirmar: entendí que la cuenta en pareja se usa tanto para ahorro como para guardar el dinero de la casa antes de pagar propietarios. ¿Es la misma cuenta?"
    : "";
  return `Esto fue lo que entendí de cómo manejan las cuentas:\n\n${lines.join("\n")}\n${ambiguity}\n\n¿Está bien este mapa? Puedes decir “sí” o corregirme con naturalidad; todavía no guardaré nada.`;
}
function planSummary(task, state) {
  const fixed = (state.scheduledPayments || []).filter((item) => item.active !== false).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const balances = task.accounts.reduce((sum, item) => sum + Number(item.balance || 0), 0); const incomes = Number(task.salaryPlanned || 0) + Number(task.commissionPlanned || 0);
  return ["🧾 Resumen para aprobar — todavía no guardaré nada", "", `Ciclo: ${task.cycle.start} al ${task.cycle.end}`, "Cuentas y cómo las manejan:", ...task.accounts.map((item) => `• ${item.name}: ${item.purpose || "sin contexto indicado"}. Saldo: ${item.balanceKnown === false ? "pendiente" : `CRC ${Number(item.balance).toFixed(2)}`}; mínimo: CRC ${Number(item.minimumBalance || 0).toFixed(2)}.`), `Tarjetas: ${task.cards.map((item) => item.name).join(" · ") || "ninguna"}`, `Salario planificado: CRC ${Number(task.salaryPlanned || 0).toFixed(2)}`, `Comisión planificada: CRC ${Number(task.commissionPlanned || 0).toFixed(2)}`, `Pagos programados: CRC ${fixed.toFixed(2)}`, `Saldos reportados + ingresos planificados: CRC ${(balances + incomes).toFixed(2)}`, task.otherCommitments ? `Compromisos adicionales: ${task.otherCommitments}` : "Sin compromisos adicionales indicados.", "", "¿Quieres guardar la configuración y el borrador del plan? Los ingresos quedan planificados hasta que confirmes los traslados."].join("\n");
}
function continuePlanning(state, channel, conversationId, text, actor, history = []) {
  const task = getTask(state, channel, conversationId); if (task?.kind !== "planning") return null;
  const answer = String(text || "").trim(); if (/^(cancelar|cancela)$/i.test(answer)) { setTask(state, channel, conversationId, null); return { text: "❌ Cancelé la planificación. No guardé nada." }; }
  // A long narrative is a valuable answer, not an invalid form submission.
  // Capture every account we can identify, then let the household correct the
  // summary before asking for balances or card details.
  if (task.phase === "account_count") {
    const story = accountStoryFromNarrative(answer);
    if (story.accounts.length >= 2) {
      task.storyAccounts = story.accounts; task.storyRaw = story.raw; task.phase = "account_story_review";
      setTask(state, channel, conversationId, task); return { text: formatAccountStory(story) };
    }
    if (/(arriba|anterior|contexto|lo que te dije)/.test(normalizeText(answer))) {
      const priorText = (history || []).filter((entry) => entry?.role !== "assistant").map((entry) => entry?.text || "").slice(-4).join("\n");
      const priorStory = accountStoryFromNarrative(priorText);
      if (priorStory.accounts.length >= 2) { task.storyAccounts = priorStory.accounts; task.storyRaw = priorStory.raw; task.phase = "account_story_review"; setTask(state, channel, conversationId, task); return { text: formatAccountStory(priorStory) }; }
    }
  }
  const questionReply = planningQuestionReply(task, answer); if (questionReply) return questionReply;
  if (task.phase === "account_story_review") {
    if (/^(si|sí|correcto|asi es|así es|exacto|dale|continua|continuar)$/i.test(answer)) {
      task.accounts = task.storyAccounts || []; task.accountIndex = 0; task.phase = "account_story_balance";
      setTask(state, channel, conversationId, task);
      const current = task.accounts[0];
      return { text: `Perfecto. Ya guardé el mapa como borrador, todavía sin aplicarlo. Empecemos a aterrizarlo: ¿cuál es el saldo actual de ${current.name}? Si no lo sabes ahora, dilo y seguimos con otra cuenta.` };
    }
    const revised = accountStoryFromNarrative(answer);
    if (revised.accounts.length) { task.storyAccounts = revised.accounts; task.storyRaw = revised.raw; setTask(state, channel, conversationId, task); return { text: formatAccountStory(revised) }; }
    return { text: "No necesito que uses un formato. Dime qué parte entendí mal o qué cuenta falta, por ejemplo: “la cuenta en pareja no es ahorro; el ahorro va aparte”." };
  }
  if (task.phase === "account_count") {
    const count = planCount(answer);
    if (count !== null && count > 0) { task.accountCount = count; task.accountIndex = 0; task.phase = "account_details"; setTask(state, channel, conversationId, task); return { text: `Perfecto. Cuéntame de la primera cuenta: nombre y para qué la usan. Ejemplo: “BAC principal — pagos del hogar”.` }; }
    const account = planAccountIntroduction(answer);
    if (!account) return { text: "Puedes decirme el nombre de la primera cuenta —por ejemplo “BAC principal”— y luego me explicas cómo la usan. Si prefieres, también puedes decir cuántas cuentas son." };
    task.currentAccount = { ...account, operatingContext: account.purpose ? accountOperatingContext(account.purpose) : {} };
    task.accountCount = null;
    task.phase = account.purpose ? "account_balance" : "account_purpose";
    setTask(state, channel, conversationId, task);
    return account.purpose ? { text: `Entendido: ${account.name} es para ${account.purpose}. ¿Cuál es el saldo actual? Si no lo sabes, di “aún no sé”.` } : { text: `Perfecto, ${account.name}. Cuéntame cómo funciona con libertad: qué dinero entra, qué pagos salen, si respalda una tarjeta o ahorro, y cualquier dinero que no se deba tocar.` };
  }
  if (task.phase === "account_details") { const account = planName(answer); if (!account) return { text: "Dime el nombre de la cuenta y, si quieres, cómo la usan. También puedo ir una por una contigo." }; task.currentAccount = { ...account, operatingContext: account.purpose !== "Sin propósito indicado" ? accountOperatingContext(account.purpose) : {} }; task.phase = account.purpose !== "Sin propósito indicado" ? "account_balance" : "account_purpose"; setTask(state, channel, conversationId, task); return task.phase === "account_balance" ? { text: `Entendido: ${account.name} es para ${account.purpose}. ¿Cuál es el saldo actual?` } : { text: `Perfecto, ${account.name}. Cuéntame cómo funciona: qué entra, qué sale, si respalda una tarjeta o ahorro y qué dinero no se toca.` }; }
  if (task.phase === "account_purpose") { if (/^(aun no se|aún no sé|no se|no sé|omitir)$/i.test(answer)) task.currentAccount.purpose = "Sin propósito indicado"; else task.currentAccount.purpose = answer; task.currentAccount.operatingContext = accountOperatingContext(task.currentAccount.purpose); task.phase = "account_balance"; setTask(state, channel, conversationId, task); return { text: `Guardé esa lógica para ${task.currentAccount.name}. ¿Cuál es el saldo actual? Si aún no lo sabes, escribe “aún no sé”.` }; }
  if (task.phase === "account_balance") { const balance = /^(aun no se|aún no sé|no se|no sé|omitir)$/i.test(answer) ? null : planMoney(answer); if (balance === null && !/^(aun no se|aún no sé|no se|no sé|omitir)$/i.test(answer)) return { text: "Dime el saldo como monto, por ejemplo ₡125000, o di “aún no sé”." }; task.currentAccount.balance = balance || 0; task.currentAccount.balanceKnown = balance !== null; task.phase = "account_minimum"; setTask(state, channel, conversationId, task); return { text: `¿Cuál es el saldo mínimo que quieren dejar en ${task.currentAccount.name}? Escribe 0 si no aplica o “aún no sé”.` }; }
  if (task.phase === "account_minimum") { const minimumBalance = /^(aun no se|aún no sé|no se|no sé|omitir)$/i.test(answer) ? 0 : planMoney(answer); if (minimumBalance === null || minimumBalance < 0) return { text: "Dime un saldo mínimo válido, 0 si no aplica, o “aún no sé”." }; task.accounts.push({ ...task.currentAccount, minimumBalance }); delete task.currentAccount; task.accountIndex = Number(task.accountIndex || 0) + 1; if (task.accountCount && task.accountIndex < task.accountCount) { task.phase = "account_details"; setTask(state, channel, conversationId, task); return { text: `Ahora cuéntame de la cuenta ${task.accountIndex + 1}: nombre y cómo la usan.` }; } if (!task.accountCount) { task.phase = "more_accounts"; setTask(state, channel, conversationId, task); return { text: "¿Usan otra cuenta operativa? Puedes decirme su nombre directamente, o responder “no” para pasar a las tarjetas." }; } task.phase = "card_count"; setTask(state, channel, conversationId, task); return { text: "Ahora pasemos a tarjetas: ¿cuántas de crédito usan? Responde 0 si no tienen." }; }
  if (task.phase === "account_story_balance") {
    const current = task.accounts[task.accountIndex];
    const unknown = /^(aun no se|aún no sé|no se|no sé|omitir)$/i.test(answer);
    const balance = unknown ? 0 : planMoney(answer);
    if (balance === null) return { text: `Para ${current.name}, dime el saldo si lo tienes; si no, di “aún no sé”. No hace falta que detengamos toda la planificación.` };
    current.balance = balance; current.balanceKnown = !unknown;
    task.phase = "account_story_minimum"; setTask(state, channel, conversationId, task);
    return { text: `¿Qué monto prefieren no tocar en ${current.name}? Puede ser 0 o “aún no sé”.` };
  }
  if (task.phase === "account_story_minimum") {
    const current = task.accounts[task.accountIndex]; const unknown = /^(aun no se|aún no sé|no se|no sé|omitir)$/i.test(answer);
    const minimum = unknown ? 0 : planMoney(answer);
    if (minimum === null || minimum < 0) return { text: `Dime un mínimo válido para ${current.name}, 0 si no aplica, o “aún no sé”.` };
    current.minimumBalance = minimum; task.accountIndex += 1;
    if (task.accountIndex < task.accounts.length) { task.phase = "account_story_balance"; setTask(state, channel, conversationId, task); return { text: `Siguiente: ${task.accounts[task.accountIndex].name}. ¿Cuál es el saldo actual? Si no lo tienes, di “aún no sé”.` }; }
    task.phase = "card_count"; setTask(state, channel, conversationId, task); return { text: "Ya entendí el mapa de cuentas. Ahora hablemos de tarjetas: ¿cuántas usan? Puedes decir el número o nombrármelas." };
  }
  if (task.phase === "more_accounts") { if (/^(no|ninguna|ninguno|no mas|no más)$/i.test(answer)) { task.phase = "card_count"; setTask(state, channel, conversationId, task); return { text: "Perfecto. Ahora pasemos a tarjetas: ¿cuántas de crédito usan? Responde 0 si no tienen." }; } const account = planAccountIntroduction(answer.replace(/^si[:,\s]*/i, "")); if (!account) return { text: "Dime el nombre de la otra cuenta y cómo la usan, o responde “no” si ya terminamos con cuentas." }; task.currentAccount = { ...account, operatingContext: account.purpose ? accountOperatingContext(account.purpose) : {} }; task.phase = account.purpose ? "account_balance" : "account_purpose"; setTask(state, channel, conversationId, task); return task.phase === "account_balance" ? { text: `Entendido: ${account.name} es para ${account.purpose}. ¿Cuál es el saldo actual?` } : { text: `Perfecto, ${account.name}. Cuéntame qué entra y sale, si respalda una tarjeta o ahorro, y cualquier regla para no usarla mal.` }; }
  if (task.phase === "card_count") { const count = planCount(answer); if (count === null) return { text: "Responde con el número de tarjetas, o 0." }; task.cardCount = count; task.cardIndex = 0; task.phase = count ? "card_details" : "salary"; setTask(state, channel, conversationId, task); return count ? `Tarjeta 1 de ${count}: escribe nombre y propósito.` : "Paso 3 de 6 — ¿Cuánto salario acumulado tendrán disponible para este ciclo? Escribe 0 si aún no lo sabes."; }
  if (task.phase === "card_details") { const card = planName(answer); if (!card) return { text: "Escribe el nombre y propósito de la tarjeta." }; task.currentCard = card; task.phase = "card_statement"; setTask(state, channel, conversationId, task); return { text: `Para ${card.name}, escribe saldo total, saldo al corte, pago mínimo y día límite. Ejemplo: “120000, 90000, 5000, 25”. Escribe “omitir” si aún no lo sabes.` }; }
  if (task.phase === "card_statement") { const values = /^(omitir|no se|no sé)$/i.test(answer) ? [] : (answer.match(/\d[\d.,]*/g) || []).map(planMoney).filter((item) => item !== null); if (values.length && values.length < 4) return { text: "Escribe los cuatro datos separados por coma, o “omitir”." }; task.cards.push({ ...task.currentCard, statement: values.length ? { totalBalance: values[0], statementBalance: values[1], minimumPayment: values[2], dueDate: `${costaRicaDate().slice(0, 7)}-${String(Math.max(1, Math.min(31, values[3]))).padStart(2, "0")}` } : {} }); delete task.currentCard; task.cardIndex += 1; if (task.cardIndex < task.cardCount) { task.phase = "card_details"; setTask(state, channel, conversationId, task); return { text: `Tarjeta ${task.cardIndex + 1} de ${task.cardCount}: nombre y propósito.` }; } task.phase = "salary"; setTask(state, channel, conversationId, task); return { text: "Paso 3 de 6 — ¿Cuánto salario acumulado tendrán disponible para este ciclo? Escribe 0 si aún no lo sabes." }; }
  if (task.phase === "salary") { const amount = planMoney(answer); if (amount === null || amount < 0) return { text: "Dime el salario acumulado como monto, o 0." }; task.salaryPlanned = amount; task.phase = "commission"; setTask(state, channel, conversationId, task); return { text: "Paso 4 de 6 — ¿Cuánto esperan recibir de comisión en este ciclo? Escribe 0 si no hay o aún no lo saben." }; }
  if (task.phase === "commission") { const amount = planMoney(answer); if (amount === null || amount < 0) return { text: "Dime la comisión como monto, o 0." }; task.commissionPlanned = amount; task.phase = "other_commitments"; setTask(state, channel, conversationId, task); return { text: `Paso 5 de 6 — ¿Tienen algún compromiso extraordinario este ciclo? Ya tengo los pagos programados; responde una nota breve o “no”.` }; }
  if (task.phase === "other_commitments") { task.otherCommitments = /^(no|ninguno|ninguna)$/i.test(answer) ? "" : answer; task.phase = "review"; setTask(state, channel, conversationId, task); return { text: planSummary(task, state) }; }
  if (task.phase === "review") { if (!/^(si|sí|confirmo|confirmar|guardar|aplicar|continuar)$/i.test(answer)) return { text: "Escribe “guardar” para aprobar este resumen, o “cancelar” para salir sin cambios." }; return executeProposedAction({ state, channel, conversationId, actor, action: { type: "apply_financial_plan", data: { cycle: task.cycle.id, month: costaRicaDate().slice(0, 7), date: costaRicaDate(), accounts: task.accounts, cards: task.cards, salaryPlanned: task.salaryPlanned, commissionPlanned: task.commissionPlanned, otherCommitments: task.otherCommitments } } }); }
  return { text: "No pude retomar ese paso. Escribe “planificar el mes” para iniciarlo de nuevo." };
}

function buildAgentMessages(text, snapshot, history = [], quotedContext = "") {
  const safeHistory = Array.isArray(history) ? history.slice(-8).map((entry) => ({
    role: entry?.role === "assistant" ? "assistant" : "user",
    content: String(entry?.text || "").slice(0, 650),
  })).filter((entry) => entry.content) : [];
  const system = [
    "Eres Cuenta Clara, agente financiero de un hogar en Costa Rica.",
    "Usa datos reales disponibles. No inventes saldos, fechas ni confirmaciones.",
    "Para una acción usa financial_action. El sistema validará permiso y confirmación.",
    "Los ingresos, transferencias, metas, presupuestos, categorías, ahorros, pagos y eliminaciones necesitan confirmación humana.",
    "Una factura/documento claro puede crear gasto automático solo si viene marcado con source y confidence.",
    "Responde breve, cálido y útil en español.",
    "Usa la conversación reciente para resolver referencias humanas como “sí”, “porfa”, “eso” o “de nuevo”. Si el mensaje anterior ofrecía mostrar un detalle y la persona acepta, entrega el detalle disponible; no vuelvas a hacer la misma pregunta.",
    "Un mensaje citado es el contexto prioritario de la persona. No confundas palabras normales como “detalle” o “ayuda” con una categoría financiera.",
    "Datos: " + JSON.stringify(snapshot),
  ].join("\n");
  const quoted = String(quotedContext || "").trim().slice(0, 1_600);
  const messages = [{ role: "system", content: system }, ...safeHistory];
  if (quoted) messages.push({ role: "system", content: `Mensaje citado por la persona (contexto prioritario):\n${quoted}` });
  messages.push({ role: "user", content: String(text || "") });
  return messages;
}

async function askModel(text, state, snapshot, history = [], quotedContext = "") {
  if (!process.env.OPENAI_API_KEY) return null;
  const needsDeepReasoning = /\b(invertir|inversion|etf|bono|cript|negocio|estrategia|proyeccion|proyecci[oó]n|comparar meses|reporte profundo)\b/i.test(text);
  const model = needsDeepReasoning
    ? (process.env.OPENAI_COMPLEX_MODEL || process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || "gpt-5")
    : (process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini");
  const requestBody = {
    model,
    store: false,
    max_output_tokens: 900,
    input: buildAgentMessages(text, snapshot, history, quotedContext),
    tools: [FINANCIAL_ACTION_TOOL],
    tool_choice: "auto",
    ...(String(model).startsWith("gpt-5") ? { reasoning: { effort: needsDeepReasoning ? "medium" : "minimal" } } : {}),
  };
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "El modelo no respondió.");
  return parseModelResponse(data);
}

function parseModelResponse(data) {
  const output = Array.isArray(data?.output) ? data.output : [];
  const call = output.find((item) => item?.type === "function_call" && item?.name === "financial_action");
  const text = output
    .filter((item) => item?.type === "message")
    .flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .filter((item) => item?.type === "output_text")
    .map((item) => item.text || "")
    .join("\n")
    .trim();
  return { text, action: call ? JSON.parse(call.arguments || "{}") : null };
}

function parseJsonObject(value) {
  const text = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(text); } catch { return null; }
}

function mergePlanningAccounts(task, proposed) {
  const existing = Array.isArray(task.accounts) ? task.accounts : [];
  const byName = new Map(existing.map((account) => [normalizeText(account.name), account]));
  for (const item of Array.isArray(proposed) ? proposed : []) {
    const name = String(item?.name || "").trim().slice(0, 100);
    const purpose = String(item?.purpose || item?.context || "").trim().slice(0, 900);
    if (name.length < 2 || !purpose) continue;
    const prior = byName.get(normalizeText(name));
    const account = {
      ...(prior || accountFromStory(name, purpose)), name,
      purpose,
      operatingContext: accountOperatingContext(purpose),
    };
    if (item?.balance !== null && item?.balance !== undefined && String(item.balance).trim() !== "" && Number.isFinite(Number(item.balance))) {
      account.balance = Number(item.balance); account.balanceKnown = true;
    }
    if (item?.minimumBalance !== null && item?.minimumBalance !== undefined && String(item.minimumBalance).trim() !== "" && Number.isFinite(Number(item.minimumBalance))) {
      account.minimumBalance = Number(item.minimumBalance);
    }
    if (prior) Object.assign(prior, account); else { existing.push(account); byName.set(normalizeText(name), account); }
  }
  task.accounts = existing;
}

// Planning needs conversation rather than a questionnaire. The model receives
// the household context only to build a draft and ask the next decisive
// question. It has no write tool here; applying the plan remains an audited
// action that the household explicitly confirms.
async function runFlexiblePlanningTurn({ state, task, channel, conversationId, text, history }) {
  if (!process.env.OPENAI_API_KEY) return null;
  const model = process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini";
  const context = {
    cycle: task.cycle,
    accountsAlreadyUnderstood: task.accounts || [],
    cardsAlreadyUnderstood: task.cards || [],
    salaryPlanned: task.salaryPlanned ?? null,
    commissionPlanned: task.commissionPlanned ?? null,
    scheduledPayments: state.scheduledPayments || [],
    userMessages: (history || []).filter((entry) => entry?.role !== "assistant").slice(-8).map((entry) => entry.text),
  };
  const prompt = [
    "Eres el facilitador financiero de Cuenta Clara. Estás construyendo el plan mensual de un hogar de Costa Rica.",
    "Comprende mensajes naturales, incluso largos y con errores de escritura. No los conviertas en un formulario ni pidas que repitan datos que ya dijeron.",
    "Resume con precisión qué entendiste de cuentas, tarjetas, ingresos, ahorro, transferencias y reglas. Detecta relaciones y ambigüedades importantes; pregunta UNA sola cosa que cambie el plan. Si basta con confirmar tu interpretación, pide confirmación.",
    "Nunca inventes montos, saldos, bancos, tarjetas o fechas. No digas que guardaste, moviste o aplicaste dinero.",
    "Devuelve SOLO JSON: {reply:string,accounts:[{name:string,purpose:string,balance:number|null,minimumBalance:number|null}],salaryPlanned:number|null,commissionPlanned:number|null,readyForReview:boolean}.",
    "readyForReview solo puede ser true si ya hay cuentas, saldos o saldos explícitamente pendientes aceptados, tarjetas revisadas, salario y comisión tratados, y no queda una ambigüedad decisiva.",
    "Contexto actual: " + JSON.stringify(context),
    "Mensaje nuevo: " + String(text || ""),
  ].join("\n");
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, store: false, max_output_tokens: 1100, input: prompt, ...(String(model).startsWith("gpt-5") ? { reasoning: { effort: "minimal" } } : {}) }),
    });
    const data = await response.json();
    if (!response.ok) return null;
    const output = (data.output || []).filter((item) => item?.type === "message").flatMap((item) => item.content || []).filter((item) => item?.type === "output_text").map((item) => item.text || "").join("\n");
    const draft = parseJsonObject(output);
    if (!draft?.reply || typeof draft.reply !== "string") return null;
    mergePlanningAccounts(task, draft.accounts);
    if (Number.isFinite(Number(draft.salaryPlanned))) task.salaryPlanned = Number(draft.salaryPlanned);
    if (Number.isFinite(Number(draft.commissionPlanned))) task.commissionPlanned = Number(draft.commissionPlanned);
    // Preserve the deterministic phase as a safe fallback if OpenAI is
    // temporarily unavailable on a later message. The mode records that the
    // conversational planner, rather than the old form, owns this task.
    task.mode = "agent";
    setTask(state, channel, conversationId, task);
    if (draft.readyForReview && task.accounts.length) { task.phase = "review"; setTask(state, channel, conversationId, task); return { text: `${draft.reply}\n\n${planSummary(task, state)}` }; }
    return { text: draft.reply.trim() };
  } catch (error) {
    console.error("Flexible planning error:", error);
    return null;
  }
}

async function runAgentTurn({ state, channel, conversationId, actor = "shared", text, intent = null, history = [], quotedContext = "" }) {
  const question = String(text || "").trim();
  const normalized = normalizeText(question);
  if (!question) return { text: "No pude leer el mensaje. Inténtalo de nuevo." };
  const pendingKey = taskKey(channel, conversationId);
  const pending = state.agentMemory?.pendingActions?.[pendingKey];
  if (pending && /^(si|confirmo|confirmar|acepto|dale|ok|hazlo)$/.test(normalized)) {
    try {
      const { result } = executeAction(state, pending.action);
      delete state.agentMemory.pendingActions[pendingKey];
      setTask(state, channel, conversationId, null);
      return { text: `✅ Listo. ${describeResult(pending.action.type, result)}` };
    } catch (error) { return { text: `No pude completar la acción: ${error.message}` }; }
  }
  if (pending && /^(no|cancelar|cancela|detener|dejalo|dejalo)$/.test(normalized)) {
    delete state.agentMemory.pendingActions[pendingKey];
    return { text: "❌ Acción cancelada. No cambié ningún dato." };
  }
  if (intent === "menu" || /^(menu|ayuda|opciones|comandos)$/.test(normalized)) return menu();
  if (intent === "plan" || /\b(planificar|organizar).{0,20}\b(mes|ciclo|quincena)\b/.test(normalized)) return planningPrompt(state, channel, conversationId);
  if (intent === "income") {
    setTask(state, channel, conversationId, { kind: "income", step: "amount" });
    return { text: "💵 Dime monto, fecha, fuente y cuenta que recibió el ingreso. Siempre te mostraré el resumen antes de guardarlo." };
  }
  if (intent === "accounts") return { text: state.accounts?.length ? `🏦 Cuentas registradas:\n${state.accounts.map((item) => `• ${item.name}${item.purpose ? `: ${item.purpose}` : ""}`).join("\n")}\n\nTambién puedo crear una cuenta o registrar un saldo.` : "🏦 Aún no conozco sus cuentas. Dime el nombre de la primera cuenta y para qué la usan." };
  if (intent === "status") {
    const snapshot = householdSnapshot(state);
    return { text: `📊 Estado de ${snapshot.month}\nIngresos: CRC ${snapshot.totals.income.toFixed(2)}\nGastos: CRC ${snapshot.totals.expense.toFixed(2)}\nDisponible: CRC ${snapshot.totals.available.toFixed(2)}\n\nPuedo prepararte un reporte completo con gráficos.` };
  }
  const task = getTask(state, channel, conversationId);
  // Manual-expense specialist. It runs before the general model so a clear
  // sentence such as “gasté ₡5.000 en pan” becomes an audited movement and
  // never gets stuck asking for a merchant the user already supplied.
  const expenseTask = task?.kind === "expense";
  if (intent === "movement" || expenseTask || isExpenseRequest(question)) {
    const parsed = parseExpenseRequest(question, { categories: getCategories(state), requireVerb: !expenseTask && intent !== "movement" });
    if (parsed.status === "ready") {
      setTask(state, channel, conversationId, null);
      return executeProposedAction({ state, channel, conversationId, actor, action: { type: "create_movement", data: parsed.data } });
    }
    setTask(state, channel, conversationId, { kind: "expense", step: parsed.field || "amount", startedAt: new Date().toISOString() });
    return { text: parsed.field === "merchant" ? "¿En qué lo gastaste? Puedes decirme el nombre o describirlo, por ejemplo: “en pan para el desayuno”." : "Dime el monto y en qué lo gastaste. Puedes escribirlo de forma natural, por ejemplo: “₡5.000 en pan para el desayuno, hoy”." };
  }
  if (task?.kind === "planning" && task.phase !== "review") {
    const flexibleReply = await runFlexiblePlanningTurn({ state, task, channel, conversationId, text: question, history });
    if (flexibleReply) return flexibleReply;
  }
  const planningReply = continuePlanning(state, channel, conversationId, question, actor, history);
  if (planningReply) return planningReply;
  if (isNewTopic(question, task)) return { text: "Hay una tarea pendiente. ¿Quieres continuarla, pausarla para atender esta nueva solicitud, o cancelarla?", buttons: [[{ text: "▶️ Continuar", callback_data: "agent:task:continue" }, { text: "⏸️ Pausar y cambiar", callback_data: "agent:task:pause" }, { text: "❌ Cancelar", callback_data: "agent:task:cancel" }]] };
  // Resolve movement deletion against the real ledger before asking the
  // model. The model may understand the sentence but it cannot safely invent
  // a movement id; that used to create a confirmation which always failed.
  const deletion = deleteMovementRequest(question, state);
  if (deletion?.status === "ready") return executeProposedAction({ state, channel, conversationId, actor, action: { type: "delete_movement", id: deletion.movement.id } });
  if (deletion?.status === "ambiguous" || deletion?.status === "missing") return { text: deletion.text };
  const snapshot = householdSnapshot(state);
  try {
    const decision = await askModel(question, state, snapshot, history, quotedContext);
    if (decision?.action) return executeProposedAction({ state, channel, conversationId, actor, action: decision.action });
    return { text: decision?.text || "Puedo revisar tus movimientos, correo, cuentas, tarjetas, metas y planificación. Escribe “menú” si quieres ver las opciones." };
  } catch (error) {
    console.error("Agent core error:", error);
    return { text: "No pude procesar esa solicitud ahora mismo. Tus datos no cambiaron." };
  }
}

module.exports = { CONFIRMATION_REQUIRED, costaRicaDate, cycleFor, executeProposedAction, findDuplicate, getTask, householdSnapshot, menu, planningPrompt, runAgentTurn, setTask, taskKey, undoAction, _test: { buildAgentMessages, parseModelResponse, continuePlanning, deleteMovementRequest, accountOperatingContext, accountStoryFromNarrative } };
