// Shared financial-agent orchestration.  Telegram and the web adviser call
// this module; this is intentionally the only place that lets a model request
// a write.  The model proposes a tool call, while this module applies policy,
// validates the action and records an auditable result.
const { executeAction } = require("./action-tools");
const { getCategories, makeId } = require("./_agent");

const CONFIRMATION_REQUIRED = new Set([
  "record_income", "create_account", "update_account", "record_account_balance",
  "create_card", "update_card", "record_card_statement", "plan_transfer",
  "confirm_transfer", "create_monthly_plan", "update_monthly_plan", "set_budget",
  "create_category", "update_category", "delete_category", "create_saving_goal",
  "update_saving_goal", "delete_saving_goal", "transfer_saving", "create_scheduled_payment",
  "mark_scheduled_paid", "delete_scheduled_payment", "delete_movement", "delete_pending",
  "restore_trash",
]);

const WRITE_TOOLS = new Set([
  ...CONFIRMATION_REQUIRED, "create_movement", "update_movement", "accept_pending",
]);

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
  return {
    today, month, cycle: cycleFor(today),
    totals: { income: sum(income), expense: sum(expenses), available: sum(income) - sum(expenses) },
    accounts: (state.accounts || []).map((item) => ({ id: item.id, name: item.name, purpose: item.purpose, minimumBalance: item.minimumBalance, targetBalance: item.targetBalance })),
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
  const names = { record_income: "Registrar el ingreso", plan_transfer: "Proponer la transferencia", confirm_transfer: "Confirmar la transferencia", set_budget: "Actualizar el presupuesto", create_saving_goal: "Crear la meta", update_saving_goal: "Actualizar la meta", delete_saving_goal: "Eliminar la meta", transfer_saving: "Mover dinero de ahorro", create_scheduled_payment: "Crear el pago programado", mark_scheduled_paid: "Marcar el pago como realizado", delete_movement: "Eliminar el movimiento", create_account: "Crear la cuenta", create_card: "Crear la tarjeta", create_monthly_plan: "Aplicar el plan mensual" };
  return `${names[action.type] || "Aplicar este cambio"}${data.name ? `: ${data.name}` : ""}.`;
}

function describeResult(type, result) {
  if (type === "create_movement" || type === "record_income") return `${result.merchant || "El movimiento"} quedó registrado por CRC ${Number(result.amount || 0).toFixed(2)}.`;
  if (type === "update_movement") return `${result.merchant || "El movimiento"} quedó actualizado.`;
  return "Guardé el cambio.";
}

function planningPrompt(state, channel, conversationId) {
  const cycle = cycleFor();
  setTask(state, channel, conversationId, { kind: "planning", cycle, step: "salary" });
  const profile = state.agentMemory?.householdProfile || {};
  if (!profile.onboarded) return { text: "🗓️ Empecemos a organizar el ciclo " + cycle.start + " a " + cycle.end + ". Primero voy a aprender cómo manejan sus cuentas. ¿Cuál es la primera cuenta que usan y para qué sirve?" };
  return { text: `🗓️ Plan del ciclo ${cycle.start} al ${cycle.end}. ¿Cuánto salario acumulado tendrán disponible para trasladar? No registraré nada hasta confirmarlo.` };
}

async function askModel(text, state, snapshot) {
  if (!process.env.OPENAI_API_KEY) return null;
  const toolDefinitions = [{ type: "function", function: { name: "financial_action", description: "Proponer una acción usando datos financieros. Nunca usar para eliminar sin solicitud expresa.", parameters: { type: "object", properties: { type: { type: "string", enum: [...WRITE_TOOLS] }, data: { type: "object" } }, required: ["type", "data"] } } }];
  const system = [
    "Eres Cuenta Clara, agente financiero de un hogar en Costa Rica.",
    "Usa datos reales disponibles. No inventes saldos, fechas ni confirmaciones.",
    "Para una acción usa financial_action. El sistema validará permiso y confirmación.",
    "Los ingresos, transferencias, metas, presupuestos, categorías, ahorros, pagos y eliminaciones necesitan confirmación humana.",
    "Una factura/documento claro puede crear gasto automático solo si viene marcado con source y confidence.",
    "Responde breve, cálido y útil en español.",
    "Datos: " + JSON.stringify(snapshot),
  ].join("\n");
  const needsDeepReasoning = /\b(invertir|inversion|etf|bono|cript|negocio|estrategia|proyeccion|proyecci[oó]n|comparar meses|reporte profundo)\b/i.test(text);
  const model = needsDeepReasoning
    ? (process.env.OPENAI_COMPLEX_MODEL || process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1")
    : (process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini");
  const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, store: false, temperature: 0.2, max_tokens: 380, messages: [{ role: "system", content: system }, { role: "user", content: text }], tools: toolDefinitions, tool_choice: "auto" }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "El modelo no respondió.");
  const message = data?.choices?.[0]?.message;
  const call = message?.tool_calls?.find((item) => item.function?.name === "financial_action");
  return { text: String(message?.content || "").trim(), action: call ? JSON.parse(call.function.arguments || "{}") : null };
}

async function runAgentTurn({ state, channel, conversationId, actor = "shared", text, intent = null }) {
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
  if (isNewTopic(question, task)) return { text: "Hay una tarea pendiente. ¿Quieres continuarla, pausarla para atender esta nueva solicitud, o cancelarla?", buttons: [[{ text: "▶️ Continuar", callback_data: "agent:task:continue" }, { text: "⏸️ Pausar y cambiar", callback_data: "agent:task:pause" }, { text: "❌ Cancelar", callback_data: "agent:task:cancel" }]] };
  const snapshot = householdSnapshot(state);
  try {
    const decision = await askModel(question, state, snapshot);
    if (decision?.action) return executeProposedAction({ state, channel, conversationId, actor, action: decision.action });
    return { text: decision?.text || "Puedo revisar tus movimientos, correo, cuentas, tarjetas, metas y planificación. Escribe “menú” si quieres ver las opciones." };
  } catch (error) {
    console.error("Agent core error:", error);
    return { text: "No pude procesar esa solicitud ahora mismo. Tus datos no cambiaron." };
  }
}

module.exports = { CONFIRMATION_REQUIRED, costaRicaDate, cycleFor, executeProposedAction, findDuplicate, getTask, householdSnapshot, menu, planningPrompt, runAgentTurn, setTask, taskKey, undoAction };
