-- PostgreSQL initialization script for Ansible Automation Portal
-- Create ansible_user with proper permissions
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = 'ansible_user') THEN

      CREATE ROLE ansible_user LOGIN PASSWORD 'ansible_password';
   END IF;
END
$do$;

-- In PostgreSQL 15+, we need to explicitly grant schema permissions
-- Grant the ansible_user permission to create objects in public schema
GRANT USAGE ON SCHEMA public TO ansible_user;
GRANT CREATE ON SCHEMA public TO ansible_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ansible_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ansible_user;

-- Grant permissions on future tables and sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ansible_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ansible_user;

-- Make ansible_user the owner of the database for full permissions
ALTER DATABASE ansible_automation OWNER TO ansible_user;

-- Ensure ansible_user can connect to the database
GRANT CONNECT ON DATABASE ansible_automation TO ansible_user;

-- Migration to create credentials table for storing SSH credentials
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

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_credentials_updated_at ON credentials;
CREATE TRIGGER update_credentials_updated_at
    BEFORE UPDATE ON credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert a default credential for demonstration (using INSERT ... ON CONFLICT)
INSERT INTO credentials (id, name, username, password, description, is_default) 
VALUES (
    gen_random_uuid()::text,
    'Default SSH User', 
    'ansible', 
    'your_password_here', 
    'Default SSH credentials for Ansible automation', 
    TRUE
) ON CONFLICT (id) DO NOTHING;

-- Grant permissions on the credentials table specifically
GRANT ALL PRIVILEGES ON TABLE credentials TO ansible_user;

-- Ensure ansible_user owns all objects in public schema
ALTER SCHEMA public OWNER TO ansible_user; 