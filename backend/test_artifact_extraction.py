#!/usr/bin/env python3
"""
Test artifact extraction with known good Ansible output
"""
import os
import sys
from datetime import datetime
from models import db, ExecutionHistory, Artifact
from app import app, extract_register_from_output

def create_fake_host():
    """Create a fake host object for testing"""
    class FakeHost:
        def __init__(self, hostname):
            self.hostname = hostname
            self.name = hostname
    
    return FakeHost("localhost")

def test_artifact_extraction():
    """Test artifact extraction with sample Ansible output"""
    
    # Sample Ansible output with register variables
    sample_output = """
PLAY [Simple Test Playbook] ****************************************************

TASK [Get hostname] ************************************************************
changed: [localhost] => {"changed": true, "cmd": ["hostname"], "delta": "0:00:00.003", "end": "2024-01-15 10:30:45.123456", "rc": 0, "start": "2024-01-15 10:30:45.120456", "stderr": "", "stderr_lines": [], "stdout": "test-server", "stdout_lines": ["test-server"]}

TASK [Get current date] ********************************************************
ok: [localhost] => {"changed": false, "cmd": ["date"], "delta": "0:00:00.002", "end": "2024-01-15 10:30:45.456789", "rc": 0, "start": "2024-01-15 10:30:45.454789", "stderr": "", "stderr_lines": [], "stdout": "Mon Jan 15 10:30:45 UTC 2024", "stdout_lines": ["Mon Jan 15 10:30:45 UTC 2024"]}

TASK [Display results] *********************************************************
ok: [localhost] => {
    "msg": "Hostname: test-server\\nDate: Mon Jan 15 10:30:45 UTC 2024"
}

PLAY RECAP *********************************************************************
localhost                  : ok=3    changed=1    unreachable=0    failed=0    skipped=0    rescued=0    ignored=0
""".strip().split('\n')

    print("🧪 Testing artifact extraction with sample output...")
    
    with app.app_context():
        try:
            # Create a test execution history
            test_history = ExecutionHistory(
                playbook_id='test-playbook',
                host_id=None,
                status='completed',
                started_at=datetime.utcnow(),
                finished_at=datetime.utcnow(),
                output='Test execution',
                username='test',
                host_list='[]'
            )
            
            db.session.add(test_history)
            db.session.commit()
            print(f"✅ Created test execution history: {test_history.id}")
            
            # Create fake host
            fake_host = create_fake_host()
            hosts = [fake_host]
            
            # Test artifact extraction
            print("\n🔍 Running artifact extraction...")
            artifacts = extract_register_from_output(sample_output, test_history.id, hosts)
            
            print(f"\n📊 Extraction results:")
            print(f"  Found {len(artifacts)} artifacts")
            
            for i, artifact in enumerate(artifacts):
                print(f"  Artifact {i+1}:")
                print(f"    Task: {artifact.task_name}")
                print(f"    Host: {artifact.host_name}")
                print(f"    Register: {artifact.register_name}")
                print(f"    Status: {artifact.task_status}")
                print(f"    Data preview: {artifact.register_data[:100]}...")
            
            # Try to save artifacts
            if artifacts:
                print(f"\n💾 Saving {len(artifacts)} artifacts to database...")
                for artifact in artifacts:
                    db.session.add(artifact)
                
                db.session.commit()
                print("✅ Artifacts saved successfully!")
                
                # Verify retrieval
                saved_artifacts = Artifact.query.filter_by(execution_id=test_history.id).all()
                print(f"✅ Verified: {len(saved_artifacts)} artifacts in database")
            else:
                print("❌ No artifacts extracted - check the extraction logic!")
            
            # Clean up
            if artifacts:
                for artifact in artifacts:
                    db.session.delete(artifact)
            db.session.delete(test_history)
            db.session.commit()
            print("🧹 Cleaned up test data")
            
            return len(artifacts) > 0
            
        except Exception as e:
            print(f"❌ Error during test: {e}")
            import traceback
            traceback.print_exc()
            db.session.rollback()
            return False

if __name__ == "__main__":
    print("🚀 Testing artifact extraction logic...")
    
    success = test_artifact_extraction()
    
    if success:
        print("\n✅ Artifact extraction test passed!")
        print("💡 The extraction logic works. Check if playbook executions are producing the expected output format.")
    else:
        print("\n❌ Artifact extraction test failed!")
        print("💡 The extraction logic needs to be fixed.")