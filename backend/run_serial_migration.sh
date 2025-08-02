#!/bin/bash
# Run serial ID migration

echo "Running serial ID migration..."

# Add serial_id columns and indexes
echo "Adding serial_id columns..."
docker exec automation-platform-postgres-1 psql -U postgres -d ansible_automation -c "
-- Add serial_id column to tasks table with auto-increment sequence
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS serial_id SERIAL UNIQUE;

-- Add serial_id column to execution_history table
ALTER TABLE execution_history ADD COLUMN IF NOT EXISTS serial_id INTEGER;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_serial_id ON tasks(serial_id);
CREATE INDEX IF NOT EXISTS idx_execution_history_serial_id ON execution_history(serial_id);
"

# Backfill execution_history with proper serial IDs
echo "Backfilling execution_history serial IDs..."
docker exec automation-platform-postgres-1 psql -U postgres -d ansible_automation -c "
-- Assign sequential serial IDs to all execution history entries
WITH numbered_history AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY started_at) as new_serial 
    FROM execution_history
) 
UPDATE execution_history 
SET serial_id = numbered_history.new_serial 
FROM numbered_history 
WHERE execution_history.id = numbered_history.id;
"

echo "Serial ID migration completed!"
echo "Tasks and History now have sequential serial IDs for tracking."