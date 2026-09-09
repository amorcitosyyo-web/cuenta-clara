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
    const result = await processInboxItems(rawItems, process.env.AGENT_OWNER_USER_ID);
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

async function processInboxItems(rawItems, userId) {
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
    state.movements.unshift(movement);
    result.autoAccepted.push(movement);
  }

  state.agentMemory.recentEvents = [{
    at: new Date().toISOString(),
    kind: "email_sync",
    autoAccepted: result.autoAccepted.length,
    pending: result.pending.length,
  }, ...state.agentMemory.recentEvents].slice(0, 60);
  await saveAppState(userId, state);
  await notifyTelegram(result, getCategories(state));
  return result;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function notifyTelegram(result, categories) {
  const categoryName = (id) => categories.find((category) => category.id === id)?.name || "Sin categoria";
  const dateLabel = (value) => {
    const date = new Date(`${String(value || "").slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime())
      ? String(value || "Fecha no disponible")
      : date.toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
  };
  const typeLabel = (movement) => movement.type === "income" ? "Ingreso" : "Gasto";
  const confidenceLabel = (movement) => {
    const confidence = Math.round(Number(movement.classification?.confidence || 0) * 100);
    return confidence >= 90
      ? `✅ alta (${confidence}%)`
      : confidence
        ? `⚠️ para revisar (${confidence}%)`
        : "⚠️ para revisar";
  };
  const movements = [...result.autoAccepted, ...result.pending];
  if (!movements.length) return;

  // Un solo reporte por lectura: asi pueden comparar 4-5 movimientos de una
  // vez y tocar exactamente el boton del que necesiten corregir.
  const lines = [
    "📬 Cuenta Clara · movimientos revisados",
    "",
    `Encontré ${movements.length} movimiento${movements.length === 1 ? "" : "s"}. Ya quedaron registrados:`,
    "",
  ];
  const keyboard = [];
  movements.forEach((movement, index) => {
    lines.push(
      `${index + 1}. ${movement.type === "income" ? "💵" : "🛒"} ${movement.merchant}`,
      `   💰 CRC ${movement.amount.toFixed(2)} · 📅 ${dateLabel(movement.date)}`,
      `   🏷️ ${categoryName(movement.category)} · ${confidenceLabel(movement)}`,
      "",
    );
    keyboard.push([{
      text: `✏️ Cambiar categoría · ${index + 1}. ${movement.merchant}`.slice(0, 64),
      callback_data: `cc:change:m:${movement.id}`,
    }]);
  });
  lines.push("Si todo está bien, no tienen que hacer nada. Si algo está mal, toquen su botón correspondiente.");
  await sendTelegram(lines.join("\n"), keyboard);
}

module.exports.processInboxItems = processInboxItems;
