// Agent: Intelligent Goals & Motivation
// Suggests realistic saving goals, tracks progress, celebrates wins

function fmt(value) { return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function suggestGoals(state) {
  const movements = state.movements || [];
  const today = new Date();
  const last3Months = [];

  for (let i = 0; i < 3; i++) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    last3Months.push(month);
  }

  // Calculate average spending by category
  const categoryStats = {};
  movements.forEach(m => {
    if (!last3Months.some(month => String(m.date || "").startsWith(month))) return;
    if (m.type !== "expense") return;

    const cat = m.category || "Otro";
    if (!categoryStats[cat]) categoryStats[cat] = [];
    categoryStats[cat].push(Number(m.amount || 0));
  });

  const goals = {};
  const suggestions = [];

  for (const [category, amounts] of Object.entries(categoryStats)) {
    if (amounts.length < 2) continue;

    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const max = Math.max(...amounts);

    // Suggest 15% reduction from max, minimum 10% from average
    const reductionTarget = Math.max(
      max * 0.85,
      avg * 0.9
    );

    const potentialSavings = max - reductionTarget;

    goals[category] = {
      current: avg,
      target: reductionTarget,
      potentialSavings: potentialSavings,
      difficulty: potentialSavings < avg * 0.05 ? "Fácil 🟢" : potentialSavings < avg * 0.15 ? "Moderada 🟡" : "Desafiante 🔴"
    };

    if (potentialSavings > 10000) {
      suggestions.push({
        category,
        savings: potentialSavings,
        message: `💡 ${category}: Reducir de CRC ${fmt(max)} a CRC ${fmt(reductionTarget)} = Ahorro de CRC ${fmt(potentialSavings)}/mes`
      });
    }
  }

  // Sort by savings potential
  suggestions.sort((a, b) => b.savings - a.savings);

  return { goals, suggestions };
}

function trackGoalProgress(state, categoryGoal) {
  const movements = state.movements || [];
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const thisMonthSpending = movements
    .filter(m =>
      m.category === categoryGoal &&
      String(m.date || "").startsWith(currentMonth) &&
      m.type === "expense"
    )
    .reduce((sum, m) => sum + Number(m.amount || 0), 0);

  const savingsGoals = state.savingsAccounts || [];
  const goal = savingsGoals.find(g => g.name && g.name.toLowerCase().includes(categoryGoal.toLowerCase()));

  if (!goal) return null;

  const targetAmount = goal.targetAmount || 0;
  const currentAmount = goal.currentAmount || 0;
  const progress = (currentAmount / targetAmount) * 100;

  const remainingDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate();
  const dailyTarget = (targetAmount - currentAmount) / Math.max(1, remainingDays);

  return {
    goalName: goal.name,
    targetAmount,
    currentAmount,
    progress,
    remainingAmount: targetAmount - currentAmount,
    remainingDays,
    dailyTarget,
    isOnTrack: progress >= (100 * (1 - (remainingDays / 30)))
  };
}

function generateGoalReport(state) {
  const { goals, suggestions } = suggestGoals(state);

  let report = `🎯 **METAS DE AHORRO INTELIGENTES**\n`;
  report += `${"=".repeat(50)}\n\n`;

  if (suggestions.length === 0) {
    report += `✅ Excelente. Sin oportunidades de ahorro significativas detectadas.\n`;
    return report;
  }

  report += `**${suggestions.length} Oportunidades de Ahorro Identificadas:**\n\n`;

  let totalPotential = 0;
  for (let i = 0; i < Math.min(5, suggestions.length); i++) {
    const sugg = suggestions[i];
    const goal = goals[sugg.category];
    report += `${i + 1}. ${sugg.message}\n`;
    report += `   Dificultad: ${goal.difficulty}\n\n`;
    totalPotential += sugg.savings;
  }

  report += `💰 **Total potencial de ahorro:** CRC ${fmt(totalPotential)}/mes\n`;
  report += `📅 **En un año:** CRC ${(totalPotential * 12).toFixed(2)}\n`;

  return report;
}

function generateMotivation(state) {
  const movements = state.movements || [];
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = `${today.getFullYear()}-${String(today.getMonth()).padStart(2, '0')}`;

  const thisMonthExpense = movements
    .filter(m => String(m.date || "").startsWith(currentMonth) && m.type === "expense")
    .reduce((sum, m) => sum + Number(m.amount || 0), 0);

  const lastMonthExpense = movements
    .filter(m => String(m.date || "").startsWith(lastMonth) && m.type === "expense")
    .reduce((sum, m) => sum + Number(m.amount || 0), 0);

  let message = `💪 **MOTIVACIÓN Y PROGRESO**\n\n`;

  if (thisMonthExpense < lastMonthExpense) {
    const savings = lastMonthExpense - thisMonthExpense;
    const percent = (savings / lastMonthExpense) * 100;
    message += `🎉 ¡Excelente! Este mes gastaste CRC ${fmt(savings)} menos que el anterior (${percent.toFixed(1)}% de reducción).\n`;
    message += `📈 ¡Vas por buen camino!\n`;
  } else if (thisMonthExpense === lastMonthExpense) {
    message += `→ Tu gasto se mantiene estable. Consistencia es clave.\n`;
  } else {
    const increase = thisMonthExpense - lastMonthExpense;
    const percent = (increase / lastMonthExpense) * 100;
    message += `⚠️ Este mes los gastos aumentaron CRC ${fmt(increase)} (${percent.toFixed(1)}% más que el mes pasado).\n`;
    message += `💡 Revisa dónde aumentó el gasto y cómo puedes ajustar.\n`;
  }

  // Motivational quotes based on progress
  const quotes = [
    "🌟 Cada pequeño ahorro cuenta. ¡Sigue adelante!",
    "💎 El dinero ahorrado hoy es libertad futura.",
    "🚀 Estás construyendo tu seguridad financiera.",
    "✨ Pequeños cambios, grandes resultados.",
    "🎯 Tu disciplina financiera te llevará lejos."
  ];

  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
  message += `\n${randomQuote}`;

  return message;
}

module.exports = {
  suggestGoals,
  trackGoalProgress,
  generateGoalReport,
  generateMotivation
};
