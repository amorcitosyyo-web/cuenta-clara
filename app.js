const defaultCategories = [
  { id: "supermercado", name: "Supermercado", color: "#8eb69b", keywords: ["walmart", "maxipali", "masxmenos", "automercado", "pali", "fresh", "arroz", "leche", "huevo", "pan", "carne"] },
  { id: "casa", name: "Casa", color: "#89d9ff", keywords: ["alquiler", "condominio", "mueble", "casa", "ferreteria", "epa"] },
  { id: "servicios", name: "Servicios", color: "#7a2cff", keywords: ["ice", "aya", "cnfl", "electricidad", "agua", "internet", "kolbi", "claro", "liberty"] },
  { id: "transporte", name: "Transporte", color: "#d8ff55", keywords: ["uber", "didi", "gasolina", "combustible", "parking", "peaje", "bus"] },
  { id: "comida", name: "Comida fuera", color: "#ff6f76", keywords: ["restaurante", "soda", "mcdonald", "burger", "pizza", "cafeteria", "uber eats"] },
  { id: "salud", name: "Salud", color: "#5ee0c2", keywords: ["farmacia", "fischel", "hospital", "clinica", "medicina", "doctor"] },
  { id: "entretenimiento", name: "Entretenimiento", color: "#ffbd59", keywords: ["netflix", "spotify", "cine", "cinemark", "streaming", "juego"] },
  { id: "ahorro", name: "Ahorro", color: "#daf1de", keywords: ["ahorro", "inversion", "fondo"] },
  { id: "ingreso", name: "Ingreso", color: "#d8ff55", keywords: ["salario", "pago", "freelance", "reembolso"] },
  { id: "otros", name: "Otros", color: "#6f8279", keywords: [] },
];

let categories = defaultCategories;

const state = {
  activeMonth: new Date(2026, 4, 1),
  pendingReceipt: null,
  data: normalizeData(loadData()),
};

categories = mergeCategories(state.data.customCategories);

const els = {
  monthTitle: document.querySelector("#monthTitle"),
  incomeTotal: document.querySelector("#incomeTotal"),
  expenseTotal: document.querySelector("#expenseTotal"),
  savingTotal: document.querySelector("#savingTotal"),
  balanceTotal: document.querySelector("#balanceTotal"),
  balanceHint: document.querySelector("#balanceHint"),
  budgetStatus: document.querySelector("#budgetStatus"),
  budgetHint: document.querySelector("#budgetHint"),
  topCategoryLabel: document.querySelector("#topCategoryLabel"),
  categoryBreakdown: document.querySelector("#categoryBreakdown"),
  expenseDonut: document.querySelector("#expenseDonut"),
  expenseDonutLabel: document.querySelector("#expenseDonutLabel"),
  monthlyChart: document.querySelector("#monthlyChart"),
  savingsPreview: document.querySelector("#savingsPreview"),
  savingStatusLabel: document.querySelector("#savingStatusLabel"),
  recentMovements: document.querySelector("#recentMovements"),
  movementForm: document.querySelector("#movementForm"),
  amountInput: document.querySelector("#amountInput"),
  dateInput: document.querySelector("#dateInput"),
  categoryInput: document.querySelector("#categoryInput"),
  merchantInput: document.querySelector("#merchantInput"),
  noteInput: document.querySelector("#noteInput"),
  receiptImageInput: document.querySelector("#receiptImageInput"),
  receiptPreview: document.querySelector("#receiptPreview"),
  receiptTextInput: document.querySelector("#receiptTextInput"),
  makeWebhookInput: document.querySelector("#makeWebhookInput"),
  geminiApiKeyInput: document.querySelector("#geminiApiKeyInput"),
  analyzeReceiptBtn: document.querySelector("#analyzeReceiptBtn"),
  receiptStatus: document.querySelector("#receiptStatus"),
  receiptResult: document.querySelector("#receiptResult"),
  receiptDate: document.querySelector("#receiptDate"),
  receiptMerchant: document.querySelector("#receiptMerchant"),
  receiptTotal: document.querySelector("#receiptTotal"),
  receiptCategory: document.querySelector("#receiptCategory"),
  receiptItems: document.querySelector("#receiptItems"),
  saveReceiptBtn: document.querySelector("#saveReceiptBtn"),
  budgetForm: document.querySelector("#budgetForm"),
  budgetCategoryInput: document.querySelector("#budgetCategoryInput"),
  budgetAmountInput: document.querySelector("#budgetAmountInput"),
  categoryForm: document.querySelector("#categoryForm"),
  newCategoryNameInput: document.querySelector("#newCategoryNameInput"),
  newCategoryKeywordsInput: document.querySelector("#newCategoryKeywordsInput"),
  budgetList: document.querySelector("#budgetList"),
  savingForm: document.querySelector("#savingForm"),
  savingAccountInput: document.querySelector("#savingAccountInput"),
  savingAmountInput: document.querySelector("#savingAmountInput"),
  savingDateInput: document.querySelector("#savingDateInput"),
  availableForSaving: document.querySelector("#availableForSaving"),
  savingGoalForm: document.querySelector("#savingGoalForm"),
  savingGoalNameInput: document.querySelector("#savingGoalNameInput"),
  savingGoalTargetInput: document.querySelector("#savingGoalTargetInput"),
  savingsList: document.querySelector("#savingsList"),
  historyTypeFilter: document.querySelector("#historyTypeFilter"),
  historyCategoryFilter: document.querySelector("#historyCategoryFilter"),
  historyList: document.querySelector("#historyList"),
};

init();

function init() {
  window.cuentaClaraDebug = { parseReceiptText };
  populateSelects();
  setToday();
  bindEvents();
  saveData();
  render();
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.querySelectorAll(".quick-action").forEach((button) => {
    button.addEventListener("click", () => {
      switchView(button.dataset.jump);
      if (button.dataset.type) {
        const input = document.querySelector(`input[name="type"][value="${button.dataset.type}"]`);
        input.checked = true;
      }
    });
  });

  document.querySelector("#prevMonthBtn").addEventListener("click", () => changeMonth(-1));
  document.querySelector("#nextMonthBtn").addEventListener("click", () => changeMonth(1));
  document.querySelector("#resetDemoBtn").addEventListener("click", resetData);
  els.movementForm.addEventListener("submit", saveMovementFromForm);
  els.budgetForm.addEventListener("submit", saveBudget);
  els.categoryForm.addEventListener("submit", saveCategory);
  els.savingForm.addEventListener("submit", saveSavingTransfer);
  els.savingGoalForm.addEventListener("submit", saveSavingGoal);
  els.analyzeReceiptBtn.addEventListener("click", analyzeReceipt);
  els.saveReceiptBtn.addEventListener("click", savePendingReceipt);
  els.historyTypeFilter.addEventListener("change", renderHistory);
  els.historyCategoryFilter.addEventListener("change", renderHistory);
  els.receiptImageInput.addEventListener("change", previewReceiptImage);
  els.makeWebhookInput.addEventListener("change", saveMakeWebhook);
  els.makeWebhookInput.addEventListener("input", saveMakeWebhook);
  els.geminiApiKeyInput.addEventListener("change", saveGeminiApiKey);
  els.geminiApiKeyInput.addEventListener("input", saveGeminiApiKey);
}

function populateSelects() {
  const options = categories
    .map((category) => `<option value="${category.id}">${category.name}</option>`)
    .join("");

  els.categoryInput.innerHTML = options;
  els.budgetCategoryInput.innerHTML = categories
    .filter((category) => !["ingreso", "ahorro"].includes(category.id))
    .map((category) => `<option value="${category.id}">${category.name}</option>`)
    .join("");
  els.historyCategoryFilter.innerHTML = `<option value="all">Todas las categorias</option>${options}`;
  renderSavingOptions();
}

function renderSavingOptions() {
  els.savingAccountInput.innerHTML = state.data.savingsAccounts
    .map((account) => `<option value="${account.id}">${escapeHtml(account.name)}</option>`)
    .join("");
}

function setToday() {
  const today = toInputDate(new Date());
  els.dateInput.value = today;
  els.savingDateInput.value = today;
  els.makeWebhookInput.value = localStorage.getItem("cuenta-clara-make-webhook") || "";
  els.geminiApiKeyInput.value = localStorage.getItem("cuenta-clara-gemini-api-key") || "";
}

function switchView(view) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  document.querySelectorAll(".view").forEach((panel) => panel.classList.remove("active"));
  document.querySelector(`#${view}View`).classList.add("active");
}

function changeMonth(direction) {
  state.activeMonth = new Date(state.activeMonth.getFullYear(), state.activeMonth.getMonth() + direction, 1);
  render();
}

function loadData() {
  const stored = localStorage.getItem("cuenta-clara-data");
  if (stored) return JSON.parse(stored);

  return {
    movements: [
      makeMovement("income", 950000, "2026-05-02", "ingreso", "Salarios", "Ingreso compartido del mes"),
      makeMovement("expense", 83500, "2026-05-03", "supermercado", "Walmart", "Compra semanal"),
      makeMovement("expense", 42000, "2026-05-05", "servicios", "Internet", "Pago mensual"),
      makeMovement("saving", 120000, "2026-05-06", "ahorro", "Fondo de emergencia", "Transferencia a ahorro", null, "emergencia"),
      makeMovement("expense", 28500, "2026-05-09", "comida", "Restaurante", "Salida juntos"),
      makeMovement("saving", 75000, "2026-05-16", "ahorro", "Viaje juntos", "Ahorro para vacaciones", null, "viaje"),
    ],
    budgets: {
      supermercado: 220000,
      servicios: 90000,
      comida: 80000,
      transporte: 70000,
      salud: 50000,
      entretenimiento: 60000,
    },
    savingsAccounts: [
      { id: "emergencia", name: "Fondo de emergencia", target: 1000000, createdAt: new Date().toISOString() },
      { id: "viaje", name: "Viaje juntos", target: 700000, createdAt: new Date().toISOString() },
    ],
    customCategories: [],
    merchantRules: [],
  };
}

function normalizeData(data) {
  const normalized = {
    movements: Array.isArray(data.movements) ? data.movements : [],
    budgets: data.budgets || {},
    customCategories: Array.isArray(data.customCategories) ? data.customCategories : [],
    merchantRules: Array.isArray(data.merchantRules) ? data.merchantRules : [],
    savingsAccounts: Array.isArray(data.savingsAccounts) && data.savingsAccounts.length
      ? data.savingsAccounts
      : [
          { id: "emergencia", name: "Fondo de emergencia", target: 1000000, createdAt: new Date().toISOString() },
          { id: "viaje", name: "Viaje juntos", target: 700000, createdAt: new Date().toISOString() },
        ],
  };

  normalized.movements = normalized.movements.map((movement) => ({
    savingAccountId: null,
    ...movement,
  }));

  return normalized;
}

function saveData() {
  localStorage.setItem("cuenta-clara-data", JSON.stringify(state.data));
}

function makeMovement(type, amount, date, category, merchant, note = "", receipt = null, savingAccountId = null) {
  return {
    id: createId(),
    type,
    amount: Number(amount),
    date,
    category,
    merchant: merchant || "",
    note,
    receipt,
    savingAccountId,
    createdAt: new Date().toISOString(),
  };
}

function saveMovementFromForm(event) {
  event.preventDefault();
  const type = new FormData(els.movementForm).get("type");
  const category = type === "income" && els.categoryInput.value === "ahorro" ? "ingreso" : els.categoryInput.value;
  const movement = makeMovement(
    type,
    els.amountInput.value,
    els.dateInput.value,
    category,
    els.merchantInput.value,
    els.noteInput.value,
  );

  state.data.movements.unshift(movement);
  saveData();
  els.movementForm.reset();
  setToday();
  render();
  switchView("dashboard");
}

function saveBudget(event) {
  event.preventDefault();
  state.data.budgets[els.budgetCategoryInput.value] = Number(els.budgetAmountInput.value);
  saveData();
  els.budgetForm.reset();
  render();
}

function saveCategory(event) {
  event.preventDefault();
  const name = els.newCategoryNameInput.value.trim();
  if (!name) return;

  const id = slugifyCategory(name);
  const keywords = els.newCategoryKeywordsInput.value
    .split(",")
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);

  const exists = categories.some((category) => category.id === id);
  if (!exists) {
    state.data.customCategories.push({
      id,
      name,
      color: pickCategoryColor(state.data.customCategories.length),
      keywords,
      createdAt: new Date().toISOString(),
    });
  } else {
    const category = state.data.customCategories.find((item) => item.id === id);
    if (category) category.keywords = mergeUnique(category.keywords, keywords);
  }

  categories = mergeCategories(state.data.customCategories);
  saveData();
  els.categoryForm.reset();
  renderOptions();
  render();
}

function saveSavingTransfer(event) {
  event.preventDefault();
  const account = state.data.savingsAccounts.find((item) => item.id === els.savingAccountInput.value);
  if (!account) return;

  state.data.movements.unshift(makeMovement(
    "saving",
    els.savingAmountInput.value,
    els.savingDateInput.value,
    "ahorro",
    account.name,
    "Transferencia a ahorro",
    null,
    account.id,
  ));

  saveData();
  els.savingForm.reset();
  setToday();
  render();
  switchView("savings");
}

function saveSavingGoal(event) {
  event.preventDefault();
  const name = els.savingGoalNameInput.value.trim();
  const target = Number(els.savingGoalTargetInput.value);
  if (!name || !target) return;

  state.data.savingsAccounts.push({
    id: createId(),
    name,
    target,
    createdAt: new Date().toISOString(),
  });

  saveData();
  els.savingGoalForm.reset();
  renderSavingOptions();
  render();
}

function previewReceiptImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  compressImage(file).then((dataUrl) => {
    els.receiptPreview.src = dataUrl;
    els.receiptPreview.hidden = false;
    els.receiptStatus.textContent = "Foto lista y comprimida para gastar menos creditos.";
  }).catch(() => {
    const reader = new FileReader();
    reader.onload = () => {
      els.receiptPreview.src = reader.result;
      els.receiptPreview.hidden = false;
    };
    reader.readAsDataURL(file);
  });
}

function saveMakeWebhook() {
  localStorage.setItem("cuenta-clara-make-webhook", els.makeWebhookInput.value.trim());
}

function saveGeminiApiKey() {
  localStorage.setItem("cuenta-clara-gemini-api-key", els.geminiApiKeyInput.value.trim());
}

async function analyzeReceipt() {
  const text = els.receiptTextInput.value.trim();
  const image = els.receiptPreview.src || null;
  if (!text && !image) return;

  saveMakeWebhook();
  saveGeminiApiKey();
  const webhookUrl = els.makeWebhookInput.value.trim();
  const geminiApiKey = els.geminiApiKeyInput.value.trim();
  els.receiptStatus.textContent = "Analizando factura...";
  els.analyzeReceiptBtn.disabled = true;

  try {
    const parsed = webhookUrl
      ? await analyzeReceiptWithMake(webhookUrl, text, image)
      : geminiApiKey
        ? await analyzeReceiptWithGemini(geminiApiKey, text, image)
        : await analyzeReceiptWithFreeOcr(text, image);
    state.pendingReceipt = { ...parsed, image };
    renderReceiptResult(parsed);
    els.receiptStatus.textContent = webhookUrl
      ? "Factura analizada con Make. Revisa antes de guardar."
      : geminiApiKey
        ? "Factura analizada con Gemini. Revisa antes de guardar."
        : "Factura analizada con OCR gratis. Revisa antes de guardar.";
  } catch (error) {
    console.error(error);
    const parsed = image ? await analyzeReceiptWithFreeOcr(text, image).catch(() => parseReceiptText(text)) : parseReceiptText(text);
    state.pendingReceipt = { ...parsed, image };
    renderReceiptResult(parsed);
    els.receiptStatus.textContent = "Make no respondio bien. Use analisis local como respaldo.";
  } finally {
    els.analyzeReceiptBtn.disabled = false;
  }
}

async function analyzeReceiptWithMake(webhookUrl, text, image) {
  const payload = new FormData();
  payload.set("text", buildReceiptAiPrompt(text));
  payload.set("userText", text);
  payload.set("image", image || "");
  payload.set("imageBase64", extractBase64Payload(image));
  payload.set("mimeType", extractMimeType(image) || "image/jpeg");
  payload.set("filename", "factura-cuenta-clara.jpg");
  payload.set("categories", JSON.stringify(getReceiptCategories()));
  payload.set("merchantRules", JSON.stringify(getMerchantRulesForAi()));
  payload.set("classificationGuide", buildClassificationGuide());

  const imageBlob = dataUrlToBlob(image);
  if (imageBlob) {
    payload.set("receiptFile", imageBlob, "factura-cuenta-clara.jpg");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    body: payload,
  });

  if (!response.ok) {
    throw new Error(`Make respondio con estado ${response.status}`);
  }

  const data = await response.json();
  const geminiJson = parseGeminiResponse(data);
  const receiptData = geminiJson || data;
  const ocrText = receiptData.text || receiptData.parsedText || receiptData.rawText || text;
  const parsed = parseReceiptText(ocrText);

  return {
    ...parsed,
    merchant: receiptData.comercio || receiptData.merchant || parsed.merchant,
    date: normalizeIncomingDate(receiptData.fecha || receiptData.date) || parsed.date,
    amount: Number(receiptData.total || receiptData.amount || parsed.amount || 0),
    category: normalizeCategory(receiptData.categoria || receiptData.category || parsed.category),
    items: Array.isArray(receiptData.productos || receiptData.items)
      ? (receiptData.productos || receiptData.items).map((item) => typeof item === "string" ? item : item.nombre || item.name).filter(Boolean)
      : parsed.items,
    rawText: ocrText,
  };
}

function parseGeminiResponse(data) {
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    || data?.body?.candidates?.[0]?.content?.parts?.[0]?.text
    || data?.response?.candidates?.[0]?.content?.parts?.[0]?.text
    || "";
  if (!text) return null;

  try {
    return JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch (error) {
    console.warn("Gemini devolvio texto no JSON directo", error);
    return null;
  }
}

async function analyzeReceiptWithGemini(apiKey, text, image) {
  if (!image) return parseReceiptText(text);

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: buildReceiptAiPrompt(text) },
            {
              inline_data: {
                mime_type: extractMimeType(image) || "image/jpeg",
                data: extractBase64Payload(image),
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        response_mime_type: "application/json",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini respondio con estado ${response.status}`);
  }

  const data = await response.json();
  const receiptData = parseGeminiResponse(data);
  if (!receiptData) throw new Error("Gemini no devolvio JSON valido");
  const parsed = parseReceiptText(text);

  return {
    ...parsed,
    merchant: receiptData.comercio || receiptData.merchant || parsed.merchant,
    date: normalizeIncomingDate(receiptData.fecha || receiptData.date) || parsed.date,
    amount: Number(receiptData.total || receiptData.amount || parsed.amount || 0),
    category: normalizeCategory(receiptData.categoria || receiptData.category || parsed.category),
    items: Array.isArray(receiptData.productos || receiptData.items)
      ? (receiptData.productos || receiptData.items).map((item) => typeof item === "string" ? item : item.nombre || item.name).filter(Boolean)
      : parsed.items,
    rawText: text,
  };
}

function buildReceiptAiPrompt(userText = "") {
  return [
    "Lee esta factura o tiquete de Costa Rica.",
    "Devuelve solamente JSON valido, sin markdown ni explicaciones.",
    `Categorias disponibles de la app: ${JSON.stringify(getReceiptCategories())}.`,
    `Memoria de patrones aprendidos: ${JSON.stringify(getMerchantRulesForAi())}.`,
    `Guia de clasificacion: ${buildClassificationGuide()}.`,
    "Campos requeridos: comercio, fecha en YYYY-MM-DD, total numerico, categoria, productos con nombre/cantidad/precio/categoria, confianza de 0 a 1, observaciones.",
    "Reglas: usa colones; ignora clave numerica, consecutivo, cedula, telefono, caja, autorizacion, codigos de barras y textos legales.",
    "El total correcto esta cerca de Total, Total CRC, Total a Pagar, Monto Cancelado o Tarjeta si representa el monto final.",
    "No dupliques tarjeta si es el mismo monto. Usa la fecha real de compra.",
    `Texto opcional del usuario/OCR: ${userText || "Ninguno"}.`,
  ].join(" ");
}

function getReceiptCategories() {
  return categories
    .filter((category) => !["ingreso", "ahorro"].includes(category.id))
    .map((category) => ({
      id: category.id,
      name: category.name,
      keywords: category.keywords,
    }));
}

function getMerchantRulesForAi() {
  const learned = state.data.merchantRules || [];
  const seedRules = [
    makeMerchantRule("PriceSmart", "supermercado", "", "base"),
    makeMerchantRule("Walmart", "supermercado", "", "base"),
    makeMerchantRule("Maxi Pali", "supermercado", "", "base"),
    makeMerchantRule("Pali", "supermercado", "", "base"),
    makeMerchantRule("Mas x Menos", "supermercado", "", "base"),
    makeMerchantRule("MXM", "supermercado", "", "base"),
    makeMerchantRule("Automercado", "supermercado", "", "base"),
    makeMerchantRule("AMPM", "supermercado", "", "base"),
    makeMerchantRule("Farmavalue", "salud", "", "base"),
    makeMerchantRule("Fischel", "salud", "", "base"),
    makeMerchantRule("Kiss Makeup", "otros", "", "base"),
  ];

  const byKey = new Map();
  [...seedRules, ...learned].forEach((rule) => {
    const merchant = String(rule.merchant || "").trim();
    const category = normalizeCategory(rule.category);
    if (!merchant || !category) return;
    byKey.set(normalizeMerchantKey(merchant), {
      merchant,
      category,
      patterns: Array.isArray(rule.patterns) ? rule.patterns : buildMerchantPatterns(merchant, rule.sampleItems || ""),
      productPatterns: Array.isArray(rule.productPatterns) ? rule.productPatterns : buildProductPatterns(rule.sampleItems || ""),
      source: rule.source || "aprendido",
    });
  });

  return [...byKey.values()].slice(-80);
}

function buildClassificationGuide() {
  return [
    "Usa solamente las categorias enviadas en categories.",
    "Usa merchantRules como memoria de patrones, no como lista cerrada.",
    "Si el comercio coincide con merchantRules.merchant o con merchantRules.patterns, esa regla tiene prioridad.",
    "Si los productos coinciden con merchantRules.productPatterns, suma esa evidencia a la categoria.",
    "Si no hay patron aprendido, clasifica por keywords de categories y por los productos del tiquete.",
    "Cuando una tienda vende muchas cosas, usa la categoria dominante de los productos.",
    "Si es supermercado o club de compras y hay mezcla de productos, usa supermercado.",
    "Si no estas seguro, usa otros y explica la duda en observaciones.",
  ].join(" ");
}

function learnMerchantCategory(merchant, category) {
  const receipt = state.pendingReceipt || {};
  const cleanMerchant = normalizeMerchantName(merchant);
  const cleanCategory = normalizeCategory(category);
  if (!cleanMerchant || ["ingreso", "ahorro"].includes(cleanCategory)) return;

  const rules = state.data.merchantRules || [];
  const key = normalizeMerchantKey(cleanMerchant);
  const sampleItems = Array.isArray(receipt.items) ? receipt.items.join(" ") : "";
  const existing = rules.find((rule) => normalizeMerchantKey(rule.merchant) === key);

  if (existing) {
    existing.category = cleanCategory;
    existing.patterns = mergeUnique(existing.patterns, buildMerchantPatterns(cleanMerchant, sampleItems)).slice(0, 14);
    existing.productPatterns = mergeUnique(existing.productPatterns, buildProductPatterns(sampleItems)).slice(0, 18);
    existing.count = Number(existing.count || 1) + 1;
    existing.updatedAt = new Date().toISOString();
    return;
  }

  rules.push({
    merchant: cleanMerchant,
    category: cleanCategory,
    patterns: buildMerchantPatterns(cleanMerchant, sampleItems),
    productPatterns: buildProductPatterns(sampleItems),
    count: 1,
    source: "aprendido",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  state.data.merchantRules = rules.slice(-120);
}

function makeMerchantRule(merchant, category, sampleItems = "", source = "base") {
  return {
    merchant,
    category,
    patterns: buildMerchantPatterns(merchant, sampleItems),
    productPatterns: buildProductPatterns(sampleItems),
    source,
  };
}

function buildMerchantPatterns(merchant, sampleItems = "") {
  const merchantTokens = meaningfulTokens(merchant);
  const itemTokens = meaningfulTokens(sampleItems);
  return mergeUnique(
    merchantTokens,
    merchantTokens.length > 1 ? [merchantTokens.join(" ")] : [],
    itemTokens.slice(0, 8),
  ).slice(0, 14);
}

function buildProductPatterns(sampleItems = "") {
  return meaningfulTokens(sampleItems).slice(0, 18);
}

function meaningfulTokens(value) {
  const stops = new Set(["s", "a", "sa", "srl", "ltda", "cr", "crc", "de", "del", "la", "el", "los", "las", "y", "en", "para", "con", "una", "uno", "und", "unidad", "unidades", "bot", "kg", "g", "ml", "lt", "litro"]);
  return normalizeMerchantKey(value)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stops.has(token))
    .filter((token) => !/^\d+$/.test(token));
}

function mergeUnique(...groups) {
  return [...new Set(groups.flat().filter(Boolean))];
}

async function analyzeReceiptWithFreeOcr(text, image) {
  if (!image) return parseReceiptText(text);

  const payload = new URLSearchParams();
  payload.set("apikey", "helloworld");
  payload.set("language", "spa");
  payload.set("OCREngine", "2");
  payload.set("scale", "true");
  payload.set("isTable", "true");
  payload.set("base64Image", image);

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: payload,
  });

  if (!response.ok) {
    throw new Error(`OCR respondio con estado ${response.status}`);
  }

  const data = await response.json();
  const parsedText = data && data.ParsedResults && data.ParsedResults[0] && data.ParsedResults[0].ParsedText
    ? data.ParsedResults[0].ParsedText
    : "";
  const mergedText = [text, parsedText].filter(Boolean).join("\n");
  if (!mergedText.trim()) throw new Error("OCR no devolvio texto");
  return parseReceiptText(mergedText);
}

function extractBase64Payload(dataUrl) {
  const value = String(dataUrl || "");
  const commaIndex = value.indexOf(",");
  return commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
}

function extractMimeType(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,/);
  return match ? match[1] : "";
}

function dataUrlToBlob(dataUrl) {
  if (!dataUrl || !String(dataUrl).startsWith("data:")) return null;
  const [header, base64] = String(dataUrl).split(",");
  if (!base64) return null;
  const mimeType = extractMimeType(dataUrl) || "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const maxSide = 1200;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function parseReceiptText(text) {
  const normalized = normalizeReceiptText(text);
  const date = extractReceiptDate(normalized) || toInputDate(new Date());
  const amount = extractReceiptTotal(normalized);
  const merchant = detectMerchant(text);
  const category = detectCategory(`${merchant} ${text}`);
  const items = detectItems(text);

  return { date, merchant, amount, category, items, rawText: text };
}

function normalizeReceiptText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[¢₵]/g, "₡")
    .replace(/[|]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function extractReceiptDate(text) {
  const isoMatch = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  const labelMatch = text.match(/\b(?:fecha|comprobante|emitido|emision|emisión)\D{0,18}(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/i);
  if (labelMatch) return normalizeDate(labelMatch);

  const anyDate = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
  return anyDate ? normalizeDate(anyDate) : "";
}

function extractReceiptTotal(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const candidates = [];

  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    const isBadLine = /\b(subtotal|sub total|iva|impuesto|cambio|vuelto|descuento|base|clave|cedula|c[eé]dula|aut|autorizacion|autorización|referencia|terminal|tc#|cta|cuotas|puntos|telefono|tel\.?|correo|email)\b/i.test(lower);
    const isTotalLine = /\b(total\s+a\s+pagar|total\s+crc|total|tarjeta\s+crc|tarjeta|monto\s+cancelado)\b/i.test(lower);
    if (!isTotalLine || isBadLine) return;

    const amounts = extractAmountsFromLine(line);
    amounts.forEach((amount) => {
      candidates.push({
        amount,
        score: scoreTotalLine(lower, index, lines.length),
      });
    });
  });

  if (!candidates.length) {
    lines.forEach((line, index) => {
      if (/\b(clave|cedula|c[eé]dula|telefono|tel|aut|referencia|terminal|consecutivo|tiquete|doc|fac|elec)\b/i.test(line)) return;
      extractAmountsFromLine(line).forEach((amount) => {
        if (amount >= 100 && amount <= 5000000) {
          candidates.push({ amount, score: 1 + index / 1000 });
        }
      });
    });
  }

  candidates.sort((a, b) => b.score - a.score || b.amount - a.amount);
  return candidates[0] ? Math.round(candidates[0].amount) : 0;
}

function extractAmountsFromLine(line) {
  const matches = line.match(/(?:₡|\bcrc\b)?\s*(?:\d{1,3}(?:[.,]\d{3})+|\d{4,7})(?:[.,]\d{2})?|\b\d{3,7}\b/gi) || [];
  return matches
    .map((value) => parseMoneyValue(value))
    .filter((value) => value >= 100 && value <= 5000000);
}

function parseMoneyValue(value) {
  let clean = String(value || "")
    .toLowerCase()
    .replace(/crc/g, "")
    .replace(/[₡\s]/g, "")
    .replace(/[^0-9.,]/g, "");
  if (!clean) return 0;

  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);
  const decimalPart = decimalIndex >= 0 ? clean.slice(decimalIndex + 1) : "";
  const hasDecimal = decimalPart.length === 2;

  if (hasDecimal) {
    const integer = clean.slice(0, decimalIndex).replace(/[.,]/g, "");
    return Number(`${integer}.${decimalPart}`);
  }

  return Number(clean.replace(/[.,]/g, ""));
}

function scoreTotalLine(line, index, totalLines) {
  let score = 10;
  if (/\btotal\s+a\s+pagar\b/.test(line)) score += 8;
  if (/\btotal\s+crc\b/.test(line)) score += 7;
  if (/\btotal\b/.test(line)) score += 5;
  if (/\btarjeta\s+crc\b/.test(line)) score += 4;
  if (/\btarjeta\b/.test(line)) score += 2;
  if (/\bmonto\s+cancelado\b/.test(line)) score += 1;
  score += index / Math.max(totalLines, 1);
  return score;
}

function normalizeDate(match) {
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${day}`;
}

function normalizeIncomingDate(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return extractReceiptDate(text);
}

function detectMerchant(text) {
  const normalized = normalizeReceiptText(text);
  const lower = normalized.toLowerCase();
  const knownMerchants = [
    { match: /\bmxm\b|corporacion supermercados unidos|supermercados unidos|mas\s*x\s*menos/i, name: "MXM Tibas" },
    { match: /farmavalue/i, name: "Farmavalue" },
    { match: /supermercado avenida 10|superavenida/i, name: "Supermercado Avenida 10" },
    { match: /kiss makeup/i, name: "Kiss Makeup" },
    { match: /fm tibas vive|inversiones ampm/i, name: "FM Tibas Vive" },
    { match: /\bampm\b/i, name: "AMPM" },
  ];
  const known = knownMerchants.find((merchant) => merchant.match.test(normalized));
  if (known) return known.name;

  const lines = normalized
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter((line) => line.length > 3)
    .filter((line) => !/\d{5,}|tiquete|electronico|electr[oó]nico|ced|jur|clave|fecha|hora|telefono|tel|correo|email|cliente|publico|general/i.test(line));

  const keyword = categories
    .flatMap((category) => category.keywords)
    .find((word) => lower.includes(word));
  if (keyword) return toTitleCase(keyword);

  return lines[0] ? toTitleCase(lines[0].replace(/[0-9₡]/g, "").trim()) : "Factura";
}

function detectCategory(text) {
  const normalized = text.toLowerCase();
  if (/farmavalue|farmacia|medicina|norbyl/i.test(normalized)) return "salud";
  if (/mxm|supermercado|avenida 10|superavenida|walmart|masxmenos|maxipali|pali|automercado|ampm|fm tibas|pozuelto|pozuelo|galleta|coco|leche|queso|aguacate|naranja|platano/i.test(normalized)) return "supermercado";
  if (/kiss makeup|makeup|maquillaje|keratina|shampoo/i.test(normalized)) return "otros";
  const found = categories.find((category) => category.keywords.some((keyword) => normalized.includes(keyword)));
  return found ? found.id : "otros";
}

function normalizeCategory(value) {
  const normalized = String(value || "").toLowerCase().trim();
  const aliases = {
    farmacia: "salud",
    medicina: "salud",
    medicamentos: "salud",
    belleza: "otros",
    maquillaje: "otros",
    cosmeticos: "otros",
    cosmetica: "otros",
    supermercado: "supermercado",
    super: "supermercado",
    comida: "comida",
    restaurante: "comida",
    salud: "salud",
    casa: "casa",
    transporte: "transporte",
    servicios: "servicios",
    entretenimiento: "entretenimiento",
    ahorro: "ahorro",
    otros: "otros",
  };

  if (categories.some((category) => category.id === normalized)) return normalized;
  return aliases[normalized] || "otros";
}

function normalizeMerchantName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[^\w\sÁÉÍÓÚÜÑáéíóúüñ.&-]/g, "")
    .trim();
}

function normalizeMerchantKey(value) {
  return normalizeMerchantName(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function mergeCategories(customCategories = []) {
  const byId = new Map(defaultCategories.map((category) => [category.id, category]));
  customCategories.forEach((category, index) => {
    const id = slugifyCategory(category.id || category.name);
    if (!id || ["ingreso", "ahorro"].includes(id)) return;
    byId.set(id, {
      id,
      name: category.name || toTitleCase(id.replace(/-/g, " ")),
      color: category.color || pickCategoryColor(index),
      keywords: Array.isArray(category.keywords) ? category.keywords : [],
    });
  });
  return [...byId.values()];
}

function slugifyCategory(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function pickCategoryColor(index) {
  const palette = ["#daf1de", "#8eb69b", "#5ee0c2", "#89d9ff", "#d8ff55", "#ffbd59", "#ff6f76", "#b9a7ff"];
  return palette[index % palette.length];
}

function detectItems(text) {
  const stopWords = /\b(mxm|subtotal|sub total|total|tarjeta|tarjetas|monto|cancelado|fecha|hora|cambio|vuelto|iva|impuesto|resumen|clave|aut|tiquete|comprobante|tc#|cta|servicio|cliente|participa|escanea|voucher|resolucion|gracias|correo|email|telefono|tel\.?|cedula|c[eé]dula|juridica|jur[ií]dica|inversiones|corporacion|supermercados unidos|farmavalue|kiss makeup|supermercado avenida|fm tibas)\b/i;
  return normalizeReceiptText(text)
    .split("\n")
    .map((line) => cleanItemLine(line))
    .filter((line) => line.length > 2)
    .filter((line) => !stopWords.test(line))
    .filter((line) => !/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(line))
    .filter((line) => !/\d{1,2}:\d{2}/.test(line))
    .filter((line) => !/^\d+$/.test(line))
    .slice(0, 12);
}

function cleanItemLine(line) {
  return String(line || "")
    .replace(/\b\d{7,}\b/g, "")
    .replace(/(?:₡|\bcrc\b)?\s*(?:\d{1,3}(?:[.,]\d{3})+|\d{4,7})(?:[.,]\d{2})?\s*[gs]?/gi, "")
    .replace(/\b\d+\s*x\b/gi, "")
    .replace(/\b[gs]\s*\d{1,2}\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function renderReceiptResult(parsed) {
  els.receiptDate.textContent = displayDate(parsed.date);
  els.receiptMerchant.textContent = parsed.merchant;
  els.receiptTotal.textContent = money(parsed.amount);
  els.receiptCategory.textContent = categoryName(parsed.category);
  els.receiptItems.innerHTML = parsed.items.length
    ? parsed.items.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")
    : `<span class="chip">Sin productos detectados</span>`;
  els.receiptResult.hidden = false;
}

function savePendingReceipt() {
  if (!state.pendingReceipt) return;
  const receipt = state.pendingReceipt;
  learnMerchantCategory(receipt.merchant, receipt.category);
  state.data.movements.unshift(makeMovement(
    "expense",
    receipt.amount,
    receipt.date,
    receipt.category,
    receipt.merchant,
    receipt.items.join(", "),
    receipt,
  ));
  state.pendingReceipt = null;
  els.receiptTextInput.value = "";
  els.receiptImageInput.value = "";
  els.receiptPreview.hidden = true;
  els.receiptResult.hidden = true;
  saveData();
  render();
  switchView("dashboard");
}

function resetData() {
  if (!confirm("Quieres reiniciar los datos de prueba de Cuenta Clara?")) return;
  localStorage.removeItem("cuenta-clara-data");
  state.data = normalizeData(loadData());
  categories = mergeCategories(state.data.customCategories);
  renderOptions();
  renderSavingOptions();
  saveData();
  render();
}

function render() {
  const monthMovements = getMonthMovements();
  const totals = calculateTotals(monthMovements);
  const available = totals.income - totals.expense - totals.saving;

  els.monthTitle.textContent = state.activeMonth.toLocaleDateString("es-CR", { month: "long", year: "numeric" });
  els.incomeTotal.textContent = money(totals.income);
  els.expenseTotal.textContent = money(totals.expense);
  els.savingTotal.textContent = money(totals.saving);
  els.balanceTotal.textContent = money(available);
  els.balanceHint.textContent = available >= 0 ? "Despues de gastos y ahorros" : "Estan por debajo del disponible";
  els.availableForSaving.textContent = `Disponible ${money(available)}`;

  renderBudgetSummary(monthMovements);
  renderCategoryBreakdown(monthMovements);
  renderMonthlyChart(totals);
  renderRecent(monthMovements);
  renderBudgetList(monthMovements);
  renderSavings();
  renderHistory();
}

function renderBudgetSummary(movements) {
  const budgetTotal = Object.values(state.data.budgets).reduce((sum, amount) => sum + Number(amount || 0), 0);
  const spent = movements.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  const percent = budgetTotal ? Math.round((spent / budgetTotal) * 100) : 0;

  if (!budgetTotal) {
    els.budgetStatus.textContent = "Sin limites";
    els.budgetHint.textContent = "Definan presupuesto para comparar gastos contra el plan.";
    return;
  }

  if (percent < 75) {
    els.budgetStatus.textContent = `${percent}% usado`;
    els.budgetHint.textContent = `${money(spent)} usados de ${money(budgetTotal)} presupuestados.`;
  } else if (percent <= 100) {
    els.budgetStatus.textContent = `${percent}% usado`;
    els.budgetHint.textContent = `Quedan ${money(Math.max(budgetTotal - spent, 0))} antes del limite.`;
  } else {
    els.budgetStatus.textContent = `${percent}% usado`;
    els.budgetHint.textContent = `Se pasaron por ${money(spent - budgetTotal)} este mes.`;
  }
}

function renderCategoryBreakdown(movements) {
  const expenses = movements.filter((item) => item.type === "expense");
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);
  const byCategory = groupExpensesByCategory(expenses);
  const rows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  els.topCategoryLabel.textContent = rows[0] ? `${categoryName(rows[0][0])}: ${money(rows[0][1])}` : "Sin gastos";
  els.expenseDonutLabel.textContent = rows[0] && total ? `${Math.round((rows[0][1] / total) * 100)}%` : "0%";
  els.expenseDonut.style.setProperty("--chart", buildDonutGradient(rows, total));
  els.categoryBreakdown.innerHTML = rows.length
    ? rows.map(([category, amount]) => {
        const percent = total ? Math.round((amount / total) * 100) : 0;
        return `
          <article class="category-row">
            <header>
              <strong>${categoryName(category)}</strong>
              <strong>${money(amount)}</strong>
            </header>
            <p>${percent}% de los gastos</p>
            <div class="bar"><span style="--width: ${percent}%; --color: ${categoryColor(category)}"></span></div>
          </article>
        `;
      }).join("")
    : `<div class="empty">Todavia no hay gastos en este mes.</div>`;
}

function renderMonthlyChart(totals) {
  const values = [
    { label: "Ingreso", amount: totals.income, color: "var(--lime)" },
    { label: "Gasto", amount: totals.expense, color: "var(--rose)" },
    { label: "Ahorro", amount: totals.saving, color: "var(--blue)" },
  ];
  const max = Math.max(...values.map((item) => item.amount), 1);

  els.monthlyChart.innerHTML = values.map((item) => {
    const height = Math.max(12, Math.round((item.amount / max) * 150));
    return `
      <div class="chart-column">
        <div class="chart-pillar" title="${money(item.amount)}" style="--height: ${height}px; --color: ${item.color}"></div>
        <small>${item.label}</small>
      </div>
    `;
  }).join("");
}

function renderRecent(movements) {
  const recent = [...movements].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  els.recentMovements.innerHTML = recent.length
    ? recent.map(renderMovementRow).join("")
    : `<div class="empty">Agreguen el primer movimiento para ver el resumen.</div>`;
}

function renderBudgetList(movements) {
  const expenses = movements.filter((item) => item.type === "expense");
  const byCategory = groupExpensesByCategory(expenses);
  const entries = categories.filter((category) => !["ingreso", "ahorro"].includes(category.id));

  els.budgetList.innerHTML = entries.map((category) => {
    const limit = Number(state.data.budgets[category.id] || 0);
    const spent = Number(byCategory[category.id] || 0);
    const percent = limit ? Math.round((spent / limit) * 100) : 0;
    const color = percent > 100 ? "var(--rose)" : percent > 75 ? "var(--gold)" : category.color;
    const status = limit ? `${money(spent)} de ${money(limit)}` : "Sin limite";
    return `
      <article class="budget-row">
        <header>
          <strong>${category.name}</strong>
          <strong>${status}</strong>
        </header>
        <p>${limit ? budgetMessage(percent, limit - spent) : "Agrega un limite para esta categoria."}</p>
        <div class="bar"><span style="--width: ${Math.min(percent, 100)}%; --color: ${color}"></span></div>
      </article>
    `;
  }).join("");
}

function renderSavings() {
  const accounts = state.data.savingsAccounts.map((account) => {
    const saved = getSavedForAccount(account.id);
    const percent = account.target ? Math.min(100, Math.round((saved / account.target) * 100)) : 0;
    return { ...account, saved, percent };
  });

  const totalSaved = accounts.reduce((sum, account) => sum + account.saved, 0);
  els.savingStatusLabel.textContent = `${money(totalSaved)} ahorrados`;

  const html = accounts.map((account) => renderSavingRow(account)).join("");
  els.savingsPreview.innerHTML = html || `<div class="empty">Creen su primera meta de ahorro.</div>`;
  els.savingsList.innerHTML = html || `<div class="empty">Creen su primera meta de ahorro.</div>`;
}

function renderSavingRow(account) {
  return `
    <article class="saving-row">
      <header>
        <strong>${escapeHtml(account.name)}</strong>
        <strong>${account.percent}%</strong>
      </header>
      <p>${money(account.saved)} ahorrados de ${money(account.target)}</p>
      <div class="bar"><span style="--width: ${account.percent}%; --color: var(--mint)"></span></div>
    </article>
  `;
}

function renderHistory() {
  const type = els.historyTypeFilter.value;
  const category = els.historyCategoryFilter.value;
  const rows = getMonthMovements()
    .filter((item) => type === "all" || item.type === type)
    .filter((item) => category === "all" || item.category === category)
    .sort((a, b) => b.date.localeCompare(a.date));

  els.historyList.innerHTML = rows.length
    ? rows.map(renderMovementRow).join("")
    : `<div class="empty">No hay movimientos con esos filtros.</div>`;
}

function renderMovementRow(item) {
  const config = {
    income: { sign: "+", className: "income", label: "Ingreso" },
    expense: { sign: "-", className: "expense", label: "Gasto" },
    saving: { sign: "→", className: "saving", label: "Ahorro" },
  }[item.type];

  return `
    <article class="movement-row">
      <div>
        <strong>${escapeHtml(item.merchant || categoryName(item.category))}</strong>
        <p>${displayDate(item.date)} · ${config.label} · ${categoryName(item.category)}${item.note ? ` · ${escapeHtml(item.note)}` : ""}</p>
      </div>
      <strong class="${config.className}">${config.sign}${money(item.amount)}</strong>
    </article>
  `;
}

function getMonthMovements() {
  const key = monthKey(state.activeMonth);
  return state.data.movements.filter((item) => item.date.startsWith(key));
}

function calculateTotals(movements) {
  return movements.reduce((totals, item) => {
    totals[item.type] += item.amount;
    return totals;
  }, { income: 0, expense: 0, saving: 0 });
}

function groupExpensesByCategory(expenses) {
  return expenses.reduce((group, item) => {
    group[item.category] = (group[item.category] || 0) + item.amount;
    return group;
  }, {});
}

function getSavedForAccount(accountId) {
  return state.data.movements
    .filter((movement) => movement.type === "saving" && movement.savingAccountId === accountId)
    .reduce((sum, movement) => sum + movement.amount, 0);
}

function buildDonutGradient(rows, total) {
  if (!rows.length || !total) return "conic-gradient(#163832 0 100%)";

  let start = 0;
  const stops = rows.map(([category, amount]) => {
    const end = start + (amount / total) * 100;
    const stop = `${categoryColor(category)} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    start = end;
    return stop;
  });

  return `conic-gradient(${stops.join(", ")})`;
}

function budgetMessage(percent, remaining) {
  if (percent > 100) return `Pasados por ${money(Math.abs(remaining))}.`;
  if (percent >= 75) return `Quedan ${money(Math.max(remaining, 0))}.`;
  return `Van dentro del plan. Quedan ${money(Math.max(remaining, 0))}.`;
}

function categoryName(id) {
  return categories.find((category) => category.id === id)?.name || "Otros";
}

function categoryColor(id) {
  return categories.find((category) => category.id === id)?.color || "#6f8279";
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function toInputDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
}

function money(amount) {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

function toTitleCase(text) {
  return text
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
