-- Add os_type and port columns to hosts table
-- This migration adds support for Windows hosts and custom ports

ALTER TABLE hosts ADD COLUMN IF NOT EXISTS os_type VARCHAR(50) NOT NULL DEFAULT 'linux';
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS port INTEGER NOT NULL DEFAULT 22;

-- Update any existing hosts to have proper defaults
UPDATE hosts SET os_type = 'linux' WHERE os_type IS NULL;
UPDATE hosts SET port = 22 WHERE port IS NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_hosts_os_type ON hosts(os_type);
CREATE INDEX IF NOT EXISTS idx_hosts_port ON hosts(port);