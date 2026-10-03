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

// 2b) The same statement copied with plain spaces between the columns (what a web
//     page or a PDF gives) reads exactly like the tab-separated one.
const spaced = [
  "Fecha Descripción Débitos",
  "26/09/2026 VALOR DE TARJETA TITULAR 2.772,00",
  "25/09/2026 Pago CLARO POST PAGO 61393601 28.433,00",
  "19/09/2026 SODA ROSITA SAN J  2.000,00",
  "27/09/2026 UBER *TRIP HELP.UBER.COM . 1.663,20",
  "01/10/2026 Spotify P4775582E0 S 4.189,34",
].join("\n");
const spacedRows = rowsFrom(spaced);
assert.deepEqual(spacedRows.map((row) => [row.date, row.merchant, row.amount]), [
  ["2026-09-26", "VALOR DE TARJETA TITULAR", 2772],
  ["2026-09-25", "Pago CLARO POST PAGO 61393601", 28433],
  ["2026-09-19", "SODA ROSITA SAN J", 2000],
  ["2026-09-27", "UBER *TRIP HELP.UBER.COM .", 1663.2],
  ["2026-10-01", "Spotify P4775582E0 S", 4189.34],
]);
assert.equal(_test.looksLikePastedBankTable(spaced), true);
assert.equal(_test.looksLikePastedBankTable("lista del super:\nleche 1500\npan 800\nhuevos 2.100"), false);
// A header with no matching rows after it is not a statement either.
assert.equal(_test.looksLikePastedBankTable("Fecha Descripción Débitos\nsin filas"), false);

// 2c) A sentence typed before the table must not become its header: with tabs it used to
//     leave every row without columns (0 rows readable).
const tabbed = [tab("Fecha", "Descripción", "Débitos"), tab("26/09/2026", "VALOR DE TARJETA TITULAR", "2.772,00"), tab("01/09/2026", "AUTO MERCADO MORAVIA SAN J", "6.120,00")].join("\n");
const spacedTable = "Fecha Descripción Débitos\n26/09/2026 VALOR DE TARJETA TITULAR 2.772,00\n01/09/2026 AUTO MERCADO MORAVIA SAN J 6.120,00";
for (const intro of ["Aquí va el estado de septiembre:\n", "Hola\nAquí va el estado de septiembre:\n", "\n\n", "Estado de cuenta 2026:\n"]) {
  for (const [kind, table] of [["tabs", tabbed], ["spaces", spacedTable]]) {
    if (kind === "spaces" && /\d/.test(intro)) continue;
    const parsedRows = rowsFrom(intro + table);
    assert.deepEqual(parsedRows.map((row) => row.amount), [2772, 6120], `${kind} with intro ${JSON.stringify(intro)}`);
  }
}

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

// 8b) Same amount close in time but unrelated names is not a duplicate (two SINPE payments of 2,000).
state = newState([
  { id: "plat", type: "expense", merchant: "PLATANITOS", amount: 2000, date: "2026-09-15", category: "alimentacion", source: "gmail" },
  { id: "joco", type: "expense", merchant: "JOCOTES", amount: 2000, date: "2026-09-15", category: "alimentacion", source: "gmail" },
]);
out = await run(rowsFrom([tab("Fecha", "Descripción", "Débitos"), tab("15/09/2026", "SINPE MOVIL Platanitos_____", "2.000,00"), ...filler, tab("30/09/2026", "ULTIMO", "100,00")].join("\n")), state);
const jocotes = out.unconfirmed.find(({ item }) => item.id === "joco");
assert.ok(jocotes, "it is still reported: its amount is not in the statement");
assert.ok(!/duplicado/.test(jocotes.reason), "but not as a duplicate of an unrelated merchant");

// 8c) Merchant names go to Telegram without being read as Markdown.
const { toTelegramMarkdown } = require("../lib/telegram-format.js");
assert.equal(toTelegramMarkdown("9. SINPE MOVIL Uber___________"), "9. SINPE MOVIL Uber" + "\\_".repeat(11));
assert.equal(toTelegramMarkdown("UBER *TRIP HELP.UBER.COM ."), "UBER \\*TRIP HELP.UBER.COM .");
assert.equal(toTelegramMarkdown("**ANÁLISIS** del mes"), "*ANÁLISIS* del mes", "intentional bold is kept");
assert.equal(toTelegramMarkdown("**SINPE_MOVIL** x"), "*SINPE*\\_*MOVIL* x", "an escape inside bold closes and reopens it");

// 8d) The first days of a month are purchases from the end of the previous one: a new expense
//     is dated about three days earlier, using the real calendar (not 30 days per month).
state = newState();
out = await run(rowsFrom([
  tab("Fecha", "Descripción", "Débitos"),
  tab("01/09/2026", "COMERCIO UNO", "1.000,00"),
  tab("02/09/2026", "COMERCIO DOS", "2.000,00"),
  tab("03/09/2026", "COMERCIO TRES", "3.000,00"),
  tab("04/09/2026", "COMERCIO CUATRO", "4.000,00"),
  tab("01/10/2026", "COMERCIO CINCO", "5.000,00"),
  tab("01/03/2026", "COMERCIO SEIS", "6.000,00"),
  tab("03/03/2026", "COMERCIO SIETE", "7.000,00"),
].join("\n")), state);
const dateOf = (merchant) => state.movements.find((m) => m.merchant === merchant);
assert.equal(dateOf("COMERCIO UNO").date, "2026-08-29", "01/09 -> 29/08");
assert.equal(dateOf("COMERCIO DOS").date, "2026-08-30");
assert.equal(dateOf("COMERCIO TRES").date, "2026-08-31");
assert.equal(dateOf("COMERCIO CUATRO").date, "2026-09-04", "the 4th is left as the bank shows it");
assert.equal(dateOf("COMERCIO CINCO").date, "2026-09-28", "01/10 belongs to the end of September");
assert.equal(dateOf("COMERCIO SEIS").date, "2026-02-26", "01/03 -> 26/02: February has 28 days");
assert.equal(dateOf("COMERCIO SIETE").date, "2026-02-28");
assert.equal(dateOf("COMERCIO UNO").bankDate, "2026-09-01", "the bank's own date is kept");
assert.match(dateOf("COMERCIO UNO").note, /Asentado en el banco el 2026-09-01/);
assert.equal(out.created.length, 7);

// 8e) Matching still uses the bank's date, so a late-August expense already in the app is
//     recognised by a row dated 02/09 and is not added a second time.
state = newState([{ id: "aug", type: "expense", merchant: "COMERCIO DOS", amount: 2000, date: "2026-08-30", category: "alimentacion", source: "gmail" }]);
out = await run(rowsFrom([tab("Fecha", "Descripción", "Débitos"), tab("02/09/2026", "COMERCIO DOS", "2.000,00")].join("\n")), state);
assert.equal(out.created.length, 0);
assert.equal(out.duplicates.length, 1);
assert.equal(state.movements.length, 1);

// 9) Added expenses are sent in pages, not one message each (Telegram group rate limit).
sent.length = 0;
state = newState();
await run(rowsFrom([tab("Fecha", "Descripción", "Débitos"), ...Array.from({ length: 20 }, (_, i) => tab("05/09/2026", `COMERCIO UNICO ${i}`, `${1000 + i},00`))].join("\n")), state);
assert.ok(sent.length <= 5, `expected a summary plus 3 pages, got ${sent.length} messages`);

console.log("statement smoke: ok");
