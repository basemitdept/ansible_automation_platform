#!/usr/bin/env python3
"""
Clean up fallback "Execution Summary" artifacts that were created as a temporary measure
"""
from models import db, Artifact
from app import app

def cleanup_fallback_artifacts():
    """Remove fallback artifacts created by the temporary fix"""
    with app.app_context():
        try:
            # Find all fallback artifacts
            fallback_artifacts = Artifact.query.filter_by(
                task_name='Execution Summary',
                register_name='execution_output'
            ).all()
            
            print(f"Found {len(fallback_artifacts)} fallback artifacts to remove")
            
            # Delete them
            for artifact in fallback_artifacts:
                print(f"Removing fallback artifact: {artifact.id} (execution: {artifact.execution_id})")
                db.session.delete(artifact)
            
            db.session.commit()
            print(f"✅ Removed {len(fallback_artifacts)} fallback artifacts")
            
            return len(fallback_artifacts)
            
        except Exception as e:
            print(f"❌ Error cleaning up fallback artifacts: {e}")
            db.session.rollback()
            return 0

if __name__ == "__main__":
    print("🧹 Cleaning up fallback 'Execution Summary' artifacts...")
    removed_count = cleanup_fallback_artifacts()
    
    if removed_count > 0:
        print(f"✅ Successfully removed {removed_count} fallback artifacts")
        print("💡 Now only real register variables from playbooks will appear as artifacts")
    else:
        print("ℹ️  No fallback artifacts found to remove")
    
    print("\n📋 To see real artifacts:")
    print("1. Use playbooks that contain 'register:' statements")
    print("2. Examples: register-demo.yml, echo.yml")
    print("3. Simple playbooks without 'register:' won't create artifacts")