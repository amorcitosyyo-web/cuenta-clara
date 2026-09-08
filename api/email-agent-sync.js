async function runEmailAgentSync({ existingSourceIds = [], userId = "", email = "", baseUrl }) {
  const makeUrl = process.env.MAKE_EMAIL_WEBHOOK_URL;
  if (!makeUrl) throw new Error("Falta configurar MAKE_EMAIL_WEBHOOK_URL en Vercel.");
  if (!process.env.AGENT_INGEST_TOKEN) throw new Error("Falta configurar AGENT_INGEST_TOKEN en Vercel.");
  if (!baseUrl) throw new Error("No se pudo determinar el dominio de Cuenta Clara.");

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

  const agentResponse = await fetch(`${baseUrl}/api/agent-inbox`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cuenta-Clara-Agent-Token": process.env.AGENT_INGEST_TOKEN,
    },
    body: JSON.stringify({ items: normalizeItems(makePayload) }),
  });
  const agentPayload = await readPayload(agentResponse);
  if (!agentResponse.ok) throw new Error(agentPayload.error || "El agente no pudo procesar el correo.");
  return agentPayload;
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
