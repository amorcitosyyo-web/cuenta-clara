-- Cuenta Clara: memoria persistente de conversaciones del agente.
--
-- Esta tabla es complementaria a app_states y no reemplaza el estado
-- financiero. Guarda únicamente el flujo conversacional por canal/chat:
-- qué especialista está activo, qué datos se recopilaron y qué espera el
-- agente. El servidor debe acceder mediante la service role key; no se
-- exponen estos datos directamente al navegador.

create extension if not exists "pgcrypto";

create table if not exists public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  conversation_id text not null,
  flow_state text not null default 'idle',
  flow_context jsonb not null default '{}'::jsonb,
  recent_messages jsonb not null default '[]'::jsonb,
  last_specialist_called text,
  turns_in_flow integer not null default 0 check (turns_in_flow >= 0),
  awaiting_user_input text,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_conversations_channel_id_unique unique (channel, conversation_id)
);

create index if not exists agent_conversations_channel_id_idx
  on public.agent_conversations(channel, conversation_id);

create index if not exists agent_conversations_activity_idx
  on public.agent_conversations(last_activity_at desc);

create or replace function public.set_agent_conversations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists agent_conversations_updated_at on public.agent_conversations;
create trigger agent_conversations_updated_at
before update on public.agent_conversations
for each row
execute function public.set_agent_conversations_updated_at();

comment on table public.agent_conversations is
  'Persistent conversational flow and specialist context for Cuenta Clara; financial state remains in app_states/agent_* tables.';

