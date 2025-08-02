-- Add user_id column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id VARCHAR(36) REFERENCES users(id);

-- Add user_id column to execution_history table  
ALTER TABLE execution_history ADD COLUMN IF NOT EXISTS user_id VARCHAR(36) REFERENCES users(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_execution_history_user_id ON execution_history(user_id);