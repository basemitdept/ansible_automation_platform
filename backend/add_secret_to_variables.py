#!/usr/bin/env python3
"""
Migration script to add is_secret column to variables table
"""

import os
import sys
from sqlalchemy import text
from app import app, db

def migrate_variables_add_secret():
    """Add is_secret column to variables table"""
    with app.app_context():
        try:
            # Check if column already exists
            result = db.session.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'variables' 
                AND column_name = 'is_secret'
            """))
            
            if result.fetchone():
                print("✅ is_secret column already exists in variables table")
                return
            
            # Add the is_secret column
            db.session.execute(text("""
                ALTER TABLE variables 
                ADD COLUMN is_secret BOOLEAN DEFAULT FALSE
            """))
            
            db.session.commit()
            print("✅ Successfully added is_secret column to variables table")
            
        except Exception as e:
            db.session.rollback()
            print(f"❌ Error adding is_secret column: {e}")
            raise

if __name__ == "__main__":
    migrate_variables_add_secret()
