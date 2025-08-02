-- Add OS type and port columns to hosts table
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS os_type VARCHAR(50) DEFAULT 'linux';
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS port INTEGER DEFAULT 22;

-- Create index for os_type for better performance
CREATE INDEX IF NOT EXISTS idx_hosts_os_type ON hosts(os_type);

-- Update existing hosts to have proper defaults
UPDATE hosts SET os_type = 'linux' WHERE os_type IS NULL;
UPDATE hosts SET port = 22 WHERE port IS NULL;

-- Add constraints to ensure valid OS types
ALTER TABLE hosts ADD CONSTRAINT chk_hosts_os_type CHECK (os_type IN ('linux', 'windows'));