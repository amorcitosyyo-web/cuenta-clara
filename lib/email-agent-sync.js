const { processInboxItems } = require("./agent-inbox");
const { normalizeMakeItems } = require("./make-payload");

async function runEmailAgentSync({ existingSourceIds = [], userId = "", email = "", baseUrl }) {
  const makeUrl = process.env.MAKE_EMAIL_WEBHOOK_URL;
  if (!makeUrl) throw new Error("Falta configurar MAKE_EMAIL_WEBHOOK_URL en Vercel.");

  // El botón web tiene la sesión del usuario y ya envía su correo a Make. Un
  // mensaje de Telegram no tiene esa sesión, pero debe ejecutar exactamente la
  // misma búsqueda de Gmail; de lo contrario Make responde una bandeja vacía.
  const mailbox = await resolveMailboxEmail(userId, email);

  const makeResponse = await fetch(makeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.MAKE_EMAIL_WEBHOOK_TOKEN ? { "X-Cuenta-Clara-Token": process.env.MAKE_EMAIL_WEBHOOK_TOKEN } : {}),
    },
    body: JSON.stringify({ existingSourceIds, userId, email: mailbox }),
  });
  const makePayload = await readPayload(makeResponse);
  if (!makeResponse.ok) throw new Error(makePayload.error || "Make no pudo leer el correo.");

  const items = normalizeMakeItems(makePayload);
  const result = await processInboxItems(items, userId);
  return { ok: true, ...result, received: items.length, processed: result.autoAccepted.length + result.pending.length };
}

async function resolveMailboxEmail(userId, providedEmail) {
  const supplied = String(providedEmail || "").trim();
  if (supplied) return supplied;
  const configured = String(process.env.AGENT_OWNER_EMAIL || "").trim();
  if (configured) return configured;
  if (!userId || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return "";

  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok) return "";
  const payload = await response.json().catch(() => null);
  return String(payload?.email || payload?.user?.email || "").trim();
}

async function readPayload(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { items: [] }; }
}

module.exports = { runEmailAgentSync, resolveMailboxEmail };
