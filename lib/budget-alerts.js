function collectBudgetAlerts(state, options = {}) {
  const month = String(options.month || costaRicaMonth());
  const categories = Array.isArray(options.categories) ? options.categories : [];
  const allowed = options.categoryIds?.length ? new Set(options.categoryIds) : null;
  const spentByCategory = (state.movements || [])
    .filter((item) => item.type === "expense" && String(item.date || "").startsWith(month))
    .reduce((totals, item) => {
      const categoryId = String(item.category || "");
      totals[categoryId] = (totals[categoryId] || 0) + Number(item.amount || 0);
      return totals;
    }, {});

  state.agentMemory = state.agentMemory || {};
  state.agentMemory.budgetAlertLevels = state.agentMemory.budgetAlertLevels || {};
  const levels = state.agentMemory.budgetAlertLevels[month] || {};
  const alerts = [];

  for (const [categoryId, rawBudget] of Object.entries(state.budgets || {})) {
    if (allowed && !allowed.has(categoryId)) continue;
    const budget = Number(rawBudget || 0);
    if (budget <= 0) continue;
    const spent = Number(spentByCategory[categoryId] || 0);
    const ratio = spent / budget;
    const currentLevel = ratio >= 1 ? 100 : ratio >= 0.8 ? 80 : 0;
    const previousLevel = Number(levels[categoryId] || 0);
    if (currentLevel <= previousLevel) continue;
    levels[categoryId] = currentLevel;
    alerts.push({
      categoryId,
      categoryName: categories.find((category) => category.id === categoryId)?.name || categoryId,
      budget,
      spent,
      level: currentLevel,
      percent: Math.round(ratio * 100),
    });
  }

  state.agentMemory.budgetAlertLevels[month] = levels;
  return alerts;
}

function formatBudgetAlerts(alerts) {
  if (!alerts?.length) return "";
  const title = alerts.some((item) => item.level >= 100) ? "🚨 Alerta de presupuesto" : "⚠️ Alerta de presupuesto";
  return `${title}\n\n${alerts.map((item) => {
    const difference = item.spent - item.budget;
    const status = difference > 0
      ? `excedido por ${formatCrc(difference)}`
      : difference === 0
        ? "presupuesto agotado"
        : `quedan ${formatCrc(Math.abs(difference))}`;
    return `• ${item.categoryName}: ${item.percent}% usado (${formatCrc(item.spent)} de ${formatCrc(item.budget)}); ${status}.`;
  }).join("\n")}`;
}

function costaRicaMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

function formatCrc(value) {
  return `CRC ${Number(value || 0).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

module.exports = { collectBudgetAlerts, formatBudgetAlerts, costaRicaMonth };
