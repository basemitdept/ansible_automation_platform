-- Migration to make host_id nullable in tasks table to support execution without hosts
ALTER TABLE tasks ALTER COLUMN host_id DROP NOT NULL;

-- Add comment to document the change
COMMENT ON COLUMN tasks.host_id IS 'Host ID - nullable for dynamic/playbook-defined targets'; 