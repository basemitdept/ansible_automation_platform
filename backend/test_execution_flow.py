#!/usr/bin/env python3
"""
Test the complete execution flow to see where artifacts are getting lost
"""
import os
import sys
from datetime import datetime
from models import db, Playbook, Host, ExecutionHistory, Artifact, Task
from app import app

def test_complete_flow():
    """Test the complete flow from execution to artifacts"""
    with app.app_context():
        try:
            print("🔍 Testing complete execution flow...")
            
            # 1. Check if we have any executions at all
            recent_executions = ExecutionHistory.query.order_by(ExecutionHistory.started_at.desc()).limit(5).all()
            print(f"\n📊 Recent executions in database: {len(recent_executions)}")
            
            for i, execution in enumerate(recent_executions):
                print(f"   {i+1}. ID: {execution.id}")
                print(f"      Playbook ID: {execution.playbook_id}")
                print(f"      Status: {execution.status}")
                print(f"      Started: {execution.started_at}")
                print(f"      Host ID: {execution.host_id}")
                
                # Check artifacts for this execution
                artifacts = Artifact.query.filter_by(execution_id=execution.id).all()
                print(f"      Artifacts: {len(artifacts)}")
                
                if artifacts:
                    for j, artifact in enumerate(artifacts):
                        print(f"        {j+1}. {artifact.task_name} -> {artifact.register_name}")
                else:
                    print(f"        ❌ No artifacts found!")
                print()
            
            # 2. Check if we have any tasks
            recent_tasks = Task.query.order_by(Task.started_at.desc()).limit(5).all()
            print(f"📋 Recent tasks in database: {len(recent_tasks)}")
            
            for i, task in enumerate(recent_tasks):
                print(f"   {i+1}. ID: {task.id}")
                print(f"      Playbook ID: {task.playbook_id}")
                print(f"      Status: {task.status}")
                print(f"      Started: {task.started_at}")
                print(f"      Output length: {len(task.output) if task.output else 0}")
                print(f"      Error output: {len(task.error_output) if task.error_output else 0}")
                print()
            
            # 3. Check if we have any playbooks
            playbooks = Playbook.query.all()
            print(f"📚 Playbooks in database: {len(playbooks)}")
            
            for playbook in playbooks[:3]:
                print(f"   - {playbook.name} (ID: {playbook.id})")
            
            # 4. Check if we have any hosts
            hosts = Host.query.all()
            print(f"🖥️  Hosts in database: {len(hosts)}")
            
            for host in hosts[:3]:
                print(f"   - {host.name} ({host.hostname})")
            
            # 5. If we have a recent execution, let's examine its output
            if recent_executions:
                latest = recent_executions[0]
                print(f"\n🔍 Examining latest execution: {latest.id}")
                print(f"   Status: {latest.status}")
                print(f"   Output length: {len(latest.output) if latest.output else 0}")
                
                if latest.output:
                    print(f"   First 500 chars of output:")
                    print("   " + "="*50)
                    print("   " + latest.output[:500])
                    print("   " + "="*50)
                    
                    # Try to manually extract artifacts from this output
                    if len(hosts) > 0:
                        print(f"\n🧪 Manually testing artifact extraction on this output...")
                        from app import extract_register_from_output
                        
                        output_lines = latest.output.split('\n')
                        test_artifacts = extract_register_from_output(output_lines, latest.id, hosts[:1])
                        
                        print(f"   Manual extraction result: {len(test_artifacts)} artifacts")
                        
                        if test_artifacts:
                            print("   ✅ Extraction works! Artifacts should have been created.")
                        else:
                            print("   ❌ Extraction failed - this is the problem!")
                else:
                    print("   ❌ No output in execution - this might be the problem!")
            
            return len(recent_executions), len(recent_tasks)
            
        except Exception as e:
            print(f"❌ Error during flow test: {e}")
            import traceback
            traceback.print_exc()
            return 0, 0

def check_database_constraints():
    """Check if database constraints are preventing saves"""
    with app.app_context():
        try:
            print("🔧 Checking database constraints...")
            
            # Try to create a test artifact
            test_execution = ExecutionHistory(
                playbook_id='test-constraint-check',
                host_id=None,  # Test nullable
                status='test',
                started_at=datetime.utcnow(),
                output='test',
                username='test',
                host_list='[]'
            )
            
            db.session.add(test_execution)
            db.session.commit()
            
            test_artifact = Artifact(
                execution_id=test_execution.id,
                task_name='Test Task',
                register_name='test_var',
                register_data='{"test": "data"}',
                host_name='test-host',
                task_status='ok'
            )
            
            db.session.add(test_artifact)
            db.session.commit()
            
            print("✅ Database constraints are OK - can create artifacts")
            
            # Clean up
            db.session.delete(test_artifact)
            db.session.delete(test_execution)
            db.session.commit()
            
            return True
            
        except Exception as e:
            print(f"❌ Database constraint error: {e}")
            db.session.rollback()
            return False

def main():
    print("🚀 Complete Execution Flow Test")
    print("=" * 50)
    
    # Test database constraints first
    constraints_ok = check_database_constraints()
    
    # Test the complete flow
    executions, tasks = test_complete_flow()
    
    print("\n" + "=" * 50)
    print("📊 DIAGNOSIS:")
    
    if not constraints_ok:
        print("❌ PROBLEM: Database constraints are preventing artifact creation")
        print("💡 SOLUTION: Run the database migration script")
    elif executions == 0:
        print("❌ PROBLEM: No executions found - playbooks aren't being executed at all")
        print("💡 SOLUTION: Check if playbook execution is working")
    elif tasks == 0:
        print("❌ PROBLEM: No tasks found - execution system isn't creating task records")
        print("💡 SOLUTION: Check task creation logic")
    else:
        print("✅ Executions and tasks are being created")
        print("❌ PROBLEM: Artifact extraction is failing during execution")
        print("💡 SOLUTION: The artifact extraction logic needs debugging")
    
    print(f"\n📈 Summary: {executions} executions, {tasks} tasks found")

if __name__ == "__main__":
    main()