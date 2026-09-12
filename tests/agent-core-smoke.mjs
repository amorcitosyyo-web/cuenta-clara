import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { normalizeState } = require("../api/_agent.js");
const { executeAction } = require("../api/action-tools.js");
const { cycleFor, executeProposedAction, runAgentTurn } = require("../api/agent-core.js");

const state = normalizeState({});
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

console.log("agent-core smoke: ok");
