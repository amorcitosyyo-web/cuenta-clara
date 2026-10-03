// Bank statement reconciliation: the formats and edge cases of a real BAC
// statement pasted into Telegram (tab separated, day-first dates, Spanish
// amounts, a "Débitos" column, repeated identical charges, a dollar charge).
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.TELEGRAM_BOT_TOKEN = "test";
delete process.env.OPENAI_API_KEY;

const sent = [];
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes("api.telegram.org")) {
    sent.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  }
  return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
};

const { _test } = require("../lib/telegram-webhook.js");
const { readDelimited, mapSpreadsheetRows } = require("../lib/document-tools.js");
const { getCategories } = require("../lib/_agent.js");

const rowsFrom = (text) => mapSpreadsheetRows(readDelimited(Buffer.from(_test.withStatementHeader(text), "utf8")), "csv");
const tab = (...cells) => cells.join("\t");
const newState = (movements = []) => ({
  movements, pendingMovements: [], receiptRecords: [], customCategories: [], savingsAccounts: [],
  scheduledPayments: [], budgets: {}, budgetHistory: [], agentMemory: { telegramSessions: {}, pendingActions: {} },
});
const run = (candidates, state) => _test.processBankStatementCandidates({
  candidates, state, chatId: 1, name: "tabla pegada", message: { chat: { id: 1 }, from: { id: 1 } },
  categories: getCategories(state).filter((item) => item.kind === "expense"), isSpreadsheet: true, documentRecord: null,
});

// 1) A "Débitos" column, Spanish amounts and day-first dates are all understood.
const parsed = rowsFrom([
  tab("Fecha", "Descripción", "Débitos"),
  tab("01/09/2026", "AUTO MERCADO MORAVIA SAN J", "6.120,00"),
  tab("16/09/2026", "PRICE SMART SAN J", "217.566,83"),
  tab("1-10-26", "MXM TIBAS OCN00PV", "890,00"),
].join("\n"));
assert.deepEqual(parsed.map((row) => [row.date, row.amount]), [["2026-09-01", 6120], ["2026-09-16", 217566.83], ["2026-10-01", 890]]);

// 2) A chunk of a split paste has no header row; it still parses.
const headerless = rowsFrom([tab("02/09/2026", "PRICE SMART SAN J", "75.973,04"), tab("03/09/2026", "SUPER SALON EPA", "11.000,01")].join("\n"));
assert.deepEqual(headerless.map((row) => row.amount), [75973.04, 11000.01]);

// 3) Two identical charges on the same day stay two movements.
let state = newState();
let out = await run(rowsFrom([
  tab("Fecha", "Descripción", "Débitos"),
  tab("17/09/2026", "SINPE TP SAN J", "920,00"),
  tab("17/09/2026", "SINPE TP SAN J", "920,00"),
].join("\n")), state);
assert.equal(out.created.length, 2);
assert.equal(state.movements.length, 2);

// 4) A statement row never erases the receipt breakdown of a movement it confirms,
//    and one movement is confirmed by at most one row.
const items = [{ name: "Leche", amount: 1500, category: "alimentacion" }, { name: "Detergente", amount: 2500, category: "hogar" }];
state = newState([{ id: "ps", type: "expense", merchant: "PRICE SMART SAN J", amount: 217566.83, date: "2026-09-16", category: "alimentacion", source: "receipt", receiptItems: items, receipt: { items, documentId: "d1" } }]);
out = await run(rowsFrom([tab("Fecha", "Descripción", "Débitos"), tab("16/09/2026", "PRICE SMART SAN J", "217.566,83"), tab("16/09/2026", "PRICE SMART SAN J", "217.566,83")].join("\n")), state);
assert.equal(out.duplicates.length, 1);
assert.equal(out.created.length, 1, "the second identical row is a second charge, not the same movement again");
assert.equal(state.movements.find((m) => m.id === "ps").receiptItems.length, 2);
assert.equal(state.movements.find((m) => m.id === "ps").receipt.documentId, "d1");

// 5) The bank settles a charge days later: the "1-10-26" row confirms the 28-9 movement.
state = newState([{ id: "am", type: "expense", merchant: "AUTO MERCADO MORAVIA", amount: 14307, date: "2026-09-28", category: "alimentacion", source: "gmail" }]);
out = await run(rowsFrom([tab("Fecha", "Descripción", "Débitos"), tab("1-10-26", "AUTO MERCADO MORAVIA", "14.307,00")].join("\n")), state);
assert.equal(out.created.length, 0);
assert.equal(out.duplicates.length, 1);

// 6) A dollar charge recorded as an estimate is settled to the real colones charged.
state = newState([{ id: "sp", type: "expense", merchant: "Spotify P4775582E0", amount: 4155.99, amountEstimated: true, date: "2026-09-29", category: "suscripciones", source: "gmail", fx: { originalAmount: 8.99, estimated: true } }]);
out = await run(rowsFrom([tab("Fecha", "Descripción", "Débitos"), tab("01/10/2026", "Spotify P4775582E0 S", "4.189,34")].join("\n")), state);
assert.equal(out.settled.length, 1);
assert.equal(state.movements[0].amount, 4189.34);
assert.equal(state.movements[0].amountEstimated, false);

// 7) A row with an unreadable date is set aside, never recorded as "today".
state = newState();
out = await run(rowsFrom([tab("Fecha", "Descripción", "Débitos"), tab("fecha-rara", "CAFE X", "1.500,00")].join("\n")), state);
assert.equal(out.created.length, 0);
assert.equal(out.incomplete.length, 1);

// 8) With enough rows, a movement the bank never charged and a twin of a confirmed
//    one are both flagged for review.
const filler = Array.from({ length: 10 }, (_, i) => tab(`${String(i + 1).padStart(2, "0")}/09/2026`, `COMERCIO ${i}`, `${(i + 1) * 1000},00`));
state = newState([
  { id: "a", type: "expense", merchant: "SUPERMERCADO LA AMISTAD", amount: 26080, date: "2026-09-12", category: "alimentacion", source: "gmail" },
  { id: "b", type: "expense", merchant: "SUPER LA AMISTAD 2", amount: 26080, date: "2026-09-12", category: "alimentacion", source: "receipt" },
  { id: "ghost", type: "expense", merchant: "TIENDA QUE NO COBRO", amount: 5000, date: "2026-09-05", category: "alimentacion", source: "gmail" },
]);
out = await run(rowsFrom([tab("Fecha", "Descripción", "Débitos"), tab("12/09/2026", "SUPER LA AMISTAD 2 TIBAS", "26.080,00"), ...filler, tab("30/09/2026", "ULTIMO", "100,00")].join("\n")), state);
const flagged = out.unconfirmed.map(({ item }) => item.id);
assert.equal(flagged.length, 2);
assert.ok(flagged.includes("ghost"), "a bank-sourced movement the statement never charged");
assert.equal(flagged.filter((id) => id === "a" || id === "b").length, 1, "exactly one of the duplicate pair is flagged, the confirmed one is not");

// 9) Added expenses are sent in pages, not one message each (Telegram group rate limit).
sent.length = 0;
state = newState();
await run(rowsFrom([tab("Fecha", "Descripción", "Débitos"), ...Array.from({ length: 20 }, (_, i) => tab("05/09/2026", `COMERCIO UNICO ${i}`, `${1000 + i},00`))].join("\n")), state);
assert.ok(sent.length <= 5, `expected a summary plus 3 pages, got ${sent.length} messages`);

console.log("statement smoke: ok");
