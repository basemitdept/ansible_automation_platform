-- Migration to add webhooks support
-- This allows creating webhook endpoints for playbook execution

-- Create webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    playbook_id VARCHAR(36) NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    host_ids TEXT NOT NULL,  -- JSON array of host IDs
    token VARCHAR(64) NOT NULL UNIQUE,  -- Unique webhook token
    enabled BOOLEAN DEFAULT TRUE,
    default_variables TEXT,  -- JSON object of default variable values
    credential_id VARCHAR(36) REFERENCES credentials(id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_triggered TIMESTAMP,
    trigger_count INTEGER DEFAULT 0
);

-- Add webhook_id to execution_history table
ALTER TABLE execution_history ADD COLUMN IF NOT EXISTS webhook_id VARCHAR(36) REFERENCES webhooks(id) ON DELETE SET NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_webhooks_playbook_id ON webhooks(playbook_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_token ON webhooks(token);
CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);
CREATE INDEX IF NOT EXISTS idx_execution_history_webhook_id ON execution_history(webhook_id);

-- Create function to generate secure webhook tokens
CREATE OR REPLACE FUNCTION generate_webhook_token()
RETURNS TEXT AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at timestamp for webhooks
CREATE OR REPLACE FUNCTION update_webhook_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_webhooks_updated_at ON webhooks;
CREATE TRIGGER update_webhooks_updated_at
    BEFORE UPDATE ON webhooks
    FOR EACH ROW
    EXECUTE FUNCTION update_webhook_updated_at(); 