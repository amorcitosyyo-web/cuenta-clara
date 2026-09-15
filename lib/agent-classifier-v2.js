// Specialist: Expense Classifier (v2)
// Handles classification of expenses from emails, receipts, imports.

const { classifyIncoming, getCategories, learnRule } = require("./_agent");

async function turn({ state, channel, conversationId, actor, text, flowContext, history, supabase }) {
  const stage = flowContext.stage || "classifying";

  if (stage === "classifying") return classifyExpense(state, text, flowContext);
  if (stage === "confirming") return confirmClassification(state, text, flowContext, actor);

  return { text: "Fase desconocida de clasificación.", newFlowState: "idle", newContext: {} };
}

async function classifyExpense(state, text, flowContext) {
  try {
    const item = flowContext.item || {
      merchant: "Movimiento",
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
      note: text
    };

    const classification = await classifyIncoming(item, state);
    const confidence = Math.round(classification.confidence * 100);
    const message = `Clasificué como ${classification.category} con ${confidence}% confianza.\n¿Está bien o quieres cambiarla?`;

    return {
      text: message,
      newContext: { ...flowContext, stage: "confirming", classification, item },
      newFlowState: "classifying_expense"
    };
  } catch (error) {
    console.error("Classification error:", error);
    return {
      text: "Error clasificando. Intenta de nuevo.",
      newFlowState: "idle",
      newContext: {}
    };
  }
}

async function confirmClassification(state, text, flowContext, actor) {
  const normalized = String(text || "").toLowerCase();

  if (/^(si|ok|dale|bien|listo|confirmo|correcto)/.test(normalized)) {
    // Learn this classification for future
    if (flowContext.item && flowContext.item.merchant) {
      learnRule(state, flowContext.item.merchant, flowContext.classification.category, "user");
    }

    return {
      text: "✅ Guardado. Ahora sé que ese comercio es " + flowContext.classification.category,
      newContext: { ...flowContext, stage: "done" },
      newFlowState: "idle"
    };
  }

  if (/^(no|cambiar|otra|diferente)/.test(normalized)) {
    const categories = getCategories(state);
    const categoryList = categories.slice(0, 5).map(c => c.name).join(", ");

    return {
      text: `¿Cuál debería ser? Opciones: ${categoryList}, etc.`,
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
