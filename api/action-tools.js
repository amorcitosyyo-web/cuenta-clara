// Operaciones mutables de Cuenta Clara. Todas las acciones reciben el estado
// normalizado y devuelven { state, result }. La capa conversacional decide si
// la accion necesita autorizacion antes de llamar a este modulo.
const { makeId, getCategories, learnRule } = require("./_agent");

function executeAction(state, action) {
  const type = String(action?.type || "");
  let output;
  switch (type) {
    case "create_movement": output = createMovement(state, action); break;
    case "update_movement": output = updateMovement(state, action); break;
    case "delete_movement": output = deleteMovement(state, action); break;
    case "restore_trash": output = restoreTrash(state, action); break;
    case "create_category": output = createCategory(state, action); break;
    case "update_category": output = updateCategory(state, action); break;
    case "delete_category": output = deleteCategory(state, action); break;
    case "set_budget": output = setBudget(state, action); break;
    case "create_saving_goal": output = createSavingGoal(state, action); break;
    case "update_saving_goal": output = updateSavingGoal(state, action); break;
    case "delete_saving_goal": output = deleteSavingGoal(state, action); break;
    case "transfer_saving": output = transferSaving(state, action); break;
    case "create_scheduled_payment": output = createScheduledPayment(state, action); break;
    case "mark_scheduled_paid": output = markScheduledPaid(state, action); break;
    case "delete_scheduled_payment": output = deleteScheduledPayment(state, action); break;
    case "accept_pending": output = acceptPending(state, action); break;
    case "delete_pending": output = deletePending(state, action); break;
    case "create_account": output = createAccount(state, action); break;
    case "update_account": output = updateAccount(state, action); break;
    case "record_account_balance": output = recordAccountBalance(state, action); break;
    case "create_card": output = createCard(state, action); break;
    case "update_card": output = updateCard(state, action); break;
    case "record_card_statement": output = recordCardStatement(state, action); break;
    case "record_income": output = recordIncome(state, action); break;
    case "plan_transfer": output = planTransfer(state, action); break;
    case "confirm_transfer": output = confirmTransfer(state, action); break;
    case "create_monthly_plan": output = createMonthlyPlan(state, action); break;
    case "update_monthly_plan": output = updateMonthlyPlan(state, action); break;
    default: throw new Error("Accion no reconocida: " + type);
  }
  writeAudit(state, action, output.result);
  return output;
}

function movementInput(action, fallback = {}) {
  const input = { ...fallback, ...(action.data || action) };
  const type = input.type === "income" ? "income" : input.type === "saving" ? "saving" : "expense";
  const amount = Number(input.amount || 0);
  if (!(amount > 0)) throw new Error("El monto debe ser mayor que cero.");
  if (!input.date) throw new Error("Falta la fecha del movimiento.");
  return {
    id: fallback.id || makeId(), type, amount, date: String(input.date).slice(0, 10),
    category: String(input.category || (type === "income" ? "ingreso" : "imprevistos")),
    merchant: String(input.merchant || input.name || "").trim(),
    note: String(input.note || "").trim(),
    receipt: input.receipt || fallback.receipt || null,
    savingAccountId: input.savingAccountId || fallback.savingAccountId || null,
    scheduledPaymentId: input.scheduledPaymentId || fallback.scheduledPaymentId || null,
    scheduledMonth: input.scheduledMonth || fallback.scheduledMonth || null,
    source: input.source || fallback.source || "manual",
    accountId: input.accountId || fallback.accountId || null,
    transferId: input.transferId || fallback.transferId || null,
    incomeKind: input.incomeKind || fallback.incomeKind || null,
    planCycle: input.planCycle || fallback.planCycle || null,
    receiptItems: Array.isArray(input.receiptItems) ? input.receiptItems : (fallback.receiptItems || []),
    updatedAt: new Date().toISOString(),
    createdAt: fallback.createdAt || new Date().toISOString(),
  };
}

function createMovement(state, action) {
  const movement = movementInput(action);
  state.movements.unshift(movement);
  return { state, result: movement };
}

function updateMovement(state, action) {
  const index = state.movements.findIndex((item) => item.id === action.id);
  if (index < 0) throw new Error("No encontré ese movimiento.");
  state.movements[index] = movementInput(action, state.movements[index]);
  return { state, result: state.movements[index] };
}

function deleteMovement(state, action) {
  const index = state.movements.findIndex((item) => item.id === action.id);
  if (index < 0) throw new Error("No encontré ese movimiento.");
  const [removed] = state.movements.splice(index, 1);
  putInTrash(state, "movement", removed, action);
  return { state, result: removed };
}

function createCategory(state, action) {
  const name = String(action.name || action.data?.name || "").trim();
  if (!name) throw new Error("Falta el nombre de la categoría.");
  const category = { id: `custom-${makeId()}`, name, kind: action.kind === "income" ? "income" : "expense", keywords: action.keywords || [], color: action.color || "#b9d9c4" };
  state.customCategories.push(category);
  return { state, result: category };
}

function updateCategory(state, action) {
  const category = state.customCategories.find((item) => item.id === action.id);
  if (!category) throw new Error("Solo se pueden editar categorías personalizadas.");
  if (action.name) category.name = String(action.name).trim();
  if (Array.isArray(action.keywords)) category.keywords = action.keywords;
  return { state, result: category };
}

function deleteCategory(state, action) {
  const category = state.customCategories.find((item) => item.id === action.id);
  if (!category) throw new Error("Solo se pueden eliminar categorías personalizadas.");
  state.customCategories = state.customCategories.filter((item) => item.id !== action.id);
  state.movements.forEach((movement) => { if (movement.category === action.id) movement.category = "imprevistos"; });
  putInTrash(state, "category", category, action);
  return { state, result: category };
}

function setBudget(state, action) {
  const categoryId = String(action.categoryId || action.category || "");
  const amount = Number(action.amount || action.limit || 0);
  if (!categoryId || amount < 0) throw new Error("Faltan categoría o límite mensual válido.");
  const month = String(action.month || new Date().toISOString().slice(0, 7));
  const history = Array.isArray(state.budgetHistory) ? state.budgetHistory : [];
  const existing = history.find((entry) => entry.categoryId === categoryId && entry.effectiveFrom === month);
  if (existing) existing.amount = amount;
  else history.push({ id: makeId(), categoryId, amount, effectiveFrom: month, createdAt: new Date().toISOString() });
  state.budgetHistory = history;
  state.budgets = { ...(state.budgets || {}), [categoryId]: amount };
  return { state, result: { month, categoryId, amount } };
}

function createSavingGoal(state, action) {
  const goal = { id: makeId(), name: String(action.name || "Meta").trim(), target: Number(action.target || 0), createdAt: new Date().toISOString() };
  if (!(goal.target > 0)) throw new Error("El objetivo debe ser mayor que cero.");
  state.savingsAccounts.push(goal);
  return { state, result: goal };
}

function updateSavingGoal(state, action) {
  const goal = state.savingsAccounts.find((item) => item.id === action.id);
  if (!goal) throw new Error("No encontré esa meta.");
  if (action.name) goal.name = String(action.name).trim();
  if (action.target !== undefined) goal.target = Number(action.target);
  return { state, result: goal };
}

function deleteSavingGoal(state, action) {
  const goal = state.savingsAccounts.find((item) => item.id === action.id);
  if (!goal) throw new Error("No encontré esa meta.");
  state.savingsAccounts = state.savingsAccounts.filter((item) => item.id !== action.id);
  const related = state.movements.filter((item) => item.savingAccountId === action.id);
  state.movements = state.movements.filter((item) => item.savingAccountId !== action.id);
  putInTrash(state, "saving_goal", { goal, related }, action);
  return { state, result: goal };
}

function transferSaving(state, action) {
  const account = state.savingsAccounts.find((item) => item.id === action.accountId);
  if (!account) throw new Error("No encontré esa meta de ahorro.");
  const amount = Math.abs(Number(action.amount || 0));
  if (!(amount > 0)) throw new Error("El monto debe ser mayor que cero.");
  const movement = movementInput({ ...action, amount, type: "saving", category: "ahorro", merchant: account.name });
  if (action.direction === "withdraw" || Number(action.amount) < 0) movement.amount = -amount;
  movement.savingAccountId = account.id;
  state.movements.unshift(movement);
  return { state, result: movement };
}

function createScheduledPayment(state, action) {
  const payment = { id: makeId(), name: String(action.name || "").trim(), amount: Number(action.amount || 0), dueDate: String(action.dueDate || action.date || "").slice(0, 10), category: String(action.category || "imprevistos"), note: String(action.note || ""), repeat: action.repeat === "monthly" ? "monthly" : "once", active: true, paidMonths: [] };
  if (!payment.name || !(payment.amount > 0) || !payment.dueDate) throw new Error("Faltan nombre, monto o fecha del gasto programado.");
  state.scheduledPayments.push(payment);
  return { state, result: payment };
}

function markScheduledPaid(state, action) {
  const payment = state.scheduledPayments.find((item) => item.id === action.id);
  if (!payment) throw new Error("No encontré ese gasto programado.");
  const month = String(action.month || new Date().toISOString().slice(0, 7));
  if ((payment.paidMonths || []).includes(month)) return { state, result: payment };
  payment.paidMonths = Array.from(new Set([...(payment.paidMonths || []), month]));
  const date = scheduledDateForMonth(payment.dueDate, month);
  const movement = movementInput({
    type: "expense", amount: payment.amount, date, category: payment.category,
    merchant: payment.name, note: payment.note || "Pago programado",
    scheduledPaymentId: payment.id, scheduledMonth: month, source: "scheduled",
  });
  state.movements.unshift(movement);
  return { state, result: { payment, movement } };
}

function scheduledDateForMonth(dueDate, month) {
  const day = Math.max(1, Math.min(31, Number(String(dueDate || "").slice(8, 10)) || 1));
  const [year, numericMonth] = String(month).split("-").map(Number);
  const lastDay = new Date(year, numericMonth, 0).getDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function deleteScheduledPayment(state, action) {
  const payment = state.scheduledPayments.find((item) => item.id === action.id);
  if (!payment) throw new Error("No encontré ese gasto programado.");
  state.scheduledPayments = state.scheduledPayments.filter((item) => item.id !== action.id);
  putInTrash(state, "scheduled_payment", payment, action);
  return { state, result: payment };
}

function acceptPending(state, action) {
  const index = state.pendingMovements.findIndex((item) => item.id === action.id);
  if (index < 0) throw new Error("No encontré ese pendiente.");
  const [item] = state.pendingMovements.splice(index, 1);
  item.classification = { ...(item.classification || {}), status: "approved", confidence: 1, source: "agent" };
  state.movements.unshift(item);
  return { state, result: item };
}

function deletePending(state, action) {
  const index = state.pendingMovements.findIndex((item) => item.id === action.id);
  if (index < 0) throw new Error("No encontré ese pendiente.");
  const [removed] = state.pendingMovements.splice(index, 1);
  return { state, result: removed };
}

function createAccount(state, action) {
  const data = action.data || action;
  const name = String(data.name || "").trim();
  if (!name) throw new Error("Falta el nombre de la cuenta.");
  const account = {
    id: makeId(), name, type: String(data.accountType || data.type || "bank"),
    purpose: String(data.purpose || "").trim(), minimumBalance: Number(data.minimumBalance || 0),
    targetBalance: Number(data.targetBalance || 0), associatedPayments: data.associatedPayments || [],
    associatedIncome: data.associatedIncome || [], active: true, createdAt: new Date().toISOString(),
  };
  state.accounts.push(account);
  return { state, result: account };
}

function updateAccount(state, action) {
  const account = state.accounts.find((item) => item.id === action.id);
  if (!account) throw new Error("No encontré esa cuenta.");
  const data = action.data || action;
  ["name", "purpose", "type", "accountType"].forEach((key) => {
    if (data[key] !== undefined) account[key === "accountType" ? "type" : key] = String(data[key]).trim();
  });
  ["minimumBalance", "targetBalance"].forEach((key) => { if (data[key] !== undefined) account[key] = Number(data[key]); });
  if (Array.isArray(data.associatedPayments)) account.associatedPayments = data.associatedPayments;
  if (Array.isArray(data.associatedIncome)) account.associatedIncome = data.associatedIncome;
  account.updatedAt = new Date().toISOString();
  return { state, result: account };
}

function recordAccountBalance(state, action) {
  const account = state.accounts.find((item) => item.id === action.accountId);
  if (!account) throw new Error("No encontré esa cuenta.");
  const balance = Number(action.balance);
  if (!Number.isFinite(balance)) throw new Error("El saldo no es válido.");
  const snapshot = { id: makeId(), accountId: account.id, balance, date: String(action.date || new Date().toISOString().slice(0, 10)).slice(0, 10), cycle: action.cycle || null, reportedBy: action.actor || "shared", createdAt: new Date().toISOString() };
  state.accountBalances.push(snapshot);
  return { state, result: snapshot };
}

function createCard(state, action) {
  const data = action.data || action;
  const name = String(data.name || "").trim();
  if (!name) throw new Error("Falta el nombre de la tarjeta.");
  const card = { id: makeId(), name, purpose: String(data.purpose || "").trim(), paymentAccountId: data.paymentAccountId || null, cutoffDay: Number(data.cutoffDay || 0) || null, dueDay: Number(data.dueDay || 0) || null, rate: Number(data.rate || 0), active: true, installments: [], statements: [], createdAt: new Date().toISOString() };
  state.cards.push(card);
  return { state, result: card };
}

function updateCard(state, action) {
  const card = state.cards.find((item) => item.id === action.id);
  if (!card) throw new Error("No encontré esa tarjeta.");
  const data = action.data || action;
  ["name", "purpose", "paymentAccountId"].forEach((key) => { if (data[key] !== undefined) card[key] = String(data[key] || "").trim() || null; });
  ["cutoffDay", "dueDay", "rate"].forEach((key) => { if (data[key] !== undefined) card[key] = Number(data[key]) || null; });
  if (Array.isArray(data.installments)) card.installments = data.installments;
  card.updatedAt = new Date().toISOString();
  return { state, result: card };
}

function recordCardStatement(state, action) {
  const card = state.cards.find((item) => item.id === action.cardId);
  if (!card) throw new Error("No encontré esa tarjeta.");
  const statement = { id: makeId(), month: String(action.month || new Date().toISOString().slice(0, 7)), totalBalance: Number(action.totalBalance || 0), statementBalance: Number(action.statementBalance || 0), minimumPayment: Number(action.minimumPayment || 0), dueDate: String(action.dueDate || ""), reportedAt: new Date().toISOString() };
  card.statements = [...(card.statements || []).filter((item) => item.month !== statement.month), statement];
  return { state, result: statement };
}

function recordIncome(state, action) {
  const data = action.data || action;
  const movement = movementInput({ ...data, type: "income", category: data.category || "ingreso", source: data.source || "manual", incomeKind: data.incomeKind || "other" });
  state.movements.unshift(movement);
  return { state, result: movement };
}

function planTransfer(state, action) {
  const amount = Number(action.amount || 0);
  if (!(amount > 0) || !action.fromAccountId || !action.toAccountId) throw new Error("Faltan cuenta origen, destino o monto.");
  const transfer = { id: makeId(), fromAccountId: action.fromAccountId, toAccountId: action.toAccountId, amount, purpose: String(action.purpose || ""), cycle: action.cycle || null, status: "planned", createdAt: new Date().toISOString() };
  state.plannedTransfers.push(transfer);
  return { state, result: transfer };
}

function confirmTransfer(state, action) {
  const transfer = state.plannedTransfers.find((item) => item.id === action.id);
  if (!transfer) throw new Error("No encontré esa transferencia planificada.");
  transfer.status = "confirmed"; transfer.confirmedAt = new Date().toISOString(); transfer.confirmedBy = action.actor || "shared";
  return { state, result: transfer };
}

function createMonthlyPlan(state, action) {
  const data = action.data || action;
  const cycle = String(data.cycle || "");
  if (!cycle) throw new Error("Falta el ciclo del plan.");
  const plan = { id: makeId(), cycle, status: "draft", salaryPlanned: Number(data.salaryPlanned || 0), commissionPlanned: Number(data.commissionPlanned || 0), sections: data.sections || {}, createdAt: new Date().toISOString() };
  state.monthlyPlans.push(plan);
  return { state, result: plan };
}

function updateMonthlyPlan(state, action) {
  const plan = state.monthlyPlans.find((item) => item.id === action.id);
  if (!plan) throw new Error("No encontré ese plan mensual.");
  const data = action.data || action;
  Object.assign(plan, data, { id: plan.id, updatedAt: new Date().toISOString() });
  return { state, result: plan };
}

function putInTrash(state, type, record, action) {
  state.trash = Array.isArray(state.trash) ? state.trash : [];
  state.trash.push({ id: makeId(), type, record, deletedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), actor: action.actor || "shared" });
}

function restoreTrash(state, action) {
  const index = state.trash.findIndex((item) => item.id === action.id);
  if (index < 0) throw new Error("No encontré ese elemento en la papelera.");
  const [entry] = state.trash.splice(index, 1);
  if (entry.type === "movement") state.movements.unshift(entry.record);
  else if (entry.type === "category") state.customCategories.push(entry.record);
  else if (entry.type === "saving_goal") { state.savingsAccounts.push(entry.record.goal); state.movements.push(...(entry.record.related || [])); }
  else if (entry.type === "scheduled_payment") state.scheduledPayments.push(entry.record);
  else throw new Error("Ese tipo de elemento no se puede restaurar.");
  return { state, result: entry.record };
}

function writeAudit(state, action, result) {
  state.auditLog = Array.isArray(state.auditLog) ? state.auditLog : [];
  state.auditLog.push({ id: makeId(), action: String(action.type || "unknown"), actor: action.actor || "shared", channel: action.channel || "agent", targetId: result?.id || action.id || null, at: new Date().toISOString(), idempotencyKey: action.idempotencyKey || null });
  state.auditLog = state.auditLog.slice(-500);
}

module.exports = { executeAction };
