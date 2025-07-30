-- Migration to create credentials table for storing SSH credentials

CREATE TABLE IF NOT EXISTS credentials (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_credentials_name ON credentials(name);
CREATE INDEX IF NOT EXISTS idx_credentials_is_default ON credentials(is_default);

-- Insert a default credential for demonstration
INSERT INTO credentials (id, name, username, password, description, is_default) 
VALUES (
    UUID(), 
    'Default SSH User', 
    'ansible', 
    'your_password_here', 
    'Default SSH credentials for Ansible automation', 
    TRUE
) ON DUPLICATE KEY UPDATE id=id; 