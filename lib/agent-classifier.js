// Specialist: Expense Classifier
// Handles classification of expenses from emails, receipts, imports.

async function turn({ state, channel, conversationId, actor, text, flowContext, history, supabase }) {
  const stage = flowContext.stage || "classifying";

  if (stage === "classifying") return classifyExpense(state, text, flowContext);
  if (stage === "confirming") return confirmClassification(state, text, flowContext);

  return { text: "Fase desconocida de clasificación.", newFlowState: "idle", newContext: {} };
}

async function classifyExpense(state, text, flowContext) {
  // This would use the existing classifyIncoming logic from _agent.js
  // For now, basic handling
  const { classifyIncoming, getCategories, normalizeIncomingItem } = require("./_agent");

  try {
    const categories = getCategories(state);
    const classification = await classifyIncoming(flowContext.item, state);

    const confidence = Math.round(classification.confidence * 100);
    const message = `Clasificué como ${classification.category} con ${confidence}% confianza.\n¿Está bien o quieres cambiarla?`;

    return {
      text: message,
      newContext: { ...flowContext, stage: "confirming", classification },
      newFlowState: "classifying_expense"
    };
  } catch (error) {
    console.error("Classification error:", error);
    return { text: "Error clasificando. Intenta de nuevo.", newFlowState: "idle", newContext: {} };
  }
}

async function confirmClassification(state, text, flowContext) {
  const normalized = String(text || "").toLowerCase();

  if (/^(si|ok|dale|bien|listo|confirmo|correcto)/.test(normalized)) {
    return {
      text: "✅ Guardado.",
      newContext: { ...flowContext, stage: "done" },
      newFlowState: "idle"
    };
  }

  if (/^(no|cambiar|otra)/.test(normalized)) {
    return {
      text: "¿Cuál debería ser la categoría correcta?",
      newContext: { ...flowContext, stage: "classifying" },
      newFlowState: "classifying_expense"
    };
  }

  return {
    text: "Dime 'sí' si está bien o 'no' si quieres cambiarla.",
    newContext: flowContext,
    newFlowState: "classifying_expense"
  };
}

module.exports = { turn };
