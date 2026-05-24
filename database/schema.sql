create extension if not exists "pgcrypto";

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'CRC',
  created_at timestamptz not null default now()
);

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null,
  display_name text not null,
  email text,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('income', 'expense', 'saving', 'both')),
  color text not null default '#116149',
  created_at timestamptz not null default now()
);

create table savings_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  target_amount integer not null default 0 check (target_amount >= 0),
  created_at timestamptz not null default now()
);

create table movements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'saving')),
  amount integer not null check (amount >= 0),
  movement_date date not null,
  category_id uuid references categories(id) on delete set null,
  savings_account_id uuid references savings_accounts(id) on delete set null,
  merchant text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references movements(id) on delete cascade,
  image_path text,
  detected_merchant text,
  detected_date date,
  detected_total integer,
  raw_text text,
  created_at timestamptz not null default now()
);

create table receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  name text not null,
  amount integer,
  suggested_category_id uuid references categories(id) on delete set null
);

create table budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  month date not null,
  amount integer not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (household_id, category_id, month)
);

create index movements_household_month_idx on movements (household_id, movement_date);
create index budgets_household_month_idx on budgets (household_id, month);
create index savings_accounts_household_idx on savings_accounts (household_id);
