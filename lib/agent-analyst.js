// Agent: Flexible Financial Analyst
//
// Instead of routing every question to one of a handful of fixed report
// templates, this agent gets a small set of tools to query the household's
// real data (movements, categories, budgets, accounts, goals) and decides
// for itself what to look up to answer whatever the user actually asked.

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthKey(dateStr) {
  return String(dateStr || "").slice(0, 7);
}

function inRange(dateStr, from, to) {
  const d = String(dateStr || "");
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_categories",
      description: "Lista todas las categorias de gasto e ingreso disponibles, con su id, nombre y tipo.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "aggregate_by_category",
      description: "Suma los movimientos agrupados por categoria dentro de un rango de fechas. Util para saber en que se va el dinero.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Fecha inicial YYYY-MM-DD, inclusive. Omitir para no limitar." },
          to: { type: "string", description: "Fecha final YYYY-MM-DD, inclusive. Omitir para no limitar." },
          type: { type: "string", enum: ["expense", "income"], description: "Tipo de movimiento a sumar." },
        },
        required: ["type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aggregate_by_month",
      description: "Suma los movimientos agrupados por mes calendario dentro de un rango de fechas. Util para tendencias.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Fecha inicial YYYY-MM-DD, inclusive." },
          to: { type: "string", description: "Fecha final YYYY-MM-DD, inclusive." },
          type: { type: "string", enum: ["expense", "income"] },
          category: { type: "string", description: "Id de categoria opcional para filtrar." },
        },
        required: ["type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_movements",
      description: "Devuelve movimientos individuales (fecha, monto, comercio, categoria) dentro de un rango. Usalo solo cuando necesites detalle, no para totales grandes; el resultado se limita a 80 movimientos.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          type: { type: "string", enum: ["expense", "income"] },
          category: { type: "string", description: "Id de categoria opcional para filtrar." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_budgets",
      description: "Devuelve los presupuestos configurados por categoria y mes.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_accounts",
      description: "Devuelve las cuentas, tarjetas y sus saldos conocidos.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_goals",
      description: "Devuelve las metas de ahorro y su progreso.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_scheduled_payments",
      description: "Devuelve los pagos programados o recurrentes.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

function executeTool(name, args, state, categories) {
  const categoryName = (id) => categories.find((item) => item.id === id)?.name || id || "Sin categoria";
  if (name === "list_categories") {
    return categories.map((item) => ({ id: item.id, name: item.name, kind: item.kind }));
  }
  if (name === "aggregate_by_category") {
    const totals = {};
    (state.movements || []).forEach((movement) => {
      if (movement.type !== args.type) return;
      if (!inRange(movement.date, args.from, args.to)) return;
      const key = categoryName(movement.category);
      totals[key] = (totals[key] || 0) + Number(movement.amount || 0);
    });
    return Object.entries(totals)
      .sort(([, a], [, b]) => b - a)
      .map(([category, total]) => ({ category, total: Number(total.toFixed(2)) }));
  }
  if (name === "aggregate_by_month") {
    const totals = {};
    (state.movements || []).forEach((movement) => {
      if (movement.type !== args.type) return;
      if (args.category && movement.category !== args.category) return;
      if (!inRange(movement.date, args.from, args.to)) return;
      const key = monthKey(movement.date);
      totals[key] = (totals[key] || 0) + Number(movement.amount || 0);
    });
    return Object.entries(totals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month, total: Number(total.toFixed(2)) }));
  }
  if (name === "list_movements") {
    const items = (state.movements || [])
      .filter((movement) => (!args.type || movement.type === args.type))
      .filter((movement) => (!args.category || movement.category === args.category))
      .filter((movement) => inRange(movement.date, args.from, args.to))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 80)
      .map((movement) => ({
        date: movement.date,
        amount: Number(movement.amount || 0),
        merchant: movement.merchant,
        category: categoryName(movement.category),
        type: movement.type,
      }));
    return { count: items.length, movements: items };
  }
  if (name === "get_budgets") {
    return state.budgets || {};
  }
  if (name === "get_accounts") {
    return (state.accounts || []).map((account) => ({
      name: account.name,
      purpose: account.purpose,
      balance: account.balance,
      minimumBalance: account.minimumBalance,
    }));
  }
  if (name === "get_goals") {
    return (state.savingsAccounts || []).map((goal) => ({
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
    }));
  }
  if (name === "get_scheduled_payments") {
    return (state.scheduledPayments || []).map((payment) => ({
      name: payment.name,
      amount: payment.amount,
      dueDate: payment.dueDate,
      repeat: payment.repeat,
    }));
  }
  return { error: "Herramienta desconocida." };
}

async function callOpenAi(messages, model, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0.2, tools: TOOLS, messages }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return null;
    return payload;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function runAnalystAgent(question, state, categories, todayDate) {
  if (!process.env.OPENAI_API_KEY) return null;
  const model = process.env.OPENAI_ANALYST_MODEL || process.env.OPENAI_AGENT_MODEL || "gpt-4.1-mini";
  const systemPrompt = [
    "Eres el analista financiero de Cuenta Clara, un hogar de Costa Rica. Moneda CRC.",
    `Hoy es ${todayDate}.`,
    "El usuario puede pedir cualquier tipo de analisis sobre sus finanzas: gastos esenciales vs opcionales, comparaciones, promedios, proyecciones, lo que sea.",
    "No existe una funcion fija para cada pregunta: usa las herramientas para consultar los datos reales que necesites (puedes llamar varias, en varias rondas) y luego responde con tus propias palabras.",
    "Cuando el usuario pida distinguir gasto esencial o basico de gasto opcional, usa tu propio criterio segun los nombres de categoria (vivienda, servicios, alimentacion basica, transporte al trabajo suelen ser esenciales; entretenimiento, compras, suscripciones suelen ser opcionales) y dilo explicitamente para que el usuario pueda corregirte.",
    "Nunca inventes montos: todo numero que menciones debe venir de una herramienta que llamaste.",
    "Se conciso y concreto. Usa **negrita** para resaltar los numeros o conclusiones clave. No agregues disclaimers largos.",
  ].join("\n");
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: question },
  ];
  for (let round = 0; round < 4; round++) {
    const payload = await callOpenAi(messages, model, 7000);
    if (!payload) return null;
    const message = payload?.choices?.[0]?.message;
    if (!message) return null;
    const toolCalls = message.tool_calls || [];
    if (!toolCalls.length) {
      return typeof message.content === "string" && message.content.trim() ? message.content.trim() : null;
    }
    messages.push(message);
    for (const call of toolCalls) {
      let args = {};
      try { args = JSON.parse(call.function?.arguments || "{}"); } catch { args = {}; }
      const result = executeTool(call.function?.name, args, state, categories);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return null;
}

module.exports = { runAnalystAgent };
