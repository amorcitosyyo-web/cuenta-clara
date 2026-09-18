// Agent: Smart Financial Alerts
// Detects anomalies, budget overages, and suggests limits

function fmt(value) { return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function calculateCategoryStats(movements, category) {
  const categoryMovements = (movements || [])
    .filter(m => m.category === category && m.type === "expense")
    .map(m => Number(m.amount || 0))
    .sort((a, b) => a - b);

  if (categoryMovements.length === 0) return null;

  const sum = categoryMovements.reduce((a, b) => a + b, 0);
  const avg = sum / categoryMovements.length;
  const median = categoryMovements[Math.floor(categoryMovements.length / 2)];
  const max = categoryMovements[categoryMovements.length - 1];
  const min = categoryMovements[0];

  // Standard deviation
  const variance = categoryMovements.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / categoryMovements.length;
  const stdDev = Math.sqrt(variance);

  return { sum, avg, median, max, min, stdDev, count: categoryMovements.length };
}

function detectAnomalies(movements, category, newAmount) {
  const stats = calculateCategoryStats(movements, category);
  if (!stats || stats.count < 3) return null;

  const threshold = stats.avg + (2 * stats.stdDev); // 2 std dev = ~95% confidence
  const isAnomaly = newAmount > threshold;
  const percentageAboveAvg = ((newAmount - stats.avg) / stats.avg) * 100;

  return {
    isAnomaly,
    threshold,
    percentageAboveAvg,
    avgForCategory: stats.avg,
    recommendation: isAnomaly
      ? `⚠️ Este gasto de CRC ${fmt(newAmount)} es ${Math.abs(percentageAboveAvg).toFixed(0)}% más alto que tu promedio de CRC ${fmt(stats.avg)} en ${category}.`
      : null
  };
}

function checkBudgetExceeded(state, month) {
  const budgets = state.budgets || {};
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const checkMonth = month || currentMonth;

  const alerts = [];

  for (const [category, limit] of Object.entries(budgets)) {
    const spent = (state.movements || [])
      .filter(m =>
        m.category === category &&
        m.type === "expense" &&
        String(m.date || "").startsWith(checkMonth)
      )
      .reduce((sum, m) => sum + Number(m.amount || 0), 0);

    const percentage = (spent / limit) * 100;

    if (percentage >= 100) {
      alerts.push({
        category,
        type: "exceeded",
        spent: fmt(spent),
        limit: fmt(limit),
        percentage: percentage.toFixed(0),
        message: `🚨 ${category}: Excediste el presupuesto. Gastaste CRC ${fmt(spent)} de CRC ${fmt(limit)}`
      });
    } else if (percentage >= 80) {
      alerts.push({
        category,
        type: "warning",
        spent: fmt(spent),
        limit: fmt(limit),
        percentage: percentage.toFixed(0),
        message: `⚠️ ${category}: Vas al ${percentage.toFixed(0)}% del presupuesto (CRC ${fmt(spent)} de CRC ${fmt(limit)})`
      });
    }
  }

  return alerts;
}

function suggestLimits(state) {
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const lastThreeMonths = [];

  for (let i = 0; i < 3; i++) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    lastThreeMonths.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }

  const suggestions = {};

  const categories = new Set((state.movements || []).map(m => m.category).filter(Boolean));

  for (const category of categories) {
    const monthlySpends = {};

    for (const month of lastThreeMonths) {
      const spent = (state.movements || [])
        .filter(m =>
          m.category === category &&
          m.type === "expense" &&
          String(m.date || "").startsWith(month)
        )
        .reduce((sum, m) => sum + Number(m.amount || 0), 0);

      monthlySpends[month] = spent;
    }

    const spends = Object.values(monthlySpends).filter(v => v > 0);
    if (spends.length < 2) continue;

    const avg = spends.reduce((a, b) => a + b, 0) / spends.length;
    const max = Math.max(...spends);
    const suggestedLimit = max + (max * 0.1); // 10% buffer above max

    suggestions[category] = {
      historicalAverage: fmt(avg),
      maxSpent: fmt(max),
      suggestedLimit: fmt(suggestedLimit),
      message: `${category}: Basado en 3 meses, sugerimos límite de CRC ${fmt(suggestedLimit)}`
    };
  }

  return suggestions;
}

function formatAlertMessage(alerts) {
  if (!alerts || alerts.length === 0) return null;

  const critical = alerts.filter(a => a.type === "exceeded");
  const warnings = alerts.filter(a => a.type === "warning");

  let message = "📊 **ALERTAS FINANCIERAS**\n\n";

  if (critical.length > 0) {
    message += "🚨 **CRÍTICAS (Presupuesto excedido):**\n";
    message += critical.map(a => a.message).join("\n") + "\n\n";
  }

  if (warnings.length > 0) {
    message += "⚠️ **ADVERTENCIAS (>80%):**\n";
    message += warnings.map(a => a.message).join("\n");
  }

  return message;
}

module.exports = {
  detectAnomalies,
  checkBudgetExceeded,
  suggestLimits,
  formatAlertMessage,
  calculateCategoryStats
};
