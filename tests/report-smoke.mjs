import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { financialReport } = require("../lib/reporting");
const { buildFinancialPdf } = require("../lib/report-pdf");
const { generateInsights, basicInsights, buildFacts, scoreFor } = require("../lib/report-insights");

const mv = (type, amount, date, category, merchant) => ({ id: `${type}-${date}-${merchant}`, type, amount, date, category, merchant });
const state = {
  movements: [
    mv("income", 1000000, "2026-09-01", "salario", "Salario"),
    mv("expense", 260000, "2026-09-02", "vivienda", "ALQUILER CASA"),
    mv("expense", 400000, "2026-09-05", "alimentacion", "PRICE SMART"),
    mv("expense", 120000, "2026-08-05", "alimentacion", "PRICE SMART"),
    mv("saving", 20000, "2026-09-03", "ahorro", "Ahorro"),
  ],
  budgets: { alimentacion: 230000 }, savingsAccounts: [], scheduledPayments: [],
};
const report = financialReport(state, "2026-09");
const pdfText = (buffer) => buffer.toString("latin1");

// Report data feeds the new sections.
assert.equal(report.trend.length, 6);
assert.equal(report.trend[5].expense, 660000);
assert.equal(report.categories.find((c) => c.id === "alimentacion").previous, 120000);
assert.equal(report.weeks.reduce((sum, w) => sum + w.amount, 0), 660000);

// Score is deterministic and reacts to overspending.
const score = scoreFor(report);
assert.equal(score.overBudgets, 1);
const noBudgets = scoreFor(financialReport({ ...state, budgets: {} }, "2026-09"));
assert.equal(noBudgets.score - score.score, 8, "an exceeded budget costs 8 points");
assert.equal(scoreFor({ totals: { income: 1000, expense: 100, saving: 200, available: 700, previousExpense: 100 }, budgets: [] }).score, 100);

// Fallback narrative: rent is a fixed cost, so it is never flagged as "too much weight".
const rentHeavy = financialReport({ movements: [mv("income", 1000000, "2026-09-01", "salario", "Salario"), mv("expense", 500000, "2026-09-02", "vivienda", "ALQUILER CASA"), mv("expense", 100000, "2026-09-05", "alimentacion", "PRICE SMART")], budgets: {} }, "2026-09");
assert.ok(!JSON.stringify(basicInsights(rentHeavy, buildFacts(rentHeavy))).includes("ALQUILER"), "rent is never flagged as a habit to change");
const basic = basicInsights(report, buildFacts(report));
assert.ok(basic.fails.some((item) => /Alimentacion|Alimentación/i.test(item.title)));
assert.match(basic.summary, /septiembre de 2026/);

// Without an AI key the insights still work and come from the fallback.
delete process.env.OPENAI_API_KEY;
let insights = await generateInsights(report);
assert.equal(insights.source, "basic");

// With an AI answer the narrative is used but the score stays ours.
process.env.OPENAI_API_KEY = "test";
const realFetch = globalThis.fetch;
const aiAnswer = { headline: "Mes pesado en super", summary: "Se gastó mucho en el súper (₡400 000).", wins: [{ title: "Ahorro al día", detail: "Se movieron ₡20 000." }], fails: [{ title: "Súper excedido", detail: "₡170 000 sobre lo planeado." }], improve: [{ title: "Lista de compras", detail: "Ir con lista." }], actions: ["Tope semanal de ₡50 000 en el súper"], categoryNotes: { alimentacion: "Creció 233% vs agosto" } };
globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(aiAnswer) } }] }) });
insights = await generateInsights(report);
assert.equal(insights.source, "ai");
assert.equal(insights.score, score.score);
assert.equal(insights.categoryNotes.alimentacion, "Creció 233% vs agosto");
let pdf = pdfText(buildFinancialPdf(report, "full", insights));
assert.ok(pdf.startsWith("%PDF-1.4") && pdf.includes("/Encoding /WinAnsiEncoding"));
assert.ok(pdf.includes("Mes pesado en super") && pdf.includes("s\xFAper"), "accents are written as WinAnsi bytes");
assert.ok(pdf.includes("CRC 400 000") && !pdf.includes("₡"), "colon sign is spelled CRC");

// Broken or partial AI answers fall back instead of producing an empty analysis.
for (const bad of ["no es json", JSON.stringify({ headline: "x", summary: "y" })]) {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: bad } }] }) });
  assert.equal((await generateInsights(report)).source, "basic");
}
globalThis.fetch = async () => { throw new Error("timeout"); };
assert.equal((await generateInsights(report)).source, "basic");
globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: { message: "quota" } }) });
assert.equal((await generateInsights(report)).source, "basic");
// ai:false never calls the network.
let called = false;
globalThis.fetch = async () => { called = true; return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(aiAnswer) } }] }) }; };
assert.equal((await generateInsights(report, { ai: false })).source, "basic");
assert.equal(called, false, "ai:false never calls the network");
globalThis.fetch = realFetch;
delete process.env.OPENAI_API_KEY;

// Every kind renders, including an empty month and hostile text.
const empty = financialReport({ movements: [], budgets: {} }, "2026-09");
const nasty = financialReport({ movements: [mv("expense", 5000, "2026-09-02", "otros", "Café (La \\ Esquina) ñandú — “raro” 😀 ".repeat(8))], budgets: {} }, "2026-09");
for (const target of [report, empty, nasty]) {
  for (const kind of ["full", "pending", "budget", "savings", "comparison"]) {
    const buffer = buildFinancialPdf(target, kind, await generateInsights(target, { ai: false }));
    const text = pdfText(buffer);
    assert.ok(text.startsWith("%PDF-1.4") && text.endsWith("%%EOF"), `${kind} renders`);
    const pages = Number(/\/Count (\d+)/.exec(text)[1]);
    assert.ok(pages >= 1 && pages <= 5, `${kind} has ${pages} pages`);
    // Every xref offset must point at its object.
    const table = text.slice(text.indexOf("xref"));
    [...table.matchAll(/(\d{10}) 00000 n/g)].forEach((match, index) => {
      assert.ok(text.slice(Number(match[1])).startsWith(`${index + 1} 0 obj`), `${kind}: xref ${index + 1}`);
    });
  }
}
console.log("report smoke: ok");
