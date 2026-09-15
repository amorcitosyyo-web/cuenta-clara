// MULTI-AGENT ORCHESTRATOR (v2)
// Refactored: Delegates to specialists instead of doing everything.
// This is the "master" that maintains conversational flow.

const { executeAction } = require("./action-tools");
const { getCategories, makeId, loadConversation, startConversation, updateConversation, endConversation, addToRecentMessages, detectIntent } = require("./_agent");
const { expensesByCategory } = require("./expense-allocations");

const CONFIRMATION_REQUIRED = new Set([
  "record_income", "create_account", "update_account", "record_account_balance",
  "create_card", "update_card", "record_card_statement", "plan_transfer",
  "confirm_transfer", "create_monthly_plan", "update_monthly_plan", "apply_financial_plan", "set_budget",
  "create_category", "update_category", "delete_category", "create_saving_goal",
  "update_saving_goal", "delete_saving_goal", "transfer_saving", "create_scheduled_payment",
  "mark_scheduled_paid", "delete_scheduled_payment", "delete_movement", "delete_pending",
  "restore_trash", "apply_financial_plan",
]);

const WRITE_TOOLS = new Set([
  ...CONFIRMATION_REQUIRED, "create_movement", "update_movement", "accept_pending",
]);

const FINANCIAL_ACTION_TOOL = {
  type: "function",
  name: "financial_action",
  description: "Proponer una acción usando datos financieros.",
  parameters: {
    type: "object",
    properties: {
      type: { type: "string", enum: [...WRITE_TOOLS] },
      data: { type: "object" },
    },
    required: ["type", "data"],
  },
};

// Utility functions (existing)
function normalizeText(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function costaRicaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function cycleFor(date = costaRicaDate()) {
  const [year, month, day] = date.split("-").map(Number);
  const start = day >= 7 ? new Date(Date.UTC(year, month - 1, 7)) : new Date(Date.UTC(year, month - 2, 7));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 6));
  const stamp = (value) => value.toISOString().slice(0, 10);
  return { id: `${stamp(start)}:${stamp(end)}`, start: stamp(start), end: stamp(end) };
}

function householdSnapshot(state) {
  const today = costaRicaDate();
  const month = today.slice(0, 7);
  const expenses = (state.movements || []).filter((item) => item.type === "expense" && String(item.date || "").startsWith(month));
  const income = (state.movements || []).filter((item) => item.type === "income" && String(item.date || "").startsWith(month));
  const sum = (items) => items.reduce((total, item) => total + Number(item.amount || 0), 0);
  const spendingByCategory = Object.entries(expensesByCategory(expenses, getCategories(state)))
    .sort(([, left], [, right]) => right - left).slice(0, 8).map(([category, amount]) => ({ category, amount }));
  return {
    today, month, cycle: cycleFor(today),
    totals: { income: sum(income), expense: sum(expenses), available: sum(income) - sum(expenses) },
    spendingByCategory,
    accounts: (state.accounts || []).map((item) => ({ id: item.id, name: item.name, purpose: item.purpose })),
    cards: (state.cards || []).map((item) => ({ id: item.id, name: item.name, purpose: item.purpose })),
    budgets: state.budgets || {}, goals: state.savingsAccounts || [], payments: state.scheduledPayments || [],
    pending: state.pendingMovements || [], recent: (state.movements || []).slice(0, 10),
  };
}

function menu() {
  return {
    text: ["📋 Menú de Cuenta Clara", "", "¿Qué necesitas?"].join("\n"),
    buttons: [
      [{ text: "🗓️ Planificar", callback_data: "agent:plan" }],
      [{ text: "📊 Analizar", callback_data: "agent:analyze" }, { text: "💵 Ingreso", callback_data: "agent:income" }],
      [{ text: "📋 Ver datos", callback_data: "agent:status" }],
    ],
  };
}

// Map flow_state to specialist module
function getSpecialist(flowState) {
  const specialists = {
    "planning": require("./agent-planner"),
    "analyzing_expenses": require("./agent-expense-analyzer"),
    "classifying_expense": require("./agent-classifier"),
  };
  return specialists[flowState] || null;
}

// MAIN ORCHESTRATOR
async function runAgentTurn({
  state,
  channel,
  conversationId,
  actor = "shared",
  text,
  history = [],
  quotedContext = ""
}) {
  const question = String(text || "").trim();
  if (!question) return { text: "No pude leer el mensaje." };

  // STEP 1: Load conversational state
  const conversationRow = await loadConversation(channel, conversationId);
  const flowState = conversationRow?.flow_state || "idle";
  const flowContext = conversationRow?.flow_context || {};

  // STEP 2: If in a flow, delegate to specialist
  if (flowState !== "idle") {
    const specialist = getSpecialist(flowState);
    if (specialist) {
      try {
        const response = await specialist.turn({
          state,
          channel,
          conversationId,
          actor,
          text: question,
          flowContext,
          history,
        });

        // Update conversation state
        if (response?.newFlowState) {
          const newTurns = (conversationRow?.turns_in_flow || 0) + 1;

          // Detect infinite loops
          if (newTurns > 15 && response.newFlowState === flowState) {
            await endConversation(channel, conversationId);
            return {
              text: "Parece que nos quedamos pegados. ¿Quieres empezar algo nuevo?",
              buttons: [[
                { text: "📋 Menú", callback_data: "agent:menu" },
                { text: "🔄 Reintentar", callback_data: "agent:retry" }
              ]]
            };
          }

          await updateConversation(channel, conversationId, {
            flow_state: response.newFlowState,
            flow_context: response.newContext || flowContext,
            awaiting_user_input: response.nextQuestion || null,
            last_specialist_called: flowState,
            turns_in_flow: newTurns,
            recent_messages: addToRecentMessages(conversationRow?.recent_messages, { role: "user", text: question }, 10),
          });
        }

        return response;
      } catch (error) {
        console.error("Specialist error:", error);
        await endConversation(channel, conversationId);
        return { text: "Error en el especialista. Recomienzo." };
      }
    }
  }

  // STEP 3: If idle, detect new intent
  if (flowState === "idle") {
    const intent = detectIntent(question);

    // Non-flow intents
    if (intent === "menu") return menu();

    if (intent === "status") {
      const snapshot = householdSnapshot(state);
      return {
        text: `📊 Estado de ${snapshot.month}\nIngresos: CRC ${snapshot.totals.income.toFixed(2)}\nGastos: CRC ${snapshot.totals.expense.toFixed(2)}\nDisponible: CRC ${snapshot.totals.available.toFixed(2)}`
      };
    }

    if (intent === "accounts") {
      return {
        text: state.accounts?.length
          ? `🏦 Cuentas:\n${state.accounts.map(a => `• ${a.name}: ${a.purpose || "sin propósito"}`).join("\n")}`
          : "🏦 Aún no conozco sus cuentas."
      };
    }

    // Flow-initiating intents
    if (intent === "plan") {
      await startConversation(channel, conversationId, "planning", {
        stage: "asking_accounts",
        cycle: cycleFor(costaRicaDate()),
        accounts_collected: [],
        cards_collected: []
      });
      return {
        text: "Vamos a planificar el mes. ¿Cuáles son tus cuentas principales y para qué las usas?",
        nextQuestion: "Cuentas y propósitos"
      };
    }

    if (intent === "analyze_expenses") {
      await startConversation(channel, conversationId, "analyzing_expenses", {
        stage: "selecting_period",
      });
      return {
        text: "Vamos a analizar tus gastos. ¿De qué mes?",
        nextQuestion: "Período"
      };
    }

    if (intent === "income") {
      // Could initiate income flow here
      return { text: "💵 Dime monto, fecha, fuente y cuenta." };
    }

    // Fallback
    return menu();
  }

  return { text: "Escribe 'menú' para ver opciones." };
}

// BACKWARD COMPATIBILITY: Legacy functions (still used by telegram-webhook.js)
function taskKey(channel, conversationId) { return `${channel}:${conversationId}`; }

function getTask(state, channel, conversationId) {
  return state.agentMemory?.activeTasks?.[taskKey(channel, conversationId)] || null;
}

function setTask(state, channel, conversationId, task) {
  state.agentMemory.activeTasks = state.agentMemory.activeTasks || {};
  const key = taskKey(channel, conversationId);
  if (task) state.agentMemory.activeTasks[key] = { ...task, updatedAt: new Date().toISOString() };
  else delete state.agentMemory.activeTasks[key];
}

function planningPrompt(state, channel, conversationId) {
  const cycle = cycleFor();
  setTask(state, channel, conversationId, { kind: "planning", cycle, phase: "account_count", accounts: [], cards: [], startedAt: new Date().toISOString() });
  return { text: `🗓️ Organicemos el ciclo ${cycle.start} al ${cycle.end}. No registraré dinero ni transferencias hasta que aprueben el resumen final.\n\nEmpecemos por las cuentas. ¿Cuál es la primera y cómo la manejan?` };
}

function undoAction(state, undoId, actor, channel) {
  const entry = state.agentMemory?.undoActions?.[undoId];
  if (!entry || entry.channel !== channel || Date.parse(entry.expiresAt) < Date.now()) return { text: "Ese cambio ya no se puede deshacer." };
  const movement = (state.movements || []).find((item) => item.id === entry.targetId);
  if (!movement) return { text: "Ese movimiento ya no existe." };
  executeAction(state, { type: "delete_movement", id: movement.id, actor, channel, idempotencyKey: makeId() });
  delete state.agentMemory.undoActions[undoId];
  return { text: `↩️ Deshice ${movement.merchant || "el movimiento"}. Quedó en papelera durante 30 días.` };
}

// Export (keep existing exports for backward compatibility)
module.exports = {
  CONFIRMATION_REQUIRED,
  WRITE_TOOLS,
  FINANCIAL_ACTION_TOOL,
  costaRicaDate,
  cycleFor,
  householdSnapshot,
  menu,
  runAgentTurn,
  getSpecialist,
  normalizeText,
  // Legacy compatibility
  taskKey,
  getTask,
  setTask,
  planningPrompt,
  undoAction,
};
