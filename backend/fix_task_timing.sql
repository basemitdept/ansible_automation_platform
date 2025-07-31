-- Fix task timing issues
-- This script addresses tasks that have incorrect started_at times

-- For running tasks, set started_at to current time if it's more than 5 minutes ago
-- This fixes the issue where tasks show duration starting from 180+ seconds
UPDATE tasks 
SET started_at = NOW() 
WHERE status = 'running' 
  AND started_at < (NOW() - INTERVAL '5 minutes');

-- For pending tasks, clear started_at so it gets set when they actually start
UPDATE tasks 
SET started_at = NULL 
WHERE status = 'pending';

-- Add a comment for future reference
COMMENT ON COLUMN tasks.started_at IS 'Timestamp when task actually started running (not when created)';

-- Show affected tasks
SELECT 
    id,
    status,
    started_at,
    CASE 
        WHEN status = 'running' AND started_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (NOW() - started_at))
        ELSE NULL 
    END as duration_seconds
FROM tasks 
WHERE status IN ('pending', 'running')
ORDER BY started_at DESC;