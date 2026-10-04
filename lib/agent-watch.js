// Proactive watch: looks at the household's data once a day and speaks up
// when something deserves attention, without being asked. Detection is plain
// code over the real numbers (so it never invents a problem); the AI only adds
// a short "what I would do" on top of what was found.

const { expensesByCategory } = require("./expense-allocations");

const MAX_FINDINGS = 4;
const crc = (value) => `₡${Math.round(Number(value || 0)).toLocaleString("es-CR").replace(/ /g, " ")}`;
const norm = (value) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const amountOf = (item) => Number(item.amount || 0);

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function previousMonthOf(month) {
  const [year, raw] = month.split("-").map(Number);
  const value = new Date(Date.UTC(year, raw - 2, 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
const isExpense = (item) => item.type === "expense";

// today: "YYYY-MM-DD" in Costa Rica time. Returns findings, most important first.
function collectWatchFindings(state, { today, categories = [] }) {
  const month = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const movements = state.movements || [];
  const monthExpenses = movements.filter((item) => isExpense(item) && String(item.date || "").startsWith(month));
  const monthIncome = movements.filter((item) => item.type === "income" && String(item.date || "").startsWith(month)).reduce((sum, item) => sum + amountOf(item), 0);
  const monthSaving = movements.filter((item) => item.type === "saving" && String(item.date || "").startsWith(month)).reduce((sum, item) => sum + amountOf(item), 0);
  const nameOf = (id) => categories.find((category) => category.id === id)?.name || id;
  const findings = [];

  // 1) A budget that is on track to be exceeded (the existing 80%/100% alert
  //    only fires once the money is already gone).
  if (day >= 7 && day <= daysInMonth - 3) {
    const spent = expensesByCategory(monthExpenses, categories);
    Object.entries(state.budgets || {}).forEach(([id, rawBudget]) => {
      const budget = Number(rawBudget || 0);
      const used = Number(spent[id] || 0);
      if (budget <= 0 || used <= 0 || used / budget >= 0.8) return;
      const projected = (used / day) * daysInMonth;
      if (projected <= budget * 1.05) return;
      findings.push({
        key: `pace:${month}:${id}`, severity: 3, kind: "ritmo",
        text: `${nameOf(id)}: llevan ${crc(used)} de ${crc(budget)} y a este ritmo cerrarían en unos ${crc(projected)} (${crc(projected - budget)} de más).`,
      });
    });
  }

  // 2) Variable spending on track to be well above last month's.
  const variable = (list) => list.filter((item) => item.category !== "vivienda").reduce((sum, item) => sum + amountOf(item), 0);
  const priorMonth = previousMonthOf(month);
  const priorVariable = variable(movements.filter((item) => isExpense(item) && String(item.date || "").startsWith(priorMonth)));
  if (day >= 10 && priorVariable > 0) {
    const projected = (variable(monthExpenses) / day) * daysInMonth;
    if (projected > priorVariable * 1.15 && projected - priorVariable > 30000) {
      findings.push({
        key: `total:${month}`, severity: 2, kind: "ritmo",
        text: `Sin contar vivienda, a este ritmo el mes cerraría en ${crc(projected)}, ${crc(projected - priorVariable)} más que el mes pasado (${crc(priorVariable)}).`,
      });
    }
  }

  // 3) An expense that looks out of pattern.
  const recentFrom = addDays(today, -3);
  const lookbackFrom = addDays(today, -95);
  monthExpenses.concat(movements.filter((item) => isExpense(item) && !String(item.date || "").startsWith(month) && item.date >= recentFrom)).forEach((item) => {
    if (!item.id || item.date < recentFrom || item.date > today || amountOf(item) < 25000) return;
    const sameCategory = movements.filter((other) => isExpense(other) && other.id !== item.id && other.category === item.category && other.date >= lookbackFrom && other.date < recentFrom).map(amountOf);
    const merchantSeen = movements.some((other) => other.id !== item.id && norm(other.merchant) === norm(item.merchant) && other.date < recentFrom);
    if (sameCategory.length >= 4 && amountOf(item) >= median(sameCategory) * 2.5) {
      findings.push({ key: `unusual:${item.id}`, severity: 2, kind: "inusual", text: `${item.merchant || "Un gasto"} del ${item.date} por ${crc(amountOf(item))} es mucho más de lo normal en ${nameOf(item.category)} (lo típico ronda ${crc(median(sameCategory))}).` });
    } else if (!merchantSeen && amountOf(item) >= 50000 && item.category !== "vivienda") {
      findings.push({ key: `unusual:${item.id}`, severity: 1, kind: "inusual", text: `Comercio nuevo con un gasto grande: ${item.merchant || "sin nombre"} por ${crc(amountOf(item))} el ${item.date}. ¿Es correcto?` });
    }
  });

  // 4) Possible duplicate: same merchant and amount within a day, neither confirmed by the bank.
  const recent = movements.filter((item) => isExpense(item) && item.id && item.date >= addDays(today, -7) && !item.bankConfirmed);
  for (let i = 0; i < recent.length; i += 1) {
    for (let j = i + 1; j < recent.length; j += 1) {
      const a = recent[i]; const b = recent[j];
      if (norm(a.merchant) !== norm(b.merchant) || !norm(a.merchant) || Math.abs(amountOf(a) - amountOf(b)) > 1 || amountOf(a) < 1000) continue;
      if (Math.abs(Date.parse(`${a.date}T12:00:00Z`) - Date.parse(`${b.date}T12:00:00Z`)) > 86400000) continue;
      const ids = [a.id, b.id].sort();
      findings.push({ key: `dup:${ids.join(":")}`, severity: 3, kind: "duplicado", text: `Posible duplicado: ${a.merchant} por ${crc(amountOf(a))} aparece dos veces (${a.date} y ${b.date}).` });
    }
  }

  // 5) Little money left late in the month.
  if (day >= 20 && monthIncome > 0) {
    const available = monthIncome - monthExpenses.reduce((sum, item) => sum + amountOf(item), 0) - monthSaving;
    if (available / monthIncome < 0.05) {
      findings.push({ key: `low:${month}`, severity: 3, kind: "disponible", text: `Queda ${available < 0 ? "en negativo" : "muy poco"} para el resto del mes: disponible ${crc(available)} con ${daysInMonth - day} día(s) por delante.` });
    }
  }

  // 6) Items waiting for a human decision.
  const waiting = (state.pendingMovements || []).length;
  if (waiting >= 3) findings.push({ key: `pending:${month}:${Math.floor(waiting / 3)}`, severity: 1, kind: "pendientes", text: `Hay ${waiting} movimientos esperando que los revisen antes de entrar a las cuentas.` });

  const seen = new Set();
  return findings.filter((item) => (seen.has(item.key) ? false : seen.add(item.key))).sort((a, b) => b.severity - a.severity);
}

// Remembers what was already reported so nothing is repeated, and allows at
// most one proactive message a day. Returns the findings still worth sending.
function takeNewFindings(state, findings, today) {
  state.agentMemory = state.agentMemory || {};
  const watch = state.agentMemory.watch = state.agentMemory.watch || {};
  if (watch.enabled === false || watch.lastSent === today) return [];
  const sent = watch.sent && typeof watch.sent === "object" ? watch.sent : {};
  const fresh = findings.filter((item) => !sent[item.key]).slice(0, MAX_FINDINGS);
  if (!fresh.length) return [];
  fresh.forEach((item) => { sent[item.key] = today; });
  const cutoff = addDays(today, -60);
  Object.keys(sent).forEach((key) => { if (sent[key] < cutoff) delete sent[key]; });
  watch.sent = sent;
  watch.lastSent = today;
  return fresh;
}

async function adviceFor(findings) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !findings.length) return "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_REPORT_MODEL || "gpt-4.1-mini",
        temperature: 0.4,
        max_tokens: 160,
        messages: [{ role: "user", content: [
          "Eres el asistente financiero de un hogar de dos personas en Costa Rica. Estas son las alertas de hoy (datos reales):",
          ...findings.map((item) => `- ${item.text}`),
          "Escribe UNA recomendación práctica y concreta de máximo 2 oraciones (máx 220 caracteres), en español cercano, sin regaños, sin inventar datos ni montos que no estén arriba. Solo el texto.",
        ].join("\n") }],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return "";
    return String(payload?.choices?.[0]?.message?.content || "").replace(/\s+/g, " ").trim().slice(0, 260);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function formatWatchMessage(findings, advice) {
  const icon = { ritmo: "📈", inusual: "🔎", duplicado: "👯", disponible: "🚨", pendientes: "📥" };
  return ["🧭 Revisión del día", "", ...findings.map((item) => `${icon[item.kind] || "•"} ${item.text}`), ...(advice ? ["", `💡 ${advice}`] : [])].join("\n");
}

// Runs the whole watch; returns { notified } and mutates state.agentMemory.watch.
async function runWatch(state, { today, categories, send }) {
  const findings = takeNewFindings(state, collectWatchFindings(state, { today, categories }), today);
  if (!findings.length) return { notified: 0 };
  await send(formatWatchMessage(findings, await adviceFor(findings)));
  return { notified: findings.length, keys: findings.map((item) => item.key) };
}

module.exports = { collectWatchFindings, takeNewFindings, formatWatchMessage, runWatch };
