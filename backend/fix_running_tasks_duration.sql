-- Fix running tasks duration issue
-- This script fixes tasks that show incorrect duration (like starting from 180 minutes)

-- First, let's see what running tasks we have and their durations
SELECT 
    id,
    status,
    started_at,
    finished_at,
    CASE 
        WHEN status = 'running' AND started_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (NOW() - started_at)) / 60.0  -- Duration in minutes
        ELSE NULL 
    END as duration_minutes,
    output
FROM tasks 
WHERE status = 'running'
ORDER BY started_at DESC;

-- Fix running tasks that have unrealistic start times (more than 1 hour ago)
-- Set their started_at to current time
UPDATE tasks 
SET started_at = NOW() 
WHERE status = 'running' 
  AND started_at IS NOT NULL
  AND started_at < (NOW() - INTERVAL '1 hour');

-- Clear started_at for pending tasks so they get proper timestamps when they start
UPDATE tasks 
SET started_at = NULL 
WHERE status = 'pending' 
  AND started_at IS NOT NULL;

-- Show the updated running tasks
SELECT 
    id,
    status,
    started_at,
    CASE 
        WHEN status = 'running' AND started_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (NOW() - started_at)) / 60.0  -- Duration in minutes
        ELSE NULL 
    END as duration_minutes_after_fix
FROM tasks 
WHERE status = 'running'
ORDER BY started_at DESC;