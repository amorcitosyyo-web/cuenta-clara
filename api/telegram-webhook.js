const { getAppState, getCategories, learnRule, saveAppState } = require("./_agent");

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

  try {
    const update = req.body && typeof req.body === "object" ? req.body : await readJsonBody(req);
    if (update.callback_query) {
      if (isAllowed(update.callback_query)) await handleCallback(update.callback_query);
    } else if (update.message && isAllowedMessage(update.message)) {
      await handleMessage(update.message);
    }
  } catch (error) {
    console.error("Telegram webhook error:", error);
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

async function handleMessage(message) {
  const chatId = message.chat.id;
  if (message.voice || message.audio) {
    await sendChatAction(chatId, "typing");
    const transcript = await transcribeVoice(message.voice || message.audio);
    if (!transcript) {
      return sendMessage(chatId, "No pude entender ese audio. Puedes reenviarlo o escribirme el mensaje.");
    }
    await sendMessage(chatId, "Entendi: " + transcript);
    return replyAsAgent(message, transcript);
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
  return replyAsAgent(message, text);
}

async function replyAsAgent(message, text) {
  const chatId = message.chat.id;
  const state = await getState();
  const question = String(text || "").trim();
  const requiredPeriod = needsPeriod(question);
  const period = parsePeriod(question);
  if (requiredPeriod && !period) {
    return sendMessage(chatId, "Claro. Para revisarlo bien, dime el periodo: por ejemplo “julio 2026”, “los ultimos 5 dias” o un rango de fechas.");
  }

  const sessionKey = String(chatId);
  const sessions = state.agentMemory.telegramSessions;
  const history = Array.isArray(sessions[sessionKey]) ? sessions[sessionKey] : [];
  await sendChatAction(chatId, "typing");
  const answer = await askAdvisor(question, state, period, history);
  sessions[sessionKey] = uniqueLast([
    ...history,
    { role: "user", text: truncate(question, 360) },
    { role: "assistant", text: truncate(answer, 650) },
  ], 8);
  await saveState(state);
  return sendMessage(chatId, answer);
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
    "Responde en maximo 110 palabras y no inventes datos.",
    "Datos disponibles: " + JSON.stringify(context),
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
    totales,
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
  if (prefix !== "cc" || !process.env.AGENT_OWNER_USER_ID) return;
  const state = await getState();
  const categories = getCategories(state);
  const categoryName = (value) => categories.find((category) => category.id === value)?.name || "Sin categoria";

  if (action === "keep") {
    const pending = state.pendingMovements.find((item) => item.id === id);
    if (pending) {
      pending.classification = { ...(pending.classification || {}), status: "approved", confidence: 1, source: "telegram" };
      state.pendingMovements = state.pendingMovements.filter((item) => item.id !== id);
      state.movements.unshift(pending);
      await saveState(state);
    }
    await answerCallback(query.id, "Perfecto, lo dejo asi.");
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
  return state;
}

function saveState(state) {
  return saveAppState(process.env.AGENT_OWNER_USER_ID, state);
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
