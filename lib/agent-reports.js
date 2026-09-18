// Agent: Visual Financial Reports
// Generates charts, graphs, and visual analytics

function fmt(value) { return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function getMonthName(monthStr) {
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const [, month] = monthStr.split("-");
  return months[parseInt(month) - 1] || monthStr;
}

function generateMonthlyTrend(movements) {
  const last3Months = {};
  const today = new Date();

  for (let i = 0; i < 3; i++) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    const spent = (movements || [])
      .filter(m => String(m.date || "").startsWith(monthKey) && m.type === "expense")
      .reduce((sum, m) => sum + Number(m.amount || 0), 0);

    last3Months[monthKey] = spent;
  }

  const months = Object.keys(last3Months).sort().reverse();
  const values = months.map(m => last3Months[m]);

  // ASCII bar chart
  const maxValue = Math.max(...values);
  const scale = 30 / maxValue; // 30 chars max width

  let chart = "📈 **Gastos últimos 3 meses:**\n\n";

  for (let i = 0; i < months.length; i++) {
    const month = getMonthName(months[i]);
    const value = values[i];
    const barLength = Math.round(value * scale);
    const bar = "█".repeat(barLength);
    chart += `${month} │ ${bar} CRC ${value.toFixed(0)}\n`;
  }

  return chart;
}

function generateCategoryBreakdown(movements) {
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const byCategory = {};
  (movements || [])
    .filter(m => String(m.date || "").startsWith(currentMonth) && m.type === "expense")
    .forEach(m => {
      const cat = m.category || "Otro";
      byCategory[cat] = (byCategory[cat] || 0) + Number(m.amount || 0);
    });

  const sorted = Object.entries(byCategory)
    .sort(([, a], [, b]) => b - a);

  const total = sorted.reduce((sum, [, val]) => sum + val, 0);

  let report = `💰 **Desglose por categoría (${currentMonth}):**\n\n`;

  for (const [category, amount] of sorted.slice(0, 8)) {
    const percentage = ((amount / total) * 100).toFixed(1);
    const circleWidth = Math.round((amount / total) * 20);
    const circle = "●".repeat(circleWidth) + "○".repeat(20 - circleWidth);
    report += `${category}\n${circle} ${percentage}% | CRC ${fmt(amount)}\n\n`;
  }

  return report;
}

function generateStatistics(movements) {
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const thisMonth = (movements || [])
    .filter(m => String(m.date || "").startsWith(currentMonth) && m.type === "expense")
    .map(m => Number(m.amount || 0));

  const income = (movements || [])
    .filter(m => String(m.date || "").startsWith(currentMonth) && m.type === "income")
    .map(m => Number(m.amount || 0));

  if (thisMonth.length === 0) return "📊 Sin datos este mes";

  const totalExpense = thisMonth.reduce((a, b) => a + b, 0);
  const totalIncome = income.reduce((a, b) => a + b, 0);
  const average = totalExpense / thisMonth.length;
  const max = Math.max(...thisMonth);
  const min = Math.min(...thisMonth);

  let stats = `📊 **Estadísticas ${currentMonth}:**\n\n`;
  stats += `Gastos totales: CRC ${fmt(totalExpense)}\n`;
  stats += `Ingresos totales: CRC ${fmt(totalIncome)}\n`;
  stats += `Balance: CRC ${(totalIncome - totalExpense).toFixed(2)}\n`;
  stats += `Promedio por transacción: CRC ${fmt(average)}\n`;
  stats += `Gasto máximo: CRC ${fmt(max)}\n`;
  stats += `Gasto mínimo: CRC ${fmt(min)}\n`;
  stats += `Total de transacciones: ${thisMonth.length}\n`;

  return stats;
}

function generateFullReport(state) {
  const movements = state.movements || [];

  let report = "📊 **REPORTE FINANCIERO COMPLETO**\n";
  report += "=".repeat(40) + "\n\n";

  // Trend
  report += generateMonthlyTrend(movements);
  report += "\n";

  // Categories
  report += generateCategoryBreakdown(movements);
  report += "\n";

  // Statistics
  report += generateStatistics(movements);

  return report;
}

function generateComparisonReport(state, month1, month2) {
  const movements = state.movements || [];

  const getMonthData = (month) => {
    return {
      expenses: (movements || [])
        .filter(m => String(m.date || "").startsWith(month) && m.type === "expense")
        .reduce((sum, m) => sum + Number(m.amount || 0), 0),
      income: (movements || [])
        .filter(m => String(m.date || "").startsWith(month) && m.type === "income")
        .reduce((sum, m) => sum + Number(m.amount || 0), 0),
      count: (movements || [])
        .filter(m => String(m.date || "").startsWith(month) && m.type === "expense").length
    };
  };

  const data1 = getMonthData(month1);
  const data2 = getMonthData(month2);

  const expenseChange = ((data2.expenses - data1.expenses) / data1.expenses) * 100;
  const trend = expenseChange > 0 ? "📈 ↑" : "📉 ↓";

  let report = `📊 **Comparación: ${month1} vs ${month2}**\n\n`;
  report += `${trend} Gastos:\n`;
  report += `  ${month1}: CRC ${fmt(data1.expenses)}\n`;
  report += `  ${month2}: CRC ${fmt(data2.expenses)}\n`;
  report += `  Cambio: ${expenseChange > 0 ? "+" : ""}${expenseChange.toFixed(1)}%\n\n`;

  report += `Transacciones:\n`;
  report += `  ${month1}: ${data1.count}\n`;
  report += `  ${month2}: ${data2.count}\n`;

  return report;
}

module.exports = {
  generateMonthlyTrend,
  generateCategoryBreakdown,
  generateStatistics,
  generateFullReport,
  generateComparisonReport
};
