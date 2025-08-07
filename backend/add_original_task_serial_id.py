#!/usr/bin/env python3
"""
Migration: Add original_task_serial_id column to execution_history table

This migration adds a column to preserve the original sequential ID of tasks
when they are moved from the tasks table to execution_history.

Usage: python3 add_original_task_serial_id.py
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import app, db

def add_original_task_serial_id_column():
    """Add original_task_serial_id column to execution_history table"""
    
    with app.app_context():
        try:
            # Check if column already exists
            with db.engine.connect() as conn:
                result = conn.execute(db.text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name='execution_history' 
                    AND column_name='original_task_serial_id'
                """))
                
                if result.fetchone():
                    print("✅ Column 'original_task_serial_id' already exists in execution_history table")
                    return True
                
                # Add the column
                print("📝 Adding original_task_serial_id column to execution_history table...")
                conn.execute(db.text("""
                    ALTER TABLE execution_history 
                    ADD COLUMN original_task_serial_id INTEGER
                """))
                conn.commit()
            
            print("✅ Successfully added original_task_serial_id column to execution_history table")
            return True
            
        except Exception as e:
            print(f"❌ Error adding original_task_serial_id column: {e}")
            return False

if __name__ == "__main__":
    print("🔄 Starting migration: Add original_task_serial_id column")
    
    success = add_original_task_serial_id_column()
    
    if success:
        print("🎉 Migration completed successfully!")
    else:
        print("💥 Migration failed!")
        sys.exit(1)