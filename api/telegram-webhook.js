const { getAppState, getCategories, learnRule, saveAppState } = require("./_agent");
const { APP_KNOWLEDGE } = require("./app-knowledge");
const { runEmailAgentSync } = require("./email-agent-sync");
const { executeAction } = require("./action-tools");

const MONTHS = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9,
  noviembre: 10, diciembre: 11,
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (process.env.TELEGRAM_WEBHOOK_SECRET &&
    req.headers["x-telegram-bot-api-secret-token"] !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).end();
  }

  let update;
  try {
    update = req.body && typeof req.body === "object" ? req.body : await readJsonBody(req);
    if (update.callback_query) {
      if (isAllowed(update.callback_query)) await handleCallback(update.callback_query);
    } else if (update.message && isAllowedMessage(update.message)) {
      await handleMessage(update.message, req);
    }
  } catch (error) {
    console.error("Telegram webhook error:", error);
    const message = update?.message;
    if (message && isAllowedMessage(message)) {
      await sendMessage(message.chat.id, "⚠️ Recibí tu mensaje, pero tuve un problema interno al procesarlo. Revisa la configuración de Supabase/OpenAI en Vercel y vuelve a intentarlo.").catch(() => {});
    }
  }
  res.status(200).json({ ok: true });
};

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function values(name) {
  return String(process.env[name] || "").split(",").map((value) => value.trim()).filter(Boolean);
}

function isAllowed(query) {
  return isAllowedChat(query.message?.chat?.id) && isAllowedUser(query.from?.id);
}

function isAllowedMessage(message) {
  return isAllowedChat(message.chat?.id) && isAllowedUser(message.from?.id);
}

function isAllowedChat(chatId) {
  return values("TELEGRAM_CHAT_ID").includes(String(chatId || ""));
}

function isAllowedUser(userId) {
  // La cuenta se usa dentro de un grupo privado identificado por chat ID. Por
  // defecto cualquier integrante de ese grupo puede operar; la restricción
  // adicional por IDs solo se aplica si se activa explícitamente en Vercel.
  if (process.env.TELEGRAM_STRICT_USER_IDS !== "true") return true;
  return values("TELEGRAM_ALLOWED_USER_IDS").includes(String(userId || ""));
}

function isMenuRequest(question) {
  const text = normalize(question);
  return /(^|\b)(menu|ayuda|opciones|comandos)(\b|$)/.test(text) ||
    /(que|cuales|dime).{0,18}(puedes hacer|puedo pedirte|opciones)/.test(text);
}

function sendAgentMenu(chatId) {
  return sendMessage(chatId,
    [
      "📋 Menú de Cuenta Clara",
      "",
      "Elige una opción o escríbeme con tus propias palabras. No necesitas seguir el menú para que te entienda.",
      "",
      "También puedes enviarme una foto de una factura o comprobante y la analizo antes de guardar nada.",
    ].join("\n"),
    [
      [{ text: "📬 Leer correo", callback_data: "menu:email" }],
      [{ text: "📊 Resumen del mes", callback_data: "menu:month" }, { text: "📅 Pagos pendientes", callback_data: "menu:scheduled" }],
      [{ text: "➕ Agregar gasto o ingreso", callback_data: "menu:add" }, { text: "📥 Bandeja pendiente", callback_data: "menu:inbox" }],
      [{ text: "📷 Analizar factura", callback_data: "menu:photo" }, { text: "🎯 Metas y ahorros", callback_data: "menu:goals" }],
      [{ text: "💰 Presupuestos", callback_data: "menu:budget" }, { text: "🧩 Categorías", callback_data: "menu:categories" }],
      [{ text: "➕ Pago programado", callback_data: "menu:new-scheduled" }, { text: "✏️ Corregir o eliminar", callback_data: "menu:edit" }],
    ]);
}

async function handleMessage(message, request = null) {
  const chatId = message.chat.id;
  if (Array.isArray(message.photo) && message.photo.length) {
    return analyzeTelegramImage(message, String(message.caption || "").trim());
  }
  if (message.voice || message.audio) {
    await sendChatAction(chatId, "typing");
    const transcript = await transcribeVoice(message.voice || message.audio);
    if (!transcript) {
      return sendMessage(chatId, "No pude entender ese audio. Puedes reenviarlo o escribirme el mensaje.");
    }
    await sendMessage(chatId, "Entendi: " + transcript);
    return replyAsAgent(message, transcript, request);
  }

  const text = String(message.text || "").trim();
  if (!text) return;
  if (/^\/start(?:@\w+)?$/i.test(text)) {
    await sendMessage(chatId,
      "Hola, soy Cuenta Clara. Puedo revisar gastos, ingresos y presupuestos, aprender sus correcciones y avisarles cuando algo necesite confirmacion.\n\n" +
      "Escribanme como si hablaran con una persona. Tambien acepto notas de voz.\n" +
      "Escribe /menu cuando quieras ver todas las opciones.");
    return sendAgentMenu(chatId);
  }
  if (/^\/(?:ayuda|menu)(?:@\w+)?$/i.test(text)) {
    return sendAgentMenu(chatId);
  }
  if (/^\/limpiar(?:@\w+)?$/i.test(text)) {
    const state = await getState();
    delete state.agentMemory.telegramSessions[String(chatId)];
    delete state.agentMemory.pendingIntents[String(chatId)];
    delete state.agentMemory.pendingActions[String(chatId)];
    delete state.agentMemory.movementDrafts[String(chatId)];
    await saveState(state);
    return sendMessage(chatId, "Listo. Limpie el contexto de esta conversacion, sin borrar ningun gasto ni dato financiero.");
  }
  if (/^\/recuerda(?:@\w+)?\s+/i.test(text)) {
    const note = text.replace(/^\/recuerda(?:@\w+)?\s+/i, "").trim();
    const state = await getState();
    state.agentMemory.notes = uniqueLast([...(state.agentMemory.notes || []), note], 14);
    await saveState(state);
    return sendMessage(chatId, "Lo voy a recordar: " + note);
  }
  if (/^\/meta(?:@\w+)?\s+/i.test(text)) {
    const goal = text.replace(/^\/meta(?:@\w+)?\s+/i, "").trim();
    const state = await getState();
    state.agentMemory.goals = uniqueLast([...(state.agentMemory.goals || []), goal], 10);
    await saveState(state);
    return sendMessage(chatId, "Meta guardada: " + goal);
  }
  return replyAsAgent(message, text, request);
}

async function replyAsAgent(message, text, request = null) {
  const chatId = message.chat.id;
  const state = await getState();
  const question = String(text || "").trim();

  const sessionKey = String(chatId);
  const sessions = state.agentMemory.telegramSessions;
  const history = Array.isArray(sessions[sessionKey]) ? sessions[sessionKey] : [];
  const pendingIntents = state.agentMemory.pendingIntents || {};
  const pendingIntentPhrase = pendingIntents[sessionKey] || "";

  const pendingAction = state.agentMemory.pendingActions?.[sessionKey];
  if (pendingAction && /^(si|sí|confirmo|confirmar|hazlo|dale|ok|okay|acepto)$/i.test(normalize(question))) {
    return executePendingAction(message, state, pendingAction);
  }
  if (pendingAction && /^(no|cancelar|cancela|detener|déjalo|dejalo)$/i.test(normalize(question))) {
    delete state.agentMemory.pendingActions[sessionKey];
    await saveState(state);
    return sendMessage(chatId, "Listo, no hice ningún cambio.");
  }

  if (isMenuRequest(question)) return sendAgentMenu(chatId);

  if (isScheduledPaymentsQuestion(question)) {
    const reply = summarizeScheduledPayments(state);
    rememberConversation(state, sessionKey, question, reply);
    await saveState(state);
    return sendMessage(chatId, reply);
  }

  const paidScheduled = findPaidScheduledPayment(question, state);
  if (paidScheduled) {
    const actionId = makeActionId();
    state.agentMemory.pendingActions[sessionKey] = {
      id: actionId, type: "mark_scheduled_paid",
      action: { type: "mark_scheduled_paid", id: paidScheduled.id, month: costaRicaToday().slice(0, 7) },
      createdAt: new Date().toISOString(),
    };
    await saveState(state);
    return sendMessage(chatId, `¿Confirmas que marque “${paidScheduled.name}” como pagado este mes?`, [[
      { text: "✅ Sí, marcar pagado", callback_data: `act:confirm:${actionId}` },
      { text: "❌ Cancelar", callback_data: `act:cancel:${actionId}` },
    ]]);
  }

  const operation = findOperationalAction(question, state);
  if (operation.status === "ready") return requestOperationalConfirmation(chatId, state, sessionKey, operation);
  if (operation.status === "incomplete" || operation.status === "info") return sendMessage(chatId, operation.message);

  const draftResult = handleMovementDraft(question, state, sessionKey);
  if (draftResult.status === "ready") return requestCreateConfirmation(chatId, state, sessionKey, draftResult);
  if (draftResult.status === "incomplete") {
    await saveState(state);
    return sendMessage(chatId, draftResult.message);
  }

  const deleteRequest = findDeleteRequest(question, state);
  if (deleteRequest.status === "ready") {
    const actionId = makeActionId();
    state.agentMemory.pendingActions[sessionKey] = {
      id: actionId,
      type: "delete_movement",
      movementId: deleteRequest.movement.id,
      createdAt: new Date().toISOString(),
    };
    await saveState(state);
    return sendMessage(chatId,
      [
        "⚠️ Antes de hacer ese cambio necesito tu autorización.",
        "",
        `Voy a eliminar este movimiento del historial:`,
        `🛒 ${deleteRequest.movement.merchant}`,
        `💰 CRC ${Number(deleteRequest.movement.amount || 0).toFixed(2)} · 📅 ${deleteRequest.movement.date}`,
        "",
        "Esto afectará los totales del mes y no se puede deshacer desde Telegram.",
        "¿Quieres que lo elimine?",
      ].join("\n"),
      [[
        { text: "✅ Sí, eliminar", callback_data: `act:confirm:${actionId}` },
        { text: "❌ Cancelar", callback_data: `act:cancel:${actionId}` },
      ]]);
  }
  if (deleteRequest.status === "ambiguous") {
    return sendMessage(chatId, deleteRequest.message);
  }

  // Las consultas de "hoy" no deben depender de una interpretación del
  // modelo: la fecha y los movimientos ya están disponibles en la app.
  // Así evitamos respuestas contradictorias cuando existe un movimiento con
  // una fecha distinta a la que la persona esperaba.
  if (isTodayMovementsQuestion(question)) {
    const reply = summarizeTodayMovements(state);
    rememberConversation(state, sessionKey, question, reply);
    await saveState(state);
    return sendMessage(chatId, reply);
  }
  if (isMonthMovementsQuestion(question)) {
    const reply = summarizeMonthMovements(state);
    rememberConversation(state, sessionKey, question, reply);
    await saveState(state);
    return sendMessage(chatId, reply);
  }
  if (isImportedMovementsQuestion(question)) {
    const reply = summarizeImportedMovements(state);
    rememberConversation(state, sessionKey, question, reply);
    await saveState(state);
    return sendMessage(chatId, reply);
  }

  const emailIntent = detectEmailIntent(question, state);
  if (emailIntent.matched) {
    if (pendingIntentPhrase) {
      state.agentMemory.intentAliases = uniqueAliases([
        ...(state.agentMemory.intentAliases || []),
        { phrase: pendingIntentPhrase, action: "read_email" },
      ], 80);
      delete pendingIntents[sessionKey];
    }
    try {
      await sendChatAction(chatId, "typing");
      const result = await runEmailAgentSync({
        existingSourceIds: [...state.movements, ...state.pendingMovements].map((item) => item.sourceId).filter(Boolean),
        userId: process.env.AGENT_OWNER_USER_ID,
        baseUrl: getBaseUrl(request),
      });
      const reply = result.processed
        ? `Listo 💌. Make devolvió ${result.received} movimiento${result.received === 1 ? "" : "s"}; el agente procesó ${result.processed}.`
        : `Listo 💌. Make respondió ${result.received || 0} movimientos nuevos; no había nada nuevo que agregar.`;
      rememberConversation(state, sessionKey, question, reply);
      await saveState(state);
      return sendMessage(chatId, reply);
    } catch (error) {
      const reply = `No pude leer el correo todavía: ${error.message}`;
      rememberConversation(state, sessionKey, question, reply);
      await saveState(state);
      return sendMessage(chatId, reply);
    }
  }

  const requiredPeriod = needsPeriod(question);
  const period = parsePeriod(question);
  if (requiredPeriod && !period) {
    return sendMessage(chatId, "Claro. Para revisarlo bien, dime el periodo: por ejemplo “julio 2026”, “los ultimos 5 dias” o un rango de fechas.");
  }

  await sendChatAction(chatId, "typing");
  const answer = await askAdvisor(question, state, period, history);
  rememberConversation(state, sessionKey, question, answer);
  await saveState(state);
  return sendMessage(chatId, answer);
}

function detectEmailIntent(question, state) {
  const normalized = normalize(question);
  const aliases = Array.isArray(state.agentMemory?.intentAliases) ? state.agentMemory.intentAliases : [];
  const learned = aliases.some((alias) => alias?.action === "read_email" && normalized.includes(normalize(alias.phrase)));
  const direct = /(lee|leer|revisa|revisar|revis[aá]|busca|buscar|trae|traer|actualiza|actualizar|sincroniza|sincronizar).{0,35}(correo|email|bandeja|transferencia|movimiento|banco)/.test(normalized)
    || /(correo|email|bandeja|transferencia|movimiento).{0,35}(nuevo|nuevos|pendiente|pendientes|banco)/.test(normalized)
    || /\b(ver|mira|mirar)\b.{0,20}\b(correo|email|bandeja)\b/.test(normalized)
    || /\b(llama|llamar|llamado|ejecuta|ejecutar).{0,30}\bmake\b/.test(normalized)
    || /\bmake\b.{0,30}\b(correo|email|bandeja|lee|leer)\b/.test(normalized);
  return { matched: learned || direct };
}

function isTodayMovementsQuestion(question) {
  const text = normalize(question);
  return /\b(hoy|dia de hoy)\b/.test(text) &&
    /\b(gasto|gastos|movimiento|movimientos|compra|compras|transaccion|transacciones)\b/.test(text) &&
    !/(agrega|agregar|registra|registrar|anota|anotar|elimina|eliminar|borra|borrar)/.test(text);
}

function isScheduledPaymentsQuestion(question) {
  const text = normalize(question);
  if (/(crea|crear|agrega|agregar|programa|programar|elimina|eliminar|borra|borrar|realizado|pagado)/.test(text)) return false;
  return /(gasto|gastos|pago|pagos).{0,25}(programado|programados|pendiente|pendientes)/.test(text) ||
    /(programado|programados|pendiente|pendientes).{0,25}(gasto|gastos|pago|pagos)/.test(text);
}

function summarizeScheduledPayments(state) {
  const month = costaRicaToday().slice(0, 7);
  const list = (state.scheduledPayments || []).filter((item) => item.active !== false &&
    (item.repeat === "monthly" || String(item.dueDate || "").startsWith(month)));
  if (!list.length) return `No hay gastos programados activos para ${month}.`;
  const pending = list.filter((item) => !(item.paidMonths || []).includes(month));
  if (!pending.length) return `Todos los ${list.length} pagos programados de ${month} están marcados como pagados.`;
  return `Pagos programados pendientes de ${month}:\n${pending.map((item) => `• ${item.name}: CRC ${Number(item.amount || 0).toFixed(2)} · vence ${item.dueDate || "sin fecha"}`).join("\n")}`;
}

function findPaidScheduledPayment(question, state) {
  const text = normalize(question);
  if (!/(realizado|pagado|ya se pago|ya se pagó)/.test(text)) return null;
  const candidates = (state.scheduledPayments || []).filter((item) => item.active !== false);
  return candidates.find((item) => {
    const name = normalize(item.name);
    const terms = name.split(/\s+/).filter((term) => term.length > 2);
    return terms.some((term) => text.includes(term));
  }) || null;
}

function isMonthMovementsQuestion(question) {
  const text = normalize(question);
  return /(este mes|mes actual)/.test(text) &&
    /\b(gasto|gastos|movimiento|movimientos|compra|compras|transaccion|transacciones)\b/.test(text);
}

function summarizeTodayMovements(state) {
  const today = costaRicaToday();
  const movements = (state.movements || []).filter((item) => item.date === today && item.type !== "saving");
  if (movements.length) {
    const lines = movements.slice(0, 8).map((item) => `• ${item.merchant || "Sin comercio"}: CRC ${Number(item.amount || 0).toFixed(2)}`);
    const totalExpenses = movements.filter((item) => item.type === "expense").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return `Hoy (${today}) hay ${movements.length} movimiento${movements.length === 1 ? "" : "s"}:\n${lines.join("\n")}\n\nTotal de gastos hoy: CRC ${totalExpenses.toFixed(2)}.`;
  }

  // Un registro creado antes de corregir la zona horaria puede quedar con la
  // fecha del día siguiente. Se muestra de forma transparente sin cambiarlo.
  const adjacent = (state.movements || []).filter((item) => item.date && item.date !== today && item.type !== "saving").slice(0, 3);
  if (adjacent.length) {
    const details = adjacent.map((item) => `${item.merchant || "Sin comercio"} (CRC ${Number(item.amount || 0).toFixed(2)}, fecha ${item.date})`).join("; ");
    return `No hay movimientos registrados para hoy (${today}). Sí veo: ${details}. Si alguno corresponde a hoy pero tiene una fecha incorrecta, dímelo y te pediré confirmación antes de corregirlo.`;
  }
  return `No hay movimientos registrados para hoy (${today}).`;
}

function summarizeMonthMovements(state) {
  const month = costaRicaToday().slice(0, 7);
  const movements = (state.movements || []).filter((item) => String(item.date || "").startsWith(month) && item.type !== "saving");
  const expenses = movements.filter((item) => item.type === "expense");
  if (!movements.length) return `No hay movimientos registrados en ${month}.`;
  const lines = expenses.slice(0, 10).map((item) => `• ${item.date} · ${item.merchant || "Sin comercio"}: CRC ${Number(item.amount || 0).toFixed(2)}`);
  const total = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return `Movimientos de ${month}:\n${lines.join("\n") || "No hay gastos."}\n\nTotal de gastos del mes: CRC ${total.toFixed(2)}.`;
}

function isImportedMovementsQuestion(question) {
  const text = normalize(question);
  return /(otros|todos|lista|muestrame|muestra|ver).{0,45}(gasto|gastos|movimiento|movimientos|correo|import)/.test(text) &&
    /(pasaste|llegaron|import|correo|otros|todos|lista)/.test(text);
}

function summarizeImportedMovements(state) {
  const items = (state.movements || []).filter((item) => item.source === "gmail").slice(0, 20);
  if (!items.length) return "No encuentro movimientos importados desde correo todavía.";
  const lines = items.map((item, index) => `${index + 1}. ${item.date} · ${item.merchant || "Sin comercio"}: CRC ${Number(item.amount || 0).toFixed(2)}`);
  return `Estos son los ${items.length} movimientos importados más recientes:\n${lines.join("\n")}`;
}

function uniqueAliases(items, limit) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item?.action || ""}:${normalize(item?.phrase || "")}`;
    if (!item?.phrase || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(-limit);
}

function getBaseUrl(request) {
  const host = request?.headers?.host || process.env.VERCEL_URL;
  if (!host) return "";
  const protocol = String(request?.headers?.["x-forwarded-proto"] || "https").split(",")[0];
  return `${protocol}://${host}`;
}

function needsPeriod(text) {
  const normalized = normalize(text);
  if (/(este mes|mes actual|como vamos|resumen|hoy|ultimos?|pasados?|desde|entre|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|\d{1,2}[/-]\d{1,2})/.test(normalized)) return false;
  return /(analiza|analisis|presupuesto|compar|gasto|ingreso|ahorro|finanza|revisa|cuanto|cuáles|cuales)/.test(normalized);
}

function parsePeriod(text) {
  const normalized = normalize(text);
  const today = new Date();
  const monthFound = Object.keys(MONTHS).find((month) => new RegExp("\\b" + month + "\\b").test(normalized));
  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  if (monthFound) {
    const year = yearMatch ? Number(yearMatch[1]) : today.getFullYear();
    return monthPeriod(year, MONTHS[monthFound], monthFound + " " + year);
  }
  const lastDays = normalized.match(/(?:ultimos?|pasados?)\s+(\d+)\s+dias?/);
  if (lastDays) {
    const end = dateOnly(today);
    const start = new Date(end);
    start.setDate(start.getDate() - Number(lastDays[1]) + 1);
    return { start, end, label: "ultimos " + lastDays[1] + " dias" };
  }
  const dates = [...text.matchAll(/(\d{1,2})[/-](\d{1,2})[/-](20\d{2})/g)].map((match) =>
    new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  if (dates.length >= 2) return { start: dateOnly(dates[0]), end: dateOnly(dates[1]), label: "rango indicado" };
  if (dates.length === 1) return { start: dateOnly(dates[0]), end: dateOnly(dates[0]), label: "fecha indicada" };
  if (/(este mes|mes actual|como vamos|resumen|hoy)/.test(normalized)) {
    return monthPeriod(today.getFullYear(), today.getMonth(), "mes actual");
  }
  return null;
}

function monthPeriod(year, month, label) {
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0),
    label,
  };
}

function dateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

async function askAdvisor(question, state, period, history) {
  if (!process.env.OPENAI_API_KEY) {
    return "El agente todavia no tiene configurada la clave de OpenAI en Vercel.";
  }
  const context = buildContext(state, period, question);
  const system = [
    "Eres Cuenta Clara, asistente financiero personal de una pareja en Costa Rica.",
    "Habla en espanol claro, cercano y breve. Usa colones cuando menciones montos.",
    "Primero conversa y pregunta cuando falte un dato. No hagas analisis, presupuesto ni graficos si no te lo pidieron.",
    "Nunca afirmes que cambiaste gastos, categorias, presupuestos o ahorros: para eso pide confirmacion explicita.",
    "Para clasificar, usa patrones y categorias existentes. Si no estas seguro, explica la duda y pregunta.",
    "Conoce y explica la app usando el MANUAL_DE_USO. Si preguntan como hacer algo, da los pasos exactos de la seccion correspondiente. No inventes botones ni afirmes haber cambiado datos.",
    "Responde en maximo 110 palabras y no inventes datos.",
    "Datos disponibles: " + JSON.stringify(context),
    "MANUAL_DE_USO:\n" + APP_KNOWLEDGE,
  ].join("\n");
  const messages = [{ role: "system", content: system }];
  history.slice(-6).forEach((entry) => messages.push({ role: entry.role, content: entry.text }));
  messages.push({ role: "user", content: question });

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
        messages,
        max_tokens: 300,
        temperature: 0.35,
      }),
    });
    const data = await response.json();
    const answer = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!response.ok || !answer) throw new Error(data && data.error && data.error.message || "No response");
    return String(answer).trim();
  } catch (error) {
    console.error("Telegram advisor error:", error);
    return "No pude responder en este momento. Intentalo de nuevo en unos segundos.";
  }
}

function buildContext(state, period, question) {
  const categories = getCategories(state);
  const all = Array.isArray(state.movements) ? state.movements : [];
  const movements = all.filter((movement) => {
    if (movement.type === "saving") return false;
    if (!period) return false;
    const date = parseMovementDate(movement.date);
    return date && date >= period.start && date <= period.end;
  });
  const expenses = movements.filter((movement) => movement.type === "expense");
  const income = movements.filter((movement) => movement.type === "income");
  const totals = {
    ingresos: sum(income),
    gastos: sum(expenses),
    disponible: sum(income) - sum(expenses),
  };
  const byCategory = expenses.reduce((result, movement) => {
    const category = categories.find((item) => item.id === movement.category);
    const name = category ? category.name : "Sin categoria";
    result[name] = (result[name] || 0) + Number(movement.amount || 0);
    return result;
  }, {});
  const wantsDetail = /(detalle|movimientos|lista|donde|cuales|cu[aá]les)/i.test(question);
  return {
    periodo: period ? period.label : "sin periodo solicitado",
    totales: totals,
    categorias_gasto: Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 6),
    movimientos: wantsDetail ? movements.slice(0, 10).map((movement) => ({
      fecha: movement.date,
      comercio: movement.merchant,
      monto: Number(movement.amount || 0),
      tipo: movement.type,
    })) : [],
    reglas_aprendidas: Object.values(state.merchantRules || {}).slice(-10),
    metas: (state.agentMemory.goals || []).slice(-6),
    notas: (state.agentMemory.notes || []).slice(-6),
  };
}

function parseMovementDate(value) {
  if (!value) return null;
  const date = new Date(String(value).length === 10 ? String(value) + "T12:00:00" : value);
  return Number.isNaN(date.getTime()) ? null : dateOnly(date);
}

function sum(items) {
  return items.reduce((total, item) => total + Number(item.amount || 0), 0);
}

async function transcribeVoice(file) {
  if (!process.env.OPENAI_API_KEY || !file || !file.file_id) return "";
  try {
    const fileInfo = await telegram("getFile", { file_id: file.file_id });
    const filePath = fileInfo && fileInfo.result && fileInfo.result.file_path;
    if (!filePath) return "";
    const audioResponse = await fetch("https://api.telegram.org/file/bot" + process.env.TELEGRAM_BOT_TOKEN + "/" + filePath);
    if (!audioResponse.ok) return "";
    const content = await audioResponse.arrayBuffer();
    const form = new FormData();
    form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
    form.append("language", "es");
    form.append("file", new Blob([content], { type: file.mime_type || "audio/ogg" }), "mensaje.ogg");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY },
      body: form,
    });
    const data = await response.json();
    return String(data && data.text || "").trim();
  } catch (error) {
    console.error("Voice transcription error:", error);
    return "";
  }
}

async function analyzeTelegramImage(message, caption) {
  const chatId = message.chat.id;
  if (!process.env.OPENAI_API_KEY) return sendMessage(chatId, "No puedo analizar imágenes todavía porque falta configurar OpenAI en Vercel.");
  try {
    await sendChatAction(chatId, "typing");
    const photo = message.photo[message.photo.length - 1];
    const fileInfo = await telegram("getFile", { file_id: photo.file_id });
    const filePath = fileInfo?.result?.file_path;
    if (!filePath) throw new Error("No pude obtener la foto de Telegram.");
    const imageResponse = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`);
    if (!imageResponse.ok) throw new Error("No pude descargar la foto.");
    const mime = imageResponse.headers.get("content-type") || "image/jpeg";
    const bytes = Buffer.from(await imageResponse.arrayBuffer()).toString("base64");
    const state = await getState();
    const categories = getCategories(state).filter((item) => item.kind === "expense");
    const prompt = [
      "Analiza la imagen que te envió una persona en Costa Rica.",
      "Si es una factura, recibo o comprobante, devuelve SOLO JSON válido con: {isReceipt:boolean,merchant:string,date:string,total:number,category:string,items:[{name:string,quantity:number|null,amount:number|null}],notes:string,confidence:number,description:string}.",
      "Fecha YYYY-MM-DD, monto final en CRC. Artículos debe incluir nombres y montos legibles. No inventes datos ilegibles; usa null cuando no puedas leer un dato.",
      "Categorías disponibles: " + categories.map((item) => item.name).join(", ") + ".",
      "Si no es comprobante, devuelve isReceipt:false y una descripción breve.",
      caption ? `Pie de foto: ${caption}` : "",
    ].filter(Boolean).join("\n");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
        max_tokens: 350,
        temperature: 0.1,
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mime};base64,${bytes}` } },
        ] }],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const answer = payload?.choices?.[0]?.message?.content;
    if (!response.ok || !answer) throw new Error(payload?.error?.message || "No pude analizar la imagen.");
    const parsed = parseReceiptVision(answer);
    if (!parsed?.isReceipt) return sendMessage(chatId, parsed?.description || "Veo la imagen, pero no parece ser una factura o comprobante financiero.");
    const category = categoryFromVision(parsed.category, categories);
    if (!parsed.merchant || !(Number(parsed.total) > 0)) {
      return sendMessage(chatId, "Pude ver una factura, pero no pude leer con suficiente seguridad el comercio o total. Envíala más nítida o dime esos dos datos.");
    }
    const receipt = {
      source: "telegram", telegramFileId: photo.file_id, analyzedAt: new Date().toISOString(),
      items: Array.isArray(parsed.items) ? parsed.items.slice(0, 30) : [],
      note: String(parsed.notes || ""), confidence: Number(parsed.confidence || 0),
    };
    const data = {
      type: "expense", merchant: String(parsed.merchant).trim(), amount: Number(parsed.total),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.date || "")) ? parsed.date : costaRicaToday(),
      category: category?.id || "imprevistos", note: receiptNote(receipt.items, receipt.note), receipt,
    };
    const duplicate = findReceiptDuplicate(data, state);
    if (duplicate) {
      const draftId = makeActionId();
      state.agentMemory.receiptDrafts = state.agentMemory.receiptDrafts || {};
      state.agentMemory.receiptDrafts[draftId] = { data, duplicateId: duplicate.id, chatId: String(chatId) };
      await saveState(state);
      return sendMessage(chatId,
        `⚠️ Encontré un posible duplicado:\n\n${duplicate.merchant} · CRC ${Number(duplicate.amount).toFixed(2)} · ${duplicate.date}\n\nLa factura tiene el mismo comercio, día y monto. ¿Es el mismo gasto?`, [[
          { text: "✅ Sí, es el mismo", callback_data: `rc:dupe-yes:${draftId}` },
          { text: "➕ No, es otro gasto", callback_data: `rc:dupe-no:${draftId}` },
        ]]);
    }
    const { result: created } = executeAction(state, { type: "create_movement", data });
    await saveState(state);
    return sendReceiptSaved(chatId, created, categories, "✅ Factura analizada y gasto agregado automáticamente.");
  } catch (error) {
    console.error("Telegram image analysis error:", error);
    return sendMessage(chatId, "No pude analizar esa imagen. Intenta enviarla con más luz, completa y sin recortar los datos importantes.");
  }
}

function parseReceiptVision(answer) {
  const text = String(answer || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(text); } catch { return null; }
}

function categoryFromVision(value, categories) {
  const target = normalize(value);
  return categories.find((item) => normalize(item.name) === target) ||
    categories.find((item) => target && (normalize(item.name).includes(target) || target.includes(normalize(item.name)))) || null;
}

function receiptNote(items, note) {
  const lines = (items || []).map((item) => {
    const name = String(item?.name || "").trim();
    if (!name) return "";
    const quantity = item.quantity === null || item.quantity === undefined ? "" : ` x${item.quantity}`;
    const amount = Number(item.amount);
    return `${name}${quantity}${Number.isFinite(amount) && amount > 0 ? ` — CRC ${amount.toFixed(2)}` : ""}`;
  }).filter(Boolean);
  return [String(note || "").trim(), lines.length ? `Artículos: ${lines.join("; ")}` : ""].filter(Boolean).join(" · ");
}

function findReceiptDuplicate(data, state) {
  const merchant = normalize(data.merchant);
  return (state.movements || []).find((item) => item.type === "expense" && item.date === data.date &&
    Math.abs(Number(item.amount || 0) - Number(data.amount || 0)) < 0.01 &&
    (normalize(item.merchant) === merchant || normalize(item.merchant).includes(merchant) || merchant.includes(normalize(item.merchant))));
}

function sendReceiptSaved(chatId, movement, categories, headline) {
  const category = categories.find((item) => item.id === movement.category)?.name || "Sin categoría";
  return sendMessage(chatId, `${headline}\n\n🛒 ${movement.merchant}\n💰 CRC ${Number(movement.amount).toFixed(2)} · 📅 ${movement.date}\n🏷️ ${category}\n${movement.note ? `📝 ${movement.note}` : ""}`, [[
    { text: "✏️ Cambiar categoría", callback_data: `cc:change:m:${movement.id}` },
    { text: "✏️ Corregir monto o fecha", callback_data: `rc:edit:${movement.id}` },
  ]]);
}

async function handleCallback(query) {
  const parts = String(query.data || "").split(":");
  const prefix = parts[0];
  const action = parts[1];
  const scope = parts[2];
  const id = parts[3];
  const categoryId = parts[4];
  if (!["cc", "act", "menu", "rc"].includes(prefix) || !process.env.AGENT_OWNER_USER_ID) return;
  if (prefix === "menu") return handleMenuCallback(query, action);
  if (prefix === "rc") return handleReceiptCallback(query, action, scope);
  const state = await getState();
  const categories = getCategories(state);
  const categoryName = (value) => categories.find((category) => category.id === value)?.name || "Sin categoria";

  if (prefix === "act") {
    return handleActionCallback(query, state);
  }

  if (action === "keep") {
    const pending = state.pendingMovements.find((item) => item.id === id);
    const movement = pending || state.movements.find((item) => item.id === id);
    if (movement) {
      movement.classification = { ...(movement.classification || {}), status: "approved", confidence: 1, source: "telegram" };
      if (pending) {
        state.pendingMovements = state.pendingMovements.filter((item) => item.id !== id);
        state.movements.unshift(movement);
      }
      await saveState(state);
    }
    await editMessage(query.message.chat.id, query.message.message_id,
      `✅ Listo. ${movement ? movement.merchant : "El movimiento"} queda en ${movement ? categoryName(movement.category) : "su categoría actual"}.`, []);
    await answerCallback(query.id, "Movimiento confirmado.");
    return;
  }
  if (action === "change") {
    const pending = state.pendingMovements.find((item) => item.id === id);
    const movement = pending || state.movements.find((item) => item.id === id);
    if (!movement) return answerCallback(query.id, "No encontre ese movimiento.");
    // No editar el reporte original: contiene todos los movimientos y sus
    // botones. La elección abre una tarjeta nueva y compacta para que la
    // persona pueda volver al listado y corregir más de uno.
    await sendMessage(query.message.chat.id,
      "Elige una nueva categoría para " + movement.merchant + ":", buildCategoryButtons(categories, movement, pending ? "p" : "m"));
    await answerCallback(query.id, "Elige una categoria.");
    return;
  }
  if (action === "set") {
    const collection = scope === "p" ? state.pendingMovements : state.movements;
    const item = collection.find((entry) => entry.id === id);
    if (!item || !categories.some((category) => category.id === categoryId && category.kind === item.type)) {
      return answerCallback(query.id, "No pude cambiar esa categoria.");
    }
    item.category = categoryId;
    item.classification = { ...(item.classification || {}), status: "approved", confidence: 1, source: "telegram" };
    learnRule(state, item.merchant, categoryId, "user");
    if (scope === "p") {
      state.pendingMovements = state.pendingMovements.filter((entry) => entry.id !== id);
      state.movements.unshift(item);
    }
    const report = (state.agentMemory.telegramReports || []).find((entry) =>
      String(entry.chatId) === String(query.message.chat.id) && (entry.entries || []).some((entryItem) => entryItem.id === id));
    if (report) {
      report.correctedIds = Array.from(new Set([...(report.correctedIds || []), id]));
    }
    await saveState(state);
    if (report) {
      await editReplyMarkup(report.chatId, report.messageId, buildReportKeyboard(state, report));
    }
    await editMessage(query.message.chat.id, query.message.message_id,
      "Listo. " + item.merchant + " quedo como " + categoryName(categoryId) + ".", []);
    await answerCallback(query.id, "Movimiento actualizado.");
  }
}

async function handleReceiptCallback(query, action, id) {
  const chatId = query.message.chat.id;
  const state = await getState();
  const categories = getCategories(state);
  if (action === "edit") {
    const movement = state.movements.find((item) => item.id === id);
    if (!movement) return answerCallback(query.id, "No encontré ese gasto.");
    await answerCallback(query.id, "Dime la corrección.");
    return sendMessage(chatId, `Escribe la corrección en una frase. Por ejemplo:\n“cambia el monto del gasto ${movement.merchant} a ₡4.500”\nó\n“cambia la fecha del gasto ${movement.merchant} a 2026-09-09”.\n\nTe pediré confirmación antes de guardar.`);
  }
  const draft = state.agentMemory.receiptDrafts?.[id];
  if (!draft || String(draft.chatId) !== String(chatId)) return answerCallback(query.id, "Esta revisión ya venció.");
  if (action === "dupe-yes") {
    const movement = state.movements.find((item) => item.id === draft.duplicateId);
    if (!movement) return answerCallback(query.id, "No encontré el gasto original.");
    movement.receipt = draft.data.receipt;
    movement.note = [movement.note, draft.data.note].filter(Boolean).join(movement.note && draft.data.note ? " · " : "");
    delete state.agentMemory.receiptDrafts[id];
    await saveState(state);
    await editMessage(chatId, query.message.message_id, `✅ Listo. Adjunté los artículos de la factura al gasto existente de ${movement.merchant}.`, []);
    return answerCallback(query.id, "Factura añadida al gasto existente.");
  }
  if (action === "dupe-no") {
    const { result: created } = executeAction(state, { type: "create_movement", data: draft.data });
    delete state.agentMemory.receiptDrafts[id];
    await saveState(state);
    await editMessage(chatId, query.message.message_id, "✅ Entendido: era otro gasto. Lo agregué al historial.", []);
    await sendReceiptSaved(chatId, created, categories, "Detalle de la factura:");
    return answerCallback(query.id, "Gasto agregado.");
  }
  return answerCallback(query.id, "Acción no reconocida.");
}

async function handleMenuCallback(query, action) {
  const chatId = query.message.chat.id;
  const message = { chat: query.message.chat };
  const actions = {
    email: { text: "lee el correo", notice: "Revisando correo..." },
    month: { text: "qué gastos tenemos este mes", notice: "Preparando el resumen..." },
    scheduled: { text: "qué pagos programados están pendientes este mes", notice: "Revisando pagos..." },
    imports: { text: "muéstrame los otros gastos importados", notice: "Buscando movimientos..." },
    goals: { text: "muéstrame mis metas y ahorros", notice: "Revisando metas..." },
    inbox: { text: "muéstrame pendientes de bandeja", notice: "Revisando Bandeja..." },
    budget: { text: "muéstrame presupuestos", notice: "Revisando presupuestos..." },
    categories: { text: "muéstrame categorías", notice: "Revisando categorías..." },
  };
  if (actions[action]) {
    await answerCallback(query.id, actions[action].notice);
    return replyAsAgent(message, actions[action].text);
  }
  if (action === "add") {
    await answerCallback(query.id, "Listo.");
    return sendMessage(chatId,
      "➕ Dime el gasto o ingreso en una frase. Por ejemplo:\n\n“Hoy ₡5.000 en Automercado, alimentación. Agrégalo”.\n\nTe pediré lo que falte y siempre confirmaré antes de guardarlo.");
  }
  if (action === "photo") {
    await answerCallback(query.id, "Envíame la foto.");
    return sendMessage(chatId,
      "📷 Envíame una foto clara de la factura, recibo o comprobante. Extraeré comercio, fecha, monto, categoría y artículos. Si no coincide con un gasto existente, la registraré; si parece duplicada, te preguntaré antes.");
  }
  if (action === "new-scheduled") {
    await answerCallback(query.id, "Dime los datos.");
    return sendMessage(chatId, "Escribe, por ejemplo: “programa pago de alquiler por ₡260.000 el 2026-09-15 mensual”. Te mostraré el resumen antes de guardarlo.");
  }
  if (action === "edit") {
    await answerCallback(query.id, "Te explico.");
    return sendMessage(chatId,
      "✏️ Para corregir una categoría, toca “Cambiar categoría” en la lista importada. Para eliminar, escribe por ejemplo: “elimina el gasto de ₡5.000 en Automercado”. Siempre te pediré confirmación antes de modificar algo.");
  }
  return answerCallback(query.id, "Opción no disponible.");
}

function buildReportKeyboard(state, report) {
  const all = [...(state.movements || []), ...(state.pendingMovements || [])];
  const corrected = new Set(report.correctedIds || []);
  return (report.entries || []).map((entry) => {
    const movement = all.find((item) => item.id === entry.id);
    const label = corrected.has(entry.id)
      ? `✅ Corregido · ${entry.index}. ${entry.merchant}`
      : `✏️ Cambiar categoría · ${entry.index}. ${entry.merchant}`;
    return [{
      text: label.slice(0, 64),
      callback_data: `cc:change:${movement && state.pendingMovements.some((item) => item.id === movement.id) ? "p" : "m"}:${entry.id}`,
    }];
  });
}

async function handleActionCallback(query, state) {
  const action = String(query.data || "").split(":")[1];
  const actionId = String(query.data || "").split(":")[2];
  const chatId = String(query.message?.chat?.id || "");
  const pending = state.agentMemory.pendingActions?.[chatId];
  if (!pending || pending.id !== actionId) return answerCallback(query.id, "Esta autorización ya venció.");
  if (action === "cancel") {
    delete state.agentMemory.pendingActions[chatId];
    await saveState(state);
    await editMessage(query.message.chat.id, query.message.message_id, "❌ Acción cancelada. No cambié ningún dato.", []);
    return answerCallback(query.id, "Cancelado.");
  }
  if (action === "confirm") {
    await executePendingAction({ chat: query.message.chat }, state, pending, query.message);
    return answerCallback(query.id, "Acción autorizada.");
  }
  return answerCallback(query.id, "Acción no reconocida.");
}

async function executePendingAction(message, state, pending, telegramMessage = null) {
  const chatId = String(message.chat.id);
  if (pending.action) {
    const { result } = executeAction(state, pending.action);
    delete state.agentMemory.pendingActions[chatId];
    await saveState(state);
    const text = pending.successText || describeCompletedAction(pending.action, result);
    if (telegramMessage) return editMessage(telegramMessage.chat.id, telegramMessage.message_id, text, []);
    return sendMessage(chatId, text);
  }
  if (pending.type !== "delete_movement") return sendMessage(chatId, "No pude ejecutar esa acción todavía.");
  const target = state.movements.find((movement) => movement.id === pending.movementId);
  if (!target) {
    delete state.agentMemory.pendingActions[chatId];
    await saveState(state);
    return sendMessage(chatId, "Ese movimiento ya no existe o ya fue eliminado.");
  }
  const { result: removed } = executeAction(state, { type: "delete_movement", id: pending.movementId });
  delete state.agentMemory.pendingActions[chatId];
  await saveState(state);
  const text = `🗑️ Listo. Eliminé ${removed.merchant} por CRC ${Number(removed.amount || 0).toFixed(2)} del ${removed.date}.`;
  if (telegramMessage) return editMessage(telegramMessage.chat.id, telegramMessage.message_id, text, []);
  return sendMessage(chatId, text);
}

function describeCompletedAction(action, result) {
  const type = action.type;
  if (type === "create_movement") return `✅ Listo. Agregué ${result.merchant || "el movimiento"} por CRC ${Number(result.amount || 0).toFixed(2)} al historial.`;
  if (type === "update_movement") return `✅ Listo. Actualicé ${result.merchant || "el movimiento"}.`;
  if (type === "set_budget") return `✅ Listo. El presupuesto quedó en CRC ${Number(result.amount || 0).toFixed(2)} para ${result.month}.`;
  if (type === "create_category") return `✅ Listo. Creé la categoría “${result.name}”.`;
  if (type === "update_category") return `✅ Listo. Actualicé la categoría “${result.name}”.`;
  if (type === "delete_category") return "✅ Listo. Eliminé la categoría y reasigné sus movimientos.";
  if (type === "create_saving_goal") return `✅ Listo. Creé la meta “${result.name}” por CRC ${Number(result.target || 0).toFixed(2)}.`;
  if (type === "update_saving_goal") return `✅ Listo. Actualicé la meta “${result.name}”.`;
  if (type === "delete_saving_goal") return `✅ Listo. Eliminé la meta “${result.name}”.`;
  if (type === "transfer_saving") return `✅ Listo. Registré el movimiento de ahorro por CRC ${Number(result.amount || 0).toFixed(2)}.`;
  if (type === "create_scheduled_payment") return `✅ Listo. Creé el pago programado “${result.name}”.`;
  if (type === "mark_scheduled_paid") return `✅ Listo. Marqué el pago como realizado y agregué el gasto de CRC ${Number(result.movement?.amount || 0).toFixed(2)}.`;
  if (type === "delete_scheduled_payment") return `✅ Listo. Eliminé el pago programado “${result.name}”.`;
  if (type === "accept_pending") return `✅ Listo. Agregué ${result.merchant || "el movimiento"} al historial.`;
  if (type === "delete_pending") return `✅ Listo. Descarté ${result.merchant || "el pendiente"}.`;
  return "✅ Listo. Guardé el cambio.";
}

function findDeleteRequest(question, state) {
  const normalized = normalize(question);
  if (!/(elimina|eliminar|borra|borrar|quita|quitar)/.test(normalized) ||
      !/(gasto|movimiento|compra|transaccion|transacción)/.test(normalized)) return { status: "none" };
  const movements = Array.isArray(state.movements) ? state.movements : [];
  const amountMatch = normalized.match(/(?:crc|₡)?\s*([\d][\d.,]*)/);
  const amount = amountMatch ? parseLooseMoney(amountMatch[1]) : null;
  const words = normalized.match(/(?:de|del|en)\s+(.+?)(?:\s+(?:por|de|del|del día|del dia|del mes)|$)/);
  const merchantQuery = words ? words[1].trim() : "";
  let matches = movements.filter((movement) => movement.type === "expense");
  if (amount !== null) matches = matches.filter((movement) => Math.abs(Number(movement.amount) - amount) < 0.01);
  if (merchantQuery) matches = matches.filter((movement) => normalize(movement.merchant).includes(merchantQuery));
  if (matches.length === 1) return { status: "ready", movement: matches[0] };
  if (matches.length > 1) {
    return {
      status: "ambiguous",
      message: "Encontré varios movimientos parecidos. Dime el comercio y el monto exacto para saber cuál quieres eliminar.",
    };
  }
  return {
    status: "ambiguous",
    message: "No encontré un único movimiento para eliminar. Dime el comercio y el monto, por ejemplo: “elimina el gasto de Uber por ₡4.250”.",
  };
}

function handleMovementDraft(question, state, sessionKey) {
  const normalized = normalize(question);
  const drafts = state.agentMemory.movementDrafts || (state.agentMemory.movementDrafts = {});
  const existing = drafts[sessionKey];
  const startsRequest = /(agrega|agregar|agregalo|agrégalo|registra|registrar|anota|anotar|añade|anadir|añadir|mete|meter)/.test(normalized);
  if (!existing && !startsRequest) {
    return { status: "none" };
  }
  if (existing && /^(cancelar|cancela|no|dejalo|déjalo)$/i.test(normalized)) {
    delete drafts[sessionKey];
    return { status: "incomplete", message: "Listo, cancelé el registro pendiente." };
  }

  const draft = { ...(existing || { type: /\b(ingreso|salario|pago recibido)\b/.test(normalized) ? "income" : "expense" }) };
  const amount = extractMovementAmount(question);
  if (amount) draft.amount = amount;
  if (/\bhoy\b/.test(normalized)) draft.date = costaRicaToday();

  const categories = getCategories(state).filter((category) => category.kind === draft.type);
  const category = inferDraftCategory(question, categories);
  if (category) draft.category = category.id;

  const merchant = findMerchantInMessage(question, Boolean(existing));
  if (merchant) draft.merchant = merchant;

  const missing = [
    !draft.amount && "el monto (por ejemplo ₡5000)",
    !draft.date && "la fecha (por ejemplo hoy)",
    !draft.merchant && "el comercio o fuente",
    !draft.category && "la categoría",
  ].filter(Boolean);
  if (missing.length) {
    drafts[sessionKey] = draft;
    return {
      status: "incomplete",
      message: `Para registrar el ${draft.type === "income" ? "ingreso" : "gasto"} solo me falta ${missing.join(", ")}. Envíame únicamente ese dato; escribe “cancelar” si no quieres continuar.`,
    };
  }
  delete drafts[sessionKey];
  const categoryName = categories.find((item) => item.id === draft.category)?.name || "Sin categoría";
  return {
    status: "ready",
    categoryName,
    data: { type: draft.type, amount: draft.amount, date: draft.date, merchant: draft.merchant, category: draft.category },
  };
}

async function requestCreateConfirmation(chatId, state, sessionKey, createRequest) {
  const actionId = makeActionId();
  state.agentMemory.pendingActions[sessionKey] = {
    id: actionId,
    type: "create_movement",
    action: { type: "create_movement", data: createRequest.data },
    createdAt: new Date().toISOString(),
  };
  await saveState(state);
  return sendMessage(chatId,
    [
      "⚠️ Antes de guardar necesito tu autorización.",
      "",
      `🛒 ${createRequest.data.merchant}`,
      `💰 CRC ${Number(createRequest.data.amount).toFixed(2)} · 📅 ${createRequest.data.date}`,
      `🏷️ ${createRequest.categoryName}`,
      "",
      "¿Quieres que lo agregue al historial?",
    ].join("\n"),
    [[
      { text: "✅ Sí, agregar", callback_data: `act:confirm:${actionId}` },
      { text: "❌ Cancelar", callback_data: `act:cancel:${actionId}` },
    ]]);
}

async function requestOperationalConfirmation(chatId, state, sessionKey, operation) {
  const actionId = makeActionId();
  state.agentMemory.pendingActions[sessionKey] = {
    id: actionId,
    type: operation.action.type,
    action: operation.action,
    successText: operation.successText || "",
    createdAt: new Date().toISOString(),
  };
  await saveState(state);
  return sendMessage(chatId, ["⚠️ Antes de hacer este cambio necesito tu autorización.", "", operation.preview, "", "¿Confirmas?"].join("\n"), [[
    { text: "✅ Sí, confirmar", callback_data: `act:confirm:${actionId}` },
    { text: "❌ Cancelar", callback_data: `act:cancel:${actionId}` },
  ]]);
}

function findOperationalAction(question, state) {
  const text = normalize(question);
  const categories = getCategories(state);
  const amount = extractMovementAmount(question);

  if (/(muestra|muestrame|ver|lista).{0,28}(pendiente|pendientes|bandeja)/.test(text)) {
    const pending = state.pendingMovements || [];
    return {
      status: "info",
      message: pending.length
        ? `Bandeja pendiente:\n${pending.slice(0, 12).map((item, index) => `${index + 1}. ${item.merchant || "Sin comercio"} · CRC ${Number(item.amount || 0).toFixed(2)} · ${item.date}`).join("\n")}\n\nPara aceptarlo escribe “acepta pendiente <comercio>” o para descartarlo “descarta pendiente <comercio>”.`
        : "No hay movimientos pendientes en la Bandeja.",
    };
  }

  const pendingMatch = findPendingFromText(question, state);
  if (pendingMatch && /(acepta|aceptar|agrega|agregar|confirma|confirmar).{0,24}(pendiente|bandeja)|(?:pendiente|bandeja).{0,24}(acepta|aceptar|agrega|agregar)/.test(text)) {
    return { status: "ready", action: { type: "accept_pending", id: pendingMatch.id }, preview: `Agregaré a historial: ${pendingMatch.merchant} por CRC ${Number(pendingMatch.amount || 0).toFixed(2)}.` };
  }
  if (pendingMatch && /(descarta|descartar|elimina|eliminar|borra|borrar).{0,24}(pendiente|bandeja)|(?:pendiente|bandeja).{0,24}(descarta|descartar|elimina|eliminar|borra|borrar)/.test(text)) {
    return { status: "ready", action: { type: "delete_pending", id: pendingMatch.id }, preview: `Descartaré el pendiente: ${pendingMatch.merchant} por CRC ${Number(pendingMatch.amount || 0).toFixed(2)}.` };
  }

  if (/(muestra|muestrame|ver|lista).{0,20}(categoria|categorias)/.test(text)) {
    return { status: "info", message: `Categorías:\n${categories.map((item) => `• ${item.name} (${item.kind === "income" ? "ingreso" : "gasto"})`).join("\n")}` };
  }
  const newCategory = question.match(/(?:crea|crear|agrega|agregar)\s+(?:una\s+)?categor[ií]a\s+(?:de\s+)?(.+)/i);
  if (newCategory) {
    const name = newCategory[1].replace(/\s+(?:para|con)\s+.*/i, "").trim();
    if (!name) return { status: "incomplete", message: "Dime el nombre de la categoría. Por ejemplo: “crea categoría Mascotas”." };
    const kind = /ingreso|entrada/.test(text) ? "income" : "expense";
    if (categories.some((item) => normalize(item.name) === normalize(name))) return { status: "info", message: `La categoría “${name}” ya existe.` };
    return { status: "ready", action: { type: "create_category", name, kind }, preview: `Crearé la categoría de ${kind === "income" ? "ingresos" : "gastos"}: “${name}”.` };
  }
  const categoryToDelete = findCategoryAfterAction(question, categories, /(elimina|eliminar|borra|borrar).{0,20}categoria/);
  if (categoryToDelete) return { status: "ready", action: { type: "delete_category", id: categoryToDelete.id }, preview: `Eliminaré la categoría “${categoryToDelete.name}”. Sus movimientos pasarán a Imprevistos.` };
  const renameCategory = question.match(/(?:cambia|cambiar|renombra|renombrar|edita|editar)\s+(?:la\s+)?categor[ií]a\s+(.+?)\s+(?:a|por)\s+(.+)$/i);
  if (renameCategory) {
    const current = categories.find((item) => normalize(item.name) === normalize(renameCategory[1]));
    const name = renameCategory[2].trim();
    if (!current || !state.customCategories.some((item) => item.id === current.id)) return { status: "incomplete", message: "Solo puedo renombrar categorías personalizadas. Dime el nombre exacto de la categoría." };
    return { status: "ready", action: { type: "update_category", id: current.id, name }, preview: `Renombraré la categoría “${current.name}” como “${name}”.` };
  }

  if (/(presupuesto|limite|l[ií]mite).{0,45}(pone|pon|cambia|actualiza|define|guarda)|(?:pone|pon|cambia|actualiza|define|guarda).{0,45}(presupuesto|limite|l[ií]mite)/.test(text)) {
    const category = findCategoryInText(question, categories, "expense");
    if (!category || !amount) return { status: "incomplete", message: "Para cambiar un presupuesto dime categoría y monto. Ejemplo: “pon presupuesto de Alimentación en ₡80.000”." };
    return { status: "ready", action: { type: "set_budget", categoryId: category.id, amount, month: costaRicaToday().slice(0, 7) }, preview: `El presupuesto de ${category.name} quedará en CRC ${amount.toFixed(2)} este mes.` };
  }
  if (/(muestra|muestrame|ver|como van|cómo van).{0,30}(presupuesto|presupuestos)/.test(text)) return { status: "info", message: summarizeBudgets(state, categories) };

  const goal = question.match(/(?:crea|crear|agrega|agregar)\s+(?:una\s+)?meta(?:\s+de\s+ahorro)?\s+(.+)/i);
  if (goal) {
    const name = goal[1].replace(/\s+(?:de|por)\s+(?:₡|crc)?[\d.,]+.*$/i, "").trim();
    if (!name || !amount) return { status: "incomplete", message: "Para crear una meta dime el nombre y objetivo. Ejemplo: “crea meta Viaje de ₡500.000”." };
    return { status: "ready", action: { type: "create_saving_goal", name, target: amount }, preview: `Crearé la meta “${name}” con objetivo de CRC ${amount.toFixed(2)}.` };
  }
  const savingGoal = findSavingFromText(question, state);
  if (savingGoal && /(elimina|eliminar|borra|borrar).{0,30}(meta|ahorro)|(?:meta|ahorro).{0,30}(elimina|eliminar|borra|borrar)/.test(text)) {
    return { status: "ready", action: { type: "delete_saving_goal", id: savingGoal.id }, preview: `Eliminaré la meta “${savingGoal.name}” y sus movimientos de ahorro asociados.` };
  }
  if (savingGoal && amount && /(cambia|cambiar|actualiza|actualizar|edita|editar).{0,35}(meta|objetivo|ahorro)/.test(text)) {
    return { status: "ready", action: { type: "update_saving_goal", id: savingGoal.id, target: amount }, preview: `El objetivo de “${savingGoal.name}” quedará en CRC ${amount.toFixed(2)}.` };
  }
  if (/(muestra|muestrame|ver|como van|cómo van).{0,30}(ahorro|ahorros|meta|metas)/.test(text)) return { status: "info", message: summarizeSavings(state) };
  const savingVerb = /(ahorra|ahorrar|deposita|depositar|mete|meter|retira|retirar|saca|sacar)/.test(text);
  if (savingVerb && amount && /(ahorro|meta|cuenta)/.test(text)) {
    const account = findSavingFromText(question, state);
    if (!account) return { status: "incomplete", message: "Dime en cuál meta de ahorro. Puedes escribir, por ejemplo: “ahorra ₡10.000 en Viaje”." };
    const withdrawal = /(retira|retirar|saca|sacar)/.test(text);
    return { status: "ready", action: { type: "transfer_saving", accountId: account.id, amount, direction: withdrawal ? "withdraw" : "deposit", date: costaRicaToday() }, preview: `${withdrawal ? "Retiraré" : "Moveré"} CRC ${amount.toFixed(2)} ${withdrawal ? "de" : "a"} la meta “${account.name}”.` };
  }

  const scheduledDelete = findScheduledFromText(question, state);
  if (scheduledDelete && /(elimina|eliminar|borra|borrar).{0,25}(programado|pago)/.test(text)) return { status: "ready", action: { type: "delete_scheduled_payment", id: scheduledDelete.id }, preview: `Eliminaré el pago programado “${scheduledDelete.name}”.` };
  if (/(?:programa|programar|agrega|agregar|crea|crear).{0,30}(?:pago|gasto).{0,45}(?:mensual|programado)|(?:pago|gasto).{0,30}programado/.test(text) && amount) {
    const nameMatch = question.match(/(?:pago|gasto)(?:\s+programado)?\s+(?:de\s+)?([^₡\d,.]+?)(?:\s+(?:por|de)\s+(?:₡|crc)?[\d.,]+|$)/i);
    const name = String(nameMatch?.[1] || "Pago programado").replace(/^(?:para|de)\s+/i, "").trim();
    const category = findCategoryInText(question, categories, "expense") || categories.find((item) => item.id === "imprevistos");
    const dueDate = parseActionDate(question) || costaRicaToday();
    return { status: "ready", action: { type: "create_scheduled_payment", name, amount, dueDate, category: category.id, repeat: /mensual/.test(text) ? "monthly" : "once" }, preview: `Crearé el pago programado “${name}” por CRC ${amount.toFixed(2)} para ${dueDate}${/mensual/.test(text) ? ", mensual" : ""}.` };
  }

  const update = findMovementUpdate(question, state, categories);
  if (update.status !== "none") return update;
  return { status: "none" };
}

function summarizeBudgets(state, categories) {
  const rows = Object.entries(state.budgets || {}).map(([id, amount]) => `• ${categories.find((item) => item.id === id)?.name || id}: CRC ${Number(amount || 0).toFixed(2)}`);
  return rows.length ? `Presupuestos del mes actual:\n${rows.join("\n")}` : "No hay presupuestos definidos todavía.";
}

function summarizeSavings(state) {
  const accounts = state.savingsAccounts || [];
  if (!accounts.length) return "No hay metas de ahorro creadas todavía.";
  return `Metas de ahorro:\n${accounts.map((account) => {
    const saved = (state.movements || []).filter((item) => item.savingAccountId === account.id).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return `• ${account.name}: CRC ${saved.toFixed(2)} de CRC ${Number(account.target || 0).toFixed(2)}`;
  }).join("\n")}`;
}

function findCategoryInText(question, categories, kind) {
  const text = normalize(question);
  return categories.filter((item) => !kind || item.kind === kind).sort((a, b) => normalize(b.name).length - normalize(a.name).length)
    .find((item) => text.includes(normalize(item.name)) || (item.keywords || []).some((word) => normalize(word).length > 2 && text.includes(normalize(word)))) || null;
}

function findCategoryAfterAction(question, categories, expression) {
  return expression.test(normalize(question)) ? findCategoryInText(question, categories) : null;
}

function findSavingFromText(question, state) {
  const text = normalize(question);
  return (state.savingsAccounts || []).sort((a, b) => normalize(b.name).length - normalize(a.name).length).find((item) => text.includes(normalize(item.name))) || null;
}

function findScheduledFromText(question, state) {
  const text = normalize(question);
  return (state.scheduledPayments || []).sort((a, b) => normalize(b.name).length - normalize(a.name).length).find((item) => text.includes(normalize(item.name))) || null;
}

function findPendingFromText(question, state) {
  const text = normalize(question);
  return (state.pendingMovements || []).sort((a, b) => normalize(b.merchant).length - normalize(a.merchant).length).find((item) => text.includes(normalize(item.merchant))) || null;
}

function parseActionDate(question) {
  const text = normalize(question);
  if (/\bhoy\b/.test(text)) return costaRicaToday();
  const match = String(question).match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  return match ? match[0] : "";
}

function findMovementUpdate(question, state, categories) {
  const text = normalize(question);
  if (!/(cambia|cambiar|edita|editar|corrige|corregir|actualiza|actualizar)/.test(text) || !/(gasto|movimiento|compra|categoria|categoría|monto|fecha|comercio)/.test(text)) return { status: "none" };
  const candidates = (state.movements || []).filter((item) => item.type !== "saving" && normalize(item.merchant).split(" ").some((word) => word.length > 3 && text.includes(word)));
  if (candidates.length !== 1) return { status: "incomplete", message: "Para editar dime el comercio y qué cambio quieres hacer. Ejemplo: “cambia la categoría del gasto Uber a Transporte”." };
  const target = candidates[0];
  const category = findCategoryInText(question, categories, target.type);
  const newAmount = /(monto|importe|total|por)\s*(?:a|en)?\s*(?:₡|crc)?\s*[\d]/.test(text) ? amountFromQuestion(question) : null;
  const date = parseActionDate(question);
  const data = { ...target };
  if (category && category.id !== target.category) data.category = category.id;
  if (newAmount) data.amount = newAmount;
  if (date) data.date = date;
  if (data.category === target.category && data.amount === target.amount && data.date === target.date) return { status: "incomplete", message: "Dime el valor nuevo que quieres guardar: categoría, monto o fecha." };
  return { status: "ready", action: { type: "update_movement", id: target.id, data }, preview: `Actualizaré ${target.merchant}: categoría ${categories.find((item) => item.id === data.category)?.name || data.category}, monto CRC ${Number(data.amount).toFixed(2)}, fecha ${data.date}.` };
}

function amountFromQuestion(question) { return extractMovementAmount(question); }

function inferDraftCategory(question, categories) {
  const text = normalize(question);
  const match = categories.find((item) => normalize(item.name) && (text.includes(normalize(item.name)) || (item.keywords || []).some((word) => text.includes(normalize(word)))));
  return match || null;
}

function findMerchantInMessage(text, allowSingleValue) {
  const direct = String(text || "").match(/\ben\s+([\p{L}][\p{L}\s.'’-]*?)(?:\s*,|\s+(?:alimentacion|alimentación|comida|gasto|categoria|categoría)\b|$)/iu);
  if (direct) return direct[1].trim();
  const value = String(text || "").trim();
  if (allowSingleValue && value.length >= 3 && value.length <= 50 && /^[\p{L}\s.'’-]+$/u.test(value) &&
    !/(hoy|ayer|cancelar|si|sí|no|correo|email|make|leer|lee|porfa|puedes)/i.test(value)) return value;
  return "";
}

function extractMovementAmount(value) {
  const text = normalize(value);
  const amountWithUnit = text.match(/(?:₡\s*)?(\d+(?:[.,]\d+)?)\s*(mil(?:es)?|colones|crc)\b/);
  if (amountWithUnit) {
    const amount = parseLooseMoney(amountWithUnit[1]);
    return /mil/.test(amountWithUnit[2]) ? amount * 1000 : amount;
  }
  const symbolAmount = text.match(/(?:₡|crc)\s*(\d+(?:[.,]\d+)?)/);
  return symbolAmount ? parseLooseMoney(symbolAmount[1]) : null;
}

function findMerchantInConversation(userTexts) {
  const ignored = new Set(["porfa", "por favor", "agregalo", "agregalo porfa", "quiero que tu lo agregues", "quiero que tú lo agregues"]);
  const detail = [...userTexts].reverse().find((value) => extractMovementAmount(value) && /\ben\s+/i.test(String(value || "")));
  const directMatch = String(detail || "").match(/\ben\s+([\p{L}][\p{L}\s.'’-]*?)(?:\s*,|\s+(?:alimentacion|alimentación|comida|gasto|categoria|categoría)\b|$)/iu);
  if (directMatch) return directMatch[1].trim();
  const single = [...userTexts].reverse().map((value) => String(value || "").trim()).find((value) =>
    value.length >= 3 && value.length <= 50 && /^[\p{L}\s.'’-]+$/u.test(value) &&
      !ignored.has(normalize(value)) && !/(correo|email|make|leer|lee|porfa|puedes)/.test(normalize(value)));
  if (single) return single;
  const match = userTexts.join(" ").match(/(?:en|de|para)\s+([\p{L}][\p{L}\s.'’-]{2,50})/u);
  return match ? match[1].trim() : "";
}

function costaRicaToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseLooseMoney(value) {
  const clean = String(value || "").replace(/[^\d.,]/g, "");
  if (!clean) return null;
  if (/^\d{1,3}(\.\d{3})+$/.test(clean) && !clean.includes(",")) return Number(clean.replace(/\./g, ""));
  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");
  const decimalSeparator = lastComma > lastDot ? "," : ".";
  return Number(clean.replace(new RegExp(`\\${decimalSeparator === "," ? "." : ","}`, "g"), "").replace(decimalSeparator, "."));
}

function makeActionId() {
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildCategoryButtons(categories, movement, scope) {
  const options = categories.filter((category) => category.kind === movement.type).slice(0, 14);
  const rows = [];
  for (let index = 0; index < options.length; index += 2) {
    rows.push(options.slice(index, index + 2).map((category) => ({
      text: category.name,
      callback_data: "cc:set:" + scope + ":" + movement.id + ":" + category.id,
    })));
  }
  return rows;
}

async function getState() {
  const state = await getAppState(process.env.AGENT_OWNER_USER_ID);
  state.movements = Array.isArray(state.movements) ? state.movements : [];
  state.pendingMovements = Array.isArray(state.pendingMovements) ? state.pendingMovements : [];
  state.agentMemory = state.agentMemory || {};
  state.agentMemory.notes = Array.isArray(state.agentMemory.notes) ? state.agentMemory.notes : [];
  state.agentMemory.goals = Array.isArray(state.agentMemory.goals) ? state.agentMemory.goals : [];
  state.agentMemory.telegramSessions = state.agentMemory.telegramSessions || {};
  state.agentMemory.pendingActions = state.agentMemory.pendingActions || {};
  state.agentMemory.pendingIntents = state.agentMemory.pendingIntents || {};
  return state;
}

function saveState(state) {
  return saveAppState(process.env.AGENT_OWNER_USER_ID, state);
}

function rememberConversation(state, sessionKey, question, answer) {
  const sessions = state.agentMemory.telegramSessions || (state.agentMemory.telegramSessions = {});
  const history = Array.isArray(sessions[sessionKey]) ? sessions[sessionKey] : [];
  sessions[sessionKey] = uniqueLast([
    ...history,
    { role: "user", text: truncate(question, 360) },
    { role: "assistant", text: truncate(answer, 650) },
  ], 8);
}

function uniqueLast(items, limit) {
  return items.filter(Boolean).slice(-limit);
}

function truncate(value, length) {
  const text = String(value || "");
  return text.length > length ? text.slice(0, length - 1) + "…" : text;
}

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function telegram(method, body) {
  const response = await fetch("https://api.telegram.org/bot" + process.env.TELEGRAM_BOT_TOKEN + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json().catch(() => ({}));
}

function answerCallback(callbackQueryId, text) {
  return telegram("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

function editMessage(chatId, messageId, text, keyboard) {
  return telegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: keyboard.length ? { inline_keyboard: keyboard } : { inline_keyboard: [] },
  });
}

function editReplyMarkup(chatId, messageId, keyboard) {
  return telegram("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: keyboard },
  });
}

function sendMessage(chatId, text, keyboard = []) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    ...(keyboard.length ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

function sendChatAction(chatId, action) {
  return telegram("sendChatAction", { chat_id: chatId, action });
}
