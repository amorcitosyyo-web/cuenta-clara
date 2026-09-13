const { getAppState, getCategories, saveAppState, sendTelegram } = require("./_agent");
const { planningPrompt, taskKey } = require("./agent-core");
const { runEmailAgentSync } = require("./email-agent-sync");

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return res.status(405).end();
  if (!authorized(req)) return res.status(401).json({ error: "Cron no autorizado" });
  const ownerId = process.env.AGENT_OWNER_USER_ID;
  if (!ownerId) return res.status(500).json({ error: "Falta AGENT_OWNER_USER_ID" });
  try {
    const job = String(req.query?.job || req.body?.job || "routine");
    let result;
    // The inbox sync loads and saves its own fresh state.  Keeping a second,
    // stale copy here used to overwrite movements that Make had just added.
    if (job === "email") {
      result = await emailJob(req);
    } else {
      const state = await getAppState(ownerId);
      if (job === "due") result = await dueJob(state);
      else result = await routineJob(state);
      await saveAppState(ownerId, state);
    }
    res.status(200).json({ ok: true, job, ...result });
  } catch (error) {
    console.error("Agent cron error:", error);
    res.status(500).json({ error: error.message || "No se pudo ejecutar la automatización." });
  }
};

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.authorization === `Bearer ${secret}`;
}

function costaRicaNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

async function emailJob(req) {
  const ownerId = process.env.AGENT_OWNER_USER_ID;
  const state = await getAppState(ownerId);
  const result = await runEmailAgentSync({ existingSourceIds: [...(state.movements || []), ...(state.pendingMovements || [])].map((item) => item.sourceId).filter(Boolean), userId: ownerId, baseUrl: `https://${process.env.VERCEL_URL || req.headers.host}` });
  return { received: result.received || 0, processed: result.processed || 0 };
}

async function dueJob(state) {
  const today = costaRicaNow();
  const date = `${today.year}-${today.month}-${today.day}`;
  const inThreeDays = new Date(`${date}T12:00:00Z`); inThreeDays.setUTCDate(inThreeDays.getUTCDate() + 3);
  const targets = [date, inThreeDays.toISOString().slice(0, 10)];
  const pending = (state.scheduledPayments || []).filter((item) => item.active !== false && !(item.paidMonths || []).includes(date.slice(0, 7)) && targets.includes(String(item.dueDate || "").slice(0, 10)));
  if (!pending.length) return { notified: 0 };
  await sendTelegram(`📅 Recordatorio de pagos\n\n${pending.map((item) => `• ${item.name}: CRC ${Number(item.amount || 0).toFixed(2)} · vence ${item.dueDate}`).join("\n")}`);
  return { notified: pending.length };
}

async function routineJob(state) {
  const local = costaRicaNow();
  const date = `${local.year}-${local.month}-${local.day}`;
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "");
  const planningKey = taskKey("telegram", chatId);
  const active = state.agentMemory?.activeTasks?.[planningKey];
  const notices = [];
  if (Number(local.day) === 7 && !active) {
    const reply = planningPrompt(state, "telegram", chatId);
    await sendTelegram(reply.text, reply.buttons || []);
    notices.push("monthly_plan_started");
  } else if (active?.kind === "planning" && active.status !== "cancelled") {
    await sendTelegram("🗓️ La planificación mensual sigue pendiente. Puedes continuar desde el botón “Planificar el mes” o escribirme “continuar planificación”.");
    notices.push("monthly_plan_reminded");
  }
  const categories = getCategories(state);
  const month = date.slice(0, 7);
  const spend = (state.movements || []).filter((item) => item.type === "expense" && String(item.date || "").startsWith(month));
  const byCategory = spend.reduce((map, item) => ({ ...map, [item.category]: (map[item.category] || 0) + Number(item.amount || 0) }), {});
  const alerts = Object.entries(state.budgets || {}).map(([id, budget]) => ({ id, budget: Number(budget || 0), spent: Number(byCategory[id] || 0) })).filter((item) => item.budget > 0 && item.spent / item.budget >= 0.8);
  if (alerts.length) {
    await sendTelegram(`⚠️ Presupuestos a vigilar\n\n${alerts.map((item) => `• ${categories.find((category) => category.id === item.id)?.name || item.id}: ${Math.round((item.spent / item.budget) * 100)}% usado`).join("\n")}`);
    notices.push("budget_alert");
  }
  if (local.weekday === "Sun") {
    const total = spend.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    await sendTelegram(`🧭 Seguimiento semanal\n\nLlevan CRC ${total.toFixed(2)} de gastos registrados en ${month}. Si quieres, te digo qué categoría y comercio están pesando más.`);
    notices.push("weekly_review");
  }
  return { date, notices };
}
