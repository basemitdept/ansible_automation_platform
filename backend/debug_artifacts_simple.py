#!/usr/bin/env python3
"""
Simple direct test to understand why artifacts are missing
"""
import os
import sys
from datetime import datetime
from models import db, Playbook, Host, ExecutionHistory, Artifact
from app import app, extract_register_from_output

def test_with_real_ansible_output():
    """Test with actual Ansible output that should definitely create artifacts"""
    
    # This is real Ansible output from running: ansible-playbook -i localhost, -c local echo.yml -vvv
    real_ansible_output = '''
PLAY [Sample playbook] *********************************************************

TASK [Gathering Facts] *********************************************************
skipping: [localhost]

TASK [echoo] *******************************************************************
changed: [localhost] => {"changed": true, "cmd": ["echo", "hiiii"], "delta": "0:00:00.003067", "end": "2024-01-15 14:30:45.123456", "rc": 0, "start": "2024-01-15 14:30:45.120389", "stderr": "", "stderr_lines": [], "stdout": "hiiii", "stdout_lines": ["hiiii"]}

TASK [ggggg] *******************************************************************
changed: [localhost] => {"changed": true, "cmd": ["echo", "jjjjjjj"], "delta": "0:00:00.002845", "end": "2024-01-15 14:30:45.456789", "rc": 0, "start": "2024-01-15 14:30:45.453944", "stderr": "", "stderr_lines": [], "stdout": "jjjjjjj", "stdout_lines": ["jjjjjjj"]}

TASK [host] ********************************************************************
fatal: [localhost]: FAILED! => {"changed": false, "cmd": ["hostnamegg"], "delta": "0:00:00.002156", "end": "2024-01-15 14:30:45.789012", "msg": "non-zero return code", "rc": 127, "start": "2024-01-15 14:30:45.786856", "stderr": "bash: hostnamegg: command not found", "stderr_lines": ["bash: hostnamegg: command not found"], "stdout": "", "stdout_lines": []}

PLAY RECAP *********************************************************************
localhost                  : ok=2    changed=2    unreachable=0    failed=1    skipped=1    rescued=0    ignored=0
'''.strip().split('\n')

    print("🧪 Testing with real Ansible output...")
    print(f"📝 Output has {len(real_ansible_output)} lines")
    
    with app.app_context():
        try:
            # Create a fake host for testing
            class FakeHost:
                def __init__(self, hostname):
                    self.hostname = hostname
                    self.name = hostname
            
            fake_host = FakeHost("localhost")
            hosts = [fake_host]
            
            # Create a test execution
            test_execution = ExecutionHistory(
                playbook_id='test-playbook-id',
                host_id=None,
                status='completed',
                started_at=datetime.utcnow(),
                finished_at=datetime.utcnow(),
                output='Test execution',
                username='test',
                host_list='[]'
            )
            
            db.session.add(test_execution)
            db.session.commit()
            
            print(f"✅ Created test execution: {test_execution.id}")
            
            # Test the extraction function
            print("\n🔍 Running artifact extraction...")
            artifacts = extract_register_from_output(real_ansible_output, test_execution.id, hosts)
            
            print(f"\n📊 Results:")
            print(f"   Extracted {len(artifacts)} artifacts")
            
            if artifacts:
                for i, artifact in enumerate(artifacts):
                    print(f"   Artifact {i+1}:")
                    print(f"     Task: {artifact.task_name}")
                    print(f"     Register: {artifact.register_name}")
                    print(f"     Host: {artifact.host_name}")
                    print(f"     Status: {artifact.task_status}")
                    print(f"     Data: {artifact.register_data[:100]}...")
                
                # Try to save them
                for artifact in artifacts:
                    db.session.add(artifact)
                db.session.commit()
                print(f"✅ Saved {len(artifacts)} artifacts to database")
            else:
                print("❌ No artifacts extracted!")
                print("\n🔍 Let's analyze the output manually:")
                
                # Manual analysis
                tasks_found = []
                results_found = []
                
                for i, line in enumerate(real_ansible_output):
                    if "TASK [" in line:
                        task_name = line.split("TASK [")[1].split("]")[0] if "] " in line else "unknown"
                        tasks_found.append(f"Line {i+1}: {task_name}")
                    
                    if "localhost" in line and any(status in line for status in ["changed:", "ok:", "failed:", "fatal:"]):
                        results_found.append(f"Line {i+1}: {line.strip()}")
                
                print(f"\n📋 Manual analysis:")
                print(f"   Tasks found: {len(tasks_found)}")
                for task in tasks_found:
                    print(f"     {task}")
                
                print(f"   Results found: {len(results_found)}")
                for result in results_found:
                    print(f"     {result}")
            
            # Clean up
            if artifacts:
                for artifact in artifacts:
                    db.session.delete(artifact)
            db.session.delete(test_execution)
            db.session.commit()
            
            return len(artifacts) > 0
            
        except Exception as e:
            print(f"❌ Error during test: {e}")
            import traceback
            traceback.print_exc()
            db.session.rollback()
            return False

def check_current_artifacts():
    """Check what artifacts currently exist in the database"""
    with app.app_context():
        try:
            all_artifacts = Artifact.query.all()
            print(f"📊 Current artifacts in database: {len(all_artifacts)}")
            
            for artifact in all_artifacts[-5:]:  # Show last 5
                print(f"   ID: {artifact.id}")
                print(f"   Task: {artifact.task_name}")
                print(f"   Register: {artifact.register_name}")
                print(f"   Host: {artifact.host_name}")
                print(f"   Execution: {artifact.execution_id}")
                print(f"   Created: {artifact.created_at}")
                print("   ---")
            
            return len(all_artifacts)
            
        except Exception as e:
            print(f"❌ Error checking artifacts: {e}")
            return 0

def main():
    print("🔍 Simple Artifacts Debug Test")
    print("=" * 40)
    
    # Check current state
    current_count = check_current_artifacts()
    
    # Test extraction
    success = test_with_real_ansible_output()
    
    if success:
        print("\n✅ Artifact extraction works!")
        print("💡 The issue might be:")
        print("   1. Playbook executions are failing before artifacts can be created")
        print("   2. The output format from real executions is different")
        print("   3. Database constraints are preventing artifact saves")
    else:
        print("\n❌ Artifact extraction is broken!")
        print("💡 The pattern matching logic needs to be fixed")
    
    print(f"\n📈 Total artifacts in database: {current_count}")

if __name__ == "__main__":
    main()