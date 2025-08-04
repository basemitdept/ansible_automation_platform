"""
Database initialization and seeding module.
This replaces all the SQL migration files with Python code that runs automatically.
"""

import os
import uuid
from datetime import datetime
from werkzeug.security import generate_password_hash
from sqlalchemy import text
from models import db, User, Playbook, Host, HostGroup, Task, ExecutionHistory, Credential, Webhook, ApiToken

def create_database_schema():
    """Create all database tables and schema"""
    print("Creating database schema...")
    
    try:
        # Create all tables defined in models
        db.create_all()
        print("✅ Database schema created successfully")
        
        # Add any additional columns that might be missing
        ensure_additional_columns()
        
    except Exception as e:
        print(f"❌ Error creating database schema: {e}")
        raise

def ensure_additional_columns():
    """Ensure all additional columns exist that might not be in the base model"""
    try:
        # Ensure os_type and port columns exist in hosts table
        db.session.execute(text("""
            ALTER TABLE hosts ADD COLUMN IF NOT EXISTS os_type VARCHAR(50) DEFAULT 'linux';
        """))
        
        db.session.execute(text("""
            ALTER TABLE hosts ADD COLUMN IF NOT EXISTS port INTEGER DEFAULT 22;
        """))
        
        # Ensure os_type column exists in playbooks table
        db.session.execute(text("""
            ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS os_type VARCHAR(50) DEFAULT 'linux';
        """))
        
        # Ensure host_list column exists in tasks table
        db.session.execute(text("""
            ALTER TABLE tasks ADD COLUMN IF NOT EXISTS host_list TEXT;
        """))
        
        # Ensure serial_id column exists in tasks table
        db.session.execute(text("""
            ALTER TABLE tasks ADD COLUMN IF NOT EXISTS serial_id VARCHAR(36);
        """))
        
        # Ensure webhook-related columns
        db.session.execute(text("""
            ALTER TABLE tasks ADD COLUMN IF NOT EXISTS webhook_id VARCHAR(36);
        """))
        
        db.session.commit()
        print("✅ Additional columns ensured")
        
    except Exception as e:
        db.session.rollback()
        print(f"⚠️ Warning: Could not ensure additional columns: {e}")

def seed_default_data():
    """Seed the database with default data"""
    print("Seeding default data...")
    
    try:
        # Create default admin user
        create_default_admin()
        
        # Create default host groups
        create_default_host_groups()
        
        # Create localhost host
        create_localhost_host()
        
        # Create sample playbooks
        create_sample_playbooks()
        
        # Create default credentials
        create_default_credentials()
        
        print("✅ Default data seeded successfully")
        
    except Exception as e:
        print(f"❌ Error seeding default data: {e}")
        raise

def create_default_admin():
    """Create the default admin user"""
    try:
        # Check if admin user already exists
        admin = User.query.filter_by(username='admin').first()
        if admin:
            print("ℹ️ Default admin user already exists")
            return
        
        # Create admin user
        admin_user = User(
            id=str(uuid.uuid4()),
            username='admin',
            password_hash=generate_password_hash('admin123'),
            role='admin',
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        db.session.add(admin_user)
        db.session.commit()
        print("✅ Default admin user created (username: admin, password: admin123)")
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error creating default admin user: {e}")

def create_default_host_groups():
    """Create default host groups"""
    try:
        default_groups = [
            {
                'name': 'Production',
                'description': 'Production servers',
                'color': '#ff4d4f'
            },
            {
                'name': 'Development',
                'description': 'Development and testing servers',
                'color': '#52c41a'
            },
            {
                'name': 'Staging',
                'description': 'Staging environment servers',
                'color': '#faad14'
            }
        ]
        
        for group_data in default_groups:
            # Check if group already exists
            existing = HostGroup.query.filter_by(name=group_data['name']).first()
            if existing:
                continue
                
            group = HostGroup(
                id=str(uuid.uuid4()),
                name=group_data['name'],
                description=group_data['description'],
                color=group_data['color'],
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            
            db.session.add(group)
        
        db.session.commit()
        print("✅ Default host groups created")
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error creating default host groups: {e}")

def create_localhost_host():
    """Create localhost host for testing"""
    try:
        # Check if localhost already exists
        localhost = Host.query.filter_by(name='localhost').first()
        if localhost:
            print("ℹ️ Localhost host already exists")
            return
        
        # Get Development group
        dev_group = HostGroup.query.filter_by(name='Development').first()
        
        localhost_host = Host(
            id=str(uuid.uuid4()),
            name='localhost',
            hostname='localhost',
            description='Local development server',
            os_type='linux',
            port=22,
            group_id=dev_group.id if dev_group else None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        db.session.add(localhost_host)
        db.session.commit()
        print("✅ Localhost host created")
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error creating localhost host: {e}")

def create_sample_playbooks():
    """Create sample playbooks"""
    try:
        sample_playbooks = [
            {
                'name': 'system-info-linux',
                'description': 'Get system information from Linux hosts',
                'os_type': 'linux',
                'content': '''---
- name: Get system information
  hosts: all
  become: yes
  tasks:
    - name: Get hostname
      command: hostname
      register: hostname_result
    
    - name: Get uptime
      command: uptime
      register: uptime_result
    
    - name: Get disk usage
      command: df -h
      register: disk_result
    
    - name: Display system info
      debug:
        msg: |
          Hostname: {{ hostname_result.stdout }}
          Uptime: {{ uptime_result.stdout }}
          Disk Usage: {{ disk_result.stdout }}'''
            },
            {
                'name': 'system-info-windows',
                'description': 'Get system information from Windows hosts',
                'os_type': 'windows',
                'content': '''---
- name: Get Windows system information
  hosts: all
  tasks:
    - name: Get computer name
      win_shell: hostname
      register: hostname_result
    
    - name: Get system info
      win_shell: systeminfo | findstr /C:"Host Name" /C:"OS Name" /C:"System Up Time"
      register: sysinfo_result
    
    - name: Get disk usage
      win_shell: wmic logicaldisk get size,freespace,caption
      register: disk_result
    
    - name: Display system info
      debug:
        msg: |
          Computer: {{ hostname_result.stdout }}
          System Info: {{ sysinfo_result.stdout }}
          Disk Info: {{ disk_result.stdout }}'''
            }
        ]
        
        for pb_data in sample_playbooks:
            # Check if playbook already exists
            existing = Playbook.query.filter_by(name=pb_data['name']).first()
            if existing:
                continue
            
            playbook = Playbook(
                id=str(uuid.uuid4()),
                name=pb_data['name'],
                description=pb_data['description'],
                content=pb_data['content'],
                os_type=pb_data['os_type'],
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            
            db.session.add(playbook)
            
            # Also create the playbook file
            playbooks_dir = '/app/playbooks'
            os.makedirs(playbooks_dir, exist_ok=True)
            playbook_file = os.path.join(playbooks_dir, f"{pb_data['name']}.yml")
            with open(playbook_file, 'w') as f:
                f.write(pb_data['content'])
        
        db.session.commit()
        print("✅ Sample playbooks created")
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error creating sample playbooks: {e}")

def create_default_credentials():
    """Create default SSH credentials"""
    try:
        # Check if default credential already exists
        existing = Credential.query.filter_by(name='Default SSH').first()
        if existing:
            print("ℹ️ Default credentials already exist")
            return
        
        default_cred = Credential(
            id=str(uuid.uuid4()),
            name='Default SSH',
            username='ansible',
            password_hash=generate_password_hash('ansible123'),
            description='Default SSH credentials for Ansible automation',
            is_default=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        db.session.add(default_cred)
        db.session.commit()
        print("✅ Default credentials created (username: ansible, password: ansible123)")
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error creating default credentials: {e}")

def create_ansible_user():
    """Create the ansible_user role if it doesn't exist"""
    try:
        import psycopg2
        
        print("Checking and creating ansible_user role...")
        
        # Connect as postgres superuser to create the ansible_user
        postgres_url = "postgresql://postgres:postgres_password@postgres:5432/ansible_automation"
        
        print("Connecting as postgres to create ansible_user...")
        conn = psycopg2.connect(postgres_url)
        conn.autocommit = True
        cursor = conn.cursor()
        
        # Check if user exists
        cursor.execute("SELECT 1 FROM pg_roles WHERE rolname = 'ansible_user'")
        user_exists = cursor.fetchone() is not None
        
        if not user_exists:
            print("Creating ansible_user role...")
            
            # Create the user
            cursor.execute("CREATE USER ansible_user WITH PASSWORD 'ansible_password'")
            
            # Grant database privileges
            cursor.execute("GRANT ALL PRIVILEGES ON DATABASE ansible_automation TO ansible_user")
            
            # Grant schema privileges
            cursor.execute("GRANT ALL ON SCHEMA public TO ansible_user")
            
            # Grant table privileges (for existing tables)
            cursor.execute("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ansible_user")
            
            # Grant sequence privileges
            cursor.execute("GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ansible_user")
            
            # Set default privileges for future objects
            cursor.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ansible_user")
            cursor.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ansible_user")
            
            print("✅ ansible_user role created successfully")
        else:
            print("ℹ️ ansible_user role already exists")
            
            # Still grant privileges in case they're missing
            try:
                cursor.execute("GRANT ALL PRIVILEGES ON DATABASE ansible_automation TO ansible_user")
                cursor.execute("GRANT ALL ON SCHEMA public TO ansible_user")
                cursor.execute("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ansible_user")
                cursor.execute("GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ansible_user")
                print("✅ Ensured ansible_user privileges are up to date")
            except Exception as e:
                print(f"⚠️ Warning: Could not update ansible_user privileges: {e}")
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Error creating/checking ansible_user: {e}")
        try:
            cursor.close()
            conn.close()
        except:
            pass
        raise

def initialize_database():
    """Main function to initialize the entire database"""
    print("🚀 Starting database initialization...")
    
    try:
        # First, create the ansible_user role
        create_ansible_user()
        
        # Create schema and tables
        create_database_schema()
        
        # Seed with default data
        seed_default_data()
        
        print("🎉 Database initialization completed successfully!")
        return True
        
    except Exception as e:
        print(f"💥 Database initialization failed: {e}")
        return False

if __name__ == '__main__':
    from app import app
    with app.app_context():
        initialize_database()