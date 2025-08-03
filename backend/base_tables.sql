-- Base tables creation for Ansible Automation Portal
-- This file creates all the core tables that the application needs
-- Run this BEFORE running any other migration files

-- Create playbooks table
CREATE TABLE IF NOT EXISTS playbooks (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL UNIQUE,
    content TEXT NOT NULL,
    description TEXT,
    variables TEXT,  -- JSON string storing variable definitions
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create host_groups table (needed before hosts)
CREATE TABLE IF NOT EXISTS host_groups (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    color VARCHAR(7) DEFAULT '#1890ff',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create hosts table
CREATE TABLE IF NOT EXISTS hosts (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL UNIQUE,
    hostname VARCHAR(255) NOT NULL,
    description TEXT,
    os_type VARCHAR(50) NOT NULL DEFAULT 'linux',
    port INTEGER NOT NULL DEFAULT 22,
    group_id VARCHAR(36) REFERENCES host_groups(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    playbook_id VARCHAR(36) NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    host_id VARCHAR(36) NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP,
    output TEXT,
    error_output TEXT,
    host_list TEXT  -- JSON string of all hosts in multi-host execution
);

-- Create execution_history table
CREATE TABLE IF NOT EXISTS execution_history (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    playbook_id VARCHAR(36) NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    host_id VARCHAR(36) NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP,
    output TEXT,
    error_output TEXT,
    username VARCHAR(255),
    host_list TEXT,  -- JSON string of all hosts in multi-host execution
    webhook_id VARCHAR(36)  -- Will be linked to webhooks table when created
);

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

-- Add webhook foreign key to execution_history
ALTER TABLE execution_history ADD CONSTRAINT fk_execution_history_webhook 
    FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE SET NULL;

-- Add check constraint for os_type
ALTER TABLE hosts ADD CONSTRAINT chk_hosts_os_type CHECK (os_type IN ('linux', 'windows'));

-- Create artifacts table
CREATE TABLE IF NOT EXISTS artifacts (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    execution_id VARCHAR(36) NOT NULL REFERENCES execution_history(id) ON DELETE CASCADE,
    task_name VARCHAR(255) NOT NULL,
    register_name VARCHAR(255) NOT NULL,
    register_data TEXT NOT NULL,
    host_name VARCHAR(255) NOT NULL,
    task_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_playbooks_name ON playbooks(name);
CREATE INDEX IF NOT EXISTS idx_hosts_name ON hosts(name);
CREATE INDEX IF NOT EXISTS idx_hosts_hostname ON hosts(hostname);
CREATE INDEX IF NOT EXISTS idx_hosts_group_id ON hosts(group_id);
CREATE INDEX IF NOT EXISTS idx_hosts_os_type ON hosts(os_type);
CREATE INDEX IF NOT EXISTS idx_host_groups_name ON host_groups(name);
CREATE INDEX IF NOT EXISTS idx_tasks_playbook_id ON tasks(playbook_id);
CREATE INDEX IF NOT EXISTS idx_tasks_host_id ON tasks(host_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_execution_history_playbook_id ON execution_history(playbook_id);
CREATE INDEX IF NOT EXISTS idx_execution_history_host_id ON execution_history(host_id);
CREATE INDEX IF NOT EXISTS idx_execution_history_status ON execution_history(status);
CREATE INDEX IF NOT EXISTS idx_execution_history_webhook_id ON execution_history(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_playbook_id ON webhooks(playbook_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_token ON webhooks(token);
CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);
CREATE INDEX IF NOT EXISTS idx_artifacts_execution_id ON artifacts(execution_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_host_name ON artifacts(host_name);
CREATE INDEX IF NOT EXISTS idx_artifacts_task_name ON artifacts(task_name);

-- Create update timestamp functions and triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at columns
DROP TRIGGER IF EXISTS update_playbooks_updated_at ON playbooks;
CREATE TRIGGER update_playbooks_updated_at
    BEFORE UPDATE ON playbooks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_hosts_updated_at ON hosts;
CREATE TRIGGER update_hosts_updated_at
    BEFORE UPDATE ON hosts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_host_groups_updated_at ON host_groups;
CREATE TRIGGER update_host_groups_updated_at
    BEFORE UPDATE ON host_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_webhooks_updated_at ON webhooks;
CREATE TRIGGER update_webhooks_updated_at
    BEFORE UPDATE ON webhooks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default host groups
INSERT INTO host_groups (id, name, description, color) VALUES 
    (gen_random_uuid()::text, 'Production', 'Production servers', '#f5222d'),
    (gen_random_uuid()::text, 'Development', 'Development servers', '#52c41a'),
    (gen_random_uuid()::text, 'Testing', 'Testing servers', '#fa8c16'),
    (gen_random_uuid()::text, 'Ungrouped', 'Hosts without a specific group', '#666666')
ON CONFLICT (name) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE playbooks IS 'Ansible playbooks storage';
COMMENT ON TABLE hosts IS 'Target hosts for Ansible execution';
COMMENT ON TABLE host_groups IS 'Groups for organizing hosts';
COMMENT ON TABLE tasks IS 'Active and recent task executions';
COMMENT ON TABLE execution_history IS 'Historical record of all playbook executions';
COMMENT ON TABLE webhooks IS 'Webhook endpoints for API-triggered executions';
COMMENT ON TABLE artifacts IS 'Stored output from Ansible register variables';

COMMENT ON COLUMN playbooks.variables IS 'JSON array storing variable definitions';
-- Create schema migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_name VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN hosts.group_id IS 'Foreign key to host_groups table';
COMMENT ON COLUMN hosts.os_type IS 'Operating system type: linux or windows';
COMMENT ON COLUMN hosts.port IS 'Connection port: 22 for SSH (Linux), 5986 for WinRM (Windows)';
COMMENT ON COLUMN tasks.host_list IS 'JSON array of all hosts in multi-host execution';
COMMENT ON COLUMN execution_history.host_list IS 'JSON array of all hosts in multi-host execution';
COMMENT ON COLUMN webhooks.host_ids IS 'JSON array of host IDs for webhook execution';
COMMENT ON COLUMN webhooks.default_variables IS 'JSON object of default variable values';