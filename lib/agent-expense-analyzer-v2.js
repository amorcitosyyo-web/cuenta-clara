// Specialist: Expense Analysis (v2)
// Analyzes spending patterns, budgets, trends with intelligent summarization.

async function turn({ state, channel, conversationId, actor, text, flowContext, history, supabase }) {
  const stage = flowContext.stage || "selecting_period";

  if (stage === "selecting_period") return selectingPeriod(state, text, flowContext);
  if (stage === "selecting_categories") return selectingCategories(state, text, flowContext);
  if (stage === "generating_report") return generatingReport(state, text, flowContext);

  return { text: "Fase desconocida de análisis.", newFlowState: "idle", newContext: {} };
}

async function selectingPeriod(state, text, flowContext) {
  const normalized = String(text || "").toLowerCase();

  const now = new Date();
  const currentYear = now.getFullYear().toString();

  const monthMap = {
    "enero": "01", "febrero": "02", "marzo": "03", "abril": "04",
    "mayo": "05", "junio": "06", "julio": "07", "agosto": "08",
    "septiembre": "09", "setiembre": "09", "octubre": "10", "noviembre": "11", "diciembre": "12",
  };

  let selectedMonth = null;
  for (const [month, value] of Object.entries(monthMap)) {
    if (normalized.includes(month)) {
      selectedMonth = `${currentYear}-${value}`;
      break;
    }
  }

  if (!selectedMonth) {
    return {
      text: "No entendí el mes. Dime agosto, septiembre, octubre, etc.",
      newContext: flowContext,
      newFlowState: "analyzing_expenses"
    };
  }

  return {
    text: `¿Quieres ver todas las categorías o alguna específica?`,
    newContext: { ...flowContext, stage: "selecting_categories", selectedMonth },
    newFlowState: "analyzing_expenses"
  };
}

async function selectingCategories(state, text, flowContext) {
  const normalized = String(text || "").toLowerCase();
  const allCategories = /^(todas|todo|si|sí|ok|all)/.test(normalized);

  return {
    text: `Generando análisis de ${flowContext.selectedMonth}...`,
    newContext: { ...flowContext, stage: "generating_report", allCategories },
    newFlowState: "analyzing_expenses"
  };
}

async function generatingReport(state, text, flowContext) {
  try {
    const movements = (state.movements || []).filter(m =>
      String(m.date || "").startsWith(flowContext.selectedMonth) && m.type === "expense"
    );

    const byCategory = {};
    movements.forEach(m => {
      const cat = m.category || "Sin categoría";
      byCategory[cat] = (byCategory[cat] || 0) + Number(m.amount || 0);
    });

    const total = movements.reduce((sum, m) => sum + Number(m.amount || 0), 0);

    const topCategories = Object.entries(byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat, amt]) => `• ${cat}: CRC ${Number(amt).toFixed(2)}`)
      .join("\n");

    const report = `📊 Análisis de gastos ${flowContext.selectedMonth}\n\n` +
      `Total: CRC ${total.toFixed(2)}\n` +
      `Transacciones: ${movements.length}\n\n` +
      `Top 5 categorías:\n${topCategories || "Sin gastos"}`;

    return {
      text: report,
      newContext: { ...flowContext, stage: "done" },
      newFlowState: "idle"
    };
  } catch (error) {
    console.error("Report generation error:", error);
    return {
      text: "No pude generar el análisis. Intenta de nuevo.",
      newFlowState: "idle",
      newContext: {}
    };
  }
}

module.exports = { turn };
