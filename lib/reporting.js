const { getCategories } = require("./_agent");
const { expensesByCategory } = require("./expense-allocations");

function monthRange(month) {
  const [year, numericMonth] = String(month).split("-").map(Number);
  const last = new Date(year, numericMonth, 0).getDate();
  return { month, start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

function previousMonth(month) {
  const [year, numericMonth] = String(month).split("-").map(Number);
  const date = new Date(year, numericMonth - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month, delta) {
  const [year, numericMonth] = String(month).split("-").map(Number);
  const date = new Date(year, numericMonth - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function financialReport(state, month) {
  const categories = getCategories(state);
  const movements = (state.movements || []).filter((item) => String(item.date || "").startsWith(month));
  const expenses = movements.filter((item) => item.type === "expense");
  const income = movements.filter((item) => item.type === "income");
  const savings = movements.filter((item) => item.type === "saving");
  const total = (items) => items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const categoryAmounts = expensesByCategory(expenses, categories);
  const byCategory = Object.entries(categoryAmounts).map(([id, amount]) => ({
    id, name: categories.find((category) => category.id === id)?.name || "Sin categoría", amount,
    count: expenses.filter((item) => item.category === id || (item.receiptItems || item.receipt?.items || []).some((line) => line.category === id)).length,
  })).sort((a, b) => b.amount - a.amount);
  const byMerchant = Object.values(expenses.reduce((result, item) => {
    const name = item.merchant || "Sin comercio";
    const row = result[name] || (result[name] = { name, amount: 0, count: 0 });
    row.amount += Number(item.amount || 0);
    row.count += 1;
    return result;
  }, {})).sort((a, b) => b.amount - a.amount);
  const budgetRows = Object.entries(state.budgets || {}).map(([id, budget]) => {
    const spent = byCategory.find((row) => row.id === id)?.amount || 0;
    return { id, name: categories.find((category) => category.id === id)?.name || id, budget: Number(budget || 0), spent, remaining: Number(budget || 0) - spent };
  }).sort((a, b) => (b.spent - b.budget) - (a.spent - a.budget));
  const scheduled = (state.scheduledPayments || []).filter((item) => item.active !== false && (item.repeat === "monthly" || String(item.dueDate || "").startsWith(month)));
  const pendingPayments = scheduled.filter((item) => !(item.paidMonths || []).includes(month));
  const previous = previousMonth(month);
  const priorExpenses = (state.movements || []).filter((item) => item.type === "expense" && String(item.date || "").startsWith(previous));
  const priorTotal = total(priorExpenses);
  const savingsBalance = (state.savingsAccounts || []).map((account) => ({
    name: account.name,
    target: Number(account.target || 0),
    saved: (state.movements || []).filter((item) => item.savingAccountId === account.id).reduce((sum, item) => sum + Number(item.amount || 0), 0),
  }));
  const priorAmounts = expensesByCategory(priorExpenses, categories);
  byCategory.forEach((row) => { row.previous = Number(priorAmounts[row.id] || 0); });
  const trend = Array.from({ length: 6 }, (_, index) => shiftMonth(month, index - 5)).map((key) => {
    const rows = (state.movements || []).filter((item) => String(item.date || "").startsWith(key));
    return { month: key, income: total(rows.filter((item) => item.type === "income")), expense: total(rows.filter((item) => item.type === "expense")) };
  });
  const weeks = [[1, 7], [8, 14], [15, 21], [22, 31]].map(([from, to]) => ({
    label: to === 31 ? `${from}-fin` : `${from}-${to}`,
    amount: total(expenses.filter((item) => { const day = Number(String(item.date).slice(8, 10)); return day >= from && day <= to; })),
  }));
  const topExpenses = [...expenses].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)).slice(0, 5)
    .map((item) => ({ merchant: item.merchant || "Sin comercio", amount: Number(item.amount || 0), date: item.date, category: categories.find((category) => category.id === item.category)?.name || "Sin categoría" }));
  const nowMonth = new Date().toISOString().slice(0, 7);
  return {
    month, range: monthRange(month), movements, expenses, income, savings,
    trend, weeks, topExpenses, isPartial: month >= nowMonth,
    totals: { income: total(income), expense: total(expenses), saving: total(savings), available: total(income) - total(expenses) - total(savings), previousExpense: priorTotal },
    categories: byCategory, merchants: byMerchant, budgets: budgetRows,
    pendingPayments, savingsBalance,
  };
}

function money(value) { return `CRC ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function bar(value, max) {
  const units = Math.max(1, Math.round((Number(value || 0) / Math.max(Number(max || 0), 1)) * 12));
  return "█".repeat(units);
}

function reportText(report, kind = "full") {
  const totals = report.totals;
  const title = `📑 Reporte financiero · ${report.month}`;
  if (kind === "pending") {
    return [title, "", report.pendingPayments.length ? `Pagos pendientes (${report.pendingPayments.length}):` : "No hay pagos programados pendientes.", ...report.pendingPayments.map((item) => `• ${item.name}: ${money(item.amount)} · vence ${item.dueDate}`)].join("\n");
  }
  if (kind === "budget") {
    return [title, "", report.budgets.length ? "Presupuesto vs. gasto:" : "No hay presupuestos configurados.", ...report.budgets.map((item) => `• ${item.name}: ${money(item.spent)} de ${money(item.budget)}${item.remaining < 0 ? " ⚠️ excedido" : ` · quedan ${money(item.remaining)}`}`)].join("\n");
  }
  if (kind === "savings") {
    return [title, "", report.savingsBalance.length ? "Metas de ahorro:" : "No hay metas de ahorro configuradas.", ...report.savingsBalance.map((item) => `• ${item.name}: ${money(item.saved)} de ${money(item.target)}`)].join("\n");
  }
  if (kind === "comparison") {
    const diff = totals.expense - totals.previousExpense;
    return [title, "", `Gastos este mes: ${money(totals.expense)}`, `Gastos mes anterior: ${money(totals.previousExpense)}`, `Cambio: ${diff >= 0 ? "+" : ""}${money(diff)}`, "", "Categorías principales:", ...report.categories.slice(0, 5).map((item) => `• ${item.name}: ${money(item.amount)}`)].join("\n");
  }
  const max = report.categories[0]?.amount || 1;
  return [title, "", `Ingresos: ${money(totals.income)}`, `Gastos: ${money(totals.expense)}`, `Ahorro movido: ${money(totals.saving)}`, `Disponible: ${money(totals.available)}`, "", "Dónde se fue el dinero:", ...report.categories.slice(0, 5).map((item) => `• ${item.name}: ${money(item.amount)} ${bar(item.amount, max)}`), "", report.pendingPayments.length ? `⚠️ Pagos pendientes: ${report.pendingPayments.length}` : "✅ Sin pagos programados pendientes."].join("\n");
}

module.exports = { financialReport, reportText, money, previousMonth };
