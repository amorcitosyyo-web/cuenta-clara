const { processInboxItems } = require("./agent-inbox");

async function runEmailAgentSync({ existingSourceIds = [], userId = "", email = "", baseUrl }) {
  const makeUrl = process.env.MAKE_EMAIL_WEBHOOK_URL;
  if (!makeUrl) throw new Error("Falta configurar MAKE_EMAIL_WEBHOOK_URL en Vercel.");

  const makeResponse = await fetch(makeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.MAKE_EMAIL_WEBHOOK_TOKEN ? { "X-Cuenta-Clara-Token": process.env.MAKE_EMAIL_WEBHOOK_TOKEN } : {}),
    },
    body: JSON.stringify({ existingSourceIds, userId, email }),
  });
  const makePayload = await readPayload(makeResponse);
  if (!makeResponse.ok) throw new Error(makePayload.error || "Make no pudo leer el correo.");

  const result = await processInboxItems(normalizeItems(makePayload), userId);
  return { ok: true, ...result, processed: result.autoAccepted.length + result.pending.length };
}

async function readPayload(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { items: [] }; }
}

function normalizeItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.pending)) return payload.pending;
  if (Array.isArray(payload.movements)) return payload.movements;
  return [];
}

module.exports = { runEmailAgentSync };
