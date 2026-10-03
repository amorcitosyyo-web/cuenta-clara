// Agent: Flexible Financial Analyst
//
// Instead of routing every question to one of a handful of fixed report
// templates, this agent gets a small set of tools to query the household's
// real data (movements, categories, budgets, accounts, goals) and decides
// for itself what to look up to answer whatever the user actually asked.
// It also gets a controlled set of write tools so it can register a
// movement, set a budget or create a goal itself instead of only talking
// about the data.
const { executeAction } = require("./action-tools");
const { usdToCrc, parseAmount } = require("./fx");

const EXECUTABLE_ACTIONS = new Set([
  "create_movement", "update_movement", "delete_movement", "record_income", "set_budget",
  "create_saving_goal", "update_saving_goal", "transfer_saving",
  "create_scheduled_payment", "mark_scheduled_paid", "delete_scheduled_payment",
  "delete_saving_goal", "create_category",
]);

// Types whose real financial fields (amount/date/merchant/category/type)
// must stay nested under data.<field>: the movement's own `type`
// (expense/income/saving) would otherwise collide with the action's own
// `type` ("create_movement"/"update_movement"). update_movement also needs
// its `id` kept flat, since that lookup happens before the nested merge.
const NESTED_DATA_ACTIONS = new Set(["create_movement", "update_movement"]);

function makeMemoryId() {
  return `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function getLongTermMemory(state) {
  state.agentMemory = state.agentMemory || {};
  state.agentMemory.longTermMemory = Array.isArray(state.agentMemory.longTermMemory) ? state.agentMemory.longTermMemory : [];
  return state.agentMemory.longTermMemory;
}

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
  {
    type: "function",
    function: {
      name: "execute_action",
      description: "Ejecuta de inmediato una accion financiera real: registrar un gasto o ingreso, poner un presupuesto, crear o actualizar una meta de ahorro, mover dinero de ahorro, crear o marcar como pagado un pago programado, o crear una categoria nueva. Se ejecuta sin pedir confirmacion adicional, asi que solo llamalo cuando el usuario ya dio o confirmo los datos necesarios.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [...EXECUTABLE_ACTIONS],
            description: "Tipo de accion a ejecutar.",
          },
          data: {
            type: "object",
            description: "Datos de la accion, con estos nombres exactos de campo. create_movement (data.type = 'expense'|'income'): {type, amount, date, merchant, category}; si el monto original esta en dolares NO lo conviertas tu: manda usd_amount en lugar de amount y el sistema convierte con el tipo de cambio del dia y lo marca como estimado. update_movement: {id, type opcional, amount opcional (o usd_amount si el monto correcto esta en dolares), date opcional, merchant opcional, category opcional} — el id va SIEMPRE, el resto solo lo que cambia; obten el id real con list_movements primero. delete_movement: {id} — obten el id real con list_movements primero, nunca inventes un id. record_income: {amount, date, merchant, category}. set_budget: {category, amount, month opcional YYYY-MM}. create_saving_goal: {name, target}. update_saving_goal: {id, name opcional, target opcional}. transfer_saving: {accountId, amount, direction opcional 'deposit'|'withdraw'}. create_scheduled_payment: {name, amount, dueDate, category, repeat 'monthly'|'once'}. mark_scheduled_paid: {id, month opcional}. delete_scheduled_payment: {id}. delete_saving_goal: {id}. create_category: {name, kind 'expense'|'income'}.",
          },
        },
        required: ["type", "data"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_last_email_sync",
      description: "Devuelve el resultado de las ultimas lecturas del correo bancario (via Make): cuantos movimientos devolvio Make, cuantos eran nuevos, cuantos ya estaban registrados (duplicados) y cuales se omitieron y por que. Usalo cuando pregunten por que se registraron pocos movimientos o que paso con una lectura de correo.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "remember_fact",
      description: "Guarda un dato o preferencia duradera sobre el usuario o el hogar, para recordarla en cualquier conversacion futura (no solo esta). Usalo cuando el usuario pida explicitamente que recuerdes algo, o cuando mencione una preferencia clara y estable (ej: 'siempre redondea a colones enteros', 'mi alquiler es de 350000 y no cambia', 'prefiero que no me preguntes confirmacion').",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "El dato o preferencia, en una frase clara y corta." },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_fact",
      description: "Corrige el texto de un dato ya guardado en la memoria de largo plazo (usa el id que aparece en la lista de hechos conocidos que tienes en tu contexto).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
        },
        required: ["id", "text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "forget_fact",
      description: "Elimina permanentemente un dato guardado en la memoria de largo plazo (usa el id de la lista de hechos conocidos).",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
];

async function executeTool(name, args, state, categories) {
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
        id: movement.id,
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
  if (name === "get_last_email_sync") {
    const events = ((state.agentMemory && state.agentMemory.recentEvents) || []).filter((event) => event && event.kind === "email_sync").slice(0, 3);
    return events.length ? events : { info: "Todavia no hay lecturas de correo registradas con detalle." };
  }
  if (name === "remember_fact") {
    const text = String(args.text || "").trim();
    if (!text) return { error: "Falta el texto a recordar." };
    const memory = getLongTermMemory(state);
    const fact = { id: makeMemoryId(), text, createdAt: new Date().toISOString() };
    memory.push(fact);
    return { ok: true, fact };
  }
  if (name === "update_fact") {
    const memory = getLongTermMemory(state);
    const fact = memory.find((item) => item.id === args.id);
    if (!fact) return { error: "No encontre ese hecho guardado." };
    fact.text = String(args.text || fact.text).trim();
    fact.updatedAt = new Date().toISOString();
    return { ok: true, fact };
  }
  if (name === "forget_fact") {
    const memory = getLongTermMemory(state);
    const before = memory.length;
    state.agentMemory.longTermMemory = memory.filter((item) => item.id !== args.id);
    return { ok: true, removed: before !== state.agentMemory.longTermMemory.length };
  }
  if (name === "execute_action") {
    if (!EXECUTABLE_ACTIONS.has(args.type)) return { error: "Esa accion no esta permitida desde este agente." };
    try {
      // Dollar amounts are converted in code, never by the model: the system
      // applies the day's rate and flags the amount as an estimate so the
      // bank statement can settle it later.
      if (NESTED_DATA_ACTIONS.has(args.type) && args.data && args.data.usd_amount !== undefined) {
        const usd = parseAmount(args.data.usd_amount);
        if (!(usd > 0)) return { ok: false, error: "usd_amount no es un monto valido." };
        const existing = args.type === "update_movement" ? (state.movements || []).find((item) => item.id === args.data.id) : null;
        if (args.type === "update_movement" && !existing) return { ok: false, error: "No encontre ese movimiento." };
        const date = String(args.data.date || existing?.date || new Date().toISOString()).slice(0, 10);
        const converted = await usdToCrc(usd, date, state);
        if (!converted) return { ok: false, error: "No hay tipo de cambio disponible ahora; intenta de nuevo en unos minutos." };
        const baseNote = String(args.data.note ?? existing?.note ?? "").trim();
        const note = baseNote.includes("tipo de cambio estimado") ? baseNote : [baseNote, converted.label].filter(Boolean).join(" · ");
        const { usd_amount: _usd, ...rest } = args.data;
        args = { ...args, data: { ...rest, date, amount: converted.amount, fx: converted.fx, amountEstimated: true, note } };
      }
      const payload = NESTED_DATA_ACTIONS.has(args.type)
        ? { type: args.type, id: args.data?.id, data: args.data || {}, actor: "ai-analyst", channel: "telegram" }
        : { ...(args.data || {}), type: args.type, actor: "ai-analyst", channel: "telegram" };
      const { result } = executeAction(state, payload);
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
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

async function runAnalystAgent(question, state, categories, todayDate, history = []) {
  if (!process.env.OPENAI_API_KEY) return null;
  const model = process.env.OPENAI_ANALYST_MODEL || process.env.OPENAI_AGENT_MODEL || "gpt-4.1-mini";
  const knownFacts = getLongTermMemory(state);
  const factsBlock = knownFacts.length
    ? `Hechos que ya conoces del usuario/hogar (puedes corregirlos con update_fact o borrarlos con forget_fact si dice que ya no aplican):\n${knownFacts.map((item) => `- [${item.id}] ${item.text}`).join("\n")}`
    : "Todavia no tienes hechos guardados de este usuario.";
  const systemPrompt = [
    "Eres el analista financiero de Cuenta Clara, un hogar de Costa Rica. Moneda CRC.",
    `Hoy es ${todayDate}.`,
    "El usuario puede pedir cualquier tipo de analisis sobre sus finanzas: gastos esenciales vs opcionales, comparaciones, promedios, proyecciones, lo que sea.",
    "No existe una funcion fija para cada pregunta: usa las herramientas para consultar los datos reales que necesites (puedes llamar varias, en varias rondas) y luego responde con tus propias palabras.",
    "Cuando el usuario pida distinguir gasto esencial o basico de gasto opcional, usa tu propio criterio segun los nombres de categoria (vivienda, servicios, alimentacion basica, transporte al trabajo suelen ser esenciales; entretenimiento, compras, suscripciones suelen ser opcionales) y dilo explicitamente para que el usuario pueda corregirte.",
    "Nunca inventes montos: todo numero que menciones debe venir de una herramienta que llamaste.",
    "La app guarda todo en colones. Si un gasto fue en dolares, usa usd_amount (nunca calcules la conversion tu). Si un movimiento ya quedo registrado en colones pero en realidad era en dolares (monto muy bajo, por ejemplo 8.99), corrigelo con update_movement usando usd_amount y el id real de list_movements.",
    "Si el usuario pregunta por que se registraron pocos movimientos del correo, o que paso con una lectura, consulta get_last_email_sync antes de responder.",
    "Si el usuario pide eliminar o corregir un gasto duplicado o mal registrado, SI puedes hacerlo: usa list_movements para encontrar el id exacto (nunca lo inventes) y luego execute_action con delete_movement o update_movement segun corresponda. No propongas registrar un ingreso de compensacion como sustituto de eliminar: eso duplicaria el problema. El sistema guarda todo lo eliminado en una papelera recuperable, asi que no hay riesgo de perdida real.",
    "Tienes acceso a los ultimos mensajes de esta conversacion. Usalos para entender referencias como 'y el mes pasado', 'y esa categoria', 'lo mismo pero de enero', etc. sin pedir que repitan el contexto.",
    "Ademas de esa memoria corta, tienes memoria de largo plazo entre conversaciones distintas: usa remember_fact cuando el usuario pida explicitamente que recuerdes algo o exprese una preferencia estable y duradera. No guardes cosas triviales o de una sola vez.",
    factsBlock,
    "Se conciso y concreto. Usa **negrita** para resaltar los numeros o conclusiones clave. No agregues disclaimers largos.",
  ].join("\n");
  const recentTurns = (Array.isArray(history) ? history : [])
    .slice(-8)
    .filter((entry) => entry && entry.text && (entry.role === "user" || entry.role === "assistant"))
    .map((entry) => ({ role: entry.role, content: String(entry.text) }));
  const messages = [
    { role: "system", content: systemPrompt },
    ...recentTurns,
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
      const result = await executeTool(call.function?.name, args, state, categories);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return null;
}

module.exports = { runAnalystAgent };
