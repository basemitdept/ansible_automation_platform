#!/usr/bin/env python3
"""
Simple test to verify playbook execution and artifact creation
"""
import os
import sys
import subprocess
import tempfile
from datetime import datetime

def create_test_inventory():
    """Create a simple test inventory"""
    inventory_content = """[all]
localhost ansible_connection=local

[all:vars]
ansible_python_interpreter=/usr/bin/python3
"""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.ini', delete=False) as f:
        f.write(inventory_content)
        return f.name

def create_test_playbook():
    """Create a simple test playbook with register statements"""
    playbook_content = """---
- name: Simple Test Playbook
  hosts: all
  gather_facts: no
  tasks:
    - name: Get hostname
      command: hostname
      register: hostname_result
      
    - name: Get current date
      command: date
      register: date_result
      
    - name: Display results
      debug:
        msg: |
          Hostname: {{ hostname_result.stdout }}
          Date: {{ date_result.stdout }}
"""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yml', delete=False) as f:
        f.write(playbook_content)
        return f.name

def run_ansible_test():
    """Run a simple ansible test and capture output"""
    print("🧪 Running simple Ansible test...")
    
    inventory_path = create_test_inventory()
    playbook_path = create_test_playbook()
    
    try:
        # Run ansible-playbook with maximum verbosity
        cmd = [
            'ansible-playbook',
            '-i', inventory_path,
            playbook_path,
            '-vvv'
        ]
        
        print(f"Running command: {' '.join(cmd)}")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        print(f"\n📊 Exit code: {result.returncode}")
        print(f"📝 STDOUT ({len(result.stdout)} chars):")
        print("=" * 50)
        print(result.stdout)
        print("=" * 50)
        
        if result.stderr:
            print(f"❌ STDERR ({len(result.stderr)} chars):")
            print("=" * 50)
            print(result.stderr)
            print("=" * 50)
        
        # Analyze output for artifact patterns
        print("\n🔍 Analyzing output for artifact patterns...")
        lines = result.stdout.split('\n')
        
        task_count = 0
        register_count = 0
        host_results = 0
        
        for i, line in enumerate(lines):
            if "TASK [" in line and "] **" in line:
                task_count += 1
                task_name = line.split("TASK [")[1].split("]")[0].strip()
                print(f"  📋 Found task: {task_name}")
            
            if "ok: [localhost]" in line or "changed: [localhost]" in line:
                host_results += 1
                print(f"  ✅ Found host result: {line.strip()}")
                
                # Check if this line has JSON output
                if "=> {" in line:
                    print(f"    📊 Has JSON output: {line[line.find('=>'):line.find('=>')+50]}...")
            
            if "register:" in line:
                register_count += 1
        
        print(f"\n📈 Summary:")
        print(f"  Tasks found: {task_count}")
        print(f"  Register statements in playbook: {register_count}")
        print(f"  Host results found: {host_results}")
        
        return result.returncode == 0, result.stdout
        
    except subprocess.TimeoutExpired:
        print("❌ Test timed out after 60 seconds")
        return False, ""
    except Exception as e:
        print(f"❌ Error running test: {e}")
        return False, ""
    finally:
        # Clean up
        try:
            os.unlink(inventory_path)
            os.unlink(playbook_path)
        except:
            pass

if __name__ == "__main__":
    print("🚀 Testing Ansible execution and output format...")
    success, output = run_ansible_test()
    
    if success:
        print("\n✅ Ansible test completed successfully!")
        print("💡 Check the output above to see if the patterns match what the artifact extraction logic expects.")
    else:
        print("\n❌ Ansible test failed!")
        print("💡 Fix the Ansible setup before debugging artifact extraction.")