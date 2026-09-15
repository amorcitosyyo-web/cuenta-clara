// Specialist: Action Executor
// Handles confirmation and execution of financial actions with smart logic.

const { executeAction } = require("./action-tools");
const { makeId } = require("./_agent");

const CONFIRMATION_REQUIRED = new Set([
  "record_income", "create_account", "update_account", "record_account_balance",
  "create_card", "update_card", "record_card_statement", "plan_transfer",
  "confirm_transfer", "create_monthly_plan", "update_monthly_plan", "apply_financial_plan", "set_budget",
  "create_category", "update_category", "delete_category", "create_saving_goal",
  "update_saving_goal", "delete_saving_goal", "transfer_saving", "create_scheduled_payment",
  "mark_scheduled_paid", "delete_scheduled_payment", "delete_movement", "delete_pending",
  "restore_trash", "apply_financial_plan",
]);

async function turn({ state, channel, conversationId, actor, text, flowContext, history, supabase }) {
  const stage = flowContext.stage || "awaiting_confirmation";

  if (stage === "awaiting_confirmation") return awaitingConfirmation(state, text, flowContext, actor, channel, conversationId);

  return { text: "Fase desconocida de ejecución.", newFlowState: "idle", newContext: {} };
}

async function awaitingConfirmation(state, text, flowContext, actor, channel, conversationId) {
  const normalized = String(text || "").toLowerCase();
  const action = flowContext.pendingAction;

  if (!action) {
    return {
      text: "No hay acción pendiente.",
      newFlowState: "idle",
      newContext: {}
    };
  }

  // User confirms
  if (/^(si|sí|ok|dale|confirmo|correcto|bien|hazlo|adelante)/.test(normalized)) {
    try {
      const { result } = executeAction(state, { ...action, actor, channel, idempotencyKey: makeId() });

      // Remember undo if applicable
      if (["create_movement", "update_movement", "accept_pending"].includes(action.type)) {
        const undoId = makeId();
        state.agentMemory.undoActions = state.agentMemory.undoActions || {};
        state.agentMemory.undoActions[undoId] = {
          id: undoId,
          type: action.type,
          targetId: result.id,
          actor,
          channel,
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString()
        };
      }

      return {
        text: `✅ Listo. ${describeResult(action.type, result)}`,
        newFlowState: "idle",
        newContext: {}
      };
    } catch (error) {
      console.error("Action execution error:", error);
      return {
        text: `❌ No pude ejecutar la acción: ${error.message}`,
        newFlowState: "idle",
        newContext: {}
      };
    }
  }

  // User cancels
  if (/^(no|cancelar|detener|dejalo|olvida)/.test(normalized)) {
    return {
      text: "❌ Cancelada. No cambié ningún dato.",
      newFlowState: "idle",
      newContext: {}
    };
  }

  return {
    text: "Dime 'sí' para confirmar o 'no' para cancelar.",
    newFlowState: "confirming_action",
    newContext: flowContext
  };
}

function describeResult(type, result) {
  if (type === "create_movement" || type === "record_income") {
    return `${result.merchant || "El movimiento"} quedó registrado por CRC ${Number(result.amount || 0).toFixed(2)}.`;
  }
  if (type === "update_movement") {
    return `${result.merchant || "El movimiento"} quedó actualizado.`;
  }
  if (type === "create_account") {
    return `Cuenta "${result.name}" creada.`;
  }
  if (type === "create_card") {
    return `Tarjeta "${result.name}" creada.`;
  }
  if (type === "set_budget") {
    return `Presupuesto actualizado.`;
  }
  if (type === "create_saving_goal") {
    return `Meta "${result.name}" creada.`;
  }
  if (type === "create_scheduled_payment") {
    return `Pago programado registrado.`;
  }
  return "Guardé el cambio.";
}

module.exports = { turn, CONFIRMATION_REQUIRED };
