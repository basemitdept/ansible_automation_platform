#!/bin/bash

echo "Running database migration to add playbook_files table..."

# Run the migration SQL
docker-compose exec postgres psql -U postgres -d ansible_automation -f /docker-entrypoint-initdb.d/playbook_files_migration.sql

echo "Migration completed!"
echo "Please restart the backend service to apply the model changes:"
echo "docker-compose restart backend" 