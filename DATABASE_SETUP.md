# Database Setup Guide

This guide explains how to properly set up the database when moving to a new PC or doing a fresh installation.

## Files Overview

The database setup consists of several SQL files that must be run in the correct order:

### 1. **init.sql** (Auto-run by Docker)
- Creates the `ansible_user` role and permissions
- Creates the `credentials` table
- **Status**: ✅ Complete and working

### 2. **base_tables.sql** (NEW - Run this first!)
- Creates all core tables: `playbooks`, `hosts`, `host_groups`, `tasks`, `execution_history`, `webhooks`, `artifacts`
- Creates all indexes and triggers
- Inserts default host groups
- **Status**: ✅ Complete - **MUST RUN FIRST**

### 3. Migration Files (Run after base_tables.sql)
- `playbook_variables_migration.sql` - Adds variables support (already included in base_tables.sql)
- `host_groups_migration.sql` - Creates host groups (already included in base_tables.sql)  
- `webhooks_migration.sql` - Creates webhooks (already included in base_tables.sql)
- `artifacts_migration.sql` - Creates artifacts table (already included in base_tables.sql)
- `add_host_list_migration.sql` - Adds host_list columns (already included in base_tables.sql)

## Setup Instructions for New PC

### Option A: Fresh Start (Recommended)
```bash
# 1. Stop any running containers
docker-compose down -v

# 2. Start with fresh database
docker-compose up -d postgres

# 3. Wait for postgres to be ready, then run base tables
docker-compose exec postgres psql -U ansible_user -d ansible_automation -f /docker-entrypoint-initdb.d/base_tables.sql

# 4. Start all services
docker-compose up -d
```

### Option B: Manual Database Setup
```bash
# 1. Connect to database
docker-compose exec postgres psql -U ansible_user -d ansible_automation

# 2. Run this SQL to create all tables:
\i /docker-entrypoint-initdb.d/base_tables.sql

# 3. Exit and restart services
\q
docker-compose restart
```

## Troubleshooting

### If you get "failed to fetch" errors:

1. **Check if containers are running:**
   ```bash
   docker-compose ps
   ```

2. **Check container logs:**
   ```bash
   docker-compose logs backend
   docker-compose logs frontend
   docker-compose logs postgres
   ```

3. **Check if database tables exist:**
   ```bash
   docker-compose exec postgres psql -U ansible_user -d ansible_automation -c "\dt"
   ```

4. **If tables are missing, run base_tables.sql:**
   ```bash
   docker-compose exec postgres psql -U ansible_user -d ansible_automation -f /docker-entrypoint-initdb.d/base_tables.sql
   ```

### Common Issues:
- **Port conflicts**: Change ports in `docker-compose.yml` if 80, 5000, or 5432 are occupied
- **Firewall blocking**: Allow Docker through Windows Firewall
- **Docker not running**: Start Docker Desktop
- **Database not initialized**: Run `base_tables.sql` manually

## File Execution Order

When setting up from scratch, the files should be executed in this order:

1. `init.sql` (automatic via Docker)
2. `base_tables.sql` (manual - creates all core tables)
3. Any additional migration files (optional, most are already included in base_tables.sql)

## Verification

After setup, verify the installation by checking:

1. **Database tables exist:**
   ```sql
   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
   ```

2. **Application loads:**
   - Visit `http://localhost` 
   - Check that all pages load without "failed to fetch" errors

3. **Default data exists:**
   ```sql
   SELECT * FROM host_groups;
   SELECT * FROM credentials;
   ```

## Migration Files Status

| File | Status | Included in base_tables.sql |
|------|--------|------------------------------|
| `init.sql` | ✅ Working | Partially (credentials) |
| `base_tables.sql` | ✅ New Complete File | N/A |
| `credentials_migration.sql` | ✅ Fixed PostgreSQL syntax | Yes |
| `playbook_variables_migration.sql` | ✅ Working | Yes |
| `host_groups_migration.sql` | ✅ Working | Yes |
| `webhooks_migration.sql` | ✅ Working | Yes |
| `artifacts_migration.sql` | ✅ Working | Yes |
| `add_host_list_migration.sql` | ✅ Working | Yes |
| `migration.sql` | ⚠️ Optional | No |