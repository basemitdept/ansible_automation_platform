-- Add serial_id columns to tasks and execution_history tables

-- Add serial_id column to tasks table with auto-increment sequence
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS serial_id SERIAL UNIQUE;

-- Add serial_id column to execution_history table (will be populated from tasks)
ALTER TABLE execution_history ADD COLUMN IF NOT EXISTS serial_id INTEGER;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_serial_id ON tasks(serial_id);
CREATE INDEX IF NOT EXISTS idx_execution_history_serial_id ON execution_history(serial_id);

-- Note: Tasks with SERIAL will automatically get sequential IDs when created
-- For existing tasks, PostgreSQL auto-assigned serial IDs when column was added

-- Backfill execution_history with serial IDs from corresponding tasks
UPDATE execution_history 
SET serial_id = (
    SELECT tasks.serial_id 
    FROM tasks 
    WHERE tasks.id = execution_history.id
) 
WHERE serial_id IS NULL;

-- For execution_history entries without matching tasks, assign incremental serial IDs
UPDATE execution_history 
SET serial_id = subquery.row_number 
FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY started_at) + (
        SELECT COALESCE(MAX(serial_id), 0) FROM execution_history WHERE serial_id IS NOT NULL
    ) as row_number 
    FROM execution_history 
    WHERE serial_id IS NULL
) AS subquery 
WHERE execution_history.id = subquery.id;