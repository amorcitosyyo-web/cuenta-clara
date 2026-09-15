-- Migration: Create agent_conversations table for multi-agent conversational state
-- This table persists the conversational flow state between turns,
-- allowing the agent to maintain context, remember previous questions,
-- and avoid repeating itself.

CREATE TABLE IF NOT EXISTS agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,              -- "telegram" | "web" | "test"
  conversation_id uuid NOT NULL,      -- Same as sessionKey/chatId from client

  -- Conversational state (THE IMPORTANT PART)
  flow_state text DEFAULT 'idle',     -- "idle" | "planning" | "analyzing_expenses" | "recording_income" | "confirming_action"
  flow_context jsonb DEFAULT '{}',    -- {"stage": "asking_accounts", "accounts_collected": [...], ...}
  awaiting_user_input text,           -- "¿Cuál es el saldo de tu cuenta principal?"
  awaiting_confirmation text,         -- For actions that need confirmation
  turns_in_flow integer DEFAULT 0,    -- Detects if stuck (> 15 turns without progress)

  -- Conversation history (for context window)
  recent_messages jsonb DEFAULT '[]', -- Last 10 messages [{role, text, timestamp}, ...]

  -- Metadata
  started_at timestamp DEFAULT now(),
  last_turn_at timestamp DEFAULT now(),
  last_specialist_called text,        -- "planner" | "analyzer" | "classifier" | "executor"

  created_by text DEFAULT 'agent'
);

-- Create unique index for active conversations
-- Only one active flow per (channel, conversation_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_conversations_active
  ON agent_conversations(channel, conversation_id)
  WHERE flow_state != 'idle';

-- Create index for timestamp queries (cleanup, recent activity)
CREATE INDEX IF NOT EXISTS idx_agent_conversations_timestamp
  ON agent_conversations(last_turn_at DESC);

-- Create index for channel lookups
CREATE INDEX IF NOT EXISTS idx_agent_conversations_channel
  ON agent_conversations(channel, last_turn_at DESC);

-- Grant appropriate permissions (adjust schema if using different role)
-- ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
-- (RLS policies would go here if using Supabase Auth)

COMMENT ON TABLE agent_conversations IS 'Persistent conversational state for multi-agent orchestration';
COMMENT ON COLUMN agent_conversations.flow_state IS 'Current conversational flow: idle, planning, analyzing_expenses, etc.';
COMMENT ON COLUMN agent_conversations.flow_context IS 'Flow-specific data (e.g., stage, collected_data, awaiting_confirmation)';
COMMENT ON COLUMN agent_conversations.turns_in_flow IS 'Counter to detect infinite loops/stuck flows';
