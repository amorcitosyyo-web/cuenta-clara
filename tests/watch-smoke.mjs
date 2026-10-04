import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { collectWatchFindings, takeNewFindings, formatWatchMessage, runWatch } = require("../lib/agent-watch");

const categories = [{ id: "alimentacion", name: "Alimentación", kind: "expense" }, { id: "vivienda", name: "Vivienda", kind: "expense" }, { id: "compras", name: "Compras", kind: "expense" }];
let n = 0;
const mv = (type, amount, date, category, merchant, extra = {}) => ({ id: `m${++n}`, type, amount, date, category, merchant, ...extra });
const find = (list, prefix) => list.find((item) => item.key.startsWith(prefix));

// Pace: day 15 of September, 150k of a 200k food budget -> would close near 300k.
let state = { budgets: { alimentacion: 200000 }, movements: [mv("expense", 150000, "2026-09-10", "alimentacion", "SUPER")] };
let findings = collectWatchFindings(state, { today: "2026-09-15", categories });
assert.match(find(findings, "pace:2026-09:alimentacion").text, /Alimentación.*300 000/);
// Already over 80% is the job of the existing budget alert, not this one.
state.movements = [mv("expense", 170000, "2026-09-10", "alimentacion", "SUPER")];
assert.ok(!find(collectWatchFindings(state, { today: "2026-09-15", categories }), "pace:"));
// Too early in the month there is not enough data to project.
state.movements = [mv("expense", 60000, "2026-09-03", "alimentacion", "SUPER")];
assert.ok(!find(collectWatchFindings(state, { today: "2026-09-04", categories }), "pace:"));
// On pace is silent.
state.movements = [mv("expense", 80000, "2026-09-10", "alimentacion", "SUPER")];
assert.equal(collectWatchFindings(state, { today: "2026-09-15", categories }).length, 0);

// Whole-month pace ignores rent.
state = { budgets: {}, movements: [
  mv("expense", 260000, "2026-08-02", "vivienda", "ALQUILER"), mv("expense", 200000, "2026-08-15", "alimentacion", "SUPER"),
  mv("expense", 260000, "2026-09-02", "vivienda", "ALQUILER"), mv("expense", 200000, "2026-09-08", "alimentacion", "SUPER"),
] };
findings = collectWatchFindings(state, { today: "2026-09-10", categories });
assert.match(find(findings, "total:2026-09").text, /Sin contar vivienda/);
state.movements[3].amount = 50000;
assert.ok(!find(collectWatchFindings(state, { today: "2026-09-10", categories }), "total:"));

// Unusual: 5 normal purchases then one 5x bigger.
const base = [1, 2, 3, 4, 5].map((d) => mv("expense", 20000, `2026-08-0${d}`, "compras", "TIENDA"));
state = { budgets: {}, movements: [...base, mv("expense", 120000, "2026-09-14", "compras", "TIENDA")] };
assert.match(find(collectWatchFindings(state, { today: "2026-09-15", categories }), "unusual:").text, /mucho más de lo normal/);
// A big charge at a never-seen merchant is flagged softly; rent is never "new".
state = { budgets: {}, movements: [mv("expense", 90000, "2026-09-14", "compras", "COMERCIO RARO")] };
assert.match(find(collectWatchFindings(state, { today: "2026-09-15", categories }), "unusual:").text, /Comercio nuevo/);
state = { budgets: {}, movements: [mv("expense", 260000, "2026-09-14", "vivienda", "ALQUILER NUEVO")] };
assert.ok(!find(collectWatchFindings(state, { today: "2026-09-15", categories }), "unusual:"));

// Duplicates: same merchant and amount a day apart; bank-confirmed ones are legitimate.
state = { budgets: {}, movements: [mv("expense", 8990, "2026-09-14", "compras", "SPOTIFY"), mv("expense", 8990, "2026-09-15", "compras", "Spotify")] };
assert.match(find(collectWatchFindings(state, { today: "2026-09-15", categories }), "dup:").text, /Posible duplicado/);
state.movements.forEach((item) => { item.bankConfirmed = true; });
assert.ok(!find(collectWatchFindings(state, { today: "2026-09-15", categories }), "dup:"));
state.movements.forEach((item) => { item.bankConfirmed = false; });
state.movements[1].date = "2026-09-20";
assert.ok(!find(collectWatchFindings(state, { today: "2026-09-21", categories }), "dup:"), "days apart is not a duplicate");

// Low available late in the month.
state = { budgets: {}, movements: [mv("income", 1000000, "2026-09-01", "salario", "Salario"), mv("expense", 980000, "2026-09-10", "compras", "VARIOS")] };
assert.match(find(collectWatchFindings(state, { today: "2026-09-22", categories }), "low:").text, /muy poco/);
assert.ok(!find(collectWatchFindings(state, { today: "2026-09-12", categories }), "low:"));

// Dedupe memory: reported once, one message per day, cap of 4, mute switch.
state = { budgets: {}, movements: [], agentMemory: {} };
const many = ["a", "b", "c", "d", "e", "f"].map((key, index) => ({ key, severity: 6 - index, kind: "ritmo", text: key }));
let taken = takeNewFindings(state, many, "2026-09-15");
assert.deepEqual(taken.map((item) => item.key), ["a", "b", "c", "d"]);
assert.deepEqual(takeNewFindings(state, many, "2026-09-15"), [], "only one proactive message per day");
assert.deepEqual(takeNewFindings(state, many, "2026-09-16").map((item) => item.key), ["e", "f"], "already-reported items are not repeated");
assert.deepEqual(takeNewFindings(state, many, "2026-09-17"), []);
state.agentMemory.watch.enabled = false;
assert.deepEqual(takeNewFindings(state, [{ key: "z", severity: 1, kind: "ritmo", text: "z" }], "2026-09-18"), [], "muted");

// runWatch sends one message with the AI tip, and still sends without it.
process.env.OPENAI_API_KEY = "test";
const realFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "Compren con lista esta semana." } }] }) });
state = { budgets: { alimentacion: 200000 }, movements: [mv("expense", 150000, "2026-09-10", "alimentacion", "SUPER")], agentMemory: {} };
const sentMessages = [];
let result = await runWatch(state, { today: "2026-09-15", categories, send: async (text) => sentMessages.push(text) });
assert.equal(result.notified, 1);
assert.match(sentMessages[0], /Revisión del día[\s\S]*📈[\s\S]*💡 Compren con lista/);
result = await runWatch(state, { today: "2026-09-15", categories, send: async (text) => sentMessages.push(text) });
assert.equal(result.notified, 0);
assert.equal(sentMessages.length, 1, "second run the same day sends nothing");
globalThis.fetch = async () => { throw new Error("down"); };
state = { budgets: { alimentacion: 200000 }, movements: [mv("expense", 150000, "2026-09-10", "alimentacion", "SUPER")], agentMemory: {} };
await runWatch(state, { today: "2026-09-15", categories, send: async (text) => sentMessages.push(text) });
assert.ok(sentMessages[1] && !sentMessages[1].includes("💡"), "works without the AI tip");
globalThis.fetch = realFetch;
delete process.env.OPENAI_API_KEY;
assert.ok(formatWatchMessage([{ kind: "x", text: "hola" }], "").includes("hola"));
// The analyst can run the check on demand and mute/unmute the daily notices.
const { runAnalystAgent } = require("../lib/agent-analyst");
process.env.OPENAI_API_KEY = "test";
const calls = [];
const scripted = (toolName, args) => {
  let round = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    round += 1;
    if (round === 1) return { ok: true, json: async () => ({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: toolName, arguments: JSON.stringify(args) } }] } }] }) };
    calls.push(body.messages.filter((m) => m.role === "tool").map((m) => m.content));
    return { ok: true, json: async () => ({ choices: [{ message: { role: "assistant", content: "listo" } }] }) };
  };
};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
const dupState = { budgets: {}, movements: [mv("expense", 8990, today, "compras", "SPOTIFY"), mv("expense", 8990, today, "compras", "Spotify")], agentMemory: {} };
scripted("check_alerts", {});
assert.equal(await runAnalystAgent("hay algo raro?", dupState, categories, today, []), "listo");
assert.match(calls[0][0], /Posible duplicado/);
scripted("set_watch", { enabled: false });
await runAnalystAgent("ya no me avises", dupState, categories, today, []);
assert.equal(dupState.agentMemory.watch.enabled, false);
assert.deepEqual(takeNewFindings(dupState, [{ key: "q", severity: 1, kind: "ritmo", text: "q" }], today), [], "muted from chat");
scripted("set_watch", { enabled: true });
await runAnalystAgent("avísame de nuevo", dupState, categories, today, []);
assert.equal(dupState.agentMemory.watch.enabled, true);
globalThis.fetch = realFetch;
delete process.env.OPENAI_API_KEY;
console.log("watch smoke: ok");
