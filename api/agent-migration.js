const { getAppState, saveAppState } = require("./_agent");
const { syncStructuredState } = require("./agent-store");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });
  try {
    const userId = await authorizedUser(req);
    if (!userId) return res.status(403).json({ error: "No tienes acceso a la migración." });
    const check = await migrationCheck(userId);
    const valid = Number(check.legacy_count) === Number(check.structured_count)
      && Math.abs(Number(check.legacy_total) - Number(check.structured_total)) < 0.01;
    if (!valid) return res.status(409).json({ ok: false, verified: false, check, error: "Los movimientos o totales no coinciden; la versión anterior sigue intacta." });
    const state = await getAppState(userId);
    state.meta = { ...(state.meta || {}), structuredStorageEnabled: true, structuredStorageVerifiedAt: new Date().toISOString() };
    await syncStructuredState(userId, state);
    await saveAppState(userId, state);
    res.status(200).json({ ok: true, verified: true, check });
  } catch (error) {
    console.error("Migration verification error:", error);
    res.status(500).json({ error: error.message || "No pude verificar la migración." });
  }
};

async function migrationCheck(userId) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/agent_migration_check`, {
    method: "POST", headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ target_household: userId }),
  });
  const rows = await response.json().catch(() => null);
  if (!response.ok) throw new Error(rows?.message || "Primero ejecuta database/agent-migration.sql en Supabase.");
  return Array.isArray(rows) ? rows[0] : rows;
}

async function authorizedUser(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !process.env.SUPABASE_URL) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "" } });
  const user = await response.json().catch(() => null);
  const owner = process.env.AGENT_OWNER_USER_ID;
  return response.ok && user?.id && (!owner || user.id === owner) ? user.id : null;
}
