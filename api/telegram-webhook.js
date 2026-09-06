const { getAppState, getCategories, learnRule, saveAppState } = require("./_agent");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  if (process.env.TELEGRAM_WEBHOOK_SECRET && req.headers["x-telegram-bot-api-secret-token"] !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    res.status(401).end();
    return;
  }

  try {
    const update = req.body && typeof req.body === "object" ? req.body : await readJsonBody(req);
    const query = update.callback_query;
    const message = update.message;
    if (query) {
      if (!isAllowed(query)) {
        res.status(200).json({ ok: true });
        return;
      }
      await handleCallback(query);
      res.status(200).json({ ok: true });
      return;
    }
    if (message) {
      if (!isAllowedMessage(message)) {
        res.status(200).json({ ok: true });
        return;
      }
      await handleMessage(message);
      res.status(200).json({ ok: true });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(200).json({ ok: true });
  }
};

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function isAllowed(query) {
  const allowedChats = String(process.env.TELEGRAM_CHAT_ID || "").split(",").map((value) => value.trim());
  const allowedUsers = String(process.env.TELEGRAM_ALLOWED_USER_IDS || "").split(",").map((value) => value.trim());
  return allowedChats.includes(String(query.message?.chat?.id || ""))
    && allowedUsers.includes(String(query.from?.id || ""));
}

function isAllowedMessage(message) {
  const allowedChats = String(process.env.TELEGRAM_CHAT_ID || "").split(",").map((value) => value.trim());
  const allowedUsers = String(process.env.TELEGRAM_ALLOWED_USER_IDS || "").split(",").map((value) => value.trim());
  return allowedChats.includes(String(message.chat?.id || ""))
    && allowedUsers.includes(String(message.from?.id || ""));
}

async function handleMessage(message) {
  const text = String(message.text || "").trim();
  if (!text) return;

  if (text === "/start" || text === "/start@CuentaClaraBot") {
    await sendMessage(message.chat.id, "Cuenta Clara conectada. Ya puedo recibir avisos y ayudarte con los movimientos.");
    return;
  }

  await sendMessage(message.chat.id, "Recibi tu mensaje. El bot ya esta conectado; pronto podras consultar y gestionar los gastos desde aqui.");
}

async function handleCallback(query) {
  const [prefix, action, scope, id, categoryId] = String(query.data || "").split(":");
  if (prefix !== "cc" || !process.env.AGENT_OWNER_USER_ID) return;
  const state = await getAppState(process.env.AGENT_OWNER_USER_ID);
  const categories = getCategories(state);
  const categoryName = (idValue) => categories.find((category) => category.id === idValue)?.name || "Sin categoria";

  if (action === "keep") {
    await answerCallback(query.id, "Perfecto, lo dejo asi.");
    return;
  }

  if (action === "change") {
    const movement = state.movements.find((item) => item.id === id);
    if (!movement) return answerCallback(query.id, "No encontre ese movimiento.");
    const buttons = buildCategoryButtons(categories, "m", movement.id, movement.type);
    await editMessage(query.message.chat.id, query.message.message_id, `Elige una nueva categoria para ${movement.merchant}:`, buttons);
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
    await saveAppState(process.env.AGENT_OWNER_USER_ID, state);
    await editMessage(query.message.chat.id, query.message.message_id, `Listo. ${item.merchant} quedo como ${categoryName(categoryId)}.`, []);
    await answerCallback(query.id, "Movimiento actualizado.");
  }
}

function buildCategoryButtons(categories, scope, id, type) {
  const options = categories.filter((category) => category.kind === type).slice(0, 14);
  const rows = [];
  for (let index = 0; index < options.length; index += 2) {
    rows.push(options.slice(index, index + 2).map((category) => ({
      text: category.name,
      callback_data: `cc:set:${scope}:${id}:${category.id}`,
    })));
  }
  return rows;
}

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
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
