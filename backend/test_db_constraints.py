#!/usr/bin/env python3
"""
Test script to check if database constraints are properly configured
"""
import os
import sys
from sqlalchemy import create_engine, text

# Database connection
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://ansible_user:ansible_password@localhost:5432/ansible_automation')

def test_constraints():
    engine = create_engine(DATABASE_URL)
    
    try:
        with engine.connect() as conn:
            # Check if host_id in tasks table is nullable
            result = conn.execute(text("""
                SELECT column_name, is_nullable 
                FROM information_schema.columns 
                WHERE table_name = 'tasks' AND column_name = 'host_id'
            """))
            
            task_constraint = result.fetchone()
            print(f"Tasks table host_id constraint: {task_constraint}")
            
            # Check if host_id in execution_history table is nullable
            result = conn.execute(text("""
                SELECT column_name, is_nullable 
                FROM information_schema.columns 
                WHERE table_name = 'execution_history' AND column_name = 'host_id'
            """))
            
            history_constraint = result.fetchone()
            print(f"ExecutionHistory table host_id constraint: {history_constraint}")
            
            # Check if migration is needed
            if task_constraint and task_constraint[1] == 'NO':
                print("❌ Tasks table host_id is NOT NULL - migration needed!")
                return False
            elif task_constraint and task_constraint[1] == 'YES':
                print("✅ Tasks table host_id is nullable")
            
            if history_constraint and history_constraint[1] == 'NO':
                print("❌ ExecutionHistory table host_id is NOT NULL - migration needed!")
                return False
            elif history_constraint and history_constraint[1] == 'YES':
                print("✅ ExecutionHistory table host_id is nullable")
            
            return True
            
    except Exception as e:
        print(f"Error checking constraints: {e}")
        return False

if __name__ == "__main__":
    print("Checking database constraints...")
    if test_constraints():
        print("\n✅ Database constraints are properly configured!")
    else:
        print("\n❌ Database migration is required!")
        print("Run: psql -d your_database -f backend/fix_task_host_nullable.sql")