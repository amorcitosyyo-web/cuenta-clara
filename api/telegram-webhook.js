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
  return values("TELEGRAM_CHAT_ID").includes(String(query.message && query.message.chat && query.message.chat.id || "")) &&
    values("TELEGRAM_ALLOWED_USER_IDS").includes(String(query.from && query.from.id || ""));
}

function isAllowedMessage(message) {
  return values("TELEGRAM_CHAT_ID").includes(String(message.chat && message.chat.id || "")) &&
    values("TELEGRAM_ALLOWED_USER_IDS").includes(String(message.from && message.from.id || ""));
}

async function handleMessage(message, request = null) {
  const chatId = message.chat.id;
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
    return sendMessage(chatId,
      "Hola, soy Cuenta Clara. Puedo revisar gastos, ingresos y presupuestos, aprender sus correcciones y avisarles cuando algo necesite confirmacion.\n\n" +
      "Escribanme como si hablaran con una persona. Tambien acepto notas de voz.\n" +
      "Comandos utiles: /ayuda, /recuerda [dato], /meta [objetivo], /limpiar.");
  }
  if (/^\/ayuda(?:@\w+)?$/i.test(text)) {
    return sendMessage(chatId,
      "Pueden preguntarme: “como vamos este mes?”, “analiza julio 2026”, “ayudanos a hacer presupuesto” o “que categoria es este gasto?”.\n\n" +
      "No cambio gastos, categorias ni presupuestos sin confirmar. Con /recuerda guardo una regla o preferencia y con /meta una meta financiera.");
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

function isMonthMovementsQuestion(question) {
  const text = normalize(question);
  return /(este mes|mes actual)/.test(text) &&
    /\b(gasto|gastos|movimiento|movimientos|compra|compras|transaccion|transacciones)\b/.test(text);
}

function summarizeTodayMovements(state) {
  const today = costaRicaToday();
  const movements = (state.movements || []).filter((item) => item.date === today && item.type !== "savings");
  if (movements.length) {
    const lines = movements.slice(0, 8).map((item) => `• ${item.merchant || "Sin comercio"}: CRC ${Number(item.amount || 0).toFixed(2)}`);
    const totalExpenses = movements.filter((item) => item.type === "expense").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return `Hoy (${today}) hay ${movements.length} movimiento${movements.length === 1 ? "" : "s"}:\n${lines.join("\n")}\n\nTotal de gastos hoy: CRC ${totalExpenses.toFixed(2)}.`;
  }

  // Un registro creado antes de corregir la zona horaria puede quedar con la
  // fecha del día siguiente. Se muestra de forma transparente sin cambiarlo.
  const adjacent = (state.movements || []).filter((item) => item.date && item.date !== today && item.type !== "savings").slice(0, 3);
  if (adjacent.length) {
    const details = adjacent.map((item) => `${item.merchant || "Sin comercio"} (CRC ${Number(item.amount || 0).toFixed(2)}, fecha ${item.date})`).join("; ");
    return `No hay movimientos registrados para hoy (${today}). Sí veo: ${details}. Si alguno corresponde a hoy pero tiene una fecha incorrecta, dímelo y te pediré confirmación antes de corregirlo.`;
  }
  return `No hay movimientos registrados para hoy (${today}).`;
}

function summarizeMonthMovements(state) {
  const month = costaRicaToday().slice(0, 7);
  const movements = (state.movements || []).filter((item) => String(item.date || "").startsWith(month) && item.type !== "savings");
  const expenses = movements.filter((item) => item.type === "expense");
  if (!movements.length) return `No hay movimientos registrados en ${month}.`;
  const lines = expenses.slice(0, 10).map((item) => `• ${item.date} · ${item.merchant || "Sin comercio"}: CRC ${Number(item.amount || 0).toFixed(2)}`);
  const total = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return `Movimientos de ${month}:\n${lines.join("\n") || "No hay gastos."}\n\nTotal de gastos del mes: CRC ${total.toFixed(2)}.`;
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
    if (movement.type === "savings") return false;
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

async function handleCallback(query) {
  const parts = String(query.data || "").split(":");
  const prefix = parts[0];
  const action = parts[1];
  const scope = parts[2];
  const id = parts[3];
  const categoryId = parts[4];
  if (!["cc", "act"].includes(prefix) || !process.env.AGENT_OWNER_USER_ID) return;
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
    await editMessage(query.message.chat.id, query.message.message_id,
      "Elige una nueva categoria para " + movement.merchant + ":", buildCategoryButtons(categories, movement, pending ? "p" : "m"));
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
    await saveState(state);
    await editMessage(query.message.chat.id, query.message.message_id,
      "Listo. " + item.merchant + " quedo como " + categoryName(categoryId) + ".", []);
    await answerCallback(query.id, "Movimiento actualizado.");
  }
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
  if (pending.type === "create_movement") {
    const { result: created } = executeAction(state, pending.action);
    delete state.agentMemory.pendingActions[chatId];
    await saveState(state);
    const text = `✅ Listo. Agregué ${created.merchant || "el gasto"} por CRC ${Number(created.amount || 0).toFixed(2)} al historial.`;
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

function sendMessage(chatId, text) {
  return telegram("sendMessage", { chat_id: chatId, text });
}

function sendChatAction(chatId, action) {
  return telegram("sendChatAction", { chat_id: chatId, action });
}
