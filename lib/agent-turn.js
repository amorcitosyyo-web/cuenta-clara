const { getAppState, saveAppState } = require("./_agent");
const { runAgentTurn } = require("./agent-core");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });
  try {
    const body = req.body && typeof req.body === "object" ? req.body : await readBody(req);
    const question = String(body.question || "").trim();
    if (!question) return res.status(400).json({ error: "Escribe una solicitud para Cuenta Clara." });
    const signedInUser = await authenticatedUser(req);
    const ownerId = process.env.AGENT_OWNER_USER_ID;
    // Never expose the shared household simply because a server environment
    // variable exists. The web client still needs a valid Supabase session.
    if (!signedInUser) return res.status(401).json({ error: "Inicia sesión para usar el agente." });
    if (ownerId && signedInUser !== ownerId) return res.status(403).json({ error: "Esta sesión no tiene acceso a la cuenta compartida." });
    const userId = ownerId || signedInUser;
    const state = await getAppState(userId);
    const result = await runAgentTurn({ state, channel: "web", conversationId: userId, actor: "Cuenta compartida", text: question });
    await saveAppState(userId, state);
    res.status(200).json({ answer: result.text, buttons: result.buttons || [], suggestedActions: (result.buttons || []).flat().map((button) => ({ label: button.text, description: "Acción del agente" })) });
  } catch (error) {
    console.error("Agent turn error:", error);
    res.status(500).json({ error: error.message || "No pude procesar la solicitud." });
  }
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function authenticatedUser(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !process.env.SUPABASE_URL) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "" } });
  const user = await response.json().catch(() => null);
  return response.ok ? user?.id : null;
}
