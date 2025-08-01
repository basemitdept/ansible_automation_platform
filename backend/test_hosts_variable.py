#!/usr/bin/env python3
"""
Test the hosts variable support for dynamic playbook execution
"""
import os
import sys
from datetime import datetime
from models import db, Playbook, ExecutionHistory, Artifact
from app import app, extract_register_from_output

def test_hosts_variable_extraction():
    """Test artifact extraction with hosts variable"""
    
    # Simulate output from a playbook using hosts: "{{hosts}}"
    # where hosts variable contains "192.168.1.10,192.168.1.11"
    sample_output_with_hosts_var = '''
PLAY [Test playbook with dynamic hosts] ****************************************

TASK [Gathering Facts] *********************************************************
skipping: [192.168.1.10]
skipping: [192.168.1.11]

TASK [Get hostname] ************************************************************
changed: [192.168.1.10] => {"changed": true, "cmd": ["hostname"], "delta": "0:00:00.003", "end": "2024-01-15 14:30:45.123", "rc": 0, "start": "2024-01-15 14:30:45.120", "stderr": "", "stderr_lines": [], "stdout": "server1", "stdout_lines": ["server1"]}
changed: [192.168.1.11] => {"changed": true, "cmd": ["hostname"], "delta": "0:00:00.003", "end": "2024-01-15 14:30:45.456", "rc": 0, "start": "2024-01-15 14:30:45.453", "stderr": "", "stderr_lines": [], "stdout": "server2", "stdout_lines": ["server2"]}

TASK [Check disk space] ********************************************************
ok: [192.168.1.10] => {"changed": false, "cmd": ["df", "-h"], "delta": "0:00:00.002", "end": "2024-01-15 14:30:45.789", "rc": 0, "start": "2024-01-15 14:30:45.787", "stderr": "", "stderr_lines": [], "stdout": "Filesystem      Size  Used Avail Use% Mounted on\\n/dev/sda1        20G  5.5G   14G  30% /", "stdout_lines": ["Filesystem      Size  Used Avail Use% Mounted on", "/dev/sda1        20G  5.5G   14G  30% /"]}
ok: [192.168.1.11] => {"changed": false, "cmd": ["df", "-h"], "delta": "0:00:00.002", "end": "2024-01-15 14:30:45.999", "rc": 0, "start": "2024-01-15 14:30:45.997", "stderr": "", "stderr_lines": [], "stdout": "Filesystem      Size  Used Avail Use% Mounted on\\n/dev/sda1        30G  8.2G   20G  30% /", "stdout_lines": ["Filesystem      Size  Used Avail Use% Mounted on", "/dev/sda1        30G  8.2G   20G  30% /"]}

PLAY RECAP *********************************************************************
192.168.1.10               : ok=2    changed=1    unreachable=0    failed=0    skipped=1    rescued=0    ignored=0
192.168.1.11               : ok=2    changed=1    unreachable=0    failed=0    skipped=1    rescued=0    ignored=0
'''.strip().split('\n')

    print("🧪 Testing hosts variable support...")
    print(f"📝 Sample output has {len(sample_output_with_hosts_var)} lines")
    
    with app.app_context():
        try:
            # Create a test execution
            test_execution = ExecutionHistory(
                playbook_id='test-hosts-variable',
                host_id=None,
                status='completed',
                started_at=datetime.utcnow(),
                finished_at=datetime.utcnow(),
                output='Test execution with hosts variable',
                username='test',
                host_list='[]'
            )
            
            db.session.add(test_execution)
            db.session.commit()
            
            print(f"✅ Created test execution: {test_execution.id}")
            
            # Create pseudo-hosts from hosts variable (simulating the extraction logic)
            class PseudoHost:
                def __init__(self, hostname):
                    self.hostname = hostname
                    self.name = hostname
            
            # Simulate hosts variable: "192.168.1.10,192.168.1.11"
            hosts_variable = "192.168.1.10,192.168.1.11"
            dynamic_hosts = []
            for ip in hosts_variable.split(','):
                ip = ip.strip()
                if ip:
                    dynamic_hosts.append(PseudoHost(ip))
            
            print(f"🔧 Created {len(dynamic_hosts)} hosts from variable:")
            for host in dynamic_hosts:
                print(f"   - {host.hostname}")
            
            # Test the extraction function
            print("\n🔍 Running artifact extraction...")
            artifacts = extract_register_from_output(sample_output_with_hosts_var, test_execution.id, dynamic_hosts)
            
            print(f"\n📊 Results:")
            print(f"   Extracted {len(artifacts)} artifacts")
            
            if artifacts:
                for i, artifact in enumerate(artifacts):
                    print(f"   Artifact {i+1}:")
                    print(f"     Task: {artifact.task_name}")
                    print(f"     Register: {artifact.register_name}")
                    print(f"     Host: {artifact.host_name}")
                    print(f"     Status: {artifact.task_status}")
                    print(f"     Data preview: {artifact.register_data[:100]}...")
                
                # Save them
                for artifact in artifacts:
                    db.session.add(artifact)
                db.session.commit()
                print(f"✅ Saved {len(artifacts)} artifacts to database")
                
                # Verify retrieval
                saved_artifacts = Artifact.query.filter_by(execution_id=test_execution.id).all()
                print(f"✅ Verified: {len(saved_artifacts)} artifacts in database")
                
                # Clean up
                for artifact in artifacts:
                    db.session.delete(artifact)
            else:
                print("❌ No artifacts extracted!")
                print("\n🔍 Manual analysis:")
                
                # Check for expected patterns
                task_lines = [line for line in sample_output_with_hosts_var if "TASK [" in line]
                result_lines = [line for line in sample_output_with_hosts_var if any(ip in line for ip in ["192.168.1.10", "192.168.1.11"]) and any(status in line for status in ["ok:", "changed:", "failed:"])]
                
                print(f"   Tasks found: {len(task_lines)}")
                for task in task_lines:
                    print(f"     {task}")
                
                print(f"   Results found: {len(result_lines)}")
                for result in result_lines[:3]:  # Show first 3
                    print(f"     {result}")
            
            # Clean up
            db.session.delete(test_execution)
            db.session.commit()
            
            return len(artifacts) > 0
            
        except Exception as e:
            print(f"❌ Error during test: {e}")
            import traceback
            traceback.print_exc()
            db.session.rollback()
            return False

def main():
    print("🚀 Testing hosts variable support for artifacts")
    print("=" * 50)
    
    success = test_hosts_variable_extraction()
    
    if success:
        print("\n✅ hosts variable support works!")
        print("💡 Your playbooks using hosts: \"{{hosts}}\" should now create artifacts")
        print("📋 Make sure to pass the 'hosts' variable when executing playbooks")
    else:
        print("\n❌ hosts variable support needs more work")
        print("💡 Check the pattern matching logic")

if __name__ == "__main__":
    main()