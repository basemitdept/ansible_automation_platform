# Database Migration Strategy

## Current State

### ✅ Properly Integrated (Persistent)
- **Code Changes**: All model definitions, API endpoints, and frontend components are properly saved in the codebase
- **Migration Files**: Created and integrated into docker-compose.yml
- **Schema Tracking**: Added schema_migrations table for tracking applied migrations

### ⚠️ Manual Changes Applied (One-time)
For the current running instance, these changes were applied manually:
- `ALTER TABLE hosts ADD COLUMN os_type VARCHAR(50) DEFAULT 'linux'`
- `ALTER TABLE hosts ADD COLUMN port INTEGER DEFAULT 22`
- `CREATE INDEX idx_hosts_os_type ON hosts(os_type)`
- Various other schema updates

## Migration Files Hierarchy

The system uses PostgreSQL's `docker-entrypoint-initdb.d` for automatic schema setup:

1. `01-init.sql` - Basic database and user setup
2. `02-base_tables.sql` - Core tables + schema_migrations table
3. `03-localhost_setup.sql` - Default localhost configuration
4. `04-playbook_files_migration.sql` - Playbook files support
5. `05-fix_host_id_nullable.sql` - Host ID fixes
6. **`06-host_os_port_migration.sql`** - Windows/Linux OS support (NEW)

## For New Deployments

### Fresh Install
✅ **Automatic**: New deployments will automatically get all schema changes including OS/port support

### Existing Deployments
⚠️ **Manual**: For existing deployments, run the migration manually:

```bash
# Option 1: Recreation (Data Loss - Only for Development)
docker-compose down -v
docker-compose up --build

# Option 2: Manual Migration (Production Safe)
docker exec automation-platform-postgres-1 psql -U postgres -d ansible_automation -f /docker-entrypoint-initdb.d/06-host_os_port_migration.sql
```

## Verification

Check if migrations are applied:
```sql
SELECT * FROM schema_migrations ORDER BY applied_at;
```

Should show:
- `06-host_os_port_migration` with timestamp

## Files Modified for Persistence

### Backend
- ✅ `models.py` - Host model with os_type and port fields
- ✅ `app.py` - API endpoints and Ansible execution logic
- ✅ `base_tables.sql` - Added schema_migrations table
- ✅ `06-host_os_port_migration.sql` - New migration file

### Frontend  
- ✅ `components/Hosts.js` - OS type and port form fields + table display

### Infrastructure
- ✅ `docker-compose.yml` - Added new migration to initdb sequence

## Migration Philosophy

1. **Code First**: All changes are in the codebase
2. **Tracked Migrations**: Every schema change is tracked
3. **Automatic Setup**: New deployments get everything automatically
4. **Production Safe**: Existing deployments can migrate safely

This ensures the platform is **portable** and **production-ready**! 🚀