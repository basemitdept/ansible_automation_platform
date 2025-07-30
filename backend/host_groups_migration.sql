-- Migration to add host groups functionality
-- This allows organizing hosts into groups and bulk operations

-- Create host_groups table
CREATE TABLE IF NOT EXISTS host_groups (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    color VARCHAR(7) DEFAULT '#1890ff',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add group_id column to hosts table
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS group_id VARCHAR(36) REFERENCES host_groups(id) ON DELETE SET NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_hosts_group_id ON hosts(group_id);
CREATE INDEX IF NOT EXISTS idx_host_groups_name ON host_groups(name);

-- Create trigger to update updated_at timestamp for host_groups
CREATE OR REPLACE FUNCTION update_host_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_host_groups_updated_at ON host_groups;
CREATE TRIGGER update_host_groups_updated_at
    BEFORE UPDATE ON host_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_host_groups_updated_at();

-- Insert some default groups
INSERT INTO host_groups (id, name, description, color) VALUES 
    (gen_random_uuid()::text, 'Production', 'Production servers', '#f5222d'),
    (gen_random_uuid()::text, 'Development', 'Development servers', '#52c41a'),
    (gen_random_uuid()::text, 'Testing', 'Testing servers', '#fa8c16')
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE host_groups IS 'Groups for organizing hosts';
COMMENT ON COLUMN hosts.group_id IS 'Foreign key to host_groups table for organizing hosts';