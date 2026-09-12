// Downloadable encrypted snapshot. The passphrase only exists for this
// request; it is never stored in Supabase, logs, Telegram, or agent memory.
const crypto = require("crypto");
const { getAppState } = require("./_agent");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });
  try {
    const body = req.body && typeof req.body === "object" ? req.body : await readBody(req);
    const passphrase = String(body.passphrase || "");
    if (passphrase.length < 12) return res.status(400).json({ error: "Usa una contraseña local de al menos 12 caracteres." });
    const signedInUser = await authenticatedUser(req);
    const ownerId = process.env.AGENT_OWNER_USER_ID;
    if (!signedInUser || (ownerId && signedInUser !== ownerId)) return res.status(403).json({ error: "No tienes acceso a este respaldo." });
    const state = await getAppState(ownerId || signedInUser);
    const payload = Buffer.from(JSON.stringify({ format: "cuenta-clara-backup-v1", createdAt: new Date().toISOString(), state }), "utf8");
    const encrypted = encrypt(payload, passphrase);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename=cuenta-clara-respaldo-${new Date().toISOString().slice(0, 10)}.ccbackup`);
    res.status(200).send(JSON.stringify(encrypted));
  } catch (error) {
    console.error("Encrypted backup error:", error);
    res.status(500).json({ error: "No pude crear el respaldo cifrado." });
  }
};

function encrypt(payload, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  return {
    format: "cuenta-clara-backup-v1",
    cipher: "aes-256-gcm",
    kdf: "scrypt",
    salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"),
    data: ciphertext.toString("base64"),
  };
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

