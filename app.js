const expenseCategories = [
  { id: "vivienda", name: "Vivienda (alquiler, agua, luz)", color: "#8eb69b", keywords: ["alquiler", "casa", "aya", "agua", "cnfl", "electricidad", "luz", "condominio"], kind: "expense" },
  { id: "alimentacion", name: "Alimentacion (super, PriceSmart, carnes/verduras)", color: "#daf1de", keywords: ["walmart", "maxipali", "masxmenos", "mxm", "automercado", "pali", "fresh", "pricesmart", "price smart", "super", "arroz", "leche", "huevo", "pan", "carne", "verdura", "fruta"], kind: "expense" },
  { id: "comida-fuera", name: "Comida fuera (restaurantes, cafe, antojos)", color: "#ffbd59", keywords: ["restaurante", "soda", "subway", "pizza", "cafe", "cafeteria", "pops", "antojo", "uber eats", "hamburguesa"], kind: "expense" },
  { id: "hogar", name: "Hogar (limpieza, utensilios, gas)", color: "#89d9ff", keywords: ["limpieza", "jabon", "detergente", "utensilio", "ferreteria", "epa", "lagar", "gas", "propano", "hogar"], kind: "expense" },
  { id: "salud", name: "Salud (farmacia, gym, doctor)", color: "#5ee0c2", keywords: ["farmacia", "fischel", "saba", "farmavalue", "hospital", "clinica", "medicina", "doctor", "smartfit", "gym"], kind: "expense" },
  { id: "telefono-internet", name: "Telefono e internet (Claro, internet casa, recargas)", color: "#7a2cff", keywords: ["claro", "kolbi", "liberty", "internet", "recarga", "post pago", "prepago", "telefono"], kind: "expense" },
  { id: "transporte", name: "Transporte (Uber, bus, gasolina)", color: "#d8ff55", keywords: ["uber", "didi", "gasolina", "combustible", "parking", "peaje", "bus", "sinpe tp"], kind: "expense" },
  { id: "educacion", name: "Educacion (Open English, cursos, libros)", color: "#aeb9ff", keywords: ["openenglish", "open english", "curso", "libro", "educacion", "clase"], kind: "expense" },
  { id: "suscripciones", name: "Suscripciones (Spotify, apps, membresias)", color: "#ff6f76", keywords: ["spotify", "netflix", "app", "membresia", "subscription", "suscripcion"], kind: "expense" },
  { id: "compras-personales", name: "Compras personales (ropa, perfumes, cuidado personal)", color: "#f7b7d7", keywords: ["ropa", "perfume", "fraiche", "ekono", "cuidado personal", "shampoo", "desodorante"], kind: "expense" },
  { id: "tecnologia", name: "Tecnologia (telefono, cargador, accesorios)", color: "#a1e7ff", keywords: ["telefono", "celular", "cargador", "cable", "accesorio", "tecnologia"], kind: "expense" },
  { id: "ocio-salidas", name: "Ocio y salidas (cine, paseos, actividades)", color: "#ffa56b", keywords: ["cine", "cinepolis", "paseo", "actividad", "salida"], kind: "expense" },
  { id: "ahorro", name: "Ahorro (emergencia, metas, reserva)", color: "#cfff57", keywords: ["ahorro", "emergencia", "meta", "reserva", "fondo"], kind: "special" },
  { id: "imprevistos", name: "Imprevistos (arreglos, gastos raros, urgencias)", color: "#6f8279", keywords: ["arreglo", "reparacion", "urgencia", "imprevisto", "deuda", "refri", "nevera"], kind: "expense" },
  { id: "regalos-familia", name: "Regalos / familia (regalos, ayudas, detalles)", color: "#b9d9c4", keywords: ["regalo", "familia", "ayuda", "detalle"], kind: "expense" },
];

const incomeCategories = [
  { id: "ingreso", name: "Ingreso", color: "#d8ff55", keywords: ["salario", "pago", "freelance", "reembolso", "bono", "comision", "ventas"], kind: "income" },
  { id: "salario", name: "Salario", color: "#8eb69b", keywords: ["salario", "sueldo", "quincena", "planilla"], kind: "income" },
  { id: "negocio", name: "Negocio / freelance", color: "#5ee0c2", keywords: ["freelance", "comision", "ventas", "trabajo extra", "servicio"], kind: "income" },
  { id: "reembolso", name: "Reembolso", color: "#ffbd59", keywords: ["reembolso", "devolucion", "reintegro", "refund"], kind: "income" },
];

let categories = [...expenseCategories, ...incomeCategories];

const remote = {
  enabled: false,
  ready: false,
  client: null,
  user: null,
  saveTimer: null,
};

const state = {
  activeMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  editingMovementId: null,
  editingSavingMovementId: null,
  editingSavingGoalId: null,
  editingCategoryId: null,
  savingEditReturnView: "savings",
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
  alertsList: document.querySelector("#alertsList"),
  savingsPreview: document.querySelector("#savingsPreview"),
  savingStatusLabel: document.querySelector("#savingStatusLabel"),
  recentMovements: document.querySelector("#recentMovements"),
  monthlyMovementsCount: document.querySelector("#monthlyMovementsCount"),
  movementForm: document.querySelector("#movementForm"),
  amountInput: document.querySelector("#amountInput"),
  dateInput: document.querySelector("#dateInput"),
  categoryInput: document.querySelector("#categoryInput"),
  merchantInput: document.querySelector("#merchantInput"),
  merchantSuggestionPanel: document.querySelector("#merchantSuggestionPanel"),
  noteInput: document.querySelector("#noteInput"),
  movementSubmitBtn: document.querySelector("#movementSubmitBtn"),
  cancelMovementEditBtn: document.querySelector("#cancelMovementEditBtn"),
  receiptImageInput: document.querySelector("#receiptImageInput"),
  receiptPreview: document.querySelector("#receiptPreview"),
  receiptTextInput: document.querySelector("#receiptTextInput"),
  analyzeReceiptBtn: document.querySelector("#analyzeReceiptBtn"),
  receiptStatus: document.querySelector("#receiptStatus"),
  receiptResult: document.querySelector("#receiptResult"),
  receiptDate: document.querySelector("#receiptDate"),
  receiptMerchant: document.querySelector("#receiptMerchant"),
  receiptMerchantSuggestionPanel: document.querySelector("#receiptMerchantSuggestionPanel"),
  receiptTotal: document.querySelector("#receiptTotal"),
  receiptCategory: document.querySelector("#receiptCategory"),
  receiptItems: document.querySelector("#receiptItems"),
  receiptNote: document.querySelector("#receiptNote"),
  saveReceiptBtn: document.querySelector("#saveReceiptBtn"),
  cancelReceiptBtn: document.querySelector("#cancelReceiptBtn"),
  budgetForm: document.querySelector("#budgetForm"),
  budgetCategoryInput: document.querySelector("#budgetCategoryInput"),
  budgetAmountInput: document.querySelector("#budgetAmountInput"),
  categoryForm: document.querySelector("#categoryForm"),
  newCategoryNameInput: document.querySelector("#newCategoryNameInput"),
  newCategoryKeywordsInput: document.querySelector("#newCategoryKeywordsInput"),
  categorySubmitBtn: document.querySelector("#categorySubmitBtn"),
  cancelCategoryEditBtn: document.querySelector("#cancelCategoryEditBtn"),
  categoryManageList: document.querySelector("#categoryManageList"),
  categoryKindInputs: document.querySelectorAll('input[name="categoryKind"]'),
  budgetList: document.querySelector("#budgetList"),
  savingForm: document.querySelector("#savingForm"),
  savingAccountInput: document.querySelector("#savingAccountInput"),
  savingAmountInput: document.querySelector("#savingAmountInput"),
  savingDateInput: document.querySelector("#savingDateInput"),
  savingSubmitBtn: document.querySelector("#savingSubmitBtn"),
  cancelSavingEditBtn: document.querySelector("#cancelSavingEditBtn"),
  availableForSaving: document.querySelector("#availableForSaving"),
  savingGoalForm: document.querySelector("#savingGoalForm"),
  savingGoalNameInput: document.querySelector("#savingGoalNameInput"),
  savingGoalTargetInput: document.querySelector("#savingGoalTargetInput"),
  savingGoalSubmitBtn: document.querySelector("#savingGoalSubmitBtn"),
  cancelSavingGoalEditBtn: document.querySelector("#cancelSavingGoalEditBtn"),
  savingsList: document.querySelector("#savingsList"),
  historyTypeFilter: document.querySelector("#historyTypeFilter"),
  historyCategoryFilter: document.querySelector("#historyCategoryFilter"),
  historySearchInput: document.querySelector("#historySearchInput"),
  historyDateFrom: document.querySelector("#historyDateFrom"),
  historyDateTo: document.querySelector("#historyDateTo"),
  historyList: document.querySelector("#historyList"),
  downloadMovementsBtn: document.querySelector("#downloadMovementsBtn"),
  scheduledForm: document.querySelector("#scheduledForm"),
  scheduledNameInput: document.querySelector("#scheduledNameInput"),
  scheduledNameSuggestionPanel: document.querySelector("#scheduledNameSuggestionPanel"),
  scheduledAmountInput: document.querySelector("#scheduledAmountInput"),
  scheduledDateInput: document.querySelector("#scheduledDateInput"),
  scheduledCategoryInput: document.querySelector("#scheduledCategoryInput"),
  scheduledNoteInput: document.querySelector("#scheduledNoteInput"),
  scheduledMonthlyInput: document.querySelector("#scheduledMonthlyInput"),
  scheduledList: document.querySelector("#scheduledList"),
  enableNotificationsBtn: document.querySelector("#enableNotificationsBtn"),
  confirmModal: document.querySelector("#confirmModal"),
  confirmTitle: document.querySelector("#confirmTitle"),
  confirmMessage: document.querySelector("#confirmMessage"),
  confirmCancelBtn: document.querySelector("#confirmCancelBtn"),
  confirmOkBtn: document.querySelector("#confirmOkBtn"),
  floatingAlertModal: document.querySelector("#floatingAlertModal"),
  floatingAlertList: document.querySelector("#floatingAlertList"),
  floatingAlertOkBtn: document.querySelector("#floatingAlertOkBtn"),
  authScreen: document.querySelector("#authScreen"),
  authForm: document.querySelector("#authForm"),
  authEmailInput: document.querySelector("#authEmailInput"),
  authPasswordInput: document.querySelector("#authPasswordInput"),
  authStatus: document.querySelector("#authStatus"),
  signOutBtn: document.querySelector("#signOutBtn"),
};

let confirmDeleteResolver = null;
let lastFloatingAlertKey = "";

init();

async function init() {
  window.cuentaClaraDebug = { parseReceiptText };
  bindEvents();
  const remoteReady = await setupRemoteSync();
  if (remoteReady === "locked") return;
  populateSelects();
  setToday();
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
        populateMovementCategoryOptions(button.dataset.type);
      }
    });
  });

  document.querySelectorAll('input[name="type"]').forEach((radio) => {
    radio.addEventListener("change", () => populateMovementCategoryOptions(getSelectedMovementType()));
  });

  document.querySelector("#prevMonthBtn").addEventListener("click", () => changeMonth(-1));
  document.querySelector("#nextMonthBtn").addEventListener("click", () => changeMonth(1));
  els.movementForm.addEventListener("submit", saveMovementFromForm);
  els.cancelMovementEditBtn.addEventListener("click", cancelMovementEdit);
  els.budgetForm.addEventListener("submit", saveBudget);
  els.categoryForm.addEventListener("submit", saveCategory);
  els.categoryManageList.addEventListener("click", handleCategoryAction);
  els.cancelCategoryEditBtn.addEventListener("click", cancelCategoryEdit);
  els.categoryKindInputs.forEach((radio) => {
    radio.addEventListener("change", () => {
      cancelCategoryEdit(false);
      els.newCategoryNameInput.value = "";
      els.newCategoryKeywordsInput.value = "";
      renderBudgetList(getMonthMovements());
    });
  });
  els.savingForm.addEventListener("submit", saveSavingTransfer);
  els.cancelSavingEditBtn.addEventListener("click", () => cancelSavingTransferEdit(true, true));
  els.savingGoalForm.addEventListener("submit", saveSavingGoal);
  els.cancelSavingGoalEditBtn.addEventListener("click", cancelSavingGoalEdit);
  els.savingsList.addEventListener("click", handleSavingGoalAction);
  els.analyzeReceiptBtn.addEventListener("click", analyzeReceipt);
  els.saveReceiptBtn.addEventListener("click", savePendingReceipt);
  els.cancelReceiptBtn.addEventListener("click", resetReceiptFlow);
  els.historyTypeFilter.addEventListener("change", renderHistory);
  els.historyCategoryFilter.addEventListener("change", renderHistory);
  els.historySearchInput.addEventListener("input", renderHistory);
  els.historyDateFrom.addEventListener("change", renderHistory);
  els.historyDateTo.addEventListener("change", renderHistory);
  els.historyList.addEventListener("click", handleMovementAction);
  els.downloadMovementsBtn.addEventListener("click", downloadMovementsCsv);
  els.recentMovements.addEventListener("click", handleMovementAction);
  bindMerchantSuggestionInput(els.merchantInput, els.merchantSuggestionPanel);
  bindMerchantSuggestionInput(els.receiptMerchant, els.receiptMerchantSuggestionPanel);
  bindMerchantSuggestionInput(els.scheduledNameInput, els.scheduledNameSuggestionPanel);
  els.scheduledForm.addEventListener("submit", saveScheduledPayment);
  els.scheduledList.addEventListener("click", handleScheduledAction);
  els.enableNotificationsBtn.addEventListener("click", requestNotifications);
  els.confirmCancelBtn.addEventListener("click", () => resolveDeleteConfirm(false));
  els.confirmOkBtn.addEventListener("click", () => resolveDeleteConfirm(true));
  els.floatingAlertOkBtn.addEventListener("click", dismissFloatingAlert);
  els.receiptImageInput.addEventListener("change", previewReceiptImage);
  els.authForm.addEventListener("submit", handleAuthSubmit);
  els.signOutBtn.addEventListener("click", signOut);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.confirmModal.hidden) resolveDeleteConfirm(false);
    if (event.key === "Escape" && !els.floatingAlertModal.hidden) dismissFloatingAlert();
    if (event.key === "Escape") hideMerchantSuggestions();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".field")) hideMerchantSuggestions();
  });
}

function confirmDeleteApp(message, title = "Eliminar") {
  if (confirmDeleteResolver) resolveDeleteConfirm(false);
  els.confirmTitle.textContent = title;
  els.confirmMessage.textContent = message;
  els.confirmModal.hidden = false;
  els.confirmOkBtn.focus();
  return new Promise((resolve) => {
    confirmDeleteResolver = resolve;
  });
}

function resolveDeleteConfirm(shouldDelete) {
  if (!confirmDeleteResolver) return;
  const resolve = confirmDeleteResolver;
  confirmDeleteResolver = null;
  els.confirmModal.hidden = true;
  resolve(shouldDelete);
}

async function setupRemoteSync() {
  if (!location.protocol.startsWith("http") || !window.supabase) {
    showApp();
    return "local";
  }

  try {
    const configResponse = await fetch("/api/supabase-config");
    const config = await configResponse.json();
    if (!config.enabled) {
      showApp();
      return "local";
    }

    remote.enabled = true;
    remote.client = window.supabase.createClient(config.url, config.anonKey);
    const { data } = await remote.client.auth.getSession();
    if (!data.session?.user) {
      showAuthGate("Inicia sesion para ver los datos privados.");
      return "locked";
    }

    remote.user = data.session.user;
    await loadRemoteData();
    remote.ready = true;
    showApp();
    remote.client.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        remote.user = null;
        remote.ready = false;
        showAuthGate("Sesion cerrada.");
      }
    });
    return "remote";
  } catch (error) {
    console.error(error);
    showAuthGate("No pude conectar con Supabase. Revisa la configuracion.");
    return "locked";
  }
}

function showAuthGate(message = "") {
  document.body.classList.add("auth-locked");
  els.authScreen.hidden = false;
  els.signOutBtn.hidden = true;
  if (message) els.authStatus.textContent = message;
}

function showApp() {
  document.body.classList.remove("auth-locked");
  els.authScreen.hidden = true;
  els.signOutBtn.hidden = !remote.enabled;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!remote.client) return;
  const submitter = event.submitter;
  const action = submitter?.dataset.authAction || "signin";
  const email = els.authEmailInput.value.trim();
  const password = els.authPasswordInput.value;
  els.authStatus.textContent = action === "signup" ? "Creando cuenta..." : "Entrando...";

  const result = action === "signup"
    ? await remote.client.auth.signUp({ email, password })
    : await remote.client.auth.signInWithPassword({ email, password });

  if (result.error) {
    els.authStatus.textContent = result.error.message;
    return;
  }

  if (!result.data.session?.user) {
    els.authStatus.textContent = "Revisa tu correo para confirmar la cuenta y luego entra.";
    return;
  }

  remote.user = result.data.session.user;
  await loadRemoteData();
  remote.ready = true;
  categories = mergeCategories(state.data.customCategories);
  populateSelects();
  setToday();
  render();
  showApp();
}

async function signOut() {
  if (!remote.client) return;
  await flushRemoteSave();
  await remote.client.auth.signOut();
  showAuthGate("Sesion cerrada.");
}

async function loadRemoteData() {
  const { data, error } = await remote.client
    .from("app_states")
    .select("data")
    .eq("user_id", remote.user.id)
    .maybeSingle();

  if (error) throw error;

  if (data?.data) {
    state.data = normalizeData(data.data);
    categories = mergeCategories(state.data.customCategories);
    return;
  }

  state.data = normalizeData(loadData());
  await remote.client.from("app_states").insert({
    user_id: remote.user.id,
    data: state.data,
  });
}

function scheduleRemoteSave() {
  if (!remote.enabled || !remote.ready || !remote.user || !remote.client) return;
  clearTimeout(remote.saveTimer);
  remote.saveTimer = setTimeout(() => {
    flushRemoteSave().catch((error) => console.error("No se pudo sincronizar", error));
  }, 500);
}

async function flushRemoteSave() {
  if (!remote.enabled || !remote.ready || !remote.user || !remote.client) return;
  clearTimeout(remote.saveTimer);
  remote.saveTimer = null;
  const { error } = await remote.client.from("app_states").upsert({
    user_id: remote.user.id,
    data: state.data,
  });
  if (error) throw error;
}

function populateSelects() {
  populateMovementCategoryOptions();
  els.budgetCategoryInput.innerHTML = categories
    .filter((category) => category.kind === "expense")
    .map((category) => `<option value="${category.id}">${category.name}</option>`)
    .join("");
  els.scheduledCategoryInput.innerHTML = categories
    .filter((category) => category.kind === "expense")
    .map((category) => `<option value="${category.id}">${category.name}</option>`)
    .join("");
  els.receiptCategory.innerHTML = categories
    .filter((category) => category.kind === "expense")
    .map((category) => `<option value="${category.id}">${category.name}</option>`)
    .join("");
  els.historyCategoryFilter.innerHTML = `<option value="all">Todas las categorias</option>${categories
    .map((category) => `<option value="${category.id}">${category.name}</option>`)
    .join("")}`;
  renderSavingOptions();
}

function renderOptions() {
  populateSelects();
}

function getSelectedMovementType() {
  return document.querySelector('input[name="type"]:checked')?.value || "expense";
}

function getSelectedCategoryKind() {
  return document.querySelector('input[name="categoryKind"]:checked')?.value || "expense";
}

function getMovementCategories(type) {
  return categories.filter((category) => category.kind === type);
}

function populateMovementCategoryOptions(type = getSelectedMovementType()) {
  const options = getMovementCategories(type)
    .map((category) => `<option value="${category.id}">${category.name}</option>`)
    .join("");
  els.categoryInput.innerHTML = options;
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
  els.scheduledDateInput.value = today;
}

function switchView(view) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  document.querySelectorAll(".view").forEach((panel) => panel.classList.remove("active"));
  document.querySelector(`#${view}View`).classList.add("active");
  if (view === "movement") populateMovementCategoryOptions();
}

function getActiveView() {
  return document.querySelector(".view.active")?.id?.replace("View", "") || "dashboard";
}

function changeMonth(direction) {
  state.activeMonth = new Date(state.activeMonth.getFullYear(), state.activeMonth.getMonth() + direction, 1);
  render();
}

function getBudgetSnapshotForMonth(targetMonthKey) {
  const snapshot = {};
  const entries = [...(state.data.budgetHistory || [])]
    .filter((entry) => entry.effectiveFrom <= targetMonthKey)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.localeCompare(b.createdAt));

  entries.forEach((entry) => {
    snapshot[entry.categoryId] = Number(entry.amount || 0);
  });

  return snapshot;
}

function upsertBudgetForMonth(categoryId, amount, effectiveFrom) {
  const history = Array.isArray(state.data.budgetHistory) ? state.data.budgetHistory : [];
  const existing = history.find((entry) => entry.categoryId === categoryId && entry.effectiveFrom === effectiveFrom);
  if (existing) {
    existing.amount = amount;
    existing.updatedAt = new Date().toISOString();
  } else {
    history.push({
      id: createId(),
      categoryId,
      amount,
      effectiveFrom,
      createdAt: new Date().toISOString(),
    });
  }
  state.data.budgetHistory = history;
}

function syncBudgetsForActiveMonth() {
  state.data.budgets = getBudgetSnapshotForMonth(monthKey(state.activeMonth));
}

function loadData() {
  const stored = localStorage.getItem("cuenta-clara-data");
  if (stored) return JSON.parse(stored);

  return {
    movements: [],
    budgets: {},
    savingsAccounts: [],
    customCategories: [],
    merchantRules: [],
  };
}

function normalizeData(data) {
  const currentMonth = monthKey(new Date());
  const budgetHistory = Array.isArray(data.budgetHistory) && data.budgetHistory.length
    ? data.budgetHistory
    : Object.entries(data.budgets || {}).map(([categoryId, amount]) => ({
        id: createId(),
        categoryId,
        amount: Number(amount || 0),
        effectiveFrom: currentMonth,
        createdAt: new Date().toISOString(),
      }));

  const normalized = {
    movements: Array.isArray(data.movements) ? data.movements : [],
    budgets: data.budgets || {},
    budgetHistory,
    customCategories: Array.isArray(data.customCategories) ? data.customCategories : [],
    deletedDefaultCategories: Array.isArray(data.deletedDefaultCategories) ? data.deletedDefaultCategories : [],
    merchantRules: Array.isArray(data.merchantRules) ? data.merchantRules : [],
    scheduledPayments: Array.isArray(data.scheduledPayments) ? data.scheduledPayments : [],
    savingsAccounts: Array.isArray(data.savingsAccounts) ? data.savingsAccounts : [],
  };

  normalized.movements = normalized.movements.map((movement) => ({
    savingAccountId: null,
    ...movement,
  }));

  normalized.scheduledPayments = normalized.scheduledPayments.map((payment) => ({
    paidMonths: [],
    ...payment,
    paidMonths: Array.isArray(payment.paidMonths) ? payment.paidMonths : [],
  }));

  return normalized;
}

function saveData() {
  localStorage.setItem("cuenta-clara-data", JSON.stringify(state.data));
  scheduleRemoteSave();
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
  const available = getMovementCategories(type);
  const category = available.some((item) => item.id === els.categoryInput.value)
    ? els.categoryInput.value
    : available[0]?.id || "otros";
  const existing = state.data.movements.find((item) => item.id === state.editingMovementId);

  if (existing) {
    existing.type = type;
    existing.amount = Number(els.amountInput.value);
    existing.date = els.dateInput.value;
    existing.category = category;
    existing.merchant = els.merchantInput.value.trim();
    existing.note = els.noteInput.value.trim();
  } else {
    state.data.movements.unshift(makeMovement(
      type,
      els.amountInput.value,
      els.dateInput.value,
      category,
      els.merchantInput.value,
      els.noteInput.value,
    ));
  }

  cancelMovementEdit(false);
  saveData();
  els.movementForm.reset();
  setToday();
  populateMovementCategoryOptions();
  render();
  switchView("dashboard");
}

function startMovementEdit(id) {
  const movement = state.data.movements.find((item) => item.id === id);
  if (!movement || movement.type === "saving") return;
  state.editingMovementId = id;
  switchView("movement");
  const typeInput = document.querySelector(`input[name="type"][value="${movement.type}"]`);
  if (typeInput) typeInput.checked = true;
  populateMovementCategoryOptions(movement.type);
  els.amountInput.value = movement.amount;
  els.dateInput.value = movement.date;
  els.categoryInput.value = movement.category;
  els.merchantInput.value = movement.merchant || "";
  els.noteInput.value = movement.note || "";
  els.movementSubmitBtn.textContent = "Guardar cambios";
  els.cancelMovementEditBtn.hidden = false;
}

function cancelMovementEdit(shouldReset = true) {
  state.editingMovementId = null;
  els.movementSubmitBtn.textContent = "Guardar movimiento";
  els.cancelMovementEditBtn.hidden = true;
  if (shouldReset) {
    els.movementForm.reset();
    setToday();
    populateMovementCategoryOptions();
  }
}

async function deleteMovement(id) {
  const movement = state.data.movements.find((item) => item.id === id);
  if (!movement) return;
  const label = movement.type === "income" ? "ingreso" : movement.type === "saving" ? "ahorro" : "gasto";
  const confirmed = await confirmDeleteApp(`Vas a eliminar este ${label}.`, "Eliminar movimiento");
  if (!confirmed) return;
  state.data.movements = state.data.movements.filter((item) => item.id !== id);
  if (state.editingMovementId === id) cancelMovementEdit(false);
  if (state.editingSavingMovementId === id) cancelSavingTransferEdit(false);
  saveData();
  render();
}

function handleMovementAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "edit-movement") {
    const movement = state.data.movements.find((item) => item.id === button.dataset.id);
    if (movement?.type === "saving") startSavingTransferEdit(button.dataset.id);
    else startMovementEdit(button.dataset.id);
  }
  if (button.dataset.action === "delete-movement") deleteMovement(button.dataset.id);
}

function saveBudget(event) {
  event.preventDefault();
  upsertBudgetForMonth(els.budgetCategoryInput.value, Number(els.budgetAmountInput.value), monthKey(state.activeMonth));
  syncBudgetsForActiveMonth();
  saveData();
  els.budgetForm.reset();
  render();
}

function saveCategory(event) {
  event.preventDefault();
  const name = els.newCategoryNameInput.value.trim();
  if (!name) return;

  const editingId = state.editingCategoryId;
  let id = editingId || slugifyCategory(name);
  const keywords = els.newCategoryKeywordsInput.value
    .split(",")
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
  const kind = getSelectedCategoryKind();
  if (!editingId && categories.some((category) => category.id === id && category.kind !== kind)) {
    id = `${kind}-${id}`.slice(0, 32);
  }

  const existing = state.data.customCategories.find((category) => category.id === id);
  if (existing) {
    existing.name = name;
    existing.keywords = keywords;
    existing.kind = kind;
  } else if (!categories.some((category) => category.id === id)) {
    state.data.customCategories.push({
      id,
      name,
      color: pickCategoryColor(state.data.customCategories.length),
      keywords,
      kind,
      createdAt: new Date().toISOString(),
    });
  } else {
    state.data.customCategories.push({
      id,
      name,
      color: categoryColor(id),
      keywords,
      kind,
      createdAt: new Date().toISOString(),
    });
  }

  categories = mergeCategories(state.data.customCategories);
  saveData();
  els.categoryForm.reset();
  const kindInput = document.querySelector(`input[name="categoryKind"][value="${kind}"]`);
  if (kindInput) kindInput.checked = true;
  cancelCategoryEdit(false);
  renderOptions();
  render();
}

function startCategoryEdit(id) {
  const category = categories.find((item) => item.id === id);
  if (!category || ["imprevistos", "ingreso"].includes(id)) return;
  state.editingCategoryId = id;
  const kindInput = document.querySelector(`input[name="categoryKind"][value="${category.kind}"]`);
  if (kindInput) kindInput.checked = true;
  els.newCategoryNameInput.value = category.name || "";
  els.newCategoryKeywordsInput.value = Array.isArray(category.keywords) ? category.keywords.join(", ") : "";
  els.categorySubmitBtn.textContent = "Guardar categoria";
  els.cancelCategoryEditBtn.hidden = false;
  switchView("budgets");
}

function cancelCategoryEdit(shouldReset = true) {
  state.editingCategoryId = null;
  els.categorySubmitBtn.textContent = "Agregar categoria";
  els.cancelCategoryEditBtn.hidden = true;
  if (shouldReset) els.categoryForm.reset();
}

async function deleteCategory(id) {
  const category = categories.find((item) => item.id === id);
  if (!category || ["imprevistos", "ingreso"].includes(id)) return;
  const fallbackCategory = category.kind === "income" ? "ingreso" : "imprevistos";
  const fallbackName = category.kind === "income" ? "Ingreso" : "Imprevistos";
  const confirmed = await confirmDeleteApp(`Vas a eliminar la categoria "${category.name}". Los movimientos pasaran a ${fallbackName}.`, "Eliminar categoria");
  if (!confirmed) return;
  state.data.customCategories = state.data.customCategories.filter((item) => item.id !== id);
  if ([...expenseCategories, ...incomeCategories].some((item) => item.id === id)) {
    state.data.deletedDefaultCategories = mergeUnique(state.data.deletedDefaultCategories || [], [id]);
  }
  state.data.movements = state.data.movements.map((movement) => (
    movement.category === id ? { ...movement, category: fallbackCategory } : movement
  ));
  state.data.budgetHistory = (state.data.budgetHistory || []).filter((entry) => entry.categoryId !== id);
  state.data.merchantRules = (state.data.merchantRules || []).map((rule) => (
    rule.category === id ? { ...rule, category: fallbackCategory } : rule
  ));
  categories = mergeCategories(state.data.customCategories);
  syncBudgetsForActiveMonth();
  saveData();
  renderOptions();
  render();
}

function handleCategoryAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "edit-category") startCategoryEdit(button.dataset.id);
  if (button.dataset.action === "delete-category") deleteCategory(button.dataset.id);
}

function saveSavingTransfer(event) {
  event.preventDefault();
  const account = state.data.savingsAccounts.find((item) => item.id === els.savingAccountInput.value);
  if (!account) return;
  const action = new FormData(els.savingForm).get("savingAction");
  const amount = Number(els.savingAmountInput.value);
  const saved = getSavedForAccount(account.id);
  const existing = state.data.movements.find((item) => item.id === state.editingSavingMovementId);
  const existingAmount = existing?.savingAccountId === account.id ? existing.amount : 0;
  const availableForWithdrawal = saved - existingAmount;
  if (action === "withdraw" && amount > availableForWithdrawal) {
    alert("No hay suficiente dinero en esa meta para retirar ese monto.");
    return;
  }
  const signedAmount = action === "withdraw" ? -amount : amount;

  if (existing) {
    existing.amount = signedAmount;
    existing.date = els.savingDateInput.value;
    existing.merchant = account.name;
    existing.note = action === "withdraw" ? "Retiro desde ahorro" : "Transferencia a ahorro";
    existing.savingAccountId = account.id;
  } else {
    state.data.movements.unshift(makeMovement(
      "saving",
      signedAmount,
      els.savingDateInput.value,
      "ahorro",
      account.name,
      action === "withdraw" ? "Retiro desde ahorro" : "Transferencia a ahorro",
      null,
      account.id,
    ));
  }

  const returnView = state.savingEditReturnView || "savings";
  cancelSavingTransferEdit(false);
  saveData();
  els.savingForm.reset();
  setToday();
  render();
  switchView(returnView);
  state.savingEditReturnView = "savings";
}

function startSavingTransferEdit(id) {
  const movement = state.data.movements.find((item) => item.id === id);
  if (!movement || movement.type !== "saving") return;
  state.editingSavingMovementId = id;
  state.savingEditReturnView = getActiveView();
  switchView("savings");
  els.savingAccountInput.value = movement.savingAccountId;
  els.savingAmountInput.value = Math.abs(movement.amount);
  els.savingDateInput.value = movement.date;
  const actionInput = document.querySelector(`input[name="savingAction"][value="${movement.amount < 0 ? "withdraw" : "deposit"}"]`);
  if (actionInput) actionInput.checked = true;
  els.savingSubmitBtn.textContent = "Guardar ahorro";
  els.cancelSavingEditBtn.hidden = false;
}

function cancelSavingTransferEdit(shouldReset = true, shouldReturn = false) {
  const returnView = state.savingEditReturnView || "savings";
  state.editingSavingMovementId = null;
  state.savingEditReturnView = "savings";
  els.savingSubmitBtn.textContent = "Mover a ahorro";
  els.cancelSavingEditBtn.hidden = true;
  if (shouldReset) {
    els.savingForm.reset();
    setToday();
  }
  if (shouldReturn) switchView(returnView);
}

function saveSavingGoal(event) {
  event.preventDefault();
  const name = els.savingGoalNameInput.value.trim();
  const target = Number(els.savingGoalTargetInput.value);
  if (!name || !target) return;
  const existing = state.data.savingsAccounts.find((item) => item.id === state.editingSavingGoalId);

  if (existing) {
    existing.name = name;
    existing.target = target;
    state.data.movements = state.data.movements.map((movement) => (
      movement.savingAccountId === existing.id ? { ...movement, merchant: name } : movement
    ));
    cancelSavingGoalEdit(false);
  } else {
    state.data.savingsAccounts.push({
      id: createId(),
      name,
      target,
      createdAt: new Date().toISOString(),
    });
  }

  saveData();
  els.savingGoalForm.reset();
  renderSavingOptions();
  render();
}

function startSavingGoalEdit(id) {
  const account = state.data.savingsAccounts.find((item) => item.id === id);
  if (!account) return;
  state.editingSavingGoalId = id;
  switchView("savings");
  els.savingGoalNameInput.value = account.name;
  els.savingGoalTargetInput.value = account.target;
  els.savingGoalSubmitBtn.textContent = "Guardar meta";
  els.cancelSavingGoalEditBtn.hidden = false;
}

function cancelSavingGoalEdit(shouldReset = true) {
  state.editingSavingGoalId = null;
  els.savingGoalSubmitBtn.textContent = "Crear meta";
  els.cancelSavingGoalEditBtn.hidden = true;
  if (shouldReset) els.savingGoalForm.reset();
}

async function deleteSavingGoal(id) {
  const account = state.data.savingsAccounts.find((item) => item.id === id);
  if (!account) return;
  const relatedMovements = state.data.movements.filter((movement) => movement.savingAccountId === id);
  const confirmed = await confirmDeleteApp(
    relatedMovements.length
      ? `Eliminar la meta "${account.name}" y ${relatedMovements.length} movimiento(s) relacionados?`
      : `Eliminar la meta "${account.name}"?`,
    "Eliminar meta",
  );
  if (!confirmed) return;
  state.data.savingsAccounts = state.data.savingsAccounts.filter((item) => item.id !== id);
  state.data.movements = state.data.movements.filter((movement) => movement.savingAccountId !== id);
  if (state.editingSavingGoalId === id) cancelSavingGoalEdit(false);
  saveData();
  renderSavingOptions();
  render();
}

function startSavingWithdrawal(id) {
  const account = state.data.savingsAccounts.find((item) => item.id === id);
  if (!account) return;
  switchView("savings");
  els.savingAccountInput.value = id;
  const withdrawInput = document.querySelector('input[name="savingAction"][value="withdraw"]');
  if (withdrawInput) withdrawInput.checked = true;
  els.savingAmountInput.focus();
}

function handleSavingGoalAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "withdraw-saving") startSavingWithdrawal(button.dataset.id);
  if (button.dataset.action === "edit-saving-goal") startSavingGoalEdit(button.dataset.id);
  if (button.dataset.action === "delete-saving-goal") deleteSavingGoal(button.dataset.id);
}

function saveScheduledPayment(event) {
  event.preventDefault();
  const amount = Number(els.scheduledAmountInput.value || 0);
  const name = els.scheduledNameInput.value.trim();
  if (!name || !amount) return;
  state.data.scheduledPayments.push({
    id: createId(),
    name,
    amount,
    dueDate: els.scheduledDateInput.value,
    category: els.scheduledCategoryInput.value,
    note: els.scheduledNoteInput.value.trim(),
    repeat: els.scheduledMonthlyInput.checked ? "monthly" : "once",
    active: true,
    notifiedOn: "",
    createdAt: new Date().toISOString(),
  });
  saveData();
  els.scheduledForm.reset();
  setToday();
  render();
}

async function markScheduledPaid(id) {
  const payment = state.data.scheduledPayments.find((item) => item.id === id);
  if (!payment) return;
  const paidMonth = monthKey(state.activeMonth);
  payment.paidMonths = Array.isArray(payment.paidMonths) ? payment.paidMonths : [];

  if (isScheduledPaidForMonth(payment, paidMonth)) {
    payment.paidMonths = payment.paidMonths.filter((item) => item !== paidMonth);
    state.data.movements = state.data.movements.filter((movement) => (
      movement.scheduledPaymentId !== payment.id || movement.scheduledMonth !== paidMonth
    ));
  } else {
    const movement = makeMovement(
      "expense",
      payment.amount,
      scheduledDateForMonth(payment, paidMonth),
      payment.category,
      payment.name,
      payment.note || "Pago programado",
    );
    movement.scheduledPaymentId = payment.id;
    movement.scheduledMonth = paidMonth;
    state.data.movements.unshift(movement);
    payment.paidMonths.push(paidMonth);
    if (paidMonth === monthKey(new Date())) payment.notifiedOn = toInputDate(new Date());
  }
  saveData();
  render();
}

async function deleteScheduledPayment(id) {
  const payment = state.data.scheduledPayments.find((item) => item.id === id);
  if (!payment) return;
  const confirmed = await confirmDeleteApp(`Eliminar el pago programado "${payment.name}"?`, "Eliminar pago");
  if (!confirmed) return;
  state.data.scheduledPayments = state.data.scheduledPayments.filter((item) => item.id !== id);
  saveData();
  render();
}

function handleScheduledAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "pay-scheduled") markScheduledPaid(button.dataset.id);
  if (button.dataset.action === "delete-scheduled") deleteScheduledPayment(button.dataset.id);
}

async function requestNotifications() {
  if (!("Notification" in window)) {
    alert("Este navegador no soporta notificaciones.");
    return;
  }
  const permission = await Notification.requestPermission();
  els.enableNotificationsBtn.textContent = permission === "granted" ? "Notificaciones activas" : "Activar notificaciones";
  checkScheduledNotifications();
}

function previewReceiptImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  state.pendingReceipt = null;
  els.receiptResult.hidden = true;

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

async function analyzeReceipt() {
  const text = els.receiptTextInput.value.trim();
  const image = els.receiptPreview.src || null;
  if (!text && !image) return;

  els.receiptStatus.textContent = "Analizando factura...";
  els.analyzeReceiptBtn.disabled = true;

  try {
    const parsed = await analyzeReceiptWithBackend(text, image);
    state.pendingReceipt = { ...parsed, image };
    renderReceiptResult(parsed);
    els.receiptStatus.textContent = "IA Gemini usada. Revisa y corrige antes de guardar.";
  } catch (error) {
    console.error(error);
    const parsed = image ? await analyzeReceiptWithFreeOcr(text, image).catch(() => parseReceiptText(text)) : parseReceiptText(text);
    state.pendingReceipt = { ...parsed, image };
    renderReceiptResult(parsed);
    els.receiptStatus.textContent = "No uso IA: use respaldo local. Revisa bien antes de guardar.";
  } finally {
    els.analyzeReceiptBtn.disabled = false;
  }
}

async function analyzeReceiptWithBackend(text, image) {
  if (!window.location.protocol.startsWith("http") || location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    throw new Error("El backend protegido solo funciona cuando la app esta publicada.");
  }

  const response = await fetch("/api/analyze-receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      image,
      categories: getReceiptCategories(),
      merchantRules: getMerchantRulesForAi(),
      classificationGuide: buildClassificationGuide(),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Backend respondio con estado ${response.status}`);
  }

  return normalizeReceiptAiResult(data, text);
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
      ? (receiptData.productos || receiptData.items).map(normalizeReceiptItem).filter((item) => item.name)
      : parsed.items,
    rawText: ocrText,
  };
}

function normalizeReceiptAiResult(receiptData, fallbackText = "") {
  const parsed = parseReceiptText(receiptData.text || receiptData.rawText || fallbackText);
  const products = receiptData.productos || receiptData.items || [];

  return {
    ...parsed,
    merchant: receiptData.comercio || receiptData.merchant || parsed.merchant,
    date: normalizeIncomingDate(receiptData.fecha || receiptData.date) || parsed.date,
    amount: Number(receiptData.total || receiptData.amount || parsed.amount || 0),
    category: normalizeCategory(receiptData.categoria || receiptData.category || parsed.category),
    items: Array.isArray(products)
      ? products.map(normalizeReceiptItem).filter((item) => item.name)
      : parsed.items,
    rawText: receiptData.text || receiptData.rawText || fallbackText,
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
      ? (receiptData.productos || receiptData.items).map(normalizeReceiptItem).filter((item) => item.name)
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
    "En productos devuelve solo nombre y precio final del producto. No incluyas impuestos resumidos, claves, telefonos, autorizaciones, terminales ni textos legales.",
    `Texto opcional del usuario/OCR: ${userText || "Ninguno"}.`,
  ].join(" ");
}

function getReceiptCategories() {
  return categories
    .filter((category) => category.kind === "expense")
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

function normalizeReceiptItem(item) {
  if (typeof item === "string") return parseReceiptItemLine(item) || { name: "", amount: null };
  return {
    name: cleanReceiptProductName(String(item?.nombre || item?.name || "")),
    amount: Number(item?.precio || item?.amount || item?.monto || 0) || null,
  };
}

function formatReceiptItems(items = []) {
  return items.map((item) => {
    const normalized = normalizeReceiptItem(item);
    if (!normalized.name || !normalized.amount) return "";
    return `${normalized.name} - ${formatReceiptProductAmount(normalized.amount)}`;
  }).filter(Boolean).join("\n");
}

function formatReceiptProductAmount(amount) {
  return `₡${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(amount || 0))}`;
}

function parseReceiptItemsInput(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const amountMatch = line.match(/(?:₡|\bcrc\b)?\s*(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{2}))?\s*$/i);
      if (!amountMatch) return { name: line, amount: null };
      const amount = parseMoneyValue(amountMatch[0]);
      const name = line.slice(0, amountMatch.index).replace(/[-–—:]+$/g, "").trim() || line;
      return { name, amount };
    });
}

function parseReceiptItemLine(line) {
  const original = String(line || "").trim();
  if (!original || isReceiptNoiseLine(original)) return null;
  const amountMatch = original.match(/(?:₡|\bcrc\b)?\s*(\d{1,3}(?:[.,]\d{3})+|\d{3,7})(?:[.,](\d{2}))?\s*[gs]?$/i);
  if (!amountMatch) return null;
  const amount = parseMoneyValue(amountMatch[0]);
  if (!amount || amount < 50) return null;
  const name = cleanReceiptProductName(original.slice(0, amountMatch.index));
  if (!name || isReceiptNoiseLine(name)) return null;
  return { name, amount };
}

function cleanReceiptProductName(value) {
  return String(value || "")
    .replace(/\b\d{7,}\b/g, "")
    .replace(/\b\d+\s*x\b/gi, "")
    .replace(/\b[gs]\s*\d{1,2}\b/gi, "")
    .replace(/^\s*\d+(?:[.,]\d+)?\s+/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[-–—:]+$/g, "")
    .trim();
}

function isReceiptNoiseLine(value) {
  return /\b(subtotal|sub total|total|tarjeta|tarjetas|monto|cancelado|fecha|hora|cambio|vuelto|iva|impuesto|resumen|clave|aut|autorizacion|terminal|tiquete|comprobante|tc#|cta|servicio|cliente|participa|escanea|voucher|resolucion|gracias|correo|email|telefono|tel\.?|cedula|c[eé]dula|juridica|jur[ií]dica|consecutivo|qr|barcode|codigo|moneda|cajero|caja|condicion|medio de pago)\b/i.test(String(value || ""));
}

function buildReceiptNote(items, note) {
  const productLines = formatReceiptItems(items);
  const extraNote = String(note || "").trim();
  return [productLines, extraNote].filter(Boolean).join("\n");
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
  return candidates[0] ? candidates[0].amount : 0;
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
  if (/mxm|supermercado|avenida 10|superavenida|walmart|masxmenos|maxipali|pali|automercado|ampm|fm tibas|pozuelto|pozuelo|galleta|coco|leche|queso|aguacate|naranja|platano/i.test(normalized)) return "alimentacion";
  if (/kiss makeup|makeup|maquillaje|keratina|shampoo/i.test(normalized)) return "compras-personales";
  const found = categories.find((category) => category.keywords.some((keyword) => normalized.includes(keyword)));
  return found ? found.id : "imprevistos";
}

function normalizeCategory(value) {
  const normalized = String(value || "").toLowerCase().trim();
  const aliases = {
    farmacia: "salud",
    medicina: "salud",
    medicamentos: "salud",
    belleza: "compras-personales",
    maquillaje: "compras-personales",
    cosmeticos: "compras-personales",
    cosmetica: "compras-personales",
    supermercado: "alimentacion",
    super: "alimentacion",
    alimentos: "alimentacion",
    alimentacion: "alimentacion",
    alimentación: "alimentacion",
    comida: "comida-fuera",
    restaurante: "comida-fuera",
    restaurantes: "comida-fuera",
    ingreso: "ingreso",
    ingresos: "ingreso",
    salario: "salario",
    sueldos: "salario",
    sueldo: "salario",
    quincena: "salario",
    nomina: "salario",
    "nómina": "salario",
    freelance: "negocio",
    negocio: "negocio",
    comision: "negocio",
    comisiones: "negocio",
    reembolso: "reembolso",
    salud: "salud",
    casa: "vivienda",
    alquiler: "vivienda",
    vivienda: "vivienda",
    hogar: "hogar",
    transporte: "transporte",
    servicios: "vivienda",
    internet: "telefono-internet",
    telefono: "telefono-internet",
    teléfono: "telefono-internet",
    entretenimiento: "ocio-salidas",
    ahorro: "ahorro",
    otros: "imprevistos",
    imprevistos: "imprevistos",
  };

  if (categories.some((category) => category.id === normalized)) return normalized;
  return aliases[normalized] || "imprevistos";
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
  const deleted = new Set(state?.data?.deletedDefaultCategories || []);
  const byId = new Map([...expenseCategories, ...incomeCategories]
    .filter((category) => !deleted.has(category.id))
    .map((category) => [category.id, category]));
  customCategories.forEach((category, index) => {
    const id = slugifyCategory(category.id || category.name);
    if (!id || ["ahorro"].includes(id)) return;
    const kind = category.kind === "income" ? "income" : "expense";
    byId.set(id, {
      id,
      name: category.name || toTitleCase(id.replace(/-/g, " ")),
      color: category.color || pickCategoryColor(index),
      keywords: Array.isArray(category.keywords) ? category.keywords : [],
      kind,
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
  return normalizeReceiptText(text)
    .split("\n")
    .map((line) => parseReceiptItemLine(line))
    .filter(Boolean)
    .slice(0, 12);
}

function renderReceiptResult(parsed) {
  populateSelects();
  els.receiptDate.value = parsed.date || toInputDate(new Date());
  els.receiptMerchant.value = parsed.merchant || "";
  els.receiptTotal.value = Number(parsed.amount || 0);
  els.receiptCategory.value = normalizeCategory(parsed.category);
  els.receiptItems.value = formatReceiptItems(parsed.items || []);
  els.receiptNote.value = parsed.note || "";
  els.receiptResult.hidden = false;
}

function savePendingReceipt() {
  if (!state.pendingReceipt) return;
  const items = parseReceiptItemsInput(els.receiptItems.value);
  const cleanItems = items.filter((item) => item.name && item.amount);
  const receipt = {
    ...state.pendingReceipt,
    date: els.receiptDate.value || toInputDate(new Date()),
    merchant: els.receiptMerchant.value.trim() || "Factura",
    amount: Number(els.receiptTotal.value || 0),
    category: normalizeCategory(els.receiptCategory.value),
    items: cleanItems,
    note: els.receiptNote.value.trim(),
  };
  if (!receipt.amount) {
    els.receiptStatus.textContent = "Revisa el total antes de guardar.";
    els.receiptTotal.focus();
    return;
  }
  learnMerchantCategory(receipt.merchant, receipt.category);
  state.data.movements.unshift(makeMovement(
    "expense",
    receipt.amount,
    receipt.date,
    receipt.category,
    receipt.merchant,
    buildReceiptNote(receipt.items, receipt.note),
    receipt,
  ));
  resetReceiptFlow("Gasto guardado desde factura.");
  saveData();
  render();
  switchView("dashboard");
}

function resetReceiptFlow(message = "Puedes subir otra factura.") {
  state.pendingReceipt = null;
  els.receiptTextInput.value = "";
  els.receiptImageInput.value = "";
  els.receiptPreview.removeAttribute("src");
  els.receiptPreview.hidden = true;
  els.receiptResult.hidden = true;
  els.receiptItems.value = "";
  els.receiptNote.value = "";
  els.receiptStatus.textContent = message;
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
  syncBudgetsForActiveMonth();
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
  const alerts = buildAlerts(monthMovements);
  renderAlerts(alerts);
  showFloatingAlerts(alerts);
  renderRecent(monthMovements);
  renderBudgetList(monthMovements);
  renderSavings();
  renderHistory();
  renderScheduledPayments();
  renderMerchantSuggestions();
  checkScheduledNotifications();
}

function renderBudgetSummary(movements) {
  const budgets = getBudgetSnapshotForMonth(monthKey(state.activeMonth));
  const budgetTotal = Object.values(budgets).reduce((sum, amount) => sum + Number(amount || 0), 0);
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

function buildAlerts(movements) {
  const alerts = [];
  getDueScheduledPayments().forEach((payment) => {
    const dueDate = scheduledDateForMonth(payment, monthKey(new Date()));
    alerts.push({
      important: true,
      tone: isPastDue(dueDate) ? "danger" : "warning",
      title: `Pago pendiente: ${payment.name}`,
      text: `${money(payment.amount)} vence ${displayDate(dueDate)}${payment.repeat === "monthly" ? " · mensual" : ""}.`,
    });
  });
  const expenses = movements.filter((item) => item.type === "expense");
  const byCategory = groupExpensesByCategory(expenses);
  const budgets = getBudgetSnapshotForMonth(monthKey(state.activeMonth));
  const currentDate = new Date();
  const sameMonth = state.activeMonth.getFullYear() === currentDate.getFullYear() && state.activeMonth.getMonth() === currentDate.getMonth();
  const daysInMonth = new Date(state.activeMonth.getFullYear(), state.activeMonth.getMonth() + 1, 0).getDate();
  const daysLeft = sameMonth ? Math.max(daysInMonth - currentDate.getDate(), 1) : daysInMonth;
  const budgetTotal = Object.values(budgets).reduce((sum, amount) => sum + Number(amount || 0), 0);
  const spentTotal = expenses.reduce((sum, item) => sum + item.amount, 0);
  const remainingBudget = budgetTotal - spentTotal;

  Object.entries(budgets).forEach(([categoryId, limit]) => {
    const limitValue = Number(limit || 0);
    if (!limitValue) return;
    const spent = Number(byCategory[categoryId] || 0);
    const percent = Math.round((spent / limitValue) * 100);
    if (percent >= 100) {
      alerts.push({ important: true, tone: "danger", title: `Superaste presupuesto en ${categoryName(categoryId).toLowerCase()}`, text: `Llevas ${money(spent)} de ${money(limitValue)}.` });
    } else if (percent >= 80) {
      alerts.push({ important: true, tone: "warning", title: `Ya gastaste ${percent}% en ${categoryName(categoryId).toLowerCase()}`, text: `Vas en ${money(spent)} de ${money(limitValue)}.` });
    }
  });

  const currentSaving = movements.filter((item) => item.type === "saving").reduce((sum, item) => sum + item.amount, 0);
  const previousMonth = new Date(state.activeMonth.getFullYear(), state.activeMonth.getMonth() - 1, 1);
  const previousSaving = calculateTotals(getMovementsForMonthKey(monthKey(previousMonth))).saving;
  if (previousSaving > 0 && currentSaving < previousSaving) {
    alerts.push({ tone: "info", title: "Este mes estas ahorrando menos", text: `Llevan ${money(currentSaving)} en ahorro frente a ${money(previousSaving)} el mes pasado.` });
  }

  if (budgetTotal > 0) {
    alerts.push({
      tone: remainingBudget < 0 ? "danger" : "success",
      title: `Te quedan ${money(Math.max(remainingBudget / daysLeft, 0))} por dia`,
      text: remainingBudget >= 0
        ? `Quedan ${money(remainingBudget)} del presupuesto total.`
        : `Ya van ${money(Math.abs(remainingBudget))} por encima del presupuesto total.`,
    });
  }

  return alerts;
}

function renderAlerts(alerts) {
  els.alertsList.innerHTML = alerts.length
    ? alerts.map((alert) => `
        <article class="alert-card ${alert.tone}">
          <strong>${escapeHtml(alert.title)}</strong>
          <p>${escapeHtml(alert.text)}</p>
        </article>
      `).join("")
    : `<div class="empty">Todavia no hay alertas que mostrar.</div>`;
}

function showFloatingAlerts(alerts) {
  const importantAlerts = alerts.filter((alert) => alert.important);
  if (!importantAlerts.length) return;

  const alertKey = `${monthKey(state.activeMonth)}:${importantAlerts.map((alert) => `${alert.tone}|${alert.title}|${alert.text}`).join("::")}`;
  if (alertKey === lastFloatingAlertKey || sessionStorage.getItem("cuenta-clara-dismissed-alert") === alertKey) return;

  lastFloatingAlertKey = alertKey;
  els.floatingAlertList.innerHTML = importantAlerts.map((alert) => `
    <article class="alert-card ${alert.tone}">
      <strong>${escapeHtml(alert.title)}</strong>
      <p>${escapeHtml(alert.text)}</p>
    </article>
  `).join("");
  els.floatingAlertModal.dataset.alertKey = alertKey;
  els.floatingAlertModal.hidden = false;
  els.floatingAlertOkBtn.focus();
}

function dismissFloatingAlert() {
  const alertKey = els.floatingAlertModal.dataset.alertKey || "";
  if (alertKey) sessionStorage.setItem("cuenta-clara-dismissed-alert", alertKey);
  els.floatingAlertModal.hidden = true;
}

function renderScheduledPayments() {
  const activeMonthKey = monthKey(state.activeMonth);
  const active = (state.data.scheduledPayments || [])
    .filter((payment) => payment.active !== false)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  els.scheduledList.innerHTML = active.length
    ? active.map((payment) => {
      const paid = isScheduledPaidForMonth(payment, activeMonthKey);
      const occurrenceDate = scheduledDateForMonth(payment, activeMonthKey);
      return `
        <article class="saving-row ${paid ? "paid-payment" : ""} ${!paid && isDueOrPast(occurrenceDate) ? "due-payment" : ""}">
          <div>
            <strong>${escapeHtml(payment.name)}</strong>
            <p>${displayDate(occurrenceDate)} · ${money(payment.amount)} · ${categoryName(payment.category)}${payment.repeat === "monthly" ? " · mensual" : ""}${paid ? " · pagado este mes" : ""}${payment.note ? ` · ${escapeHtml(payment.note)}` : ""}</p>
          </div>
          <div class="saving-actions">
            <button class="mini-button ${paid ? "paid-toggle" : ""}" data-action="pay-scheduled" data-id="${payment.id}">${paid ? "Quitar pago" : "Marcar pagado"}</button>
            <button class="mini-button icon-button-small danger" data-action="delete-scheduled" data-id="${payment.id}" aria-label="Eliminar pago" title="Eliminar">🗑️</button>
          </div>
        </article>
      `;
    }).join("")
    : `<div class="empty">No hay pagos programados.</div>`;
}

function getDueScheduledPayments() {
  const currentMonth = monthKey(new Date());
  return (state.data.scheduledPayments || [])
    .filter((payment) => payment.active !== false)
    .filter((payment) => !isScheduledPaidForMonth(payment, currentMonth))
    .filter((payment) => isDueOrPast(scheduledDateForMonth(payment, currentMonth)));
}

function isScheduledPaidForMonth(payment, key = monthKey(state.activeMonth)) {
  return (Array.isArray(payment.paidMonths) && payment.paidMonths.includes(key))
    || state.data.movements.some((movement) => (
      movement.scheduledPaymentId === payment.id && movement.scheduledMonth === key
    ));
}

function scheduledDateForMonth(payment, key = monthKey(state.activeMonth)) {
  const [year, month] = key.split("-").map(Number);
  const due = new Date(`${payment.dueDate}T12:00:00`);
  const daysInMonth = new Date(year, month, 0).getDate();
  const day = Math.min(due.getDate(), daysInMonth);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function checkScheduledNotifications() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const today = toInputDate(new Date());
  let changed = false;
  getDueScheduledPayments().forEach((payment) => {
    if (payment.notifiedOn === today) return;
    new Notification("Cuenta Clara: pago pendiente", {
      body: `${payment.name}: ${money(payment.amount)} vence ${displayDate(payment.dueDate)}.`,
    });
    payment.notifiedOn = today;
    changed = true;
  });
  if (changed) saveData();
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
  const recent = [...movements].sort((a, b) => b.date.localeCompare(a.date));
  els.monthlyMovementsCount.textContent = `${recent.length} ${recent.length === 1 ? "movimiento" : "movimientos"}`;
  els.recentMovements.innerHTML = recent.length
    ? recent.map(renderMovementRow).join("")
    : `<div class="empty">Este mes todavia no tiene movimientos.</div>`;
}

function renderBudgetList(movements) {
  const expenses = movements.filter((item) => item.type === "expense");
  const byCategory = groupExpensesByCategory(expenses);
  const selectedKind = getSelectedCategoryKind();
  const entries = categories.filter((category) => category.kind === selectedKind);
  const expenseEntries = categories.filter((category) => category.kind === "expense");
  const budgets = getBudgetSnapshotForMonth(monthKey(state.activeMonth));
  const kindLabel = selectedKind === "income" ? "Ingresos" : "Gastos";

  els.categoryManageList.innerHTML = `
    <article class="budget-row">
      <header>
        <strong>Categorias de ${kindLabel.toLowerCase()}</strong>
        <span>${entries.length} activas</span>
      </header>
      <div class="category-manage-list">
        ${entries.map((category) => `
          <div class="category-manage-row">
            <span><i style="--color: ${category.color}"></i>${escapeHtml(category.name)}</span>
            <div class="row-actions">
              <button class="mini-button icon-button-small" data-action="edit-category" data-id="${category.id}" aria-label="Editar ${escapeHtml(category.name)}" title="Editar">✏️</button>
              <button class="mini-button icon-button-small danger" data-action="delete-category" data-id="${category.id}" aria-label="Eliminar ${escapeHtml(category.name)}" title="Eliminar" ${["imprevistos", "ingreso"].includes(category.id) ? "disabled" : ""}>🗑️</button>
            </div>
          </div>
        `).join("")}
      </div>
    </article>
  `;

  els.budgetList.innerHTML = expenseEntries.map((category) => {
    const limit = Number(budgets[category.id] || 0);
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

  const previewHtml = accounts.map((account) => renderSavingRow(account, false)).join("");
  const listHtml = accounts.map((account) => renderSavingRow(account, true)).join("");
  els.savingsPreview.innerHTML = previewHtml || `<div class="empty">Creen su primera meta de ahorro.</div>`;
  els.savingsList.innerHTML = listHtml || `<div class="empty">Creen su primera meta de ahorro.</div>`;
}

function renderSavingRow(account, interactive = false) {
  return `
    <article class="saving-row">
      <header>
        <strong>${escapeHtml(account.name)}</strong>
        <strong>${account.percent}%</strong>
      </header>
      <p>${money(account.saved)} ahorrados de ${money(account.target)}</p>
      <div class="bar"><span style="--width: ${account.percent}%; --color: var(--mint)"></span></div>
      ${interactive ? `<div class="row-actions saving-actions">
        <button class="mini-button icon-button-small" data-action="withdraw-saving" data-id="${account.id}" aria-label="Retirar de ${escapeHtml(account.name)}" title="Retirar">↩️</button>
        <button class="mini-button icon-button-small" data-action="edit-saving-goal" data-id="${account.id}" aria-label="Editar ${escapeHtml(account.name)}" title="Editar">✏️</button>
        <button class="mini-button icon-button-small danger" data-action="delete-saving-goal" data-id="${account.id}" aria-label="Eliminar ${escapeHtml(account.name)}" title="Eliminar">🗑️</button>
      </div>` : ""}
    </article>
  `;
}

function renderHistory() {
  const rows = getFilteredHistoryRows();

  els.historyList.innerHTML = rows.length
    ? rows.map(renderMovementRow).join("")
    : `<div class="empty">No hay movimientos con esos filtros.</div>`;
}

function getFilteredHistoryRows() {
  const type = els.historyTypeFilter.value;
  const category = els.historyCategoryFilter.value;
  const search = els.historySearchInput.value.trim();
  const dateFrom = els.historyDateFrom.value;
  const dateTo = els.historyDateTo.value;
  return state.data.movements
    .filter((item) => !dateFrom || item.date >= dateFrom)
    .filter((item) => !dateTo || item.date <= dateTo)
    .filter((item) => type === "all" || item.type === type)
    .filter((item) => category === "all" || item.category === category)
    .filter((item) => matchesHistorySearch(item, search))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function downloadMovementsCsv() {
  const rows = getFilteredHistoryRows();
  if (!rows.length) {
    els.downloadMovementsBtn.textContent = "Sin datos";
    setTimeout(() => {
      els.downloadMovementsBtn.textContent = "Descargar CSV";
    }, 1400);
    return;
  }

  const headers = ["Fecha", "Tipo", "Comercio", "Categoria", "Monto CRC", "Nota"];
  const csvRows = [
    headers,
    ...rows.map((movement) => [
      movement.date,
      movementTypeLabel(movement.type),
      movement.merchant || "",
      categoryName(movement.category),
      Number(movement.amount || 0).toFixed(2),
      movement.note || "",
    ]),
  ];
  const csv = `\uFEFF${csvRows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cuenta-clara-movimientos-${toInputDate(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function movementTypeLabel(type) {
  if (type === "income") return "Ingreso";
  if (type === "saving") return "Ahorro";
  return "Gasto";
}

function renderMerchantSuggestions() {
  // Suggestions are rendered on focus/input by bindMerchantSuggestionInput.
}

function getMerchantSuggestionNames() {
  const names = new Map();
  state.data.movements.forEach((movement) => {
    const name = normalizeMerchantName(movement.merchant);
    if (name.length > 1) names.set(name.toLowerCase(), name);
  });
  (state.data.merchantRules || []).forEach((rule) => {
    const name = normalizeMerchantName(rule.displayName || rule.key);
    if (name.length > 1) names.set(name.toLowerCase(), name);
  });

  return [...names.values()]
    .sort((a, b) => a.localeCompare(b, "es"))
    .slice(0, 80);
}

function bindMerchantSuggestionInput(input, panel) {
  const render = () => renderInlineMerchantSuggestions(input, panel);
  input.addEventListener("input", render);
  input.addEventListener("focus", render);
  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-suggestion]");
    if (!button) return;
    input.value = button.dataset.suggestion;
    panel.hidden = true;
    input.focus();
  });
}

function renderInlineMerchantSuggestions(input, panel) {
  const query = normalizeSearchText(input.value);
  const suggestions = getMerchantSuggestionNames()
    .filter((name) => !query || normalizeSearchText(name).includes(query))
    .slice(0, 6);

  panel.innerHTML = suggestions.map((name) => `
    <button type="button" data-suggestion="${escapeHtml(name)}">${escapeHtml(name)}</button>
  `).join("");
  panel.hidden = suggestions.length === 0;
}

function hideMerchantSuggestions() {
  [els.merchantSuggestionPanel, els.receiptMerchantSuggestionPanel, els.scheduledNameSuggestionPanel]
    .forEach((panel) => {
      if (panel) panel.hidden = true;
    });
}

function matchesHistorySearch(item, search) {
  if (!search) return true;
  const normalizedSearch = normalizeSearchText(search);
  const amountQuery = parseMoneyValue(search);
  const receiptItems = Array.isArray(item.receipt?.items)
    ? item.receipt.items.map((entry) => typeof entry === "string" ? entry : `${entry.name || entry.nombre || ""} ${entry.amount || entry.precio || ""}`).join(" ")
    : "";
  const haystack = normalizeSearchText([
    item.merchant,
    item.note,
    item.date,
    item.type,
    categoryName(item.category),
    money(item.amount),
    String(Math.abs(Number(item.amount || 0))),
    receiptItems,
  ].join(" "));

  if (haystack.includes(normalizedSearch)) return true;
  if (amountQuery > 0 && Math.abs(Math.abs(Number(item.amount || 0)) - amountQuery) < 0.01) return true;
  return normalizedSearch.split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[₡,._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function renderMovementRow(item) {
  const config = {
    income: { sign: "+", className: "income", label: "Ingreso" },
    expense: { sign: "-", className: "expense", label: "Gasto" },
    saving: { sign: item.amount < 0 ? "←" : "→", className: "saving", label: item.amount < 0 ? "Retiro de ahorro" : "Ahorro" },
  }[item.type];

  return `
    <article class="movement-row">
      <div>
        <strong>${escapeHtml(item.merchant || categoryName(item.category))}</strong>
        <p>${displayDate(item.date)} · ${config.label} · ${categoryName(item.category)}${item.note ? ` · ${escapeHtml(item.note)}` : ""}</p>
      </div>
      <div class="movement-side">
        <strong class="${config.className}">${config.sign}${money(Math.abs(item.amount))}</strong>
        <div class="row-actions">
          <button class="mini-button icon-button-small" data-action="edit-movement" data-id="${item.id}" aria-label="Editar movimiento" title="Editar">✏️</button>
          <button class="mini-button icon-button-small danger" data-action="delete-movement" data-id="${item.id}" aria-label="Eliminar movimiento" title="Eliminar">🗑️</button>
        </div>
      </div>
    </article>
  `;
}

function getMonthMovements() {
  const key = monthKey(state.activeMonth);
  return getMovementsForMonthKey(key);
}

function getMovementsForMonthKey(key) {
  return state.data.movements.filter((item) => item.date.startsWith(key));
}

function isDueOrPast(date) {
  return String(date || "") <= toInputDate(new Date());
}

function isPastDue(date) {
  return String(date || "") < toInputDate(new Date());
}

function addMonths(dateValue, months) {
  const date = new Date(`${dateValue}T12:00:00`);
  const day = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() !== day) date.setDate(0);
  return toInputDate(date);
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
  const categoryId = normalizeCategory(id);
  return categories.find((category) => category.id === categoryId)?.name || "Otros";
}

function categoryColor(id) {
  const categoryId = normalizeCategory(id);
  return categories.find((category) => category.id === categoryId)?.color || "#6f8279";
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
    maximumFractionDigits: 2,
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
