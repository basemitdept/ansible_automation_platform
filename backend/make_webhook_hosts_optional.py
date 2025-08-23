#!/usr/bin/env python3
"""
Migration: Make webhook host_ids optional

This migration updates the webhooks table to make the host_ids column nullable,
allowing webhooks to be created without specifying target hosts.
When no hosts are specified, the webhook will default to localhost execution.
"""

import sys
import os
from sqlalchemy import text

# Add the backend directory to the path to import models
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import db
from app import app

def migrate():
    """Make host_ids nullable in webhooks table"""
    
    print("🔄 Starting migration: Make webhook host_ids optional...")
    
    with app.app_context():
        try:
            # Check if the column is already nullable (PostgreSQL syntax)
            result = db.session.execute(text("""
                SELECT is_nullable 
                FROM information_schema.columns 
                WHERE table_name = 'webhooks' 
                AND column_name = 'host_ids'
                AND table_schema = 'public'
            """))
            
            row = result.fetchone()
            if row and row[0] == 'YES':
                print("✅ Migration already applied: host_ids is already nullable")
                return
            
            # Make host_ids nullable (PostgreSQL syntax)
            print("📝 Altering webhooks table to make host_ids nullable...")
            db.session.execute(text("""
                ALTER TABLE webhooks 
                ALTER COLUMN host_ids DROP NOT NULL
            """))
            
            db.session.commit()
            print("✅ Migration completed successfully!")
            print("📋 Webhooks can now be created without specifying target hosts")
            print("🏠 When no hosts are specified, webhooks will use localhost as default")
            
        except Exception as e:
            db.session.rollback()
            print(f"❌ Migration failed: {e}")
            sys.exit(1)

if __name__ == "__main__":
    migrate()
