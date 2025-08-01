-- Migration to allow NULL host_id in tasks and execution_history tables for dynamic executions
-- This fixes the issue where playbook executions with dynamic targets fail
-- because the host_id is required but should be optional for dynamic executions

-- Make host_id nullable in tasks table
ALTER TABLE tasks ALTER COLUMN host_id DROP NOT NULL;

-- Make host_id nullable in execution_history table
ALTER TABLE execution_history ALTER COLUMN host_id DROP NOT NULL;

-- Add comments to document these changes
COMMENT ON COLUMN tasks.host_id IS 'Foreign key to hosts table - nullable for dynamic executions without specific hosts';
COMMENT ON COLUMN execution_history.host_id IS 'Foreign key to hosts table - nullable for dynamic executions without specific hosts';