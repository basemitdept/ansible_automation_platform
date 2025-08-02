#!/bin/bash
set -e

echo "Running webhook task migration..."

# Run migration as postgres user
docker exec automation-platform-db-1 psql -U postgres -d automation_platform -f /app/webhook_task_migration.sql

echo "Migration completed successfully!"