-- Migration to add host_list column to execution_history and tasks tables
-- This allows storing multiple hosts for multi-host executions

ALTER TABLE execution_history ADD COLUMN host_list TEXT;
ALTER TABLE tasks ADD COLUMN host_list TEXT;

-- Update existing execution_history records to have host_list populated with single host
UPDATE execution_history 
SET host_list = (
    SELECT json_build_array(
        json_build_object(
            'id', h.id,
            'name', h.name,
            'hostname', h.hostname,
            'description', h.description,
            'created_at', h.created_at::text,
            'updated_at', h.updated_at::text
        )
    )::text
    FROM hosts h 
    WHERE h.id = execution_history.host_id
)
WHERE host_list IS NULL;

-- Update existing tasks records to have host_list populated with single host
UPDATE tasks 
SET host_list = (
    SELECT json_build_array(
        json_build_object(
            'id', h.id,
            'name', h.name,
            'hostname', h.hostname,
            'description', h.description,
            'created_at', h.created_at::text,
            'updated_at', h.updated_at::text
        )
    )::text
    FROM hosts h 
    WHERE h.id = tasks.host_id
)
WHERE host_list IS NULL; 