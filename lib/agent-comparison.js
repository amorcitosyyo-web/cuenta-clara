// Agent: Comparative Analysis
// Analyzes differences between periods, detects trends and anomalies

function getMonthData(movements, month) {
  const byCategory = {};
  let totalExpense = 0;
  let totalIncome = 0;
  let transactionCount = 0;

  (movements || []).forEach(m => {
    if (!String(m.date || "").startsWith(month)) return;

    const cat = m.category || "Otro";

    if (m.type === "expense") {
      byCategory[cat] = (byCategory[cat] || 0) + Number(m.amount || 0);
      totalExpense += Number(m.amount || 0);
      transactionCount++;
    } else if (m.type === "income") {
      totalIncome += Number(m.amount || 0);
    }
  });

  return {
    month,
    byCategory,
    totalExpense,
    totalIncome,
    balance: totalIncome - totalExpense,
    transactionCount
  };
}

function compareMonths(movements, month1, month2) {
  const data1 = getMonthData(movements, month1);
  const data2 = getMonthData(movements, month2);

  const changes = {};
  const allCategories = new Set([
    ...Object.keys(data1.byCategory),
    ...Object.keys(data2.byCategory)
  ]);

  for (const cat of allCategories) {
    const amount1 = data1.byCategory[cat] || 0;
    const amount2 = data2.byCategory[cat] || 0;
    const change = amount2 - amount1;
    const percentChange = amount1 > 0 ? ((amount2 - amount1) / amount1) * 100 : 0;

    changes[cat] = {
      before: amount1,
      after: amount2,
      change,
      percentChange,
      trend: amount2 > amount1 ? "↑" : amount2 < amount1 ? "↓" : "→"
    };
  }

  return {
    month1: data1,
    month2: data2,
    changes,
    expenseChange: data2.totalExpense - data1.totalExpense,
    expenseChangePercent: data1.totalExpense > 0
      ? ((data2.totalExpense - data1.totalExpense) / data1.totalExpense) * 100
      : 0
  };
}

function detectTrends(movements, months = 3) {
  const today = new Date();
  const monthsData = [];

  for (let i = 0; i < months; i++) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const data = getMonthData(movements, month);
    monthsData.unshift(data);
  }

  const trends = {};
  const firstTotal = monthsData[0].totalExpense;
  const lastTotal = monthsData[monthsData.length - 1].totalExpense;
  const overallTrend = lastTotal > firstTotal ? "📈 CRECIENTE" : lastTotal < firstTotal ? "📉 DECRECIENTE" : "→ ESTABLE";

  return {
    months: monthsData,
    overallTrend,
    totalChange: lastTotal - firstTotal,
    totalChangePercent: firstTotal > 0 ? ((lastTotal - firstTotal) / firstTotal) * 100 : 0
  };
}

function generateComparisonReport(movements, month1, month2) {
  const comparison = compareMonths(movements, month1, month2);
  const data1 = comparison.month1;
  const data2 = comparison.month2;
  const changes = comparison.changes;

  let report = `📊 **ANÁLISIS COMPARATIVO**\n`;
  report += `${month1} vs ${month2}\n`;
  report += `${"=".repeat(50)}\n\n`;

  // Summary
  report += `**Resumen General:**\n`;
  report += `${month1}: CRC ${data1.totalExpense.toFixed(2)} gastos, CRC ${data1.totalIncome.toFixed(2)} ingresos\n`;
  report += `${month2}: CRC ${data2.totalExpense.toFixed(2)} gastos, CRC ${data2.totalIncome.toFixed(2)} ingresos\n\n`;

  // Trend
  const trend = comparison.expenseChange > 0 ? "📈 ↑" : "📉 ↓";
  report += `${trend} **Cambio total:** ${comparison.expenseChange > 0 ? "+" : ""}CRC ${comparison.expenseChange.toFixed(2)} `;
  report += `(${comparison.expenseChangePercent > 0 ? "+" : ""}${comparison.expenseChangePercent.toFixed(1)}%)\n\n`;

  // Category changes
  report += `**Cambios por Categoría:**\n`;
  const sortedChanges = Object.entries(changes)
    .sort(([, a], [, b]) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 8);

  for (const [cat, data] of sortedChanges) {
    const arrow = data.trend === "↑" ? "📈" : data.trend === "↓" ? "📉" : "→";
    report += `${arrow} ${cat}: ${data.before > 0 ? `CRC ${data.before.toFixed(2)}` : "—"} → CRC ${data.after.toFixed(2)}`;
    if (data.change !== 0) {
      report += ` (${data.percentChange > 0 ? "+" : ""}${data.percentChange.toFixed(1)}%)`;
    }
    report += `\n`;
  }

  return report;
}

function generateTrendReport(movements) {
  const trends = detectTrends(movements, 3);
  const months = trends.months;

  let report = `📈 **ANÁLISIS DE TENDENCIAS (últimos 3 meses)**\n`;
  report += `${"=".repeat(50)}\n\n`;

  report += `**Tendencia General:** ${trends.overallTrend}\n`;
  report += `**Cambio total:** ${trends.totalChange > 0 ? "+" : ""}CRC ${trends.totalChange.toFixed(2)} `;
  report += `(${trends.totalChangePercent > 0 ? "+" : ""}${trends.totalChangePercent.toFixed(1)}%)\n\n`;

  report += `**Mes a Mes:**\n`;
  for (const month of months) {
    report += `${month.month}: CRC ${month.totalExpense.toFixed(2)} en ${month.transactionCount} transacciones\n`;
  }

  // Detect spending pattern
  const avgSpending = months.reduce((sum, m) => sum + m.totalExpense, 0) / months.length;
  const volatility = Math.sqrt(
    months.reduce((sum, m) => sum + Math.pow(m.totalExpense - avgSpending, 2), 0) / months.length
  );

  report += `\n**Análisis:**\n`;
  report += `Gasto promedio: CRC ${avgSpending.toFixed(2)}\n`;
  report += `Volatilidad: ${volatility < 50000 ? "Baja 🟢" : volatility < 150000 ? "Media 🟡" : "Alta 🔴"}\n`;

  if (trends.totalChangePercent > 5) {
    report += `⚠️ Tu gasto está **creciendo**. Revisa dónde se concentra el aumento.\n`;
  } else if (trends.totalChangePercent < -5) {
    report += `✅ Tu gasto está **disminuyendo**. ¡Buen trabajo!\n`;
  }

  return report;
}

module.exports = {
  compareMonths,
  detectTrends,
  generateComparisonReport,
  generateTrendReport
};
