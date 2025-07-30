-- Migration to create credentials table for storing SSH credentials
-- NOTE: This is now included in init.sql, but kept for reference

CREATE TABLE IF NOT EXISTS credentials (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_credentials_name ON credentials(name);
CREATE INDEX IF NOT EXISTS idx_credentials_is_default ON credentials(is_default);

-- Create trigger for updated_at (PostgreSQL syntax)
CREATE OR REPLACE FUNCTION update_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_credentials_updated_at ON credentials;
CREATE TRIGGER update_credentials_updated_at
    BEFORE UPDATE ON credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_credentials_updated_at();

-- Insert a default credential for demonstration (PostgreSQL syntax)
INSERT INTO credentials (id, name, username, password, description, is_default) 
VALUES (
    gen_random_uuid()::text,
    'Default SSH User', 
    'ansible', 
    'your_password_here', 
    'Default SSH credentials for Ansible automation', 
    TRUE
) ON CONFLICT (id) DO NOTHING; 