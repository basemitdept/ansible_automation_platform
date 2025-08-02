-- Migration to add OS type and port support to hosts table
-- This migration adds Windows/Linux support with automatic port configuration

-- Add OS type and port columns to hosts table
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS os_type VARCHAR(50) DEFAULT 'linux';
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS port INTEGER DEFAULT 22;

-- Create index for os_type for better performance
CREATE INDEX IF NOT EXISTS idx_hosts_os_type ON hosts(os_type);

-- Update existing hosts to have proper defaults
UPDATE hosts SET os_type = 'linux' WHERE os_type IS NULL;
UPDATE hosts SET port = 22 WHERE port IS NULL;

-- Add constraints to ensure valid OS types
ALTER TABLE hosts DROP CONSTRAINT IF EXISTS chk_hosts_os_type;
ALTER TABLE hosts ADD CONSTRAINT chk_hosts_os_type CHECK (os_type IN ('linux', 'windows'));

-- Add comment for documentation
COMMENT ON COLUMN hosts.os_type IS 'Operating system type: linux or windows';
COMMENT ON COLUMN hosts.port IS 'Connection port: 22 for SSH (Linux), 5986 for WinRM (Windows)';

-- Log the migration
INSERT INTO schema_migrations (migration_name, applied_at) 
VALUES ('06-host_os_port_migration', CURRENT_TIMESTAMP)
ON CONFLICT (migration_name) DO NOTHING;