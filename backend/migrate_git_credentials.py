#!/usr/bin/env python3
"""
Database migration script to add Git credential support
This script adds new columns to support Git token credentials and private repository access
"""

import os
import sys
from flask import Flask
from models import db
from sqlalchemy import text

def migrate_database():
    """Add new columns for Git credential support"""
    
    app = Flask(__name__)
    
    # Use environment DATABASE_URL or default to PostgreSQL
    database_url = os.environ.get('DATABASE_URL', 'postgresql://ansible_user:ansible_password@postgres:5432/ansible_automation')
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    db.init_app(app)
    
    with app.app_context():
        try:
            print("🔍 Checking current database schema...")
            
            # Check if credentials table has new columns
            result = db.session.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'credentials'
            """))
            columns = [row[0] for row in result.fetchall()]
            print(f"📋 Current credential columns: {columns}")
            
            # Add new columns to credentials table if they don't exist
            if 'credential_type' not in columns:
                print("➕ Adding credential_type column to credentials table...")
                db.session.execute(text("ALTER TABLE credentials ADD COLUMN credential_type VARCHAR(50) DEFAULT 'ssh'"))
            
            if 'token' not in columns:
                print("➕ Adding token column to credentials table...")
                db.session.execute(text("ALTER TABLE credentials ADD COLUMN token VARCHAR(500)"))
            
            # Update existing credentials to have credential_type = 'ssh' if NULL
            print("🔄 Updating existing credentials...")
            db.session.execute(text("UPDATE credentials SET credential_type = 'ssh' WHERE credential_type IS NULL"))
            
            # Check if playbooks table has new columns
            result = db.session.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'playbooks'
            """))
            playbook_columns = [row[0] for row in result.fetchall()]
            print(f"📋 Current playbook columns: {playbook_columns}")
            
            # Add new columns to playbooks table if they don't exist
            if 'git_visibility' not in playbook_columns:
                print("➕ Adding git_visibility column to playbooks table...")
                db.session.execute(text("ALTER TABLE playbooks ADD COLUMN git_visibility VARCHAR(20) DEFAULT 'public'"))
            
            if 'git_credential_id' not in playbook_columns:
                print("➕ Adding git_credential_id column to playbooks table...")
                db.session.execute(text("ALTER TABLE playbooks ADD COLUMN git_credential_id VARCHAR(36)"))
            
            # Update existing playbooks to have git_visibility = 'public' if NULL
            print("🔄 Updating existing playbooks...")
            db.session.execute(text("UPDATE playbooks SET git_visibility = 'public' WHERE git_visibility IS NULL"))
            
            db.session.commit()
            
            print("✅ Database migration completed successfully!")
            return True
                
        except Exception as e:
            print(f"❌ Migration failed: {str(e)}")
            return False

if __name__ == '__main__':
    if migrate_database():
        print("🎉 Migration completed successfully!")
        sys.exit(0)
    else:
        print("💥 Migration failed!")
        sys.exit(1)