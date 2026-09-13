// Cuenta Clara has one public serverless entry point.  Routes are preserved
// through vercel.json rewrites so Telegram, Make and the web never need a
// breaking URL change, while the Hobby plan sees a single function.
const handlers = {
  "telegram-webhook": require("../lib/telegram-webhook"),
  "agent-inbox": require("../lib/agent-inbox"),
  "financial-advisor": require("../lib/financial-advisor"),
  "analyze-receipt": require("../lib/analyze-receipt"),
  "sync-email": require("../lib/sync-email"),
  "email-agent-sync": require("../lib/email-agent-sync"),
  "report-pdf": require("../lib/report-pdf"),
  "report-export": require("../lib/report-export"),
  reporting: require("../lib/reporting"),
  "supabase-config": require("../lib/supabase-config"),
  "agent-migration": require("../lib/agent-migration"),
  "agent-backup": require("../lib/agent-backup"),
};

module.exports = async function agentGateway(req, res) {
  const route = String(req.query?.route || "financial-advisor").replace(/^\/+|\/+$/g, "");
  const handler = handlers[route];
  if (!handler) return res.status(404).json({ error: "Ruta del agente no encontrada." });
  return handler(req, res);
};
