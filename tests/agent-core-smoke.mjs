import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { fetchSupabaseState, normalizeState } = require("../lib/_agent.js");
const { resolveMailboxEmail } = require("../lib/email-agent-sync.js");
const { executeAction } = require("../lib/action-tools.js");
const telegramWebhook = require("../lib/telegram-webhook.js");
const { cycleFor, executeProposedAction, runAgentTurn } = require("../lib/agent-core.js");

const state = normalizeState({});

const originalFetch = globalThis.fetch;
let supabaseAttempts = 0;
globalThis.fetch = async () => {
  supabaseAttempts += 1;
  return supabaseAttempts === 1 ? { ok: false, status: 504 } : { ok: true, status: 200 };
};
const retried = await fetchSupabaseState("https://example.test/state", {});
globalThis.fetch = originalFetch;
assert.equal(retried.ok, true);
assert.equal(supabaseAttempts, 2);

globalThis.fetch = async () => ({ ok: true, json: async () => ({ email: "familia@example.com" }) });
process.env.SUPABASE_URL = "https://example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
assert.equal(await resolveMailboxEmail("owner-id", ""), "familia@example.com");
globalThis.fetch = originalFetch;

assert.deepEqual(cycleFor("2026-09-06"), { id: "2026-08-07:2026-09-06", start: "2026-08-07", end: "2026-09-06" });
assert.deepEqual(cycleFor("2026-09-07"), { id: "2026-09-07:2026-10-06", start: "2026-09-07", end: "2026-10-06" });

const automatic = executeProposedAction({
  state, channel: "telegram", conversationId: "group", actor: "member-1",
  action: { type: "create_movement", data: { type: "expense", merchant: "Automercado", amount: 5000, date: "2026-09-09", category: "alimentacion", source: "receipt", confidence: 0.95 } },
});
assert.match(automatic.text, /Listo/);
assert.equal(state.movements.length, 1);

const duplicate = executeProposedAction({
  state, channel: "telegram", conversationId: "group", actor: "member-1",
  action: { type: "create_movement", data: { type: "expense", merchant: "Automercado", amount: 5000, date: "2026-09-09", category: "alimentacion", source: "receipt", confidence: 0.95 } },
});
assert.match(duplicate.text, /Ya existe/);

const manual = executeProposedAction({
  state, channel: "telegram", conversationId: "group", actor: "member-1",
  action: { type: "record_income", data: { amount: 125000, date: "2026-09-10", merchant: "Salario", incomeKind: "salary" } },
});
assert.match(manual.text, /confirmación/i);
const confirmed = await runAgentTurn({ state, channel: "telegram", conversationId: "group", actor: "member-2", text: "sí" });
assert.match(confirmed.text, /Listo/);
assert.equal(state.movements.filter((item) => item.type === "income").length, 1);

const movementId = state.movements.find((item) => item.type === "expense").id;
executeAction(state, { type: "delete_movement", id: movementId, actor: "member-3", channel: "telegram" });
assert.equal(state.movements.some((item) => item.id === movementId), false);
assert.equal(state.trash.length, 1);
executeAction(state, { type: "restore_trash", id: state.trash[0].id, actor: "member-3", channel: "telegram" });
assert.equal(state.movements.some((item) => item.id === movementId), true);

// Regression: a request to turn known Claro charges into a monthly payment
// must never be mistaken for an incomplete manual expense.
const recurringState = normalizeState({
  movements: [
    { id: "internet-a", type: "expense", merchant: "CLARO POST PAGO 61393601", amount: 28433, date: "2026-08-24", category: "telefono-internet" },
    { id: "internet-b", type: "expense", merchant: "CLARO POST PAGO 64318363", amount: 11488, date: "2026-08-24", category: "telefono-internet" },
  ],
});
const recurring = telegramWebhook._test.findRecurringPaymentRequest(
  "Pon pago de internet unificado como recurrente, el 20 se paga",
  recurringState,
  "group-test",
);
assert.equal(recurring.status, "ready");
assert.equal(recurring.action.type, "create_scheduled_payment");
assert.equal(recurring.action.name, "Pago de internet");
assert.equal(recurring.action.amount, 39921);
assert.equal(recurring.action.dueDate.endsWith("-20"), true);
assert.equal(telegramWebhook._test.isIndependentFinancialRequest("Revisa los montos y fechas del internet"), true);

const recurringHistory = normalizeState({
  movements: [
    { id: "rent-jun", type: "expense", merchant: "ALQUILER CASA", amount: 260000, date: "2026-06-01", category: "vivienda" },
    { id: "rent-jul", type: "expense", merchant: "ALQUILER CASA", amount: 260000, date: "2026-07-01", category: "vivienda" },
    { id: "rent-aug", type: "expense", merchant: "ALQUILER CASA", amount: 260000, date: "2026-08-01", category: "vivienda" },
    { id: "claro-one", type: "expense", merchant: "CLARO POST PAGO 61393601", amount: 28433, date: "2026-08-24", category: "telefono-internet" },
    { id: "claro-two", type: "expense", merchant: "CLARO POST PAGO 64318363", amount: 11488, date: "2026-08-24", category: "telefono-internet" },
  ],
});
const recurringCandidates = telegramWebhook._test.detectRecurringCandidates(recurringHistory);
assert.deepEqual(recurringCandidates.map((item) => item.name), ["ALQUILER CASA", "Pago de internet"]);
assert.equal(recurringCandidates[0].amount, 260000);
assert.equal(recurringCandidates[0].dueDay, 1);
assert.equal(recurringCandidates[1].amount, 39921);
assert.equal(recurringCandidates[1].dueDay, 24);
assert.equal(telegramWebhook._test.isRecurringAnalysisRequest("Analiza todos los meses disponibles y determina pagos recurrentes"), true);

console.log("agent-core smoke: ok");
