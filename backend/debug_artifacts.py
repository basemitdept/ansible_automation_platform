#!/usr/bin/env python3
"""
Debug script to test artifact extraction and database operations
"""
import os
import sys
from datetime import datetime
from models import db, Playbook, Host, ExecutionHistory, Artifact
from app import app

def test_artifact_creation():
    """Test creating an artifact directly"""
    with app.app_context():
        try:
            # Create a test execution history record
            test_history = ExecutionHistory(
                playbook_id='test-playbook-id',
                host_id=None,  # Test nullable constraint
                status='completed',
                started_at=datetime.utcnow(),
                finished_at=datetime.utcnow(),
                output='Test output',
                username='test-user',
                host_list='[]'
            )
            
            db.session.add(test_history)
            db.session.commit()
            print(f"✅ Created test execution history: {test_history.id}")
            
            # Create a test artifact
            test_artifact = Artifact(
                execution_id=test_history.id,
                task_name='Test Task',
                register_name='test_result',
                register_data='{"test": "data"}',
                host_name='test-host',
                task_status='ok'
            )
            
            db.session.add(test_artifact)
            db.session.commit()
            print(f"✅ Created test artifact: {test_artifact.id}")
            
            # Verify retrieval
            retrieved_artifacts = Artifact.query.filter_by(execution_id=test_history.id).all()
            print(f"✅ Retrieved {len(retrieved_artifacts)} artifacts for execution {test_history.id}")
            
            # Clean up
            db.session.delete(test_artifact)
            db.session.delete(test_history)
            db.session.commit()
            print("✅ Cleaned up test records")
            
            return True
            
        except Exception as e:
            print(f"❌ Error testing artifact creation: {e}")
            db.session.rollback()
            return False

def check_database_constraints():
    """Check if database constraints are properly configured"""
    with app.app_context():
        try:
            from sqlalchemy import text
            
            # Check tasks table constraint
            result = db.session.execute(text("""
                SELECT column_name, is_nullable 
                FROM information_schema.columns 
                WHERE table_name = 'tasks' AND column_name = 'host_id'
            """))
            
            task_constraint = result.fetchone()
            if task_constraint:
                print(f"Tasks.host_id nullable: {task_constraint[1]}")
                if task_constraint[1] == 'NO':
                    print("❌ Tasks table host_id constraint needs migration!")
                    return False
            
            # Check execution_history table constraint
            result = db.session.execute(text("""
                SELECT column_name, is_nullable 
                FROM information_schema.columns 
                WHERE table_name = 'execution_history' AND column_name = 'host_id'
            """))
            
            history_constraint = result.fetchone()
            if history_constraint:
                print(f"ExecutionHistory.host_id nullable: {history_constraint[1]}")
                if history_constraint[1] == 'NO':
                    print("❌ ExecutionHistory table host_id constraint needs migration!")
                    return False
            
            print("✅ Database constraints are properly configured")
            return True
            
        except Exception as e:
            print(f"❌ Error checking constraints: {e}")
            return False

if __name__ == "__main__":
    print("🔍 Debugging artifacts issue...")
    print("\n1. Checking database constraints...")
    constraints_ok = check_database_constraints()
    
    print("\n2. Testing artifact creation...")
    artifacts_ok = test_artifact_creation()
    
    if constraints_ok and artifacts_ok:
        print("\n✅ All tests passed! The issue might be with playbook execution or output parsing.")
        print("Check the application logs during playbook execution for more details.")
    else:
        print("\n❌ Found issues that need to be fixed:")
        if not constraints_ok:
            print("   - Run database migration: psql -d your_database -f backend/fix_task_host_nullable.sql")
        if not artifacts_ok:
            print("   - Check database connectivity and permissions")