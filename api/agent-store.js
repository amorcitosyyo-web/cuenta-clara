// Structured mirror for the autonomous agent.  The legacy JSON remains the
// rollback source until the migration check has explicitly enabled this mirror
// for the household.  Every payload is normalized from the same state object,
// so web and Telegram cannot diverge.

function headers() {
  return { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" };
}

async function upsert(table, rows, conflict = "id") {
  if (!rows?.length) return;
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, { method: "POST", headers: headers(), body: JSON.stringify(rows) });
  if (!response.ok) throw new Error(`No pude sincronizar ${table}.`);
}

function safeDate(value, fallback = new Date().toISOString().slice(0, 10)) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value).slice(0, 10) : fallback;
}

async function syncStructuredState(householdId, state) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const now = new Date().toISOString();
  await upsert("agent_households", [{ id: householdId, name: state.agentMemory?.householdProfile?.name || "Cuenta Clara", timezone: "America/Costa_Rica", updated_at: now }]);
  const categories = (state.customCategories || []).map((item) => ({ id: item.id, household_id: householdId, name: item.name, kind: item.kind === "income" ? "income" : "expense", keywords: item.keywords || [], color: item.color || null, updated_at: now }));
  await upsert("agent_categories", categories);
  const accounts = (state.accounts || []).map((item) => ({ id: item.id, household_id: householdId, name: item.name, account_type: item.type || "bank", purpose: item.purpose || "", minimum_balance: Number(item.minimumBalance || 0), target_balance: Number(item.targetBalance || 0), active: item.active !== false, metadata: item, updated_at: now }));
  await upsert("agent_accounts", accounts);
  const cards = (state.cards || []).map((item) => ({ id: item.id, household_id: householdId, name: item.name, purpose: item.purpose || "", payment_account_id: item.paymentAccountId || null, cutoff_day: item.cutoffDay || null, due_day: item.dueDay || null, annual_rate: Number(item.rate || 0), active: item.active !== false, metadata: item, updated_at: now }));
  await upsert("agent_cards", cards);
  const balances = (state.accountBalances || []).map((item) => ({ id: item.id, household_id: householdId, account_id: item.accountId, balance: Number(item.balance || 0), snapshot_date: safeDate(item.date), cycle_id: item.cycle || null, reported_by: item.reportedBy || "shared", created_at: item.createdAt || now }));
  await upsert("agent_balance_snapshots", balances);
  const movements = (state.movements || []).map((item) => ({ id: item.id, household_id: householdId, movement_type: item.type === "income" || item.type === "saving" ? item.type : "expense", amount: Number(item.amount || 0), movement_date: safeDate(item.date), category_id: item.category || null, merchant: item.merchant || "", note: item.note || "", source: item.source || "manual", source_id: item.sourceId || null, account_id: item.accountId || null, card_id: item.cardId || null, saving_account_id: item.savingAccountId || null, scheduled_payment_id: item.scheduledPaymentId || null, plan_cycle: item.planCycle || null, income_kind: item.incomeKind || null, classification: item.classification || {}, metadata: item, created_at: item.createdAt || now, updated_at: item.updatedAt || now }));
  await upsert("agent_movements", movements);
  const budgets = (state.budgetHistory || []).map((item) => ({ id: item.id, household_id: householdId, category_id: item.categoryId, amount: Number(item.amount || 0), effective_from: item.effectiveFrom, updated_at: now }));
  await upsert("agent_budgets", budgets);
  const goals = (state.savingsAccounts || []).map((item) => ({ id: item.id, household_id: householdId, name: item.name, target: Number(item.target || 0), target_date: item.targetDate || null, priority: item.priority || null, metadata: item, updated_at: now }));
  await upsert("agent_saving_goals", goals);
  const payments = (state.scheduledPayments || []).map((item) => ({ id: item.id, household_id: householdId, name: item.name, amount: Number(item.amount || 0), due_date: safeDate(item.dueDate), category_id: item.category || null, note: item.note || "", repeat_rule: item.repeat === "monthly" ? "monthly" : "once", active: item.active !== false, paid_months: item.paidMonths || [], metadata: item, updated_at: now }));
  await upsert("agent_scheduled_payments", payments);
  const plans = (state.monthlyPlans || []).map((item) => ({ id: item.id, household_id: householdId, cycle_id: item.cycle, status: item.status || "draft", salary_planned: Number(item.salaryPlanned || 0), commission_planned: Number(item.commissionPlanned || 0), sections: item.sections || {}, updated_at: now }));
  await upsert("agent_monthly_plans", plans, "household_id,cycle_id");
  const incomePlans = (state.incomePlans || []).map((item) => ({ id: item.id, household_id: householdId, cycle_id: item.cycle, income_kind: item.incomeKind || "other", amount: Number(item.amount || 0), status: item.status || "planned", account_id: item.accountId || null, metadata: item, confirmed_at: item.confirmedAt || null }));
  await upsert("agent_income_plans", incomePlans);
  const transfers = (state.plannedTransfers || []).map((item) => ({ id: item.id, household_id: householdId, from_account_id: item.fromAccountId || null, to_account_id: item.toAccountId || null, amount: Number(item.amount || 0), purpose: item.purpose || "", cycle_id: item.cycle || null, status: item.status || "planned", confirmed_at: item.confirmedAt || null }));
  await upsert("agent_transfers", transfers);
  const receipts = (state.receiptRecords || []).filter((item) => item?.id).map((item) => ({ id: item.id, household_id: householdId, movement_id: item.movementId || null, storage_path: item.path || null, filename: item.filename || null, mime_type: item.mimeType || null, extracted_text: item.extractedText || null, total: item.total || null, taxes: item.taxes || null, expires_at: item.retentionUntil || new Date(Date.now() + 365 * 86400000).toISOString(), metadata: item }));
  await upsert("agent_receipts", receipts);
  const audit = (state.auditLog || []).slice(-500).map((item) => ({ id: item.id, household_id: householdId, actor: item.actor || "shared", channel: item.channel || "agent", action: item.action || "unknown", target_id: item.targetId || null, idempotency_key: item.idempotencyKey || null, after_state: item.result || null, created_at: item.at || now }));
  await upsert("agent_audit_log", audit);
  const trash = (state.trash || []).map((item) => ({ id: item.id, household_id: householdId, record_type: item.type, record: item.record, deleted_by: item.actor || "shared", deleted_at: item.deletedAt || now, expires_at: item.expiresAt || now }));
  await upsert("agent_trash", trash);
  await upsert("agent_memory", [{ household_id: householdId, profile: state.agentMemory?.householdProfile || {}, merchant_rules: state.merchantRules || [], preferences: state.agentMemory?.automationSettings || {}, updated_at: now }], "household_id");
}

module.exports = { syncStructuredState };
