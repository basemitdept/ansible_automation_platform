-- Add webhook_id column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS webhook_id VARCHAR(36) REFERENCES webhooks(id) ON DELETE SET NULL;

-- Create index for webhook_id
CREATE INDEX IF NOT EXISTS idx_tasks_webhook_id ON tasks(webhook_id);