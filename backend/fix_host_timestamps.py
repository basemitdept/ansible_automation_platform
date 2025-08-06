#!/usr/bin/env python3

import os
import sys
from datetime import datetime
from flask import Flask
from models import db
from sqlalchemy import text

def fix_host_timestamps():
    """Update hosts that don't have created_at timestamps"""
    app = Flask(__name__)
    database_url = os.environ.get('DATABASE_URL', 'postgresql://ansible_user:ansible_password@postgres:5432/ansible_automation')
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)

    with app.app_context():
        try:
            print("🔍 Checking hosts without created_at timestamps...")
            
            # Check for hosts with null created_at
            result = db.session.execute(text("""
                SELECT id, name, created_at 
                FROM hosts 
                WHERE created_at IS NULL
            """))
            hosts_without_timestamps = result.fetchall()
            
            print(f"📊 Found {len(hosts_without_timestamps)} hosts without created_at timestamps")
            
            if hosts_without_timestamps:
                # Update hosts without timestamps to have a created_at value
                current_time = datetime.utcnow()
                print(f"⏰ Setting created_at to current time: {current_time}")
                
                for host in hosts_without_timestamps:
                    print(f"  📝 Updating host: {host.name} (ID: {host.id})")
                
                db.session.execute(text("""
                    UPDATE hosts 
                    SET created_at = :created_at, updated_at = :updated_at 
                    WHERE created_at IS NULL
                """), {
                    'created_at': current_time,
                    'updated_at': current_time
                })
                
                db.session.commit()
                print(f"✅ Successfully updated {len(hosts_without_timestamps)} hosts with timestamps!")
            else:
                print("✅ All hosts already have created_at timestamps!")
            
            # Verify the fix
            result = db.session.execute(text("""
                SELECT COUNT(*) as count 
                FROM hosts 
                WHERE created_at IS NULL
            """))
            remaining_null = result.fetchone().count
            
            print(f"🔍 Hosts still without created_at: {remaining_null}")
            
            return True
            
        except Exception as e:
            print(f"❌ Error fixing host timestamps: {str(e)}")
            db.session.rollback()
            return False

if __name__ == '__main__':
    success = fix_host_timestamps()
    sys.exit(0 if success else 1)