-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(80) UNIQUE NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'editor', 'user')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create default admin user (password: admin)
INSERT INTO users (id, username, password_hash, role) 
VALUES (
    'admin-user-id-12345', 
    'admin', 
    'pbkdf2:sha256:600000$VDvizWpVXdbI5hVX$247cb43b075bd9b08f006d671a946ad0611bfd516e3dc8af93d7a6ba9e6c5b3d',
    'admin'
) ON CONFLICT (username) DO NOTHING;