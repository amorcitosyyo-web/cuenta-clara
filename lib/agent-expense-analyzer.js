// Specialist: Expense Analysis
// Analyzes spending patterns, budgets, trends.

async function turn({ state, channel, conversationId, actor, text, flowContext, history, supabase }) {
  const stage = flowContext.stage || "selecting_period";

  if (stage === "selecting_period") return selectingPeriod(state, text, flowContext);
  if (stage === "selecting_categories") return selectingCategories(state, text, flowContext);
  if (stage === "generating_report") return generatingReport(state, text, flowContext);

  return { text: "Fase desconocida de análisis.", newFlowState: "idle", newContext: {} };
}

async function selectingPeriod(state, text, flowContext) {
  const normalized = String(text || "").toLowerCase();

  // Parse month from natural language
  const monthMap = {
    "enero": "2026-01", "febrero": "2026-02", "marzo": "2026-03", "abril": "2026-04",
    "mayo": "2026-05", "junio": "2026-06", "julio": "2026-07", "agosto": "2026-08",
    "septiembre": "2026-09", "octubre": "2026-10", "noviembre": "2026-11", "diciembre": "2026-12",
  };

  let selectedMonth = null;
  for (const [month, value] of Object.entries(monthMap)) {
    if (normalized.includes(month)) {
      selectedMonth = value;
      break;
    }
  }

  if (!selectedMonth) {
    return {
      text: "No entendí el mes. Dime agosto, septiembre, etc., o un rango de fechas.",
      newContext: flowContext,
      newFlowState: "analyzing_expenses"
    };
  }

  return {
    text: `Analizando gastos de ${selectedMonth}. ¿Qué categorías te interesan? (responde "todas" o menciona categorías específicas)`,
    newContext: { ...flowContext, stage: "selecting_categories", selectedMonth },
    newFlowState: "analyzing_expenses"
  };
}

async function selectingCategories(state, text, flowContext) {
  const normalized = String(text || "").toLowerCase();
  const allCategories = normalized.includes("todas") || normalized.includes("todo");

  return {
    text: `Generando análisis de gastos para ${flowContext.selectedMonth}${allCategories ? " (todas las categorías)" : ""}...`,
    newContext: { ...flowContext, stage: "generating_report", allCategories },
    newFlowState: "analyzing_expenses"
  };
}

async function generatingReport(state, text, flowContext) {
  // This would call reporting.js to generate actual report
  // For now, just close the flow
  return {
    text: "✅ Análisis completado.",
    newContext: { ...flowContext, stage: "done" },
    newFlowState: "idle"
  };
}

module.exports = { turn };
