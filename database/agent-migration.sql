-- Cuenta Clara Agent - additive, idempotent migration.
-- Run this in Supabase SQL Editor before enabling AGENT_STRUCTURED_STORAGE=true.
-- It never drops app_states.  Existing JSON remains the recoverable source
-- until the verification query at the end reports matching totals.

create table if not exists public.agent_households (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Cuenta Clara',
  timezone text not null default 'America/Costa_Rica',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.agent_households(id) on delete cascade,
  telegram_user_id text,
  display_name text not null,
  role text not null default 'member' check (role in ('member','owner')),
  created_at timestamptz not null default now(),
  unique (household_id, telegram_user_id)
);

create table if not exists public.agent_accounts (
  id text primary key,
  household_id uuid not null references public.agent_households(id) on delete cascade,
  name text not null,
  account_type text not null default 'bank',
  purpose text not null default '',
  minimum_balance numeric not null default 0,
  target_balance numeric not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_cards (
  id text primary key,
  household_id uuid not null references public.agent_households(id) on delete cascade,
  name text not null,
  purpose text not null default '',
  payment_account_id text references public.agent_accounts(id) on delete set null,
  cutoff_day integer,
  due_day integer,
  annual_rate numeric not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_balance_snapshots (
  id text primary key,
  household_id uuid not null references public.agent_households(id) on delete cascade,
  account_id text not null references public.agent_accounts(id) on delete cascade,
  balance numeric not null,
  snapshot_date date not null,
  cycle_id text,
  reported_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_categories (
  id text primary key,
  household_id uuid not null references public.agent_households(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('expense','income')),
  keywords jsonb not null default '[]'::jsonb,
  color text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_movements (
  id text primary key,
  household_id uuid not null references public.agent_households(id) on delete cascade,
  movement_type text not null check (movement_type in ('expense','income','saving')),
  amount numeric not null,
  movement_date date not null,
  category_id text,
  merchant text not null default '',
  note text not null default '',
  source text not null default 'manual',
  source_id text,
  account_id text references public.agent_accounts(id) on delete set null,
  card_id text references public.agent_cards(id) on delete set null,
  saving_account_id text,
  scheduled_payment_id text,
  plan_cycle text,
  income_kind text,
  classification jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agent_movements_source_unique on public.agent_movements(household_id, source, source_id) where source_id is not null;
create index if not exists agent_movements_household_date on public.agent_movements(household_id, movement_date desc);

create table if not exists public.agent_budgets (
  id text primary key,
  household_id uuid not null references public.agent_households(id) on delete cascade,
  category_id text not null,
  amount numeric not null,
  effective_from text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(household_id, category_id, effective_from)
);

create table if not exists public.agent_saving_goals (
  id text primary key,
  household_id uuid not null references public.agent_households(id) on delete cascade,
  name text not null,
  target numeric not null,
  target_date date,
  priority integer,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_scheduled_payments (
  id text primary key,
  household_id uuid not null references public.agent_households(id) on delete cascade,
  name text not null,
  amount numeric not null,
  due_date date not null,
  category_id text,
  note text not null default '',
  repeat_rule text not null default 'once',
  active boolean not null default true,
  paid_months jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agent_scheduled_payments add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.agent_income_plans (
  id text primary key,
  household_id uuid not null references public.agent_households(id) on delete cascade,
  cycle_id text not null,
  income_kind text not null,
  amount numeric not null,
  status text not null default 'planned' check(status in ('planned','confirmed','cancelled')),
  account_id text references public.agent_accounts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table if not exists public.agent_transfers (
  id text primary key,
  household_id uuid not null references public.agent_households(id) on delete cascade,
  from_account_id text references public.agent_accounts(id) on delete set null,
  to_account_id text references public.agent_accounts(id) on delete set null,
  amount numeric not null,
  purpose text not null default '',
  cycle_id text,
  status text not null default 'planned' check(status in ('planned','confirmed','cancelled')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table if not exists public.agent_monthly_plans (
  id text primary key,
  household_id uuid not null references public.agent_households(id) on delete cascade,
  cycle_id text not null,
  status text not null default 'draft' check(status in ('draft','approved','confirmed','cancelled')),
  salary_planned numeric not null default 0,
  commission_planned numeric not null default 0,
  sections jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(household_id, cycle_id)
);

create table if not exists public.agent_receipts (
  id text primary key,
  household_id uuid not null references public.agent_households(id) on delete cascade,
  movement_id text references public.agent_movements(id) on delete set null,
  storage_path text,
  filename text,
  mime_type text,
  extracted_text text,
  total numeric,
  taxes numeric,
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id text not null references public.agent_receipts(id) on delete cascade,
  name text not null,
  quantity numeric,
  amount numeric,
  category_id text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.agent_tasks (
  id text primary key,
  household_id uuid not null references public.agent_households(id) on delete cascade,
  channel text not null,
  conversation_id text not null,
  kind text not null,
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(household_id, channel, conversation_id)
);

create table if not exists public.agent_memory (
  household_id uuid primary key references public.agent_households(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  merchant_rules jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_audit_log (
  id text primary key,
  household_id uuid not null references public.agent_households(id) on delete cascade,
  actor text not null,
  channel text not null,
  action text not null,
  target_id text,
  idempotency_key text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_trash (
  id text primary key,
  household_id uuid not null references public.agent_households(id) on delete cascade,
  record_type text not null,
  record jsonb not null,
  deleted_by text not null,
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Private bucket used by the document processor. Service-role API calls write
-- files; direct public reads are deliberately not enabled.
insert into storage.buckets (id, name, public) values ('agent-documents', 'agent-documents', false) on conflict (id) do nothing;

-- Preserve a recoverable snapshot before the application starts writing the
-- new tables. This is idempotent per owner/date and does not mutate app_states.
create table if not exists public.agent_migration_backups (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null,
  created_at timestamptz not null default now()
);

-- Copy the existing JSON state into the additive tables.  These statements
-- are safe to re-run: records retain their legacy IDs and use upserts.  The
-- legacy app_states row is intentionally left untouched until verification.
insert into public.agent_households (id, name)
select user_id, coalesce(nullif(data #>> '{agentMemory,householdProfile,name}', ''), 'Cuenta Clara')
from public.app_states
on conflict (id) do nothing;

insert into public.agent_migration_backups (household_id, state)
select user_id, data from public.app_states;

insert into public.agent_categories (id, household_id, name, kind, keywords, color, created_at, updated_at)
select category->>'id', app.user_id, category->>'name',
       case when category->>'kind' = 'income' then 'income' else 'expense' end,
       coalesce(category->'keywords', '[]'::jsonb), category->>'color', now(), now()
from public.app_states app
cross join lateral jsonb_array_elements(coalesce(app.data->'customCategories', '[]'::jsonb)) category
where coalesce(category->>'id', '') <> '' and coalesce(category->>'name', '') <> ''
on conflict (id) do update set name = excluded.name, keywords = excluded.keywords, color = excluded.color, updated_at = now();

insert into public.agent_accounts (id, household_id, name, account_type, purpose, minimum_balance, target_balance, metadata)
select account->>'id', app.user_id, account->>'name', coalesce(nullif(account->>'type', ''), 'bank'),
       coalesce(account->>'purpose', ''), coalesce((account->>'minimumBalance')::numeric, 0),
       coalesce((account->>'targetBalance')::numeric, 0), account
from public.app_states app
cross join lateral jsonb_array_elements(coalesce(app.data->'accounts', '[]'::jsonb)) account
where coalesce(account->>'id', '') <> '' and coalesce(account->>'name', '') <> ''
on conflict (id) do update set name = excluded.name, account_type = excluded.account_type, purpose = excluded.purpose,
  minimum_balance = excluded.minimum_balance, target_balance = excluded.target_balance, metadata = excluded.metadata, updated_at = now();

insert into public.agent_cards (id, household_id, name, purpose, payment_account_id, cutoff_day, due_day, annual_rate, metadata)
select card->>'id', app.user_id, card->>'name', coalesce(card->>'purpose', ''),
       nullif(card->>'paymentAccountId', ''), nullif(card->>'cutoffDay', '')::integer,
       nullif(card->>'dueDay', '')::integer, coalesce(nullif(card->>'annualRate', '')::numeric, 0), card
from public.app_states app
cross join lateral jsonb_array_elements(coalesce(app.data->'cards', '[]'::jsonb)) card
where coalesce(card->>'id', '') <> '' and coalesce(card->>'name', '') <> ''
on conflict (id) do update set name = excluded.name, purpose = excluded.purpose, payment_account_id = excluded.payment_account_id,
  cutoff_day = excluded.cutoff_day, due_day = excluded.due_day, annual_rate = excluded.annual_rate, metadata = excluded.metadata, updated_at = now();

insert into public.agent_movements (id, household_id, movement_type, amount, movement_date, category_id, merchant, note, source, source_id, account_id, plan_cycle, income_kind, classification, metadata, created_at, updated_at)
select movement->>'id', app.user_id,
       case when movement->>'type' in ('income', 'saving') then movement->>'type' else 'expense' end,
       (movement->>'amount')::numeric, (movement->>'date')::date, nullif(movement->>'category', ''),
       coalesce(movement->>'merchant', ''), coalesce(movement->>'note', ''), coalesce(nullif(movement->>'source', ''), 'manual'),
       nullif(movement->>'sourceId', ''), nullif(movement->>'accountId', ''), nullif(movement->>'planCycle', ''),
       nullif(movement->>'incomeKind', ''), coalesce(movement->'classification', '{}'::jsonb), movement,
       coalesce(nullif(movement->>'createdAt', '')::timestamptz, now()), coalesce(nullif(movement->>'updatedAt', '')::timestamptz, now())
from public.app_states app
cross join lateral jsonb_array_elements(coalesce(app.data->'movements', '[]'::jsonb)) movement
where coalesce(movement->>'id', '') <> '' and coalesce(movement->>'amount', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
  and coalesce(movement->>'date', '') ~ '^\\d{4}-\\d{2}-\\d{2}$'
on conflict (id) do update set amount = excluded.amount, movement_date = excluded.movement_date, category_id = excluded.category_id,
 merchant = excluded.merchant, note = excluded.note, source = excluded.source, source_id = excluded.source_id, account_id = excluded.account_id,
 plan_cycle = excluded.plan_cycle, income_kind = excluded.income_kind, classification = excluded.classification, metadata = excluded.metadata, updated_at = excluded.updated_at;

insert into public.agent_budgets (id, household_id, category_id, amount, effective_from)
select coalesce(nullif(entry->>'id', ''), 'budget-' || app.user_id::text || '-' || entry->>'categoryId' || '-' || entry->>'effectiveFrom'),
 app.user_id, entry->>'categoryId', (entry->>'amount')::numeric, entry->>'effectiveFrom'
from public.app_states app
cross join lateral jsonb_array_elements(coalesce(app.data->'budgetHistory', '[]'::jsonb)) entry
where coalesce(entry->>'categoryId', '') <> '' and coalesce(entry->>'effectiveFrom', '') <> '' and coalesce(entry->>'amount', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
on conflict (id) do update set amount = excluded.amount, effective_from = excluded.effective_from, updated_at = now();

insert into public.agent_saving_goals (id, household_id, name, target, target_date, priority, metadata, created_at, updated_at)
select goal->>'id', app.user_id, goal->>'name', (goal->>'target')::numeric, nullif(goal->>'targetDate', '')::date,
 nullif(goal->>'priority', '')::integer, goal, coalesce(nullif(goal->>'createdAt', '')::timestamptz, now()), now()
from public.app_states app
cross join lateral jsonb_array_elements(coalesce(app.data->'savingsAccounts', '[]'::jsonb)) goal
where coalesce(goal->>'id', '') <> '' and coalesce(goal->>'name', '') <> '' and coalesce(goal->>'target', '') ~ '^[0-9]+(\\.[0-9]+)?$'
on conflict (id) do update set name = excluded.name, target = excluded.target, target_date = excluded.target_date, priority = excluded.priority, metadata = excluded.metadata, updated_at = now();

insert into public.agent_scheduled_payments (id, household_id, name, amount, due_date, category_id, note, repeat_rule, active, paid_months, metadata, created_at, updated_at)
select payment->>'id', app.user_id, payment->>'name', (payment->>'amount')::numeric, (payment->>'dueDate')::date,
 nullif(payment->>'category', ''), coalesce(payment->>'note', ''), case when payment->>'repeat' = 'monthly' then 'monthly' else 'once' end,
 coalesce((payment->>'active')::boolean, true), coalesce(payment->'paidMonths', '[]'::jsonb), payment,
 coalesce(nullif(payment->>'createdAt', '')::timestamptz, now()), now()
from public.app_states app
cross join lateral jsonb_array_elements(coalesce(app.data->'scheduledPayments', '[]'::jsonb)) payment
where coalesce(payment->>'id', '') <> '' and coalesce(payment->>'name', '') <> '' and coalesce(payment->>'amount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
 and coalesce(payment->>'dueDate', '') ~ '^\\d{4}-\\d{2}-\\d{2}$'
on conflict (id) do update set name = excluded.name, amount = excluded.amount, due_date = excluded.due_date, category_id = excluded.category_id,
 note = excluded.note, repeat_rule = excluded.repeat_rule, active = excluded.active, paid_months = excluded.paid_months, metadata = excluded.metadata, updated_at = now();

insert into public.agent_memory (household_id, profile, merchant_rules, preferences, updated_at)
select user_id, coalesce(data #> '{agentMemory,householdProfile}', '{}'::jsonb), coalesce(data->'merchantRules', '[]'::jsonb),
       coalesce(data #> '{agentMemory,automationSettings}', '{}'::jsonb), now()
from public.app_states
on conflict (household_id) do update set profile = excluded.profile, merchant_rules = excluded.merchant_rules, preferences = excluded.preferences, updated_at = now();

-- Verification helper. Execute after importing data; it highlights movement
-- count and totals mismatches instead of silently switching sources.
create or replace function public.agent_migration_check(target_household uuid)
returns table(legacy_count bigint, structured_count bigint, legacy_total numeric, structured_total numeric) language sql stable as $$
  with legacy as (
    select value from public.app_states, lateral jsonb_array_elements(data->'movements') value where user_id = target_household
  ), structured as (select amount from public.agent_movements where household_id = target_household and deleted_at is null)
  select (select count(*) from legacy), (select count(*) from structured),
    coalesce((select sum((value->>'amount')::numeric) from legacy), 0), coalesce((select sum(amount) from structured), 0);
$$;
