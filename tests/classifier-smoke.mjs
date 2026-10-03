// SINPE is a payment method, not a category: it must never decide the category.
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.TELEGRAM_BOT_TOKEN = "test";
delete process.env.OPENAI_API_KEY;

const { classifyIncoming, normalizeState, learnRule, getCategories } = require("../lib/_agent.js");

// 1) Correcting one "SINPE MOVIL Uber" teaches "uber", not "sinpe" or "movil".
let state = normalizeState({});
learnRule(state, "SINPE MOVIL Uber___________", "transporte", "user");
assert.deepEqual(state.merchantRules.at(-1).patterns, ["uber"]);

// 2) Rules already stored with the generic words (as in the real data) stop over-reaching.
state = normalizeState({ merchantRules: [{ merchant: "SINPE MOVIL Uber___________", category: "transporte", patterns: ["sinpe", "movil", "uber"], approved: true, count: 3 }] });
const classify = (merchant) => classifyIncoming({ merchant, amount: 1000, date: "2026-09-17" }, state);
assert.equal((await classify("SINPE MOVIL Uber___________")).category, "transporte");
assert.equal((await classify("SINPE MOVIL Jocotes________")).category, "alimentacion", "jocotes are fruit");
assert.equal((await classify("SINPE MOVIL Platanitos_____")).category, "alimentacion");
assert.notEqual((await classify("SINPE MOVIL Lo_de_temu_____")).category, "transporte", "SINPE does not mean transport");
assert.equal((await classify("SINPE TP SAN J")).category, "transporte", "SINPE TP is the bus fare and stays");

// 3) What the AI is told: what SINPE is, how the household has classified before, category hints.
process.env.OPENAI_API_KEY = "test";
let prompt = "";
let aiAnswer = { type: "expense", category: "compras-personales", confidence: 0.92, reason: "temu" };
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target.includes("api.openai.com")) {
    prompt = JSON.parse(options.body).messages[0].content;
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(aiAnswer) } }] }) };
  }
  if (target.includes("api.telegram.org")) return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
};
await classify("SINPE MOVIL Lo_de_temu_____");
assert.match(prompt, /SINPE Movil y SINPE TP son solo el metodo de pago: NUNCA indican la categoria/);
assert.match(prompt, /jocotes/);
assert.match(prompt, /SINPE MOVIL Uber => transporte/, "the household's own correction is shown as an example");
assert.match(prompt, /"ejemplos"/, "categories carry example words");

// 4) In a consolidation a hesitant AI answer is not used; a confident one is.
const { _test } = require("../lib/telegram-webhook.js");
const { readDelimited, mapSpreadsheetRows } = require("../lib/document-tools.js");
const tab = (...cells) => cells.join("\t");
const rows = (text) => mapSpreadsheetRows(readDelimited(Buffer.from(text, "utf8")), "csv");
const run = async (answer) => {
  aiAnswer = answer;
  const fresh = normalizeState({});
  await _test.processBankStatementCandidates({
    candidates: rows([tab("Fecha", "Descripción", "Débitos"), tab("26/09/2026", "SINPE MOVIL Lo_de_temu_____", "36.000,00")].join("\n")),
    state: fresh, chatId: 1, name: "tabla", message: { chat: { id: 1 }, from: { id: 1 } },
    categories: getCategories(fresh).filter((item) => item.kind === "expense"), isSpreadsheet: true, documentRecord: null,
  });
  return fresh.movements[0];
};
const hesitant = await run({ type: "expense", category: "transporte", confidence: 0.4, reason: "?" });
assert.equal(hesitant.category, "imprevistos", "a 0.4 guess is left for the user instead of looking sure");
const confident = await run({ type: "expense", category: "compras-personales", confidence: 0.92, reason: "temu" });
assert.equal(confident.category, "compras-personales");

// 5) The bank's underscore padding is shown as words.
assert.equal(confident.merchant, "SINPE MOVIL Lo de temu");

console.log("classifier smoke: ok");
