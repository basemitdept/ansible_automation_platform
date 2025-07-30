-- Migration to create artifacts table for storing Ansible register variables

CREATE TABLE IF NOT EXISTS artifacts (
    id VARCHAR(36) PRIMARY KEY,
    execution_id VARCHAR(36) NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    register_name VARCHAR(255) NOT NULL,
    register_data TEXT NOT NULL,
    host_name VARCHAR(255) NOT NULL,
    task_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (execution_id) REFERENCES execution_history(id) ON DELETE CASCADE
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_artifacts_execution_id ON artifacts(execution_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_host_name ON artifacts(host_name);
CREATE INDEX IF NOT EXISTS idx_artifacts_task_name ON artifacts(task_name); 