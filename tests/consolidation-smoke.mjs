// Consolidation: a bank statement is compared with the app, what is missing is
// added on its own and reported, and each added expense can be edited from a
// button that turns into a "gestionado" marker once it has been handled.
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.TELEGRAM_BOT_TOKEN = "test";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "key";
process.env.AGENT_OWNER_USER_ID = "u1";
delete process.env.OPENAI_API_KEY;

let store = {};
let version = 1;
let messageCounter = 100;
const stamp = () => `2026-10-03T00:00:00.${String(version).padStart(6, "0")}+00:00`;
let calls = [];
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  const method = options.method || "GET";
  if (target.includes("api.telegram.org")) {
    const body = JSON.parse(options.body || "{}");
    calls.push({ method: target.split("/").pop(), ...body });
    return { ok: true, json: async () => ({ ok: true, result: { message_id: ++messageCounter } }) };
  }
  if (target.includes("/rest/v1/app_states")) {
    if (method === "GET") {
      const row = { data: JSON.parse(JSON.stringify(store)) };
      if (target.includes("updated_at")) row.updated_at = stamp();
      return { ok: true, status: 200, json: async () => [row] };
    }
    const body = JSON.parse(options.body);
    if (method === "PATCH" && decodeURIComponent(target.split("updated_at=eq.")[1]) !== stamp()) return { ok: true, status: 200, json: async () => [] };
    store = JSON.parse(JSON.stringify(body.data));
    version += 1;
    return { ok: true, status: 200, json: async () => (method === "PATCH" ? [{ user_id: "u1" }] : {}), text: async () => "" };
  }
  return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
};

const { _test } = require("../lib/telegram-webhook.js");
const message = { chat: { id: 1 }, from: { id: 1 } };
const tab = (...cells) => cells.join("\t");
const sent = () => calls.filter((c) => c.method === "sendMessage");
const texts = () => sent().map((c) => c.text);
const allButtons = () => calls.flatMap((c) => (c.reply_markup?.inline_keyboard || []).flat());
const find = (prefix) => allButtons().filter((b) => b.callback_data.startsWith(prefix));
const cb = (data, id = "q") => ({ id, from: { id: 1 }, data, message: { chat: { id: 1 }, message_id: 9 } });
const edit = (kind, id) => _test.handleEditCallback(cb(`ed:${kind}:${id}`), kind, id);
const reset = (movements = []) => { store = { movements }; version = 1; calls = []; };
const movement = (id) => store.movements.find((m) => m.id === id);

const existing = () => [
  { id: "auto", type: "expense", merchant: "AUTO MERCADO MORAVIA", amount: 14307, date: "2026-09-30", category: "alimentacion", source: "gmail" },
  { id: "spot", type: "expense", merchant: "Spotify P4775582E0", amount: 4155.99, amountEstimated: true, date: "2026-09-29", category: "suscripciones", source: "gmail", fx: { originalAmount: 8.99, estimated: true } },
  { id: "uber", type: "expense", merchant: "UBER RIDES", amount: 1071.33, date: "2026-09-01", category: "transporte", source: "gmail" },
];
const statement = [
  tab("Fecha", "Descripción", "Débitos"),
  tab("01/09/2026", "UBER RIDES", "1.071,33"),
  tab("02/10/2026", "AUTO MERCADO MORAVIA", "14.307,00"),
  tab("01/10/2026", "Spotify P4775582E0 S", "4.189,34"),
  tab("03/09/2026", "SUPER SALON EPA TIBAS SAN J", "11.000,01"),
  tab("05/09/2026", "PANADERIA NUEVA", "2.800,00"),
].join("\n");

// 1) The keyword is a short command, never a question or a row of data.
assert.deepEqual(_test.parseConsolidationRequest("consolidar"), { requested: true, body: "" });
assert.equal(_test.parseConsolidationRequest("Consolidar con el banco").requested, true);
assert.equal(_test.parseConsolidationRequest("/consolidar@mi_bot").requested, true);
assert.equal(_test.parseConsolidationRequest("consolidar\nFecha\tDescripción\tDébitos\n01/09/2026\tUBER\t1.000,00").body.startsWith("Fecha"), true);
assert.equal(_test.parseConsolidationRequest("consolidado de gastos de septiembre, ¿cuánto fue?").requested, false);
assert.equal(_test.parseConsolidationRequest("cuánto gasté en comida").requested, false);
assert.equal(_test.parseConsolidationRequest("01/09/2026\tUBER\t1.000,00").requested, false);

// 2) No confirmation: the missing expenses are added right away and reported.
reset(existing());
await _test.analyzePastedBankTable(message, statement);
assert.equal(store.movements.length, 5, "the 2 missing expenses are added without asking");
assert.deepEqual(store.movements.map((m) => m.merchant).filter((n) => /EPA|PANADERIA/.test(n)).sort(), ["PANADERIA NUEVA", "SUPER SALON EPA TIBAS SAN J"]);
assert.equal(movement("spot").amount, 4189.34, "the dollar charge takes the amount the bank really charged");
assert.equal(movement("auto").bankConfirmed, true);
const summary = texts()[0];
assert.match(summary, /Consolidación/);
assert.match(summary, /3 ya estaban en la app/);
assert.match(summary, /No encontré 2 en la app y ya los agregué/);
assert.match(summary, /Ajusté 1 gasto\(s\) en dólares/);
assert.equal(find("cons:").length, 0, "nothing to confirm");

// 3) Each added expense gets ONE edit button; the page is remembered so it can be updated.
const editButtons = find("ed:menu:");
assert.equal(editButtons.length, 2);
const added = store.movements.filter((m) => /EPA|PANADERIA/.test(m.merchant));
assert.deepEqual(editButtons.map((b) => b.callback_data.split(":")[2]).sort(), added.map((m) => m.id).sort());
assert.equal(Object.keys(store.agentMemory.editPages).length, 1);
const [pageKey] = Object.keys(store.agentMemory.editPages);
const [chatPart, pageMessageId] = pageKey.split(":").map(Number);

// 4) The edit panel offers category, amount, description, date and delete.
const target = added.find((m) => m.merchant === "PANADERIA NUEVA");
calls = [];
await edit("menu", target.id);
const panel = sent().at(-1);
assert.match(panel.text, /PANADERIA NUEVA/);
assert.deepEqual(panel.reply_markup.inline_keyboard.flat().map((b) => b.callback_data.split(":")[1]).sort(), ["amt", "cat", "date", "del", "desc"]);

// 5) Changing the amount: the next message is the value, then the button becomes a marker.
calls = [];
await edit("amt", target.id);
const pending = store.agentMemory.pendingEdits["1"];
assert.equal(pending.field, "amt");
assert.match(texts().at(-1), /monto correcto/);
await _test.applyPendingEdit(message, "no es un monto", pending);
assert.ok(store.agentMemory.pendingEdits["1"], "an invalid value keeps waiting");
await _test.applyPendingEdit(message, "3.250,50", pending);
assert.equal(movement(target.id).amount, 3250.5);
assert.equal(movement(target.id).amountEstimated, undefined);
assert.equal(store.agentMemory.pendingEdits?.["1"], undefined, "the pending edit is cleared");
const redraw = calls.filter((c) => c.method === "editMessageReplyMarkup").at(-1);
assert.equal(redraw.message_id, pageMessageId);
const rows = redraw.reply_markup.inline_keyboard.flat();
assert.ok(rows.some((b) => b.text.startsWith("✅") && b.text.includes("editado") && b.callback_data === `ed:done:${target.id}`), "handled expense shows as done");
assert.ok(rows.some((b) => b.callback_data.startsWith("ed:menu:")), "the other expense keeps its edit button");

// 6) A handled button does nothing more.
calls = [];
await edit("done", target.id);
assert.match(calls.find((c) => c.method === "answerCallbackQuery").text, /Ya lo gestionaste/);

// 7) Description and date are edited the same way, date read day-first.
const other = added.find((m) => m.merchant !== "PANADERIA NUEVA");
await edit("desc", other.id);
await _test.applyPendingEdit(message, "Útiles de la escuela", store.agentMemory.pendingEdits["1"]);
assert.equal(movement(other.id).merchant, "Útiles de la escuela");
await edit("date", other.id);
await _test.applyPendingEdit(message, "1-10-26", store.agentMemory.pendingEdits["1"]);
assert.equal(movement(other.id).date, "2026-10-01");
assert.equal(movement(other.id).category, other.category, "editing one field keeps the others");

// 8) Delete goes to the trash and can be undone, restoring the button.
calls = [];
await edit("del", target.id);
assert.equal(movement(target.id), undefined);
assert.ok(store.trash.some((t) => t.record.id === target.id));
assert.ok(find("ed:undo:").length === 1);
assert.ok(calls.filter((c) => c.method === "editMessageReplyMarkup").at(-1).reply_markup.inline_keyboard.flat().some((b) => b.text.includes("eliminado")));
calls = [];
await edit("undo", target.id);
assert.ok(movement(target.id), "restored");
assert.ok(calls.filter((c) => c.method === "editMessageReplyMarkup").at(-1).reply_markup.inline_keyboard.flat().some((b) => b.callback_data === `ed:menu:${target.id}`), "the edit button is back");

// 9) A button for an expense that no longer exists answers instead of failing.
calls = [];
await edit("menu", "no-existe");
assert.match(calls.find((c) => c.method === "answerCallbackQuery").text, /No encontré ese gasto/);

// 10) Nothing matches the app at all: stop and ask once, instead of building the month from the statement.
reset([]);
const bigStatement = [tab("Fecha", "Descripción", "Débitos"), ...Array.from({ length: 12 }, (_, i) => tab("05/09/2026", `COMERCIO ${i} UNICO`, `${1000 + i},00`))].join("\n");
await _test.analyzePastedBankTable(message, bigStatement);
assert.equal((store.movements || []).length, 0, "nothing is added before the answer");
assert.match(texts().join("\n"), /Ninguno de los 12 gastos .* coincide con lo que tiene la app/);
const draftId = find("cons:add:")[0].callback_data.split(":")[2];
calls = [];
await _test.handleConsolidationCallback(cb(`cons:cancel:${draftId}`), "cancel", draftId);
assert.equal((store.movements || []).length, 0);
assert.equal(store.consolidations?.[draftId], undefined);
calls = [];
await _test.analyzePastedBankTable(message, bigStatement);
const secondId = find("cons:add:")[0].callback_data.split(":")[2];
await _test.handleConsolidationCallback(cb(`cons:add:${secondId}`), "add", secondId);
assert.equal(store.movements.length, 12, "after the answer, all of them are added");
assert.equal(store.consolidations?.[secondId], undefined);
calls = [];
await _test.handleConsolidationCallback(cb(`cons:add:${secondId}`), "add", secondId);
assert.equal(store.movements.length, 12, "a stale button adds nothing");

// 10b) With enough rows, an app expense the bank never charged is listed with its own edit button.
reset([
  { id: "keep", type: "expense", merchant: "COMERCIO 0 UNICO", amount: 1000, date: "2026-09-05", category: "alimentacion", source: "gmail" },
  { id: "ghost", type: "expense", merchant: "TIENDA QUE NO COBRO", amount: 5000, date: "2026-09-06", category: "alimentacion", source: "gmail" },
]);
await _test.analyzePastedBankTable(message, [tab("Fecha", "Descripción", "Débitos"), ...Array.from({ length: 11 }, (_, i) => tab("05/09/2026", `COMERCIO ${i} UNICO`, `${1000 + i},00`)), tab("30/09/2026", "ULTIMO", "100,00")].join("\n"));
assert.match(texts().join("\n"), /no aparecen en el estado de cuenta/);
assert.ok(find("ed:menu:").some((b) => b.callback_data === "ed:menu:ghost"), "the unmatched expense can be reviewed or deleted");
assert.ok(!find("ed:menu:").some((b) => b.callback_data === "ed:menu:keep"), "the confirmed one is not flagged");

// 11) An unreadable table says what is wrong, naming the columns it saw, and changes nothing.
reset(existing());
await _test.analyzePastedBankTable(message, [tab("Fecha", "Detalle", "Referencia"), tab("01/09/2026", "UBER", "A1"), tab("02/09/2026", "FRESH", "B2"), tab("03/09/2026", "SODA", "C3")].join("\n"));
assert.match(texts().join("\n"), /No pude usar esa tabla/);
assert.match(texts().join("\n"), /monto/);
assert.match(texts().join("\n"), /fecha, detalle, referencia/);
assert.equal(store.movements.length, 3);

// 12) The activation expires, so an old tap on the menu button cannot hijack a later table.
assert.equal(_test.consolidationArmed({ agentMemory: {} }, 1), false);
assert.equal(_test.consolidationArmed({ agentMemory: { consolidationArmed: { 1: new Date().toISOString() } } }, 1), true);
assert.equal(_test.consolidationArmed({ agentMemory: { consolidationArmed: { 1: new Date(Date.now() - 31 * 60_000).toISOString() } } }, 1), false);

// 12b) What counts as a pasted table: header + rows with dates, however few; never a plain list.
const looks = (text, min) => _test.looksLikePastedBankTable(text, min);
assert.equal(looks([tab("Fecha", "Descripción", "Débitos"), tab("05/09/2026", "UBER", "1.000,00"), tab("06/09/2026", "FRESH", "2.000,00")].join("\n")), true, "header + 2 rows");
assert.equal(looks([tab("Fecha", "Descripción", "Débitos"), tab("05/09/2026", "UBER", "1.000,00")].join("\n"), 2), true, "header + 1 row when activated");
assert.equal(looks([tab("05/09/2026", "UBER", "1.000,00"), tab("06/09/2026", "FRESH", "2.000,00"), tab("07/09/2026", "SODA", "900,00")].join("\n")), true, "a later chunk has no header");
assert.equal(looks("lista del super:\nleche, 1500\npan, 800\nhuevos, 2.100"), false, "a shopping list with prices is not a statement");
assert.equal(looks("cuanto gaste el 05/09/2026\ny el 06/09/2026\nen total"), false, "dates in a sentence are not rows");

// 13) The real message path: the menu button, the word "consolidar", and the value typed after Monto.
const say = (text) => _test.replyAsAgent({ chat: { id: 1 }, from: { id: 1 }, message_id: 5 }, text);
const twoRows = [tab("Fecha", "Descripción", "Débitos"), tab("05/09/2026", "PANADERIA NUEVA", "2.800,00")].join("\n");

// 13a) The menu button arms the comparison and explains how to use it.
reset(existing());
calls = [];
await _test.handleMenuCallback(cb("menu:consolidate"), "consolidate");
assert.ok(store.agentMemory.consolidationArmed["1"]);
assert.match(texts().at(-1), /Consolidación con el banco/);
assert.match(texts().at(-1), /No agrego nada por mi cuenta|primero te muestro/);
// ...so even a tiny 2-line table pasted next is taken as the statement, and the arming is spent.
await say(twoRows);
assert.ok(store.movements.some((m) => m.merchant === "PANADERIA NUEVA"));
assert.equal(store.agentMemory.consolidationArmed?.["1"], undefined, "the activation is used up");

// 13b) Typing "consolidar" alone arms it; "consolidar" before the table runs it straight away.
reset(existing());
calls = [];
await say("consolidar");
assert.ok(store.agentMemory.consolidationArmed["1"]);
assert.match(texts().at(-1), /Consolidación con el banco/);
assert.equal(store.movements.length, 3);
reset(existing());
await say(`/consolidar\n${statement}`);
assert.equal(store.movements.length, 5, "keyword plus table in one message");

// 13c) "menu" cancels a pending activation.
reset(existing());
await say("consolidar");
await say("menu");
assert.equal(store.agentMemory.consolidationArmed?.["1"], undefined);

// 13d) After tapping Monto, the next ordinary message is the amount; "cancelar" leaves it as it was.
reset(existing());
await _test.analyzePastedBankTable(message, statement);
const newOne = store.movements.find((m) => m.merchant === "PANADERIA NUEVA");
await edit("amt", newOne.id);
calls = [];
await say("cancelar");
assert.equal(movement(newOne.id).amount, 2800);
assert.equal(store.agentMemory.pendingEdits?.["1"], undefined);
await edit("amt", newOne.id);
await say("4.100,00");
assert.equal(movement(newOne.id).amount, 4100);
assert.match(texts().at(-1), /Listo\. PANADERIA NUEVA/);

// 13e) A stale pending edit does not swallow a later message.
reset(existing());
store.agentMemory = { pendingEdits: { 1: { movementId: "uber", field: "amt", at: new Date(Date.now() - 20 * 60_000).toISOString() } } };
await say("hola");
assert.equal(movement("uber").amount, 1071.33, "an expired edit must not take the next message as the new amount");
assert.equal(store.agentMemory.pendingEdits?.["1"], undefined);
// A live edit is overridden by an explicit command: "consolidar" is a change of mind, not an amount.
reset(existing());
await edit("amt", "uber");
await say("consolidar");
assert.equal(movement("uber").amount, 1071.33);
assert.ok(store.agentMemory.consolidationArmed["1"]);

// 14) What actually reaches Telegram. Statement descriptors lose the bank's underscore padding;
//     names already in the app (from the email) keep theirs, so they are escaped and stay literal
//     instead of turning the lines after them into italics.
reset([
  { id: "keep", type: "expense", merchant: "COMERCIO 0 UNICO", amount: 1000, date: "2026-09-05", category: "alimentacion", source: "gmail" },
  { id: "pad", type: "expense", merchant: "SINPE MOVIL Zeta_____", amount: 7000, date: "2026-09-06", category: "alimentacion", source: "gmail" },
]);
calls = [];
await _test.analyzePastedBankTable(message, [
  tab("Fecha", "Descripción", "Débitos"),
  ...Array.from({ length: 10 }, (_, i) => tab("05/09/2026", `COMERCIO ${i} UNICO`, `${1000 + i},00`)),
  tab("05/09/2026", "SINPE MOVIL Uber___________", "1.100,00"),
  tab("06/09/2026", "UBER *TRIP HELP.UBER.COM .", "1.663,20"),
  tab("30/09/2026", "ULTIMO", "100,00"),
].join("\n"));
const addedPage = calls.find((c) => c.method === "sendMessage" && c.text.includes("UBER"));
assert.equal(addedPage.parse_mode, "Markdown");
assert.ok(addedPage.text.includes("SINPE MOVIL Uber\n"), "the statement descriptor shows as words");
assert.ok(!addedPage.text.includes("Uber_"), "the bank padding is gone");
assert.ok(addedPage.text.includes("\\*TRIP"), "asterisks stay literal");
const unconfirmedPage = calls.find((c) => c.method === "sendMessage" && c.text.includes("En la app pero no en el estado"));
assert.ok(unconfirmedPage.text.includes("SINPE MOVIL Zeta\\_\\_\\_\\_\\_"), "an app name with underscores is escaped, not read as italics");
assert.ok(!/(^|[^\\])_/.test(unconfirmedPage.text), "no bare underscore is left to open italics");
assert.ok(movement("pad"), "the app expense itself is untouched");

console.log("consolidation smoke: ok");
