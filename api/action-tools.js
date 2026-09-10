// Operaciones mutables de Cuenta Clara. Todas las acciones reciben el estado
// normalizado y devuelven { state, result }. La capa conversacional decide si
// la accion necesita autorizacion antes de llamar a este modulo.
const { makeId, getCategories, learnRule } = require("./_agent");

function executeAction(state, action) {
  const type = String(action?.type || "");
  switch (type) {
    case "create_movement": return createMovement(state, action);
    case "update_movement": return updateMovement(state, action);
    case "delete_movement": return deleteMovement(state, action);
    case "create_category": return createCategory(state, action);
    case "update_category": return updateCategory(state, action);
    case "delete_category": return deleteCategory(state, action);
    case "set_budget": return setBudget(state, action);
    case "create_saving_goal": return createSavingGoal(state, action);
    case "update_saving_goal": return updateSavingGoal(state, action);
    case "delete_saving_goal": return deleteSavingGoal(state, action);
    case "transfer_saving": return transferSaving(state, action);
    case "create_scheduled_payment": return createScheduledPayment(state, action);
    case "mark_scheduled_paid": return markScheduledPaid(state, action);
    case "delete_scheduled_payment": return deleteScheduledPayment(state, action);
    case "accept_pending": return acceptPending(state, action);
    case "delete_pending": return deletePending(state, action);
    default: throw new Error("Accion no reconocida: " + type);
  }
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
  if (["imprevistos", "ingreso"].includes(action.id)) throw new Error("Esa categoría protegida no se puede eliminar.");
  const categories = getCategories(state);
  if (!categories.some((item) => item.id === action.id)) throw new Error("No encontré esa categoría.");
  state.customCategories = state.customCategories.filter((item) => item.id !== action.id);
  state.movements.forEach((movement) => { if (movement.category === action.id) movement.category = "imprevistos"; });
  return { state, result: { id: action.id } };
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
  state.movements = state.movements.filter((item) => item.savingAccountId !== action.id);
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

module.exports = { executeAction };
