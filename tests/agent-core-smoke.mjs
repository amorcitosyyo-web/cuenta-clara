import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { fetchSupabaseState, normalizeState } = require("../lib/_agent.js");
const { resolveMailboxEmail, _test: emailSyncTest } = require("../lib/email-agent-sync.js");
const { normalizeMakeItems } = require("../lib/make-payload.js");
const { executeAction } = require("../lib/action-tools.js");
const telegramWebhook = require("../lib/telegram-webhook.js");
const { cycleFor, executeProposedAction, runAgentTurn, _test: agentCoreTest } = require("../lib/agent-core.js");
const { collectBudgetAlerts, formatBudgetAlerts } = require("../lib/budget-alerts.js");
const agentJobs = require("../lib/agent-jobs.js");

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

const makeBundles = '{"items":[{"source":"gmail","sourceId":"one","date":"Sep 13, 2026","merchant":"FRESH MARKET","amount":"900.00"}]}{"items":[{"source":"gmail","sourceId":"two","date":"Sep 12, 2026","merchant":"MINI SUPER","amount":"2100.00"}]}'
const rawMakePayload = await emailSyncTest.readPayload({ text: async () => makeBundles });
assert.equal(typeof rawMakePayload, "string");
assert.equal(normalizeMakeItems(rawMakePayload).length, 2);

assert.deepEqual(cycleFor("2026-09-06"), { id: "2026-08-07:2026-09-06", start: "2026-08-07", end: "2026-09-06" });
assert.deepEqual(cycleFor("2026-09-07"), { id: "2026-09-07:2026-10-06", start: "2026-09-07", end: "2026-10-06" });
const contextualMessages = agentCoreTest.buildAgentMessages("porfa", { month: "2026-09" }, [{ role: "assistant", text: "¿Quieres que detalle los movimientos de comida fuera?" }], "Comida fuera: CRC 23,700");
assert.equal(contextualMessages.at(-1).content, "porfa");
assert.match(contextualMessages.map((item) => item.content).join("\n"), /comida fuera/i);
assert.deepEqual(agentCoreTest.parseModelResponse({ output: [
  { type: "message", content: [{ type: "output_text", text: "Entendido." }] },
  { type: "function_call", name: "financial_action", arguments: '{"type":"set_budget","data":{"amount":20000}}' },
] }), { text: "Entendido.", action: { type: "set_budget", data: { amount: 20000 } } });

// A general question must reach the model with its tool schema. This caught a
// production bug where the schema was accidentally scoped inside the prompt
// builder, making every non-rule-based request fail before the model ran.
const previousKey = process.env.OPENAI_API_KEY;
const previousModel = process.env.OPENAI_AGENT_MODEL;
process.env.OPENAI_API_KEY = "test-key";
process.env.OPENAI_AGENT_MODEL = "gpt-5-mini";
let responseRequest;
globalThis.fetch = async (_url, options) => {
  responseRequest = JSON.parse(options.body);
  return { ok: true, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: "Vigila comidas fuera esta semana." }] }] }) };
};
const modelReply = await runAgentTurn({ state: normalizeState({}), channel: "telegram", conversationId: "model-test", text: "¿Qué debería vigilar esta semana?" });
globalThis.fetch = originalFetch;
if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
if (previousModel === undefined) delete process.env.OPENAI_AGENT_MODEL; else process.env.OPENAI_AGENT_MODEL = previousModel;
assert.equal(modelReply.text, "Vigila comidas fuera esta semana.");
assert.equal(responseRequest.tools[0].name, "financial_action");

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
assert.equal(telegramWebhook._test.isRecurringAnalysisRequest("Analisa todos los meses disponibles y determina pagos recurrentes"), true);
assert.equal(telegramWebhook._test.detectEmailIntent("de nuevo porfa", {
  agentMemory: { telegramSessions: { grupo: [{ role: "user", text: "lee el correo porfa" }, { role: "assistant", text: "Make respondió 0 movimientos nuevos" }] } },
}, "grupo").matched, true);
assert.equal(telegramWebhook._test.detectEmailIntent("de nuevo porfa", {
  agentMemory: { telegramSessions: { grupo: [] } },
}, "grupo", "Listo 💌. Make respondió 0 movimientos nuevos; no había nada nuevo que agregar.").matched, true);
const detailState = normalizeState({
  movements: [
    { id: "food-1", type: "expense", merchant: "RESTAURANTE A", amount: 8000, date: "2026-09-12", category: "comida-fuera" },
    { id: "food-2", type: "expense", merchant: "RESTAURANTE B", amount: 1100, date: "2026-09-12", category: "comida-fuera" },
  ],
  agentMemory: { telegramSessions: { grupo: [{ role: "assistant", text: "En comida fuera se han gastado CRC 9,100. ¿Quieres que te detalle los movimientos?" }] } },
});
const categoryDetail = telegramWebhook._test.findCategoryDetailRequest("porfa", detailState, "grupo");
assert.equal(categoryDetail.category.id, "comida-fuera");
assert.match(telegramWebhook._test.summarizeCategoryMovements(detailState, categoryDetail.category, { label: "prueba", start: "2026-09-01", end: "2026-09-30" }), /RESTAURANTE A/);
const maximumDetail = telegramWebhook._test.findCategoryDetailRequest("¿Y cuál de esos es el más alto?", detailState, "grupo");
assert.equal(maximumDetail.mode, "maximum");
assert.match(telegramWebhook._test.summarizeCategoryMaximum(detailState, maximumDetail.category, maximumDetail.period), /RESTAURANTE A/);
assert.equal(telegramWebhook._test.isMonthMovementsQuestion("¿Cuál fue el gasto mayor de comida fuera este mes?", detailState), false);
assert.deepEqual(telegramWebhook._test.findClassificationReview("esa clasificación está bien?", normalizeState({ movements: [{ id: "bread", type: "expense", merchant: "FRESH MARKET", amount: 900, date: "2026-09-13", category: "alimentacion" }] }), "FRESH MARKET · Alimentación · pan para desayuno"), { merchant: "FRESH MARKET", category: "alimentacion", reason: "una compra de alimentación" });

const movementUpdateState = normalizeState({
  movements: [{ id: "audit-movement", type: "expense", merchant: "PRUEBA AUDITORIA", amount: 123, date: "2026-09-13", category: "comida-fuera" }],
});
const movementUpdate = telegramWebhook._test.findOperationalAction("cambia la categoría de PRUEBA AUDITORIA a Alimentación", movementUpdateState);
assert.equal(movementUpdate.status, "ready");
assert.equal(movementUpdate.action.type, "update_movement");
assert.equal(movementUpdate.action.data.category, "alimentacion");

const punctuationCategoryState = normalizeState({ customCategories: [{ id: "audit-category", name: "Auditoría temporal.", kind: "expense", keywords: [] }] });
const punctuationBudget = telegramWebhook._test.findOperationalAction("pon el presupuesto de Auditoría temporal en CRC 1000.", punctuationCategoryState);
assert.equal(punctuationBudget.status, "ready");
assert.equal(punctuationBudget.action.categoryId, "audit-category");

const goalCreation = telegramWebhook._test.findOperationalAction("crea meta Auditoría temporal de CRC 1000.", normalizeState({}));
assert.equal(goalCreation.status, "ready");
assert.equal(goalCreation.action.name, "Auditoría temporal");

const alertState = normalizeState({
  budgets: { "comida-fuera": 20000 },
  movements: [{ id: "meal", type: "expense", merchant: "RESTAURANTE", amount: 23700, date: "2026-09-13", category: "comida-fuera" }],
});
const firstAlerts = collectBudgetAlerts(alertState, { month: "2026-09", categories: [{ id: "comida-fuera", name: "Comida fuera" }] });
assert.equal(firstAlerts.length, 1);
assert.equal(firstAlerts[0].level, 100);
assert.match(formatBudgetAlerts(firstAlerts), /excedido por CRC 3\s700,00/i);
assert.equal(collectBudgetAlerts(alertState, { month: "2026-09" }).length, 0);
assert.equal(agentJobs._test.scheduledOccurrence({ dueDate: "2026-09-30", repeat: "monthly" }, "2026-02"), "2026-02-28");
assert.equal(agentJobs._test.scheduledOccurrence({ dueDate: "2026-09-20", repeat: "monthly" }, "2026-10"), "2026-10-20");
const automationState = normalizeState({});
agentJobs._test.recordAutomationRun(automationState, "email", { received: 4, processed: 4 });
assert.deepEqual(automationState.agentMemory.automationRuns[0].result, { received: 4, processed: 4 });

console.log("agent-core smoke: ok");
