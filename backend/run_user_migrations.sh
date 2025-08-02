#!/bin/bash
# Run user-related database migrations

echo "Running user migrations..."

# Run users table migration
echo "Creating users table..."
docker exec automation-platform-postgres-1 psql -U postgres -d ansible_automation -f /app/users_migration.sql

# Run user tracking migration
echo "Adding user tracking columns..."
docker exec automation-platform-postgres-1 psql -U postgres -d ansible_automation -f /app/user_tracking_migration.sql

echo "User migrations completed!"