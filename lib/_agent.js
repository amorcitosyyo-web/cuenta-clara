const DEFAULT_CATEGORIES = [
  { id: "vivienda", name: "Vivienda", kind: "expense", keywords: ["alquiler", "casa", "aya", "agua", "cnfl", "electricidad", "luz", "condominio"] },
  { id: "alimentacion", name: "Alimentacion", kind: "expense", keywords: ["walmart", "maxipali", "masxmenos", "mxm", "automercado", "pali", "fresh", "pricesmart", "price smart", "super", "arroz", "leche", "huevo", "pan", "carne", "verdura", "fruta"] },
  { id: "comida-fuera", name: "Comida fuera", kind: "expense", keywords: ["restaurante", "soda", "subway", "pizza", "cafe", "cafeteria", "pops", "antojo", "uber eats", "hamburguesa"] },
  { id: "hogar", name: "Hogar", kind: "expense", keywords: ["limpieza", "jabon", "detergente", "utensilio", "ferreteria", "epa", "lagar", "gas", "propano", "hogar"] },
  { id: "salud", name: "Salud", kind: "expense", keywords: ["farmacia", "fischel", "saba", "farmavalue", "hospital", "clinica", "medicina", "doctor", "smartfit", "gym"] },
  { id: "telefono-internet", name: "Telefono e internet", kind: "expense", keywords: ["claro", "kolbi", "liberty", "internet", "recarga", "post pago", "prepago", "telefono"] },
  { id: "transporte", name: "Transporte", kind: "expense", keywords: ["uber", "didi", "gasolina", "combustible", "parking", "peaje", "bus", "sinpe tp"] },
  { id: "educacion", name: "Educacion", kind: "expense", keywords: ["openenglish", "open english", "curso", "libro", "educacion", "clase"] },
  { id: "suscripciones", name: "Suscripciones", kind: "expense", keywords: ["spotify", "netflix", "app", "membresia", "subscription", "suscripcion"] },
  { id: "compras-personales", name: "Compras personales", kind: "expense", keywords: ["ropa", "perfume", "fraiche", "ekono", "cuidado personal", "shampoo", "desodorante"] },
  { id: "tecnologia", name: "Tecnologia", kind: "expense", keywords: ["telefono", "celular", "cargador", "cable", "accesorio", "tecnologia"] },
  { id: "ocio-salidas", name: "Ocio y salidas", kind: "expense", keywords: ["cine", "cinepolis", "paseo", "actividad", "salida"] },
  { id: "imprevistos", name: "Imprevistos", kind: "expense", keywords: ["arreglo", "reparacion", "urgencia", "imprevisto", "deuda", "refri", "nevera"] },
  { id: "regalos-familia", name: "Regalos / familia", kind: "expense", keywords: ["regalo", "familia", "ayuda", "detalle"] },
  { id: "ingreso", name: "Ingreso", kind: "income", keywords: ["salario", "pago", "freelance", "reembolso", "bono", "comision", "ventas"] },
  { id: "salario", name: "Salario", kind: "income", keywords: ["salario", "sueldo", "quincena", "planilla"] },
  { id: "negocio", name: "Negocio / freelance", kind: "income", keywords: ["freelance", "comision", "ventas", "trabajo extra", "servicio"] },
  { id: "reembolso", name: "Reembolso", kind: "income", keywords: ["reembolso", "devolucion", "reintegro", "refund"] },
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function makeId() {
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseMoney(value) {
  if (typeof value === "number") return value;
  const clean = String(value || "").replace(/[^\d.,-]/g, "").trim();
  if (!clean) return 0;
  const comma = clean.lastIndexOf(",");
  const dot = clean.lastIndexOf(".");
  const decimal = comma > dot ? "," : ".";
  const normalized = clean
    .replace(new RegExp(`\\${decimal === "," ? "." : ","}`, "g"), "")
    .replace(decimal, ".");
  return Number(normalized) || 0;
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function normalizeState(data) {
  const state = data && typeof data === "object" ? data : {};
  return {
    ...state,
    movements: Array.isArray(state.movements) ? state.movements : [],
    pendingMovements: Array.isArray(state.pendingMovements) ? state.pendingMovements : [],
    budgetHistory: Array.isArray(state.budgetHistory) ? state.budgetHistory : [],
    budgets: state.budgets && typeof state.budgets === "object" ? state.budgets : {},
    savingsAccounts: Array.isArray(state.savingsAccounts) ? state.savingsAccounts : [],
    scheduledPayments: Array.isArray(state.scheduledPayments) ? state.scheduledPayments : [],
    // These collections are deliberately additive.  The web app can continue
    // to read the legacy JSON while the agent progressively uses structured
    // household records.  The migration endpoint validates both totals before
    // enabling the new source of truth.
    accounts: Array.isArray(state.accounts) ? state.accounts : [],
    cards: Array.isArray(state.cards) ? state.cards : [],
    accountBalances: Array.isArray(state.accountBalances) ? state.accountBalances : [],
    incomePlans: Array.isArray(state.incomePlans) ? state.incomePlans : [],
    plannedTransfers: Array.isArray(state.plannedTransfers) ? state.plannedTransfers : [],
    monthlyPlans: Array.isArray(state.monthlyPlans) ? state.monthlyPlans : [],
    receiptRecords: Array.isArray(state.receiptRecords) ? state.receiptRecords : [],
    auditLog: Array.isArray(state.auditLog) ? state.auditLog.slice(-500) : [],
    trash: Array.isArray(state.trash) ? state.trash : [],
    customCategories: Array.isArray(state.customCategories) ? state.customCategories : [],
    merchantRules: Array.isArray(state.merchantRules) ? state.merchantRules : [],
    agentMemory: {
      goals: [],
      notes: [],
      recentEvents: [],
      intentAliases: [],
      pendingIntents: {},
      pendingQueries: {},
      pendingActions: {},
      movementDrafts: {},
      telegramReports: [],
      chatHistory: [],
      telegramSessions: {},
      activeTasks: {},
      householdProfile: {},
      automationSettings: {},
      undoActions: {},
      pausedActions: {},
      ...state.agentMemory,
      goals: Array.isArray(state.agentMemory?.goals) ? state.agentMemory.goals : [],
      notes: Array.isArray(state.agentMemory?.notes) ? state.agentMemory.notes : [],
      recentEvents: Array.isArray(state.agentMemory?.recentEvents) ? state.agentMemory.recentEvents : [],
      intentAliases: Array.isArray(state.agentMemory?.intentAliases) ? state.agentMemory.intentAliases : [],
      pendingIntents:
        state.agentMemory?.pendingIntents && typeof state.agentMemory.pendingIntents === "object" && !Array.isArray(state.agentMemory.pendingIntents)
          ? state.agentMemory.pendingIntents
          : {},
      pendingQueries:
        state.agentMemory?.pendingQueries && typeof state.agentMemory.pendingQueries === "object" && !Array.isArray(state.agentMemory.pendingQueries)
          ? state.agentMemory.pendingQueries
          : {},
      pendingActions:
        state.agentMemory?.pendingActions && typeof state.agentMemory.pendingActions === "object" && !Array.isArray(state.agentMemory.pendingActions)
          ? state.agentMemory.pendingActions
          : {},
      movementDrafts:
        state.agentMemory?.movementDrafts && typeof state.agentMemory.movementDrafts === "object" && !Array.isArray(state.agentMemory.movementDrafts)
          ? state.agentMemory.movementDrafts
          : {},
      telegramReports: Array.isArray(state.agentMemory?.telegramReports) ? state.agentMemory.telegramReports.slice(-12) : [],
      chatHistory: Array.isArray(state.agentMemory?.chatHistory) ? state.agentMemory.chatHistory : [],
      telegramSessions:
        state.agentMemory?.telegramSessions &&
        typeof state.agentMemory.telegramSessions === "object" &&
        !Array.isArray(state.agentMemory.telegramSessions)
          ? state.agentMemory.telegramSessions
          : {},
      activeTasks:
        state.agentMemory?.activeTasks && typeof state.agentMemory.activeTasks === "object" && !Array.isArray(state.agentMemory.activeTasks)
          ? state.agentMemory.activeTasks
          : {},
      householdProfile:
        state.agentMemory?.householdProfile && typeof state.agentMemory.householdProfile === "object" && !Array.isArray(state.agentMemory.householdProfile)
          ? state.agentMemory.householdProfile
          : {},
      automationSettings:
        state.agentMemory?.automationSettings && typeof state.agentMemory.automationSettings === "object" && !Array.isArray(state.agentMemory.automationSettings)
          ? state.agentMemory.automationSettings
          : {},
      undoActions:
        state.agentMemory?.undoActions && typeof state.agentMemory.undoActions === "object" && !Array.isArray(state.agentMemory.undoActions)
          ? state.agentMemory.undoActions
          : {},
      pausedActions:
        state.agentMemory?.pausedActions && typeof state.agentMemory.pausedActions === "object" && !Array.isArray(state.agentMemory.pausedActions)
          ? state.agentMemory.pausedActions
          : {},
    },
    meta: { ...(state.meta || {}), updatedAt: new Date().toISOString() },
  };
}

function getCategories(data) {
  const byId = new Map(DEFAULT_CATEGORIES.map((category) => [category.id, category]));
  (data.customCategories || []).forEach((category) => {
    if (!category?.id || !category?.name) return;
    byId.set(category.id, {
      ...category,
      kind: category.kind === "income" ? "income" : "expense",
      keywords: Array.isArray(category.keywords) ? category.keywords : [],
    });
  });
  return [...byId.values()];
}

function inferType(item) {
  const supplied = String(item.type || item.transactionType || item.kind || "").toLowerCase();
  if (["income", "ingreso", "credito", "credit"].includes(supplied)) return "income";
  const text = normalizeText(`${item.merchant || item.comercio || ""} ${item.note || item.nota || ""}`);
  return /deposito|salario|sueldo|reembolso|credito recibido|transferencia recibida/.test(text) ? "income" : "expense";
}

function categoryForType(categories, categoryId, type) {
  const candidate = categories.find((category) => category.id === categoryId && category.kind === type);
  return candidate || categories.find((category) => category.kind === type) || null;
}

function chooseByRules(item, categories, rules) {
  const type = inferType(item);
  const text = normalizeText(`${item.merchant || item.comercio || ""} ${item.note || item.nota || ""}`);
  const merchant = normalizeText(item.merchant || item.comercio || "");
  const allowed = categories.filter((category) => category.kind === type);
  const ruleMatches = (rules || [])
    .map((rule) => {
      const ruleMerchant = normalizeText(rule.merchant || rule.displayName || "");
      const patterns = Array.isArray(rule.patterns) ? rule.patterns : [];
      const score = (ruleMerchant && (merchant.includes(ruleMerchant) || ruleMerchant.includes(merchant)) ? 5 : 0)
        + patterns.filter((pattern) => normalizeText(pattern).length > 2 && text.includes(normalizeText(pattern))).length;
      return { rule, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const bestRule = ruleMatches[0];
  if (bestRule && categoryForType(categories, bestRule.rule.category, type)) {
    return {
      type,
      category: bestRule.rule.category,
      confidence: bestRule.score >= 5 ? 0.98 : Math.min(0.94, 0.78 + bestRule.score * 0.04),
      source: "pattern",
    };
  }

  const keywordMatches = allowed
    .map((category) => ({
      category,
      score: (category.keywords || []).filter((keyword) => {
        const clean = normalizeText(keyword);
        return clean.length > 2 && text.includes(clean);
      }).length,
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  const bestKeyword = keywordMatches[0];
  if (bestKeyword) {
    return {
      type,
      category: bestKeyword.category.id,
      // A match against a maintained category keyword (for example MXM, Uber
      // or SmartFit) is safe enough to enter directly; vague merchants still
      // go through the AI and then Bandeja when its confidence is lower.
      confidence: bestKeyword.score >= 1 ? 0.91 : 0.82,
      source: "keywords",
    };
  }

  return { type, category: type === "income" ? "ingreso" : "imprevistos", confidence: 0.35, source: "unknown" };
}

function makeRule(merchant, category, source = "agent") {
  const clean = String(merchant || "").trim();
  const tokens = normalizeText(clean).split(" ").filter((token) => token.length >= 3).slice(0, 8);
  return {
    merchant: clean,
    category,
    patterns: tokens,
    productPatterns: [],
    count: 1,
    source,
    approved: source === "user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function learnRule(data, merchant, category, source = "user") {
  const cleanMerchant = String(merchant || "").trim();
  if (!cleanMerchant || !category) return;
  const key = normalizeText(cleanMerchant);
  const existing = data.merchantRules.find((rule) => normalizeText(rule.merchant) === key);
  if (existing) {
    existing.category = category;
    existing.count = Number(existing.count || 0) + 1;
    existing.approved = source === "user" || existing.approved;
    existing.updatedAt = new Date().toISOString();
    return;
  }
  data.merchantRules.push(makeRule(cleanMerchant, category, source));
  data.merchantRules = data.merchantRules.slice(-160);
}

async function callOpenAiClassifier(item, categories) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const available = categories.map((category) => ({ id: category.id, name: category.name, kind: category.kind }));
  const prompt = [
    "Clasifica UN movimiento financiero de Costa Rica.",
    "Usa solamente una categoria existente. No crees categorias.",
    "Si no estas muy seguro, asigna confianza menor a 0.90.",
    "Devuelve solo JSON: {type:'expense|income',category:'id',confidence:0-1,reason:''}.",
    `Categorias: ${JSON.stringify(available)}`,
    `Movimiento: ${JSON.stringify({ merchant: item.merchant, note: item.note, amount: item.amount, date: item.date })}`,
  ].join("\n");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_CLASSIFIER_MODEL || "gpt-4.1-mini",
      temperature: 0,
      max_tokens: 120,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "OpenAI no pudo clasificar");
  try {
    return JSON.parse(payload?.choices?.[0]?.message?.content || "");
  } catch {
    return null;
  }
}

async function classifyIncoming(item, data) {
  const categories = getCategories(data);
  const initial = chooseByRules(item, categories, data.merchantRules);
  if (initial.confidence >= 0.9) return initial;
  const ai = await callOpenAiClassifier(item, categories).catch(() => null);
  if (ai && categoryForType(categories, ai.category, ai.type)) {
    return {
      type: ai.type,
      category: ai.category,
      confidence: Math.max(0, Math.min(1, Number(ai.confidence || 0))),
      source: "ai",
      reason: String(ai.reason || ""),
    };
  }
  return initial;
}

function normalizeIncomingItem(raw, classification) {
  const merchant = String(raw.merchant || raw.comercio || raw.name || "").trim();
  const amount = parseMoney(raw.amount || raw.monto || raw.total || 0);
  const date = normalizeDate(raw.date || raw.fecha || raw.created_at);
  const sourceId = String(raw.sourceId || raw.source_id || raw.gmailMessageId || raw.messageId || raw.id || `${merchant}-${amount}-${date}`).trim();
  return {
    id: makeId(),
    source: raw.source || "gmail",
    sourceId,
    type: classification.type,
    date,
    merchant,
    amount,
    category: classification.category,
    note: String(raw.note || raw.nota || raw.description || "").trim(),
    classification: {
      confidence: classification.confidence,
      source: classification.source,
      reason: classification.reason || "",
      status: classification.confidence >= 0.9 ? "auto_accepted" : "needs_review",
    },
    createdAt: new Date().toISOString(),
  };
}

async function getAppState(userId) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/app_states?user_id=eq.${encodeURIComponent(userId)}&select=data`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error(rows?.message || "No pude leer los datos de la app");
  return normalizeState(rows?.[0]?.data || {});
}

async function saveAppState(userId, data) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/app_states?on_conflict=user_id`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ user_id: userId, data: normalizeState(data) }),
  });
  if (!response.ok) throw new Error("No pude guardar los datos del agente");
  if (data?.meta?.structuredStorageEnabled) {
    const { syncStructuredState } = require("./agent-store");
    await syncStructuredState(userId, normalizeState(data));
  }
}

async function sendTelegram(message, keyboard = []) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true,
      reply_markup: keyboard.length ? { inline_keyboard: keyboard } : undefined,
    }),
  });
  return response.json().catch(() => null);
}

module.exports = {
  DEFAULT_CATEGORIES,
  classifyIncoming,
  getAppState,
  getCategories,
  inferType,
  learnRule,
  makeId,
  normalizeIncomingItem,
  normalizeState,
  saveAppState,
  sendTelegram,
};
