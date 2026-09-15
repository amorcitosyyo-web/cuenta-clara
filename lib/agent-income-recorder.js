// Specialist: Income Recording
// Handles natural language income entry: salary, commissions, other income.

async function turn({ state, channel, conversationId, actor, text, flowContext, history, supabase }) {
  const stage = flowContext.stage || "asking_amount";

  if (stage === "asking_amount") return askingAmount(state, text, flowContext);
  if (stage === "asking_date") return askingDate(state, text, flowContext);
  if (stage === "asking_source") return askingSource(state, text, flowContext);
  if (stage === "asking_account") return askingAccount(state, text, flowContext);
  if (stage === "confirming") return confirmingIncome(state, text, flowContext);

  return { text: "Fase desconocida de ingreso.", newFlowState: "idle", newContext: {} };
}

async function askingAmount(state, text, flowContext) {
  const amount = parseAmount(text);
  if (!amount || amount <= 0) {
    return {
      text: "No entendí el monto. Dime un número: por ejemplo '500000' o '500 mil'.",
      newContext: flowContext,
      newFlowState: "recording_income"
    };
  }
  return {
    text: `Entendí CRC ${amount.toLocaleString('es-CR')}. ¿Cuándo llegó este ingreso? (fecha o "hoy")`,
    newContext: { ...flowContext, stage: "asking_date", amount },
    newFlowState: "recording_income"
  };
}

async function askingDate(state, text, flowContext) {
  const date = parseDate(text);
  if (!date) {
    return {
      text: "No entendí la fecha. Dime una fecha o 'hoy'.",
      newContext: flowContext,
      newFlowState: "recording_income"
    };
  }
  return {
    text: `¿De dónde es este ingreso? (salario, comisión, otro, etc.)`,
    newContext: { ...flowContext, stage: "asking_source", date },
    newFlowState: "recording_income"
  };
}

async function askingSource(state, text, flowContext) {
  const source = String(text || "").toLowerCase().trim();
  const sourceType = inferSourceType(source);

  return {
    text: `¿En qué cuenta llegó? (${(state.accounts || []).map(a => a.name).join(', ') || 'nombre de cuenta'})`,
    newContext: { ...flowContext, stage: "asking_account", sourceType, sourceText: source },
    newFlowState: "recording_income"
  };
}

async function askingAccount(state, text, flowContext) {
  const account = findAccount(state, text);
  if (!account) {
    return {
      text: `No encontré esa cuenta. Opciones: ${(state.accounts || []).map(a => a.name).join(', ')}`,
      newContext: flowContext,
      newFlowState: "recording_income"
    };
  }
  return {
    text: `Perfecto. Voy a registrar CRC ${flowContext.amount.toLocaleString('es-CR')} de ${flowContext.sourceText} en ${account.name} el ${flowContext.date}.\n\n¿Está bien?`,
    newContext: { ...flowContext, stage: "confirming", accountId: account.id, accountName: account.name },
    newFlowState: "recording_income"
  };
}

async function confirmingIncome(state, text, flowContext) {
  const normalized = String(text || "").toLowerCase();

  if (/^(si|sí|ok|dale|confirmo|correcto|bien)/.test(normalized)) {
    // Record income (action will be processed by parent)
    return {
      text: `✅ Registré CRC ${flowContext.amount.toLocaleString('es-CR')} en ${flowContext.accountName}.`,
      newContext: { ...flowContext, stage: "done", shouldCreateMovement: true },
      newFlowState: "idle",
      action: {
        type: "record_income",
        data: {
          amount: flowContext.amount,
          date: flowContext.date,
          source: flowContext.sourceType,
          incomeKind: flowContext.sourceType,
          accountId: flowContext.accountId,
          note: flowContext.sourceText
        }
      }
    };
  }

  if (/^(no|cambiar|otra)/.test(normalized)) {
    return {
      text: "Empecemos de nuevo. ¿Cuál es el monto?",
      newContext: { stage: "asking_amount" },
      newFlowState: "recording_income"
    };
  }

  return {
    text: "Dime 'sí' para confirmar o 'no' para cambiar.",
    newContext: flowContext,
    newFlowState: "recording_income"
  };
}

function parseAmount(text) {
  const match = text.match(/(\d+[\d.,]*)/);
  if (!match) return null;
  const clean = match[1].replace(/[.,]/g, (m) => m === ',' ? '.' : '');
  const amount = Number(clean);
  return amount > 0 ? amount : null;
}

function parseDate(text) {
  const normalized = String(text || "").toLowerCase();
  if (/^(hoy|today|ahora)/.test(normalized)) {
    return new Date().toISOString().slice(0, 10);
  }
  // Try parsing as date
  try {
    const date = new Date(text);
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  } catch {}
  return null;
}

function inferSourceType(text) {
  const normalized = String(text || "").toLowerCase();
  if (/salario|sueldo|planilla/.test(normalized)) return "salary";
  if (/comisi[oó]n|comisiones|ventas/.test(normalized)) return "commission";
  return "other";
}

function findAccount(state, text) {
  const normalized = String(text || "").toLowerCase();
  return (state.accounts || []).find(a =>
    normalized.includes(a.name.toLowerCase()) ||
    a.name.toLowerCase().includes(normalized)
  ) || null;
}

module.exports = { turn };
