# Database Migrations

This document tracks all database schema changes for the Ansible Automation Platform.

## Migration Files

### 1. `add_original_task_serial_id.py`
**Purpose**: Add `original_task_serial_id` column to `execution_history` table

**What it does**:
- Adds `original_task_serial_id INTEGER` column to preserve task IDs when tasks move from running to history
- Ensures tasks maintain the same sequential ID throughout their lifecycle
- Allows tracking: Running Task #15 → History Record #15 (same ID)

**Usage**:
```bash
sudo docker-compose exec backend python3 add_original_task_serial_id.py
```

**Status**: ✅ Applied

---

## How to Run Migrations

### For Development:
```bash
cd backend
sudo docker-compose exec backend python3 <migration_file.py>
```

### For Production:
1. Backup your database first
2. Run the migration script:
   ```bash
   python3 <migration_file.py>
   ```
3. Verify the changes worked correctly

## Notes

- All migrations are designed to be **idempotent** (safe to run multiple times)
- Each migration checks if changes already exist before applying them
- Always test migrations in development before applying to production
- Keep this file updated when new migrations are added

## Migration History

| Date | Migration | Description | Status |
|------|-----------|-------------|---------|
| 2025-08-07 | `add_original_task_serial_id.py` | Add original task serial ID preservation | ✅ Applied |
