const {
  classifyIncoming,
  getAppState,
  getCategories,
  normalizeIncomingItem,
  saveAppState,
  sendTelegram,
} = require("./_agent");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Metodo no permitido" });
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.AGENT_OWNER_USER_ID) {
    res.status(500).json({ error: "Falta configurar Supabase o AGENT_OWNER_USER_ID en Vercel" });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Webhook no autorizado" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const rawItems = Array.isArray(body.items) ? body.items : Array.isArray(body) ? body : [body];
    const userId = process.env.AGENT_OWNER_USER_ID;
    const state = await getAppState(userId);
    const known = new Set([
      ...state.movements.map((item) => item.sourceId).filter(Boolean),
      ...state.pendingMovements.map((item) => item.sourceId).filter(Boolean),
    ]);
    const result = { autoAccepted: [], pending: [], duplicates: [], ignored: [] };

    for (const raw of rawItems) {
      const merchant = String(raw?.merchant || raw?.comercio || raw?.name || "").trim();
      if (!merchant) {
        result.ignored.push({ reason: "Sin comercio" });
        continue;
      }
      const classification = await classifyIncoming(raw, state);
      const movement = normalizeIncomingItem(raw, classification);
      if (!movement.amount) {
        result.ignored.push({ merchant, reason: "Sin monto" });
        continue;
      }
      if (known.has(movement.sourceId)) {
        result.duplicates.push({ merchant, sourceId: movement.sourceId });
        continue;
      }
      known.add(movement.sourceId);

      if (movement.classification.status === "auto_accepted") {
        state.movements.unshift(movement);
        result.autoAccepted.push(movement);
      } else {
        state.pendingMovements.unshift(movement);
        result.pending.push(movement);
      }
    }

    state.agentMemory.recentEvents = [
      {
        at: new Date().toISOString(),
        kind: "email_sync",
        autoAccepted: result.autoAccepted.length,
        pending: result.pending.length,
      },
      ...state.agentMemory.recentEvents,
    ].slice(0, 60);
    await saveAppState(userId, state);

    await notifyTelegram(result, getCategories(state));
    res.status(200).json({ ok: true, ...result, processed: result.autoAccepted.length + result.pending.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "No se pudo procesar el correo" });
  }
};

function isAuthorized(req) {
  const expected = process.env.AGENT_INGEST_TOKEN;
  if (!expected) return false;
  return req.headers["x-cuenta-clara-agent-token"] === expected;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function notifyTelegram(result, categories) {
  const categoryName = (id) => categories.find((category) => category.id === id)?.name || "Sin categoria";
  for (const movement of result.autoAccepted) {
    await sendTelegram(
      `Agregue un ${movement.type === "income" ? "ingreso" : "gasto"}: ${movement.merchant} por CRC ${movement.amount.toFixed(2)}. Categoria: ${categoryName(movement.category)}.`,
      [[
        { text: "Cambiar categoria", callback_data: `cc:change:m:${movement.id}` },
        { text: "Dejar asi", callback_data: `cc:keep:m:${movement.id}` },
      ]],
    );
  }
  for (const movement of result.pending) {
    const expenseCategories = categories.filter((category) => category.kind === movement.type).slice(0, 14);
    const buttons = [];
    for (let index = 0; index < expenseCategories.length; index += 2) {
      buttons.push(expenseCategories.slice(index, index + 2).map((category) => ({
        text: category.name,
        callback_data: `cc:set:p:${movement.id}:${category.id}`,
      })));
    }
    await sendTelegram(
      `Tengo duda con ${movement.merchant} por CRC ${movement.amount.toFixed(2)}. La deje en Bandeja. Que categoria es?`,
      buttons,
    );
  }
}
