-- Migration to add variables support to playbooks table
-- This allows storing variable definitions as JSON for each playbook

ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS variables TEXT;

-- Add a comment to document the column purpose
COMMENT ON COLUMN playbooks.variables IS 'JSON array storing variable definitions with name, type, description, and default_value fields';

-- Update existing playbooks to have empty variables array
UPDATE playbooks SET variables = '[]' WHERE variables IS NULL; 