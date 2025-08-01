-- Migration to create playbook_files table for storing uploaded files associated with playbooks

CREATE TABLE IF NOT EXISTS playbook_files (
    id VARCHAR(36) PRIMARY KEY,
    playbook_id VARCHAR(36) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_playbook_files_playbook_id ON playbook_files(playbook_id);
CREATE INDEX IF NOT EXISTS idx_playbook_files_filename ON playbook_files(filename);
CREATE INDEX IF NOT EXISTS idx_playbook_files_created_at ON playbook_files(created_at);

-- Add comment to document the table
COMMENT ON TABLE playbook_files IS 'Stores files uploaded for playbooks that can be used during Ansible execution'; 