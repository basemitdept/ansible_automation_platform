-- Migration to support partial success status
-- Run this if you want to update existing database

-- Add partial status support (optional, existing enum will work)
-- ALTER TYPE task_status ADD VALUE 'partial' BEFORE 'completed';

-- For existing installations, the varchar field will accept 'partial' automatically
-- No migration needed for varchar status fields

-- Update any existing tasks if needed
-- UPDATE tasks SET status = 'partial' WHERE status = 'completed' AND error_output IS NOT NULL;
-- UPDATE execution_history SET status = 'partial' WHERE status = 'completed' AND error_output IS NOT NULL; 