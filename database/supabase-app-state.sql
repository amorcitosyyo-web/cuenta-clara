create table if not exists app_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table app_states enable row level security;

drop policy if exists "Users can read their own app state" on app_states;
create policy "Users can read their own app state"
on app_states for select
using (auth.uid() = user_id);

drop policy if exists "Users can create their own app state" on app_states;
create policy "Users can create their own app state"
on app_states for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own app state" on app_states;
create policy "Users can update their own app state"
on app_states for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function set_app_states_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists app_states_updated_at on app_states;
create trigger app_states_updated_at
before update on app_states
for each row
execute function set_app_states_updated_at();
