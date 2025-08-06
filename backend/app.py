from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from flask_jwt_extended import JWTManager, jwt_required, create_access_token, get_jwt_identity, verify_jwt_in_request
from sqlalchemy import text
from models import db, User, Playbook, Host, HostGroup, Task, ExecutionHistory, Artifact, Credential, Webhook, ApiToken, PlaybookFile
import os
import threading
import subprocess
import tempfile
from datetime import datetime, timedelta
import json
import time
import secrets
import uuid
from werkzeug.utils import secure_filename
import mimetypes
import shutil
from functools import wraps

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'your-secret-key-here'
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-string-change-this-in-production')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=24)

db.init_app(app)
jwt = JWTManager(app)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", logger=True, engineio_logger=True)

# WebSocket event handlers
@socketio.on('connect')
def handle_connect():
    print(f"🔴 WEBSOCKET: Client connected - {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    print(f"🔴 WEBSOCKET: Client disconnected - {request.sid}")

PLAYBOOKS_DIR = '/app/playbooks'
FILES_DIR = '/app/playbook_files'

# Ensure directories exist
os.makedirs(PLAYBOOKS_DIR, exist_ok=True)
os.makedirs(FILES_DIR, exist_ok=True)

# Configure file upload settings
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size
ALLOWED_EXTENSIONS = {
    'txt', 'py', 'sh', 'bash', 'ps1', 'bat', 'cmd', 'sql', 'json', 'xml', 'yml', 'yaml',
    'conf', 'config', 'ini', 'properties', 'service', 'timer', 'socket', 'mount',
    'tar', 'gz', 'zip', 'deb', 'rpm', 'pkg', 'dmg', 'msi', 'exe', 'jar', 'war'
}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def create_ansible_user_if_needed():
    """Create ansible_user role if it doesn't exist (for app startup)"""
    try:
        import psycopg2
        
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
            print("Creating ansible_user role during app startup...")
            
            # Create the user
            cursor.execute("CREATE USER ansible_user WITH PASSWORD 'ansible_password'")
            
            # Grant privileges
            cursor.execute("GRANT ALL PRIVILEGES ON DATABASE ansible_automation TO ansible_user")
            cursor.execute("GRANT ALL ON SCHEMA public TO ansible_user")
            cursor.execute("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ansible_user")
            cursor.execute("GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ansible_user")
            cursor.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ansible_user")
            cursor.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ansible_user")
            
            print("✅ ansible_user role created during app startup")
        else:
            print("ℹ️ ansible_user role already exists")
            
        cursor.close()
        conn.close()
            
    except Exception as e:
        print(f"⚠️ Warning: Could not create ansible_user during startup: {e}")
        try:
            cursor.close()
            conn.close()
        except:
            pass

def init_database():
    """Initialize database with retry logic"""
    max_retries = 30
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            with app.app_context():
                # Test connection first
                with db.engine.connect() as connection:
                    connection.execute(text('SELECT 1'))
                
                # Create ansible_user role if needed (fallback if startup script didn't work)
                try:
                    create_ansible_user_if_needed()
                except Exception as user_creation_error:
                    print(f"⚠️ User creation fallback failed: {user_creation_error}")
                    # Continue anyway - maybe the user already exists
                
                # Create tables
                db.create_all()
                print("Database tables created successfully!")
                
                # Create default admin user if it doesn't exist
                create_default_admin_user()
                break
        except Exception as e:
            retry_count += 1
            print(f"Database connection attempt {retry_count}/{max_retries} failed: {str(e)}")
            if retry_count >= max_retries:
                print("Max retries reached. Database initialization failed.")
                raise
            print(f"Retrying in 3 seconds...")
            time.sleep(3)

def create_default_admin_user():
    """Create default admin user if it doesn't exist"""
    try:
        # Check if admin user already exists
        admin_user = User.query.filter_by(username='admin').first()
        if admin_user:
            print("Default admin user already exists")
            return
            
        # Create default admin user
        admin_user = User(
            username='admin',
            role='admin'
        )
        admin_user.set_password('admin')
        
        db.session.add(admin_user)
        db.session.commit()
        print("✅ Default admin user created successfully (username: admin, password: admin)")
        print("⚠️  Please change the default admin password after first login!")
        
    except Exception as e:
        print(f"Failed to create default admin user: {str(e)}")
        db.session.rollback()

# Initialize database
init_database()

def get_next_serial_id():
    """Get the next sequential ID for tasks"""
    try:
        # Try to get the maximum existing serial_id
        max_serial = db.session.query(db.func.max(Task.serial_id)).scalar()
        return (max_serial or 0) + 1
    except Exception as e:
        print(f"Error getting next serial ID: {e}")
        # Fallback: count existing tasks + 1
        try:
            task_count = Task.query.count()
            return task_count + 1
        except Exception as e2:
            print(f"Error getting task count: {e2}")
            return 1

# Authentication middleware
def require_permission(permission):
    """Decorator to require specific permission for a route"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                verify_jwt_in_request()
                current_user_id = get_jwt_identity()
                user = User.query.get(current_user_id)
                
                if not user:
                    return jsonify({'error': 'User not found'}), 401
                
                if not user.has_permission(permission):
                    return jsonify({'error': 'Insufficient permissions'}), 403
                    
                return func(*args, **kwargs)
            except Exception as e:
                return jsonify({'error': 'Authentication required'}), 401
        return wrapper
    return decorator

def get_current_user():
    """Get current authenticated user"""
    try:
        verify_jwt_in_request()
        current_user_id = get_jwt_identity()
        
        # Handle temporary admin user when database isn't initialized
        if current_user_id == 'temp-admin-id':
            # Create a temporary User-like object
            class TempUser:
                def __init__(self):
                    self.id = 'temp-admin-id'
                    self.username = 'admin'
                    self.role = 'admin'
                
                def has_permission(self, action):
                    return True  # Admin has all permissions
                
                def to_dict(self):
                    return {
                        'id': self.id,
                        'username': self.username,
                        'role': self.role,
                        'created_at': datetime.utcnow().isoformat() + 'Z',
                        'updated_at': datetime.utcnow().isoformat() + 'Z'
                    }
            
            return TempUser()
        
        return User.query.get(current_user_id)
    except:
        return None

# Authentication routes
@app.route('/api/auth/login', methods=['POST'])
def login():
    """User login endpoint"""
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'error': 'Username and password required'}), 400
    
    try:
        user = User.query.filter_by(username=data['username']).first()
        
        if not user or not user.check_password(data['password']):
            return jsonify({'error': 'Invalid username or password'}), 401
        
        # Create access token
        access_token = create_access_token(identity=str(user.id))
        
        return jsonify({
            'message': 'Login successful',
            'access_token': access_token,
            'user': user.to_dict()
        }), 200
        
    except Exception as e:
        # If users table doesn't exist, allow default login for development
        print(f"Database error during login: {e}")
        if data.get('username') == 'admin' and data.get('password') == 'admin':
            # Create a temporary user object for the response
            access_token = create_access_token(identity='temp-admin-id')
            return jsonify({
                'message': 'Login successful (temporary mode)',
                'access_token': access_token,
                'user': {
                    'id': 'temp-admin-id',
                    'username': 'admin',
                    'role': 'admin',
                    'created_at': datetime.utcnow().isoformat() + 'Z',
                    'updated_at': datetime.utcnow().isoformat() + 'Z'
                }
            }), 200
        else:
            return jsonify({'error': 'Database not initialized. Use admin/admin to login.'}), 401

@app.route('/api/auth/current-user', methods=['GET'])
@jwt_required()
def get_current_user_info():
    """Get current user information"""
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify({'user': user.to_dict()}), 200

@app.route('/api/auth/logout', methods=['POST'])
@jwt_required()
def logout():
    """User logout endpoint"""
    # In a stateless JWT system, logout is handled client-side by removing the token
    return jsonify({'message': 'Logout successful'}), 200

# User management routes
@app.route('/api/users', methods=['GET'])
@require_permission('read')
def get_users():
    """Get all users (admin and editor only)"""
    current_user = get_current_user()
    if current_user and current_user.role in ['admin', 'editor']:
        users = User.query.all()
        return jsonify([user.to_dict() for user in users])
    return jsonify({'error': 'Insufficient permissions'}), 403

@app.route('/api/users', methods=['POST'])
@require_permission('create_user')
def create_user():
    """Create new user (admin only)"""
    current_user = get_current_user()
    if not current_user or current_user.role != 'admin':
        return jsonify({'error': 'Admin privileges required'}), 403
    
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'error': 'Username and password required'}), 400
    
    # Check if username already exists
    existing_user = User.query.filter_by(username=data['username']).first()
    if existing_user:
        return jsonify({'error': 'Username already exists'}), 400
    
    # Validate role
    role = data.get('role', 'user')
    if role not in ['admin', 'editor', 'user']:
        return jsonify({'error': 'Invalid role'}), 400
    
    try:
        user = User(
            username=data['username'],
            role=role
        )
        user.set_password(data['password'])
        
        db.session.add(user)
        db.session.commit()
        
        return jsonify({
            'message': 'User created successfully',
            'user': user.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<user_id>', methods=['PUT'])
@require_permission('edit_user')
def update_user(user_id):
    """Update user (admin only, or user updating their own password)"""
    current_user = get_current_user()
    if not current_user:
        return jsonify({'error': 'Authentication required'}), 401
    
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    data = request.get_json()
    
    # Users can only update their own password
    if current_user.id != user.id and current_user.role != 'admin':
        return jsonify({'error': 'Can only update your own account'}), 403
    
    try:
        # Admin can update any field, users can only update their own password
        if current_user.role == 'admin':
            if 'username' in data:
                # Check if new username is unique
                existing_user = User.query.filter(User.username == data['username'], User.id != user.id).first()
                if existing_user:
                    return jsonify({'error': 'Username already exists'}), 400
                user.username = data['username']
            
            if 'role' in data:
                if data['role'] not in ['admin', 'editor', 'user']:
                    return jsonify({'error': 'Invalid role'}), 400
                user.role = data['role']
        
        # Both admin and user can update password
        if 'password' in data:
            user.set_password(data['password'])
        
        user.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'message': 'User updated successfully',
            'user': user.to_dict()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<user_id>', methods=['DELETE'])
@require_permission('delete_user')
def delete_user(user_id):
    """Delete user (admin only)"""
    current_user = get_current_user()
    if not current_user or current_user.role != 'admin':
        return jsonify({'error': 'Admin privileges required'}), 403
    
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # Prevent deleting the last admin
    if user.role == 'admin':
        admin_count = User.query.filter_by(role='admin').count()
        if admin_count <= 1:
            return jsonify({'error': 'Cannot delete the last admin user'}), 400
    
    # Don't allow deleting yourself
    if user.id == current_user.id:
        return jsonify({'error': 'Cannot delete your own account'}), 400
    
    try:
        db.session.delete(user)
        db.session.commit()
        return jsonify({'message': 'User deleted successfully'}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# Playbook routes
@app.route('/api/playbooks', methods=['GET'])
def get_playbooks():
    playbooks = Playbook.query.all()
    return jsonify([pb.to_dict() for pb in playbooks])

@app.route('/api/playbooks', methods=['POST'])
def create_playbook():
    try:
        data = request.json
        print(f"📝 Creating playbook with data: {data}")
        
        # Validate required fields
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        if not data.get('name'):
            return jsonify({'error': 'Playbook name is required'}), 400
            
        if not data.get('content'):
            return jsonify({'error': 'Playbook content is required'}), 400
        
        # Check if playbook with same name already exists
        existing_playbook = Playbook.query.filter_by(name=data['name']).first()
        if existing_playbook:
            return jsonify({'error': f'Playbook with name "{data["name"]}" already exists'}), 400
        
        # Save playbook content to file
        try:
            playbook_file = os.path.join(PLAYBOOKS_DIR, f"{data['name']}.yml")
            os.makedirs(PLAYBOOKS_DIR, exist_ok=True)
            print(f"📁 Saving playbook file to: {playbook_file}")
            
            with open(playbook_file, 'w') as f:
                f.write(data['content'])
            print(f"✅ Playbook file saved successfully")
        except Exception as file_error:
            print(f"❌ Failed to save playbook file: {file_error}")
            return jsonify({'error': f'Failed to save playbook file: {str(file_error)}'}), 500
        
        # Handle variables - convert to JSON string if provided
        variables_json = None
        if 'variables' in data and data['variables']:
            try:
                variables_json = json.dumps(data['variables'])
            except Exception as var_error:
                print(f"⚠️ Warning: Failed to serialize variables: {var_error}")
        
        # Create playbook object
        try:
            playbook = Playbook(
                name=data['name'],
                content=data['content'],
                description=data.get('description', ''),
                variables=variables_json,
                os_type=data.get('os_type', 'linux'),
                creation_method=data.get('creation_method', 'manual'),
                git_repo_url=data.get('git_repo_url'),
                git_file_path=data.get('git_file_path'),
                git_filename=data.get('git_filename'),
                git_visibility=data.get('git_visibility', 'public'),
                git_credential_id=data.get('git_credential_id')
            )
            print(f"📄 Created playbook object: {playbook.name}")
        except Exception as obj_error:
            print(f"❌ Failed to create playbook object: {obj_error}")
            return jsonify({'error': f'Failed to create playbook object: {str(obj_error)}'}), 500
        
        # Save to database
        try:
            db.session.add(playbook)
            db.session.commit()
            print(f"✅ Playbook saved to database successfully")
            return jsonify(playbook.to_dict()), 201
        except Exception as db_error:
            db.session.rollback()
            print(f"❌ Database error: {db_error}")
            # Try to clean up the file if database save failed
            try:
                if os.path.exists(playbook_file):
                    os.remove(playbook_file)
                    print(f"🧹 Cleaned up playbook file after database error")
            except:
                pass
            return jsonify({'error': f'Database error: {str(db_error)}'}), 500
            
    except Exception as e:
        print(f"❌ Unexpected error in create_playbook: {e}")
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500

@app.route('/api/playbooks/<playbook_id>', methods=['PUT'])
def update_playbook(playbook_id):
    playbook = Playbook.query.get_or_404(playbook_id)
    data = request.json
    
    # Update file
    old_file = os.path.join(PLAYBOOKS_DIR, f"{playbook.name}.yml")
    new_file = os.path.join(PLAYBOOKS_DIR, f"{data['name']}.yml")
    
    if old_file != new_file and os.path.exists(old_file):
        os.rename(old_file, new_file)
    
    with open(new_file, 'w') as f:
        f.write(data['content'])
    
    # Handle variables - convert to JSON string if provided
    variables_json = None
    if 'variables' in data and data['variables']:
        variables_json = json.dumps(data['variables'])
    
    playbook.name = data['name']
    playbook.content = data['content']
    playbook.description = data.get('description', '')
    playbook.variables = variables_json
    playbook.os_type = data.get('os_type', playbook.os_type)
    playbook.updated_at = datetime.utcnow()
    
    try:
        db.session.commit()
        return jsonify(playbook.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/playbooks/<playbook_id>', methods=['DELETE'])
@jwt_required()
@require_permission('delete_playbook')
def delete_playbook(playbook_id):
    try:
        playbook = Playbook.query.get_or_404(playbook_id)
        
        # Check for active tasks using this playbook
        active_tasks = Task.query.filter_by(playbook_id=playbook_id).filter(Task.status.in_(['pending', 'running'])).all()
        if active_tasks:
            return jsonify({'error': f'Cannot delete playbook: {len(active_tasks)} active task(s) are using this playbook'}), 400
        
        # Delete file
        playbook_file = os.path.join(PLAYBOOKS_DIR, f"{playbook.name}.yml")
        if os.path.exists(playbook_file):
            os.remove(playbook_file)
        
        # Delete associated files
        playbook_files = PlaybookFile.query.filter_by(playbook_id=playbook_id).all()
        for pf in playbook_files:
            if os.path.exists(pf.file_path):
                os.remove(pf.file_path)
        
        # Clean up playbook files directory if empty
        playbook_files_dir = os.path.join(FILES_DIR, playbook_id)
        if os.path.exists(playbook_files_dir):
            try:
                os.rmdir(playbook_files_dir)  # Will only remove if empty
            except OSError:
                pass  # Directory not empty, leave it
        
        # Manually delete related records in the correct order to handle foreign key constraints
        # Delete artifacts first (they reference execution_history)
        db.session.execute(db.text("""
            DELETE FROM artifacts 
            WHERE execution_id IN (
                SELECT id FROM execution_history WHERE playbook_id = :playbook_id
            )
        """), {"playbook_id": playbook_id})
        
        # Delete execution history
        db.session.execute(db.text("DELETE FROM execution_history WHERE playbook_id = :playbook_id"), {"playbook_id": playbook_id})
        
        # Delete tasks
        db.session.execute(db.text("DELETE FROM tasks WHERE playbook_id = :playbook_id"), {"playbook_id": playbook_id})
        
        # Delete webhooks
        db.session.execute(db.text("DELETE FROM webhooks WHERE playbook_id = :playbook_id"), {"playbook_id": playbook_id})
        
        # Delete playbook files
        db.session.execute(db.text("DELETE FROM playbook_files WHERE playbook_id = :playbook_id"), {"playbook_id": playbook_id})
        
        # Finally delete the playbook
        db.session.execute(db.text("DELETE FROM playbooks WHERE id = :playbook_id"), {"playbook_id": playbook_id})
        
        db.session.commit()
        
        return jsonify({'message': 'Playbook deleted successfully'}), 200
        
    except Exception as e:
        print(f"Error deleting playbook: {str(e)}")
        db.session.rollback()
        return jsonify({'error': f'Failed to delete playbook: {str(e)}'}), 500

# Git Import endpoint
@app.route('/api/playbooks/git-import', methods=['POST'])
@jwt_required()
def git_import_playbook():
    """Import a playbook from a Git repository"""
    try:
        data = request.json
        print(f"📦 Git import request: {data}")
        
        # Validate required fields
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        repo_url = data.get('repo_url')
        file_path = data.get('file_path', '')
        filename = data.get('filename')
        git_visibility = data.get('git_visibility', 'public')
        git_credential_id = data.get('git_credential_id')
        
        if not repo_url:
            return jsonify({'error': 'Repository URL is required'}), 400
        if not filename:
            return jsonify({'error': 'Filename is required'}), 400
        if git_visibility == 'private' and not git_credential_id:
            return jsonify({'error': 'Git credential is required for private repositories'}), 400
        
        # Add .yml extension if not present
        if not filename.endswith('.yml') and not filename.endswith('.yaml'):
            filename += '.yml'
        
        # Import git module
        import git
        import tempfile
        import shutil
        import os
        
        # Handle authentication for private repositories
        auth_repo_url = repo_url
        if git_visibility == 'private' and git_credential_id:
            credential = Credential.query.get(git_credential_id)
            if not credential or credential.credential_type != 'git_token':
                return jsonify({'error': 'Invalid Git credential provided'}), 400
            
            # Inject token into URL for authentication
            if repo_url.startswith('https://github.com/'):
                # For GitHub, use simple token format
                auth_repo_url = repo_url.replace('https://github.com/', f'https://{credential.token}@github.com/')
            elif repo_url.startswith('https://gitlab.com/'):
                auth_repo_url = repo_url.replace('https://gitlab.com/', f'https://oauth2:{credential.token}@gitlab.com/')
            else:
                # Generic Git hosting with token
                auth_repo_url = repo_url.replace('https://', f'https://{credential.token}@')
        
        # Create a temporary directory for cloning
        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                print(f"🔄 Cloning repository {repo_url} to {temp_dir}")
                
                # Clone the repository
                repo = git.Repo.clone_from(auth_repo_url, temp_dir, depth=1)
                print(f"✅ Repository cloned successfully")
                
                # Construct full file path
                if file_path:
                    # Remove leading/trailing slashes and ensure proper path
                    file_path = file_path.strip('/\\')
                    full_path = os.path.join(temp_dir, file_path, filename)
                else:
                    full_path = os.path.join(temp_dir, filename)
                
                print(f"📁 Looking for file at: {full_path}")
                
                # Check if file exists
                if not os.path.exists(full_path):
                    return jsonify({'error': f'File not found: {file_path}/{filename}'}), 404
                
                # Read the file content
                with open(full_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                print(f"📄 File content loaded, length: {len(content)} characters")
                
                # Validate that it's a YAML file (basic check)
                try:
                    import yaml
                    yaml.safe_load(content)
                    print(f"✅ YAML validation passed")
                except yaml.YAMLError as e:
                    return jsonify({'error': f'Invalid YAML content: {str(e)}'}), 400
                
                return jsonify({
                    'content': content,
                    'filename': filename,
                    'repo_url': repo_url,
                    'file_path': file_path,
                    'git_visibility': git_visibility,
                    'git_credential_id': git_credential_id
                }), 200
                
            except git.exc.GitCommandError as e:
                print(f"❌ Git error: {e}")
                return jsonify({'error': f'Git error: {str(e)}'}), 400
            except Exception as e:
                print(f"❌ Error during git import: {e}")
                return jsonify({'error': f'Import error: {str(e)}'}), 500
                
    except Exception as e:
        print(f"❌ Unexpected error in git_import_playbook: {e}")
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500

# Playbook File routes
@app.route('/api/playbooks/<playbook_id>/files', methods=['GET'])
def get_playbook_files(playbook_id):
    """Get all files associated with a playbook"""
    playbook = Playbook.query.get_or_404(playbook_id)
    files = PlaybookFile.query.filter_by(playbook_id=playbook_id).all()
    return jsonify([file.to_dict() for file in files])

@app.route('/api/playbooks/<playbook_id>/files', methods=['POST'])
def upload_playbook_file(playbook_id):
    """Upload a file for a playbook"""
    playbook = Playbook.query.get_or_404(playbook_id)
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    description = request.form.get('description', '')
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'File type not allowed'}), 400
    
    try:
        # Save files in the same directory as playbooks
        playbook_files_dir = PLAYBOOKS_DIR
        
        # Use original filename (no unique ID)
        original_filename = secure_filename(file.filename)
        file_path = os.path.join(playbook_files_dir, original_filename)
        
        # Check if file already exists
        existing_file = PlaybookFile.query.filter_by(
            playbook_id=playbook_id, 
            filename=original_filename
        ).first()
        
        file_replaced = False
        if existing_file:
            # Remove old file from disk
            if os.path.exists(existing_file.file_path):
                os.remove(existing_file.file_path)
            # Delete old database record
            db.session.delete(existing_file)
            file_replaced = True
        
        # Save new file to disk
        file.save(file_path)
        
        # Get file info
        file_size = os.path.getsize(file_path)
        mime_type, _ = mimetypes.guess_type(file_path)
        
        # Create database record
        playbook_file = PlaybookFile(
            playbook_id=playbook_id,
            filename=original_filename,
            stored_filename=original_filename,  # Same as original now
            file_path=file_path,
            file_size=file_size,
            mime_type=mime_type,
            description=description
        )
        
        db.session.add(playbook_file)
        db.session.commit()
        
        # Return appropriate response
        response_data = playbook_file.to_dict()
        if file_replaced:
            response_data['replaced'] = True
            response_data['message'] = f'File "{original_filename}" replaced successfully'
            return jsonify(response_data), 200
        else:
            response_data['message'] = f'File "{original_filename}" uploaded successfully'
            return jsonify(response_data), 201
        
    except Exception as e:
        db.session.rollback()
        # Clean up file if database save failed
        if 'file_path' in locals() and os.path.exists(file_path):
            os.remove(file_path)
        return jsonify({'error': f'Failed to upload file: {str(e)}'}), 500

@app.route('/api/playbooks/<playbook_id>/files/<file_id>', methods=['DELETE'])
def delete_playbook_file(playbook_id, file_id):
    """Delete a playbook file"""
    playbook_file = PlaybookFile.query.filter_by(id=file_id, playbook_id=playbook_id).first_or_404()
    
    try:
        # Delete file from disk
        if os.path.exists(playbook_file.file_path):
            os.remove(playbook_file.file_path)
        
        # Delete database record
        db.session.delete(playbook_file)
        db.session.commit()
        
        return jsonify({'message': 'File deleted successfully'}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to delete file: {str(e)}'}), 500

@app.route('/api/playbooks/<playbook_id>/files/<file_id>/download', methods=['GET'])
def download_playbook_file(playbook_id, file_id):
    """Download a playbook file"""
    playbook_file = PlaybookFile.query.filter_by(id=file_id, playbook_id=playbook_id).first_or_404()
    
    if not os.path.exists(playbook_file.file_path):
        return jsonify({'error': 'File not found on disk'}), 404
    
    return send_file(
        playbook_file.file_path,
        as_attachment=True,
        download_name=playbook_file.filename,
        mimetype=playbook_file.mime_type
    )

# Database initialization has been moved to database_init.py

# Migration endpoint to add missing columns
@app.route('/api/migrate-hosts', methods=['POST'])
def migrate_hosts():
    try:
        # Check if os_type and port columns exist
        column_check = db.session.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'hosts' 
            AND column_name IN ('os_type', 'port')
        """))
        existing_columns = {row[0] for row in column_check}
        
        has_os_type = 'os_type' in existing_columns
        has_port = 'port' in existing_columns
        
        changes = []
        
        # Add os_type column if missing
        if not has_os_type:
            try:
                db.session.execute(text("ALTER TABLE hosts ADD COLUMN os_type VARCHAR(50) DEFAULT 'linux'"))
                changes.append("Added os_type column")
            except Exception as e:
                changes.append(f"Failed to add os_type column: {e}")
        else:
            changes.append("os_type column already exists")
        
        # Add port column if missing
        if not has_port:
            try:
                db.session.execute(text("ALTER TABLE hosts ADD COLUMN port INTEGER DEFAULT 22"))
                changes.append("Added port column")
            except Exception as e:
                changes.append(f"Failed to add port column: {e}")
        else:
            changes.append("port column already exists")
        
        # Commit changes
        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'changes': changes,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 500

# Health check endpoint for debugging
@app.route('/api/health', methods=['GET'])
def health_check():
    try:
        # Test database connection
        db.session.execute(text('SELECT 1'))
        
        # Check database schema
        column_check = db.session.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'hosts'
            ORDER BY column_name
        """))
        all_host_columns = [row[0] for row in column_check]
        
        # Check specifically for our columns
        schema_check = db.session.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'hosts' 
            AND column_name IN ('os_type', 'port')
        """))
        existing_columns = {row[0] for row in schema_check}
        
        # Test model access
        host_groups_count = HostGroup.query.count()
        
        # Get hosts using our safe method
        hosts_result = db.session.execute(text("SELECT id, name, hostname FROM hosts LIMIT 3"))
        sample_hosts = [{'id': row.id, 'name': row.name, 'hostname': row.hostname} for row in hosts_result]
        
        return jsonify({
            'status': 'healthy',
            'database': 'connected',
            'host_groups_count': host_groups_count,
            'hosts_sample': sample_hosts,
            'schema_info': {
                'all_host_columns': all_host_columns,
                'has_os_type': 'os_type' in existing_columns,
                'has_port': 'port' in existing_columns,
                'missing_columns': ['os_type', 'port'] if not existing_columns else [col for col in ['os_type', 'port'] if col not in existing_columns]
            },
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        })
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 500

# Host Group routes
@app.route('/api/host-groups', methods=['GET'])
def get_host_groups():
    try:
        # Test database connection first
        db.session.execute(text('SELECT 1'))
        groups = HostGroup.query.all()
        result = [group.to_dict() for group in groups]
        print(f"Successfully fetched {len(result)} host groups")
        return jsonify(result)
    except Exception as e:
        print(f"Error fetching host groups: {str(e)}")
        db.session.rollback()
        return jsonify({'error': 'Failed to fetch host groups', 'details': str(e)}), 500

@app.route('/api/host-groups', methods=['POST'])
def create_host_group():
    data = request.json
    group = HostGroup(
        name=data['name'],
        description=data.get('description', ''),
        color=data.get('color', '#1890ff')
    )
    
    try:
        db.session.add(group)
        db.session.commit()
        return jsonify(group.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/host-groups/<group_id>', methods=['PUT'])
def update_host_group(group_id):
    group = HostGroup.query.get_or_404(group_id)
    data = request.json
    
    group.name = data.get('name', group.name)
    group.description = data.get('description', group.description)
    group.color = data.get('color', group.color)
    
    try:
        db.session.commit()
        return jsonify(group.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/host-groups/<group_id>', methods=['DELETE'])
def delete_host_group(group_id):
    group = HostGroup.query.get_or_404(group_id)
    
    try:
        # Set group_id to NULL for all hosts in this group
        Host.query.filter_by(group_id=group_id).update({'group_id': None})
        db.session.delete(group)
        db.session.commit()
        return jsonify({'message': 'Host group deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# Host routes
@app.route('/api/hosts', methods=['GET'])
def get_hosts():
    try:
        # Test database connection first
        db.session.execute(text('SELECT 1'))
        
        # Simple query with basic columns only
        query = "SELECT id, name, hostname, description, group_id, created_at, updated_at FROM hosts"
        result_rows = db.session.execute(text(query))
        
        hosts = []
        for row in result_rows:
            # Parse OS info from description if it exists
            description = row.description or ''
            os_type = 'linux'
            port = 22
            
            # Extract OS info from description
            if 'Windows host (WinRM port' in description:
                os_type = 'windows'
                # Try to extract port number
                import re
                port_match = re.search(r'port (\d+)', description)
                if port_match:
                    port = int(port_match.group(1))
                else:
                    port = 5986
            elif 'Linux host (SSH port' in description:
                os_type = 'linux'
                # Try to extract port number  
                import re
                port_match = re.search(r'port (\d+)', description)
                if port_match:
                    port = int(port_match.group(1))
                else:
                    port = 22
            
            host_data = {
                'id': str(row.id),
                'name': row.name,
                'hostname': row.hostname,
                'description': description,
                'group_id': str(row.group_id) if row.group_id else None,
                'created_at': row.created_at.isoformat() + 'Z' if row.created_at else None,
                'updated_at': row.updated_at.isoformat() + 'Z' if row.updated_at else None,
                'os_type': os_type,
                'port': port,
                'group': None
            }
            
            # Get group info if group_id exists
            if row.group_id:
                try:
                    group = HostGroup.query.get(row.group_id)
                    if group:
                        host_data['group'] = {
                            'id': str(group.id),
                            'name': group.name,
                            'color': group.color,
                            'description': group.description
                        }
                except Exception as group_error:
                    print(f"Error fetching group for host {row.id}: {str(group_error)}")
            
            hosts.append(host_data)
        
        print(f"Successfully fetched {len(hosts)} hosts")
        return jsonify(hosts)
        
    except Exception as e:
        print(f"Error fetching hosts: {str(e)}")
        db.session.rollback()
        return jsonify({'error': 'Failed to fetch hosts', 'details': str(e)}), 500

@app.route('/api/hosts', methods=['POST'])
def create_host():
    data = request.json
    print(f"Creating host with data: {data}")
    
    try:
        # Generate UUID for new host
        host_id = str(uuid.uuid4())
        
        # Use basic columns that always exist - store OS info in description if needed
        description = data.get('description', '')
        os_type = data.get('os_type', 'linux')
        port = data.get('port', 22)
        
        # If user didn't provide description, create one with OS info
        if not description and os_type == 'windows':
            description = f"Windows host (WinRM port {port})"
        elif not description and os_type == 'linux':
            description = f"Linux host (SSH port {port})"
        
        # Simple insert with timestamp columns
        query = """
            INSERT INTO hosts (id, name, hostname, description, group_id, created_at, updated_at) 
            VALUES (:id, :name, :hostname, :description, :group_id, :created_at, :updated_at)
        """
        
        current_time = datetime.utcnow()
        params = {
            'id': host_id,
            'name': data['name'],
            'hostname': data['hostname'],
            'description': description,
            'group_id': data.get('group_id'),
            'created_at': current_time,
            'updated_at': current_time
        }
        
        db.session.execute(text(query), params)
        db.session.commit()
        
        # Return the created host data with the OS info
        result = {
            'id': host_id,
            'name': data['name'],
            'hostname': data['hostname'],
            'description': description,
            'group_id': data.get('group_id'),
            'os_type': os_type,
            'port': port,
            'group': None,
            'created_at': current_time.isoformat() + 'Z',
            'updated_at': current_time.isoformat() + 'Z'
        }
        
        return jsonify(result), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"Error creating host: {str(e)}")
        return jsonify({'error': str(e)}), 400

@app.route('/api/hosts/bulk', methods=['POST'])
def create_hosts_bulk():
    data = request.json
    ips = data.get('ips', [])
    group_id = data.get('group_id')
    description = data.get('description', '')
    
    if not ips:
        return jsonify({'error': 'No IP addresses provided'}), 400
    
    created_hosts = []
    errors = []
    
    for i, ip in enumerate(ips):
        try:
            # Generate a name if not provided
            name = f"host-{ip.replace('.', '-').replace(':', '-')}"
            
            # Check if host with this name or hostname already exists
            existing_host = Host.query.filter(
                (Host.name == name) | (Host.hostname == ip)
            ).first()
            
            if existing_host:
                errors.append(f"Host with IP {ip} or name {name} already exists")
                continue
            
            host = Host(
                name=name,
                hostname=ip,
                description=description,
                group_id=group_id
            )
            
            db.session.add(host)
            created_hosts.append(host)
            
        except Exception as e:
            errors.append(f"Failed to create host for IP {ip}: {str(e)}")
    
    try:
        db.session.commit()
        return jsonify({
            'created_hosts': [host.to_dict() for host in created_hosts],
            'errors': errors,
            'total_created': len(created_hosts),
            'total_errors': len(errors)
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to save hosts: {str(e)}'}), 500

@app.route('/api/hosts/<host_id>', methods=['PUT'])
def update_host(host_id):
    host = Host.query.get_or_404(host_id)
    data = request.json
    
    host.name = data['name']
    host.hostname = data['hostname']
    host.description = data.get('description', '')
    host.os_type = data.get('os_type', host.os_type)
    host.port = data.get('port', host.port)
    host.group_id = data.get('group_id', host.group_id)
    host.updated_at = datetime.utcnow()
    
    try:
        db.session.commit()
        return jsonify(host.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/hosts/<host_id>', methods=['DELETE'])
@jwt_required()
@require_permission('delete_host')
def delete_host(host_id):
    try:
        host = Host.query.get_or_404(host_id)
        
        # Check for active tasks using this host
        active_tasks = Task.query.filter_by(host_id=host_id).filter(Task.status.in_(['pending', 'running'])).all()
        if active_tasks:
            return jsonify({'error': f'Cannot delete host: {len(active_tasks)} active task(s) are using this host'}), 400
        
        # Delete related records first to avoid foreign key constraint violations
        # Delete artifacts that belong to execution history for this host
        history_records = ExecutionHistory.query.filter_by(host_id=host_id).all()
        for history in history_records:
            # Delete artifacts for this execution
            artifacts = Artifact.query.filter_by(execution_id=history.id).all()
            for artifact in artifacts:
                db.session.delete(artifact)
        
        # Delete execution history records for this host
        ExecutionHistory.query.filter_by(host_id=host_id).delete()
        
        # Delete tasks for this host
        Task.query.filter_by(host_id=host_id).delete()
        
        # Finally delete the host
        db.session.delete(host)
        db.session.commit()
        
        return jsonify({'message': 'Host deleted successfully'}), 200
        
    except Exception as e:
        print(f"Error deleting host: {str(e)}")
        db.session.rollback()
        return jsonify({'error': f'Failed to delete host: {str(e)}'}), 500

# Task routes
@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    tasks = Task.query.filter(Task.status.in_(['pending', 'running'])).all()
    return jsonify([task.to_dict() for task in tasks])

@app.route('/api/tasks/<task_id>', methods=['GET'])
def get_task(task_id):
    task = Task.query.get_or_404(task_id)
    return jsonify(task.to_dict())

@app.route('/api/tasks/<task_id>', methods=['DELETE'])
def delete_task(task_id):
    try:
        task = Task.query.get(task_id)
        if not task:
            return jsonify({'error': 'Task not found'}), 404
        
        db.session.delete(task)
        db.session.commit()
        
        return jsonify({'message': 'Task deleted successfully'})
    except Exception as e:
        print(f"Error deleting task: {str(e)}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# Artifacts routes
@app.route('/api/artifacts/<execution_id>', methods=['GET'])
def get_artifacts(execution_id):
    print(f"API: Fetching artifacts for execution_id: {execution_id}")
    artifacts = Artifact.query.filter_by(execution_id=execution_id).order_by(Artifact.created_at.desc()).all()
    print(f"API: Found {len(artifacts)} artifacts for execution {execution_id}")
    
    # Debug: Print artifact details
    for i, artifact in enumerate(artifacts):
        print(f"API Artifact {i+1}: {artifact.task_name} - {artifact.host_name} - {artifact.register_name}")
    
    return jsonify([a.to_dict() for a in artifacts])

@app.route('/api/artifacts/<artifact_id>/data', methods=['GET'])
def get_artifact_data(artifact_id):
    artifact = Artifact.query.get_or_404(artifact_id)
    return jsonify({
        'artifact': artifact.to_dict(),
        'data': artifact.register_data
    })

# Credentials API endpoints
@app.route('/api/credentials', methods=['GET'])
def get_credentials():
    try:
        credentials = Credential.query.all()
        return jsonify([cred.to_dict() for cred in credentials])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/credentials', methods=['POST'])
def create_credential():
    try:
        data = request.get_json()
        
        credential_type = data.get('credential_type', 'ssh')
        
        # Validate required fields based on credential type
        if not data.get('name'):
            return jsonify({'error': 'Name is required'}), 400
            
        if credential_type == 'ssh':
            if not data.get('username') or not data.get('password'):
                return jsonify({'error': 'Username and password are required for SSH credentials'}), 400
        elif credential_type == 'git_token':
            if not data.get('token'):
                return jsonify({'error': 'Token is required for Git token credentials'}), 400
        
        # If this is set as default, unset other defaults of the same type
        if data.get('is_default'):
            Credential.query.filter_by(is_default=True, credential_type=credential_type).update({'is_default': False})
        
        credential = Credential(
            name=data['name'],
            credential_type=credential_type,
            username=data.get('username'),
            password=data.get('password'),  # In production, this should be encrypted
            token=data.get('token'),  # Git token
            description=data.get('description', ''),
            is_default=data.get('is_default', False)
        )
        
        db.session.add(credential)
        db.session.commit()
        
        return jsonify(credential.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/credentials/<credential_id>', methods=['PUT'])
def update_credential(credential_id):
    try:
        credential = Credential.query.get_or_404(credential_id)
        data = request.get_json()
        
        # If this is set as default, unset other defaults of the same type
        if data.get('is_default') and not credential.is_default:
            Credential.query.filter_by(is_default=True, credential_type=credential.credential_type).update({'is_default': False})
        
        credential.name = data.get('name', credential.name)
        credential.credential_type = data.get('credential_type', credential.credential_type)
        credential.username = data.get('username', credential.username)
        if data.get('password'):  # Only update password if provided
            credential.password = data['password']
        if data.get('token'):  # Only update token if provided
            credential.token = data['token']
        credential.description = data.get('description', credential.description)
        credential.is_default = data.get('is_default', credential.is_default)
        
        db.session.commit()
        return jsonify(credential.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/credentials/<credential_id>', methods=['DELETE'])
def delete_credential(credential_id):
    try:
        credential = Credential.query.get_or_404(credential_id)
        db.session.delete(credential)
        db.session.commit()
        return '', 204
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/credentials/<credential_id>/password', methods=['GET'])
def get_credential_password(credential_id):
    try:
        credential = Credential.query.get_or_404(credential_id)
        return jsonify({'password': credential.password})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# History routes
@app.route('/api/history', methods=['GET'])
def get_history():
    history = ExecutionHistory.query.order_by(ExecutionHistory.started_at.desc()).limit(100).all()
    print(f"🔍 HISTORY API: Found {len(history)} records")
    for i, h in enumerate(history[:5]):  # Show first 5 records
        print(f"   {i+1}. ID: {h.id}, Host ID: {h.host_id}, Status: {h.status}, Playbook: {h.playbook.name if h.playbook else 'None'}")
    return jsonify([h.to_dict() for h in history])

@app.route('/api/history/<history_id>', methods=['DELETE'])
def delete_history(history_id):
    try:
        history = ExecutionHistory.query.get(history_id)
        if not history:
            return jsonify({'error': 'Execution history not found'}), 404
        
        # First delete all associated artifacts
        artifacts = Artifact.query.filter_by(execution_id=history_id).all()
        for artifact in artifacts:
            db.session.delete(artifact)
        
        # Then delete the execution history
        db.session.delete(history)
        db.session.commit()
        
        return jsonify({'message': 'Execution history deleted successfully'})
    except Exception as e:
        print(f"Error deleting execution history: {str(e)}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# Execute playbook
@app.route('/api/execute', methods=['POST'])
@jwt_required()
def execute_playbook():
    print(f"🎯🎯🎯 EXECUTE ENDPOINT CALLED - PROCESSING PLAYBOOK EXECUTION REQUEST 🎯🎯🎯")
    print(f"🎯 REQUEST DATA: {request.get_json()}")
    
    # Get current user (handle case where users table doesn't exist)
    current_user_id = get_jwt_identity()
    print(f"🔍 Current user ID: {current_user_id}")
    
    try:
        current_user = User.query.get(current_user_id)
        print(f"🔍 User query successful: {current_user}")
        
        if not current_user:
            print(f"🔍 User not found")
            return jsonify({'error': 'User not found'}), 401
        
        # Check if user has permission to execute playbooks
        if not current_user.has_permission('execute'):
            print(f"🔍 User has no execute permission")
            return jsonify({'error': 'Insufficient permissions to execute playbooks'}), 403
    except Exception as e:
        # If users table doesn't exist, allow execution for temporary admin
        print(f"🔍 User table access error: {e}")
        if current_user_id != 'temp-admin-id':
            print(f"🔍 Not temp admin, rejecting")
            return jsonify({'error': 'Authentication required'}), 401
        print(f"🔍 Temp admin, continuing execution")
    
    try:
        data = request.json
        playbook_id = data['playbook_id']
        print(f"🎯 REQUESTED PLAYBOOK ID: {playbook_id}")
        host_ids = data.get('host_ids', [])  # Support multiple hosts
        host_id = data.get('host_id')  # Support single host for backward compatibility
        username = data.get('username')
        password = data.get('password')
        variables = data.get('variables', {})  # User-provided variable values
    except Exception as e:
        return jsonify({'error': f'Invalid request data: {str(e)}'}), 400
    
    # Make SSH credentials optional - use default if not provided
    if not username:
        username = os.environ.get('ANSIBLE_SSH_USER', 'ansible')
        print(f"Using default SSH user: {username} (SSH key authentication)")
    
    # Note: password can be None - Ansible will use SSH keys if no password provided
    
    try:
        playbook = Playbook.query.get_or_404(playbook_id)
        print(f"📖 LOADED PLAYBOOK: {playbook.id} - {playbook.name} (method: {playbook.creation_method})")
    except Exception as e:
        return jsonify({'error': f'Playbook not found: {str(e)}'}), 404
    
    # Handle both single host and multiple hosts
    if host_id and not host_ids:
        host_ids = [host_id]
    elif not host_ids:
        # Allow empty host_ids - playbook can define its own targets or use dynamic variables
        host_ids = []  # Empty host list - targets will be determined by playbook or variables
    
    # Get all selected hosts
    hosts = []
    try:
        for host_id in host_ids:
            host = Host.query.get_or_404(host_id)
            hosts.append(host)
    except Exception as e:
        return jsonify({'error': f'Host not found: {str(e)}'}), 404
    
    # Create a single task for the multi-host execution
    if hosts:
        # Use the first host as the primary host for the task record
        primary_host = hosts[0]
        host_names = ', '.join([host.name for host in hosts])
        host_list_json = json.dumps([host.to_dict() for host in hosts])
        target_info = f"Multi-host execution targeting: {host_names}"
        
        task = Task(
            playbook_id=playbook_id,
            host_id=primary_host.id,
            user_id=current_user_id,  # Store the user who created the task
            status='pending',
            host_list=host_list_json
        )
    else:
        # Dynamic targets from variables or playbook-defined targets
        host_list_json = json.dumps([])
        if variables and (variables.get('ips') or variables.get('hosts')):
            dynamic_targets = variables.get('ips') or variables.get('hosts')
            target_info = f"Dynamic execution targeting: {dynamic_targets}"
        else:
            target_info = "Execution with playbook-defined targets"
        
        task = Task(
            playbook_id=playbook_id,
            host_id=None,  # No specific host for dynamic execution
            user_id=current_user_id,  # Store the user who created the task
            status='pending',
            host_list=host_list_json
        )
    
    try:
        db.session.add(task)
        db.session.commit()
        
        # Store the execution information in the task output initially
        task.output = target_info
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to create task: {str(e)}'}), 500
    
    # Check if playbook was imported from Git and pull latest version BEFORE execution
    print(f"🔍 CHECKING PLAYBOOK: creation_method='{playbook.creation_method}', git_repo_url='{playbook.git_repo_url}'")
    if playbook.creation_method == 'git' and playbook.git_repo_url:
        print(f"🔄 DOING EXACTLY WHAT IMPORT BUTTON DOES - Sync from Git and save to physical file")
        try:
            # Import Git-related modules  
            import git
            import tempfile
            import yaml
            from datetime import datetime
            
            # Create a temporary directory for cloning
            # Handle authentication for private repositories
            auth_repo_url = playbook.git_repo_url
            if playbook.git_visibility == 'private' and playbook.git_credential_id:
                credential = Credential.query.get(playbook.git_credential_id)
                if credential and credential.credential_type == 'git_token':
                    # Inject token into URL for authentication
                    if playbook.git_repo_url.startswith('https://github.com/'):
                        # For GitHub, use simple token format
                        auth_repo_url = playbook.git_repo_url.replace('https://github.com/', f'https://{credential.token}@github.com/')
                    elif playbook.git_repo_url.startswith('https://gitlab.com/'):
                        auth_repo_url = playbook.git_repo_url.replace('https://gitlab.com/', f'https://oauth2:{credential.token}@gitlab.com/')
                    else:
                        # Generic Git hosting with token
                        auth_repo_url = playbook.git_repo_url.replace('https://', f'https://{credential.token}@')
            
            with tempfile.TemporaryDirectory() as temp_dir:
                print(f"🔄 Cloning repository {playbook.git_repo_url} to {temp_dir}")
                
                # Clone the repository
                repo = git.Repo.clone_from(auth_repo_url, temp_dir, depth=1)
                print(f"✅ Repository cloned successfully")
                
                # Construct full file path
                if playbook.git_file_path and playbook.git_file_path.strip():
                    file_path = playbook.git_file_path.strip('/\\')
                    full_path = os.path.join(temp_dir, file_path, playbook.git_filename)
                else:
                    full_path = os.path.join(temp_dir, playbook.git_filename)
                
                print(f"📁 Looking for file at: {full_path}")
                
                # Read the file content
                with open(full_path, 'r', encoding='utf-8') as f:
                    latest_content = f.read()
                
                print(f"📄 File content loaded, length: {len(latest_content)} characters")
                
                # Validate YAML
                yaml.safe_load(latest_content)
                print(f"✅ YAML validation passed")
                
                # CRITICAL: Save to physical file EXACTLY like Import button does
                physical_file_path = os.path.join(PLAYBOOKS_DIR, f"{playbook.name}.yml")
                print(f"💾 Saving latest content to physical file: {physical_file_path}")
                
                os.makedirs(PLAYBOOKS_DIR, exist_ok=True)
                with open(physical_file_path, 'w', encoding='utf-8') as f:
                    f.write(latest_content)
                print(f"✅ PHYSICAL FILE UPDATED SUCCESSFULLY!")
                
                # Also update database
                playbook.content = latest_content
                playbook.updated_at = datetime.utcnow()
                db.session.commit()
                print(f"✅ Database updated too")
                
                socketio.emit('task_update', {
                    'task_id': str(task.id),
                    'message': f'✅ Synced latest version from Git and saved to {playbook.name}.yml'
                })
                
        except Exception as e:
            print(f"❌ Git sync failed: {e}")
            socketio.emit('task_update', {
                'task_id': str(task.id),
                'message': f'Git sync failed: {e}'
            })
    else:
        print(f"🔍 SKIPPING GIT SYNC: Not a Git-imported playbook (method='{playbook.creation_method}', repo='{playbook.git_repo_url}')")

    print(f"🔄 GIT SYNC COMPLETED - Proceeding to execution phase")

    # Execute the playbook against all hosts in a single run
    try:
        # Update task status to running (started_at will be set when execution actually starts)
        task.status = 'running'
        db.session.commit()
        
        # Emit initial task status update
        socketio.emit('task_update', {
            'task_id': str(task.id),
            'status': 'running'
        })
        
        # Ensure we have the latest playbook content by refreshing from database AFTER Git sync
        db.session.refresh(playbook)
        
        # Force a fresh query to get the absolute latest content from database AFTER Git sync
        fresh_playbook = db.session.query(Playbook).filter_by(id=playbook_id).first()
        if fresh_playbook:
            playbook = fresh_playbook
            print(f"🔄 FORCE REFRESHED PLAYBOOK FROM DATABASE AFTER GIT SYNC")
        
        # Convert hosts to dictionaries to avoid session issues in thread
        host_data = [host.to_dict() for host in hosts] if hosts else []
        
        # Create playbook_data AFTER Git sync to ensure latest content
        playbook_data = {
            'id': playbook.id,
            'name': playbook.name,
            'content': playbook.content
        }
        
        print(f"🚀 STARTING EXECUTION OF PLAYBOOK: {playbook_data['id']} - {playbook_data['name']}")
        print(f"🚀 PLAYBOOK CONTENT LENGTH: {len(playbook_data['content'])} characters")
        print(f"🚀 PLAYBOOK CONTENT FIRST 100 CHARS: {playbook_data['content'][:100]}...")
        
        thread = threading.Thread(
            target=run_ansible_playbook_multi_host_safe,
            args=(task.id, playbook_data, host_data, username, password, variables)
        )
        thread.daemon = True
        thread.start()
        print(f"Started multi-host execution thread for task {task.id} on {len(hosts)} hosts")
    except Exception as e:
        print(f"Failed to start execution thread for task {task.id}: {str(e)}")
        task.status = 'failed'
        task.error_output = f"Failed to start execution: {str(e)}"
        db.session.commit()
        
        # Emit failure status update
        socketio.emit('task_update', {
            'task_id': str(task.id),
            'status': 'failed'
        })
    
    return jsonify({
        'message': f'Started playbook execution' + (f' on {len(hosts)} host(s)' if hosts else ' with dynamic/playbook-defined targets'),
        'task': task.to_dict(),
        'hosts': [host.name for host in hosts] if hosts else []
    }), 201

# Webhook API endpoints
@app.route('/api/webhooks', methods=['GET'])
def get_webhooks():
    webhooks = Webhook.query.all()
    return jsonify([webhook.to_dict() for webhook in webhooks])

@app.route('/api/webhooks', methods=['POST'])
def create_webhook():
    data = request.json
    
    # Generate a secure token
    token = secrets.token_urlsafe(32)
    
    # Handle host_ids - convert to JSON string if provided
    host_ids_json = None
    if 'host_ids' in data and data['host_ids']:
        host_ids_json = json.dumps(data['host_ids'])
    
    # Handle default_variables - convert to JSON string if provided
    variables_json = None
    if 'default_variables' in data and data['default_variables']:
        variables_json = json.dumps(data['default_variables'])
    
    webhook = Webhook(
        name=data['name'],
        playbook_id=data['playbook_id'],
        host_ids=host_ids_json,
        token=token,
        enabled=data.get('enabled', True),
        default_variables=variables_json,
        credential_id=data.get('credential_id'),
        description=data.get('description', '')
    )
    
    try:
        db.session.add(webhook)
        db.session.commit()
        return jsonify(webhook.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/webhooks/<webhook_id>', methods=['PUT'])
def update_webhook(webhook_id):
    webhook = Webhook.query.get_or_404(webhook_id)
    data = request.json
    
    # Handle host_ids - convert to JSON string if provided
    if 'host_ids' in data:
        webhook.host_ids = json.dumps(data['host_ids']) if data['host_ids'] else None
    
    # Handle default_variables - convert to JSON string if provided
    if 'default_variables' in data:
        webhook.default_variables = json.dumps(data['default_variables']) if data['default_variables'] else None
    
    # Update other fields
    if 'name' in data:
        webhook.name = data['name']
    if 'enabled' in data:
        webhook.enabled = data['enabled']
    if 'credential_id' in data:
        webhook.credential_id = data['credential_id']
    if 'description' in data:
        webhook.description = data['description']
    
    webhook.updated_at = datetime.utcnow()
    
    try:
        db.session.commit()
        return jsonify(webhook.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/webhooks/<webhook_id>', methods=['DELETE'])
def delete_webhook(webhook_id):
    webhook = Webhook.query.get_or_404(webhook_id)
    
    try:
        db.session.delete(webhook)
        db.session.commit()
        return jsonify({'message': 'Webhook deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/webhooks/<webhook_id>/regenerate-token', methods=['POST'])
def regenerate_webhook_token(webhook_id):
    webhook = Webhook.query.get_or_404(webhook_id)
    
    # Generate a new secure token
    webhook.token = secrets.token_urlsafe(32)
    webhook.updated_at = datetime.utcnow()
    
    try:
        db.session.commit()
        return jsonify(webhook.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# Public webhook trigger endpoint - requires API token authentication
@app.route('/api/webhook/trigger/<webhook_token>', methods=['POST'])
def trigger_webhook(webhook_token):
    # Get API token from Authorization header
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Permission denied. API token required in Authorization header.'}), 401
    
    api_token_value = auth_header[7:]  # Remove 'Bearer ' prefix
    
    # Authenticate API token
    api_token = authenticate_api_token(api_token_value)
    if not api_token:
        return jsonify({'error': 'Permission denied. Invalid or expired API token.'}), 401
    
    # Find webhook by token
    webhook = Webhook.query.filter_by(token=webhook_token).first()
    
    if not webhook:
        return jsonify({'error': 'Invalid webhook token'}), 404
    
    if not webhook.enabled:
        return jsonify({'error': 'Webhook is disabled'}), 403
    
    # Get request data
    data = request.json or {}
    
    # Get playbook and hosts
    playbook = webhook.playbook
    if not playbook:
        return jsonify({'error': 'Playbook not found'}), 404
    
    # Parse host IDs
    try:
        host_ids = json.loads(webhook.host_ids) if webhook.host_ids else []
    except:
        return jsonify({'error': 'Invalid host configuration'}), 500
    
    if not host_ids:
        return jsonify({'error': 'No hosts configured for webhook'}), 400
    
    # Get hosts - store as dictionaries to avoid session issues
    hosts = []
    host_objects = []
    for host_id in host_ids:
        host = Host.query.get(host_id)
        if host:
            hosts.append(host)
            host_objects.append(host.to_dict())  # Store as dict for thread safety
    
    if not hosts:
        return jsonify({'error': 'No valid hosts found'}), 400
    
    # Merge default variables with request variables
    variables = {}
    if webhook.default_variables:
        try:
            variables.update(json.loads(webhook.default_variables))
        except:
            pass
    
    # Override with variables from request
    if 'variables' in data:
        variables.update(data['variables'])
    
    # Get SSH username - use from request, webhook default, or system default
    username = None
    password = None
    
    # Priority 1: Credentials from request payload
    if 'credentials' in data and data['credentials']:
        username = data['credentials'].get('username')
        password = data['credentials'].get('password')
    
    # Priority 2: Default credential from webhook configuration
    elif webhook.credential_id:
        credential = webhook.credential
        if credential:
            username = credential.username
            password = credential.password  # Note: In production, this should be encrypted
    
    # Priority 3: Use system default SSH user (for SSH key authentication)
    if not username:
        # Use a default SSH user - this can be configured via environment variable
        username = os.environ.get('ANSIBLE_SSH_USER', 'ansible')
        print(f"Using default SSH user: {username} (SSH key authentication)")
    
    # Note: password can be None - Ansible will use SSH keys if no password provided
    
    # Create task for execution
    primary_host = hosts[0]
    host_list_json = json.dumps(host_objects)
    
    task = Task(
        playbook_id=playbook.id,
        host_id=primary_host.id,
        user_id=None,  # Webhook executions don't have a user
        status='pending',
        host_list=host_list_json
    )
    db.session.add(task)
    db.session.commit()
    
    # Store IDs and data for thread execution to avoid session issues
    task_id = task.id
    webhook_id = webhook.id  # Store webhook ID
    playbook_data = {
        'id': playbook.id,
        'name': playbook.name,
        'content': playbook.content
    }
    
    # Update webhook statistics
    webhook.last_triggered = datetime.utcnow()
    webhook.trigger_count += 1
    db.session.commit()
    
    # Execute the playbook using data instead of ORM objects
    try:
        thread = threading.Thread(
            target=run_webhook_playbook,
            args=(task_id, playbook_data, host_objects, username, password, variables, webhook_id)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'message': 'Webhook triggered successfully',
            'task_id': str(task_id),
            'playbook': playbook.name,
            'hosts': len(hosts),
            'variables': variables
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to trigger webhook: {str(e)}'}), 500

def run_webhook_playbook(task_id, playbook_data, host_objects, username, password, variables=None, webhook_id=None):
    """
    Execute playbook for webhook with proper session management.
    Uses IDs and dictionaries instead of ORM objects to avoid session issues.
    """
    print(f"Starting webhook playbook execution for task {task_id}")
    
    with app.app_context():
        # Fetch fresh task object in this thread's context
        task = Task.query.get(task_id)
        
        if not task:
            print(f"Task {task_id} not found")
            return
            
        task.status = 'running'
        task.started_at = datetime.utcnow()
        db.session.commit()
        print(f"Task {task_id} status updated to running")
    
    # Create a simple playbook object from data
    class SimplePlaybook:
        def __init__(self, data):
            self.id = data['id']
            self.name = data['name']
            self.content = data['content']
    
    # Recreate host objects from dictionaries
    class SimpleHost:
        def __init__(self, host_dict):
            self.id = host_dict['id']
            self.name = host_dict['name']
            self.hostname = host_dict['hostname']
            self.description = host_dict.get('description', '')
            self.os_type = host_dict.get('os_type', 'linux')
            self.port = host_dict.get('port', 22)
        
        def to_dict(self):
            return {
                'id': self.id,
                'name': self.name,
                'hostname': self.hostname,
                'description': self.description,
                'os_type': self.os_type,
                'port': self.port
            }
    
    playbook = SimplePlaybook(playbook_data)
    hosts = [SimpleHost(host_dict) for host_dict in host_objects]
    
    # Use the existing multi-host execution logic
    try:
        # Call the existing function but with our recreated objects
        run_ansible_playbook_multi_host_internal(task_id, playbook, hosts, username, password, variables, webhook_id)
    except Exception as e:
        print(f"Webhook execution error: {str(e)}")
        with app.app_context():
            task = Task.query.get(task_id)
            if task:
                task.status = 'failed'
                task.error_output = str(e)
                task.finished_at = datetime.utcnow()
                
                # Create execution history entry for failed webhook execution
                history = ExecutionHistory(
                    playbook_id=playbook_data['id'],
                    host_id=task.host_id,
                    status='failed',
                    started_at=task.started_at,
                    finished_at=task.finished_at,
                    output=task.output or '',
                    error_output=str(e),
                    username='webhook',
                    host_list=task.host_list,
                    webhook_id=webhook_id
                )
                db.session.add(history)
                db.session.commit()

def run_ansible_playbook_multi_host_internal(task_id, playbook, hosts, username, password, variables=None, webhook_id=None):
    """
    Internal function that does the actual ansible execution.
    Separated to avoid session issues.
    """
    # Emit status update
    socketio.emit('task_update', {
        'task_id': str(task_id),
        'status': 'running',
        'message': f'Starting execution of {playbook.name} on {len(hosts)} hosts'
    })
    
    try:
        # Create temporary inventory file with all hosts
        with tempfile.NamedTemporaryFile(mode='w', suffix='.ini', delete=False) as inv_file:
            # Determine connection type based on playbook OS type
            playbook_os_type = getattr(playbook, 'os_type', 'linux')
            is_windows_playbook = playbook_os_type.lower() == 'windows'
            
            print(f"🖥️ Playbook OS type: {playbook_os_type}, Windows playbook: {is_windows_playbook}")
            
            if is_windows_playbook:
                # For Windows playbooks, treat all hosts as Windows hosts
                windows_hosts = hosts
                linux_hosts = []
                print(f"🪟 Windows playbook detected - using WinRM (port 5986) for all {len(hosts)} hosts")
            else:
                # For Linux playbooks, treat all hosts as Linux hosts
                linux_hosts = hosts
                windows_hosts = []
                print(f"🐧 Linux playbook detected - using SSH (port 22) for all {len(hosts)} hosts")
            
            # Add Linux hosts to targets group
            inv_content = "[targets]\n"
            for host in linux_hosts:
                port = getattr(host, 'port', 22)
                inv_content += f"{host.hostname} ansible_port={port} ansible_connection=ssh\n"
            
            # Add Windows hosts to targets group with WinRM connection
            for host in windows_hosts:
                # Extract port from description or use default
                description = getattr(host, 'description', '') or ''
                port = 5986
                if 'WinRM port' in description:
                    import re
                    port_match = re.search(r'port (\d+)', description)
                    if port_match:
                        port = int(port_match.group(1))
                inv_content += f"{host.hostname} ansible_port={port} ansible_connection=winrm ansible_winrm_server_cert_validation=ignore\n"
            
            # Add dynamic IPs from variables if 'ips' or 'hosts' variable is provided
            dynamic_ips = set()

            if variables:
                # Check for 'ips' variable first, then 'hosts' variable
                ips_value = variables.get('ips') or variables.get('hosts')

                if ips_value and isinstance(ips_value, str):
                    # Split comma-separated IPs and add them to inventory with appropriate connection settings
                    for ip in ips_value.split(','):
                        ip = ip.strip()
                        if ip and ip not in ['all', 'targets']:  # Skip special keywords
                            dynamic_ips.add(ip)
                            if is_windows_playbook:
                                # Add Windows dynamic IPs with WinRM settings
                                inv_content += f"{ip} ansible_port=5986 ansible_connection=winrm ansible_winrm_server_cert_validation=ignore\n"
                            else:
                                # Add Linux dynamic IPs with SSH settings
                                inv_content += f"{ip} ansible_port=22 ansible_connection=ssh\n"

            


            


            
            # Add Windows hosts to a win group
            if windows_hosts:
                inv_content += "\n[win]\n"
                for host in windows_hosts:
                    inv_content += f"{host.hostname}\n"
            
            # Also add to 'all' group for playbooks that use 'hosts: all'
            inv_content += "\n[all]\n"
            for host in hosts:
                inv_content += f"{host.hostname}\n"
            
            # Add dynamic IPs to 'all' group as well
            for ip in dynamic_ips:
                inv_content += f"{ip}\n"
            
            # Add variables for Linux hosts
            inv_content += "\n[all:vars]\n"
            inv_content += f"ansible_user={username}\n"
            
            if password:
                inv_content += f"ansible_ssh_pass={password}\n"
                inv_content += f"ansible_become_pass={password}\n"
                inv_content += "ansible_ssh_common_args=-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=yes -o PreferredAuthentications=password\n"
            else:
                inv_content += "ansible_ssh_common_args=-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=no -o PreferredAuthentications=publickey\n"
            
            inv_content += "ansible_host_key_checking=False\n"
            inv_content += "ansible_ssh_timeout=30\n"
            inv_content += "ansible_connect_timeout=30\n"
            
            # Add Windows-specific variables
            if windows_hosts:
                inv_content += "\n[win:vars]\n"
                inv_content += f"ansible_user={username}\n"
                if password:
                    inv_content += f"ansible_password={password}\n"
                inv_content += "ansible_winrm_scheme=https\n"
                inv_content += "ansible_connection=winrm\n"
                inv_content += "ansible_winrm_server_cert_validation=ignore\n"
                inv_content += "ansible_become_method=runas\n"
                inv_content += "ansible_winrm_transport=ntlm\n"
                inv_content += "ansible_winrm_port=5986\n"
            
            inv_file.write(inv_content)
            inventory_path = inv_file.name
        
        print(f"Created multi-host inventory file: {inventory_path}")
        if password:
            print(f"Using SSH password authentication for user: {username}")
        else:
            print(f"Using SSH key authentication for user: {username}")
        
        # Get playbook file path
        playbook_path = os.path.join(PLAYBOOKS_DIR, f"{playbook.name}.yml")
        print(f"Playbook path: {playbook_path}")
        
        # CRITICAL: Always write the current playbook content to the file before execution
        # Write the playbook content to file before execution
        print(f"🔄 Writing current playbook content to file before execution")
        print(f"🔄 Content length: {len(playbook.content)} characters")
        print(f"🔄 Content preview (first 100 chars): {playbook.content[:100]}...")
        try:
            os.makedirs(PLAYBOOKS_DIR, exist_ok=True)
            with open(playbook_path, 'w', encoding='utf-8') as f:
                f.write(playbook.content)
            print(f"✅ Playbook file written successfully: {playbook_path}")
        except Exception as write_error:
            print(f"❌ Failed to write playbook file: {write_error}")
            raise Exception(f"Failed to write playbook file: {write_error}")
        
        # Check if playbook file exists (should always exist now)
        if not os.path.exists(playbook_path):
            raise Exception(f"Playbook file not found: {playbook_path}")
        
        # Set environment variables for Ansible
        env = os.environ.copy()
        env.update({
            'ANSIBLE_HOST_KEY_CHECKING': 'False',
            'ANSIBLE_SSH_ARGS': '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=yes -o PreferredAuthentications=password',
            'ANSIBLE_TIMEOUT': '30',
            'ANSIBLE_CONNECT_TIMEOUT': '30',
            'ANSIBLE_SSH_TIMEOUT': '30',
            'ANSIBLE_SSH_RETRIES': '3',
            'PYTHONUNBUFFERED': '1',  # Force Python to flush output immediately
            'ANSIBLE_FORCE_COLOR': 'false',  # Disable color codes that might interfere
            'ANSIBLE_STDOUT_CALLBACK': 'default'  # Use default callback for consistent output
        })
        
        # Run ansible-playbook command against all hosts
        cmd = [
            'ansible-playbook',
            '-i', inventory_path,
            playbook_path,
            '-vvv',  # Maximum verbosity for debugging
            '-e', 'ansible_host_key_checking=False',
            '-e', f'ansible_user={username}',
            '-e', f'ansible_ssh_pass={password}',
            '-e', f'ansible_become_pass={password}',  # Add sudo password
            '-e', f'ansible_winrm_user={username}',
            '-e', f'ansible_winrm_password={password}',
            '-e', 'ansible_ssh_common_args="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=yes -o PreferredAuthentications=password"',
            '--ssh-common-args', '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=yes -o PreferredAuthentications=password'
        ]
        
        # Add user-defined variables to the command
        if variables:
            for var_name, var_value in variables.items():
                cmd.extend(['-e', f'{var_name}={var_value}'])
        
        print(f"Executing webhook command: {' '.join(cmd)}")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
            env=env
        )
        
        output_lines = []
        error_lines = []
        
        # Read output in real-time
        for line in iter(process.stdout.readline, ''):
            line = line.strip()
            if line:
                output_lines.append(line)
                socketio.emit('task_output', {
                    'task_id': str(task_id),
                    'output': line
                })
        
        # Wait for process to complete with 2-minute timeout
        TASK_TIMEOUT = 300  # 5 minutes in seconds
        
        try:
            process.wait(timeout=TASK_TIMEOUT)
        except subprocess.TimeoutExpired:
            print(f"🚨 WEBHOOK TIMEOUT: Task exceeded {TASK_TIMEOUT} seconds (5 minutes), terminating...")
            
            # Kill the process group
            try:
                import psutil
                parent_pid = process.pid
                parent = psutil.Process(parent_pid)
                children = parent.children(recursive=True)
                
                # Terminate all processes
                for child in children:
                    try:
                        child.terminate()
                    except psutil.NoSuchProcess:
                        pass
                parent.terminate()
                
                # Wait then force kill if needed
                try:
                    parent.wait(timeout=5)
                except psutil.TimeoutExpired:
                    for child in children:
                        try:
                            child.kill()
                        except psutil.NoSuchProcess:
                            pass
                    parent.kill()
                    
            except Exception as e:
                print(f"Error terminating webhook process: {e}")
            
            # Mark webhook task as failed due to timeout
            with app.app_context():
                task = Task.query.get(task_id)
                if task:
                    task.status = 'failed'
                    task.finished_at = datetime.utcnow()
                    task.error_output = f"Webhook timeout: Execution exceeded {TASK_TIMEOUT} seconds (5 minutes) and was terminated."
                    db.session.commit()
                    
                    # Create execution history for webhook timeout
                    history = ExecutionHistory(
                        playbook_id=task.playbook_id,
                        host_id=task.host_id,
                        status='failed',
                        started_at=task.started_at,
                        finished_at=task.finished_at,
                        output=task.output or '',
                        error_output=task.error_output,
                        host_list=task.host_list,
                        webhook_id=webhook_id
                    )
                    db.session.add(history)
                    db.session.commit()
                    
                    # Emit timeout notification
                    socketio.emit('task_update', {
                        'task_id': str(task_id),
                        'status': 'failed',
                        'message': f'Webhook task terminated due to timeout ({TASK_TIMEOUT}s - 5 minutes)'
                    })
            
            return  # Exit early due to timeout
        
        # Get any remaining stderr
        stderr_output = process.stderr.read()
        if stderr_output:
            error_lines.append(stderr_output)
        
        # Update task status and create execution history
        with app.app_context():
            task = Task.query.get(task_id)
            if task:
                task.output = '\n'.join(output_lines)
                task.error_output = '\n'.join(error_lines)
                task.finished_at = datetime.utcnow()
                
                # Determine final status
                final_status = 'completed' if process.returncode == 0 else 'failed'
                task.status = final_status
                
                # Create execution history entry for webhook execution
                history = ExecutionHistory(
                    playbook_id=playbook.id,
                    host_id=task.host_id,
                    user_id=None,  # Webhook executions don't have a user
                    status=final_status,
                    started_at=task.started_at,
                    finished_at=task.finished_at,
                    output=task.output,
                    error_output=task.error_output,
                    username='webhook',  # Mark as webhook execution
                    host_list=task.host_list,
                    webhook_id=webhook_id  # Now we have webhook_id from the parameter
                )
                db.session.add(history)
                db.session.flush()  # Get the history ID
                
                # Process artifacts from the output for webhook execution
                if task.output:
                    try:
                        print(f"Extracting artifacts from webhook output for execution {history.id}")
                        output_lines = task.output.split('\n')
                        print(f"Total output lines: {len(output_lines)}")
                        
                        # Use the existing artifact extraction function
                        output_artifacts_data = extract_register_from_output(output_lines, history.id, hosts, variables)
                        
                        # Create and save all artifacts
                        artifacts_created = []
                        for artifact_data in output_artifacts_data:
                            artifact = Artifact(
                                execution_id=artifact_data['execution_id'],
                                task_name=artifact_data['task_name'],
                                register_name=artifact_data['register_name'],
                                register_data=artifact_data['register_data'],
                                host_name=artifact_data['host_name'],
                                task_status=artifact_data['task_status']
                            )
                            db.session.add(artifact)
                            artifacts_created.append(artifact)
                        
                        print(f"Saved {len(artifacts_created)} artifacts for webhook execution {history.id}")
                        
                    except Exception as artifact_error:
                        print(f"Error processing webhook artifacts: {artifact_error}")
                
                if process.returncode == 0:
                    socketio.emit('task_update', {
                        'task_id': str(task_id),
                        'status': 'completed',
                        'message': f'Webhook execution completed successfully'
                    })
                else:
                    socketio.emit('task_update', {
                        'task_id': str(task_id),
                        'status': 'failed',
                        'message': f'Webhook execution failed with return code {process.returncode}'
                    })
                
                db.session.commit()
        
        # Clean up
        try:
            os.unlink(inventory_path)
        except:
            pass
            
    except Exception as e:
        print(f"Webhook execution error: {str(e)}")
        with app.app_context():
            task = Task.query.get(task_id)
            if task:
                task.status = 'failed'
                task.error_output = str(e)
                task.finished_at = datetime.utcnow()
                
                # Create execution history entry for failed webhook execution
                history = ExecutionHistory(
                    playbook_id=playbook.id,
                    host_id=task.host_id,
                    status='failed',
                    started_at=task.started_at,
                    finished_at=task.finished_at,
                    output=task.output or '',
                    error_output=str(e),
                    username='webhook',
                    host_list=task.host_list,
                    webhook_id=None
                )
                db.session.add(history)
                db.session.commit()
        
        socketio.emit('task_update', {
            'task_id': str(task_id),
            'status': 'failed',
            'message': f'Webhook execution error: {str(e)}'
        })

def analyze_realtime_output(line, hosts, host_status_tracker):
    """
    Analyze real-time Ansible output to provide immediate status updates for each host.
    Returns a status message if a significant event is detected, None otherwise.
    """
    status_message = None
    
    # Check for task completion indicators
    for host in hosts:
        hostname = host.hostname
        
        # Check for successful task completion
        if f"ok: [{hostname}]" in line:
            host_status_tracker[hostname]['tasks_completed'] += 1
            task_match = line.split("] => ")[0].split("ok: [")[1] if "] => " in line else hostname
            status_message = f"✅ IP {hostname} ({host.name}): Task completed successfully"
            
        # Check for changed task completion  
        elif f"changed: [{hostname}]" in line:
            host_status_tracker[hostname]['tasks_completed'] += 1
            status_message = f"🔄 IP {hostname} ({host.name}): Task completed with changes"
            
        # Check for failed tasks
        elif f"failed: [{hostname}]" in line or f"FAILED! => {hostname}" in line:
            host_status_tracker[hostname]['tasks_failed'] += 1
            host_status_tracker[hostname]['status'] = 'failed'
            status_message = f"❌ IP {hostname} ({host.name}): Task FAILED"
            
        # Check for unreachable hosts
        elif f"UNREACHABLE! => {hostname}" in line:
            host_status_tracker[hostname]['status'] = 'failed'
            status_message = f"🚫 IP {hostname} ({host.name}): Host UNREACHABLE"
            
        # Check for fatal errors
        elif f"fatal: [{hostname}]" in line:
            host_status_tracker[hostname]['tasks_failed'] += 1
            host_status_tracker[hostname]['status'] = 'failed'
            status_message = f"💀 IP {hostname} ({host.name}): FATAL ERROR"
            
        # Check for skipped tasks
        elif f"skipping: [{hostname}]" in line:
            status_message = f"⏭️  IP {hostname} ({host.name}): Task skipped"
    
    # Check for play recap section
    if "PLAY RECAP" in line:
        recap_status = f"\n📊 EXECUTION RECAP\n{'='*40}\n"
        return recap_status
    
    # Parse recap lines for final status
    if any(host.hostname in line for host in hosts) and ("ok=" in line and "failed=" in line):
        for host in hosts:
            if host.hostname in line:
                try:
                    # Extract statistics from recap line
                    parts = line.split()
                    ok_count = 0
                    failed_count = 0
                    unreachable_count = 0
                    
                    for part in parts:
                        if part.startswith("ok="):
                            ok_count = int(part.split("=")[1])
                        elif part.startswith("failed="):
                            failed_count = int(part.split("=")[1])
                        elif part.startswith("unreachable="):
                            unreachable_count = int(part.split("=")[1])
                    
                    # Determine final status
                    if failed_count > 0 or unreachable_count > 0:
                        final_status = "FAILED"
                        emoji = "❌"
                        host_status_tracker[host.hostname]['status'] = 'failed'
                    else:
                        final_status = "SUCCESS"
                        emoji = "✅"
                        host_status_tracker[host.hostname]['status'] = 'success'
                    
                    status_message = f"{emoji} IP {host.hostname} ({host.name}): FINAL STATUS = {final_status} (ok={ok_count}, failed={failed_count})"
                    
                except (ValueError, IndexError):
                    pass
    
    return status_message

def extract_artifacts_from_tree(artifacts_dir, execution_id, hosts):
    """
    Extract artifacts from Ansible --tree output directory.
    This captures all register variables and task results.
    """
    artifacts = []
    
    try:
        if not os.path.exists(artifacts_dir):
            return artifacts
            
        for host in hosts:
            host_file = os.path.join(artifacts_dir, host.hostname)
            if os.path.exists(host_file):
                try:
                    with open(host_file, 'r') as f:
                        host_results = json.loads(f.read())
                    
                    # Extract task results and registers
                    if isinstance(host_results, dict):
                        for task_name, task_result in host_results.items():
                            if isinstance(task_result, dict):
                                # Create artifact for each task result
                                artifact = Artifact(
                                    execution_id=execution_id,
                                    task_name=task_name,
                                    register_name=f"{task_name}_result",
                                    register_data=json.dumps(task_result, indent=2),
                                    host_name=host.hostname,
                                    task_status=task_result.get('changed', False) and 'changed' or 'ok'
                                )
                                artifacts.append(artifact)
                                
                except Exception as e:
                    print(f"Error reading artifacts for host {host.hostname}: {e}")
                    
    except Exception as e:
        print(f"Error extracting artifacts from {artifacts_dir}: {e}")
    
    return artifacts

def create_task_summary(task_name, task_status, hostname, register_data=None, raw_line=""):
    """
    Create a user-friendly summary of a task execution.
    """
    status_emoji = {
        'ok': '✅',
        'changed': '🔄',
        'failed': '❌',
        'fatal': '💀',
        'skipped': '⏭️',
        'unreachable': '🚫'
    }
    
    status_description = {
        'ok': 'SUCCESS',
        'changed': 'CHANGED',
        'failed': 'FAILED',
        'fatal': 'FATAL ERROR',
        'skipped': 'SKIPPED',
        'unreachable': 'UNREACHABLE'
    }
    
    emoji = status_emoji.get(task_status, '❓')
    description = status_description.get(task_status, task_status.upper())
    
    summary_lines = [
        f"═══════════════════════════════════════════════════════════",
        f"{emoji} TASK EXECUTION SUMMARY",
        f"═══════════════════════════════════════════════════════════",
        f"📋 Task: {task_name}",
        f"🖥️  Host: {hostname}",
        f"📊 Status: {description}",
        f"═══════════════════════════════════════════════════════════",
    ]
    
    # Add specific information based on status
    if task_status in ['failed', 'fatal', 'unreachable']:
        summary_lines.append(f"🚨 ERROR DETAILS:")
        
        # Extract detailed error information from register_data
        if register_data and isinstance(register_data, dict):
            # Get error message
            error_msg = (register_data.get('msg', '') or 
                        register_data.get('stderr', '') or 
                        register_data.get('failed_reason', '') or
                        register_data.get('reason', ''))
            
            if error_msg:
                summary_lines.append(f"   💬 Message: {error_msg}")
            
            # Get stderr if available
            stderr = register_data.get('stderr', '')
            if stderr and stderr != error_msg:
                summary_lines.append(f"   🚫 Error Output: {stderr}")
            
            # Get stdout if available (sometimes has useful info even on failures)
            stdout = register_data.get('stdout', '')
            if stdout:
                summary_lines.append(f"   📤 Standard Output: {stdout}")
            
            # Get return code if available
            rc = register_data.get('rc')
            if rc is not None:
                summary_lines.append(f"   🔢 Return Code: {rc}")
            
            # Show raw ansible output if available
            if 'ansible_facts' in register_data:
                summary_lines.append(f"   📋 Ansible Facts: Available")
                
        else:
            # Fallback to parsing from raw line
            if "UNREACHABLE!" in raw_line:
                summary_lines.append(f"   💬 Message: Host is unreachable")
            elif "failed:" in raw_line:
                parts = raw_line.split("failed:")
                if len(parts) > 1:
                    summary_lines.append(f"   💬 Message: {parts[1].strip()}")
            else:
                summary_lines.append(f"   💬 Message: Task execution failed")
        
    elif task_status == 'changed':
        summary_lines.append(f"🔄 CHANGES MADE:")
        if register_data and isinstance(register_data, dict):
            # Show what changed with detailed output
            stdout = register_data.get('stdout', '')
            stderr = register_data.get('stderr', '')
            msg = register_data.get('msg', '')
            
            if msg:
                summary_lines.append(f"   💬 Message: {msg}")
            if stdout:
                summary_lines.append(f"   📤 Standard Output:")
                summary_lines.append(f"      {stdout}")
            if stderr:
                summary_lines.append(f"   ⚠️  Warnings/Errors:")
                summary_lines.append(f"      {stderr}")
            
            # Show return code if available
            rc = register_data.get('rc')
            if rc is not None:
                summary_lines.append(f"   🔢 Return Code: {rc}")
        else:
            summary_lines.append(f"   Task completed successfully with changes")
            
    elif task_status == 'ok':
        summary_lines.append(f"✅ SUCCESS:")
        if register_data and isinstance(register_data, dict):
            stdout = register_data.get('stdout', '')
            stderr = register_data.get('stderr', '')
            msg = register_data.get('msg', '')
            
            if msg:
                summary_lines.append(f"   💬 Message: {msg}")
            if stdout:
                summary_lines.append(f"   📤 Standard Output:")
                summary_lines.append(f"      {stdout}")
            if stderr:
                summary_lines.append(f"   ⚠️  Warnings/Errors:")
                summary_lines.append(f"      {stderr}")
            
            # Show return code if available
            rc = register_data.get('rc')
            if rc is not None:
                summary_lines.append(f"   🔢 Return Code: {rc}")
        else:
            summary_lines.append(f"   Task completed successfully")
        
    elif task_status == 'skipped':
        summary_lines.append(f"⏭️  SKIPPED:")
        if register_data and isinstance(register_data, dict):
            skip_reason = register_data.get('skip_reason', register_data.get('msg', 'Condition not met'))
            summary_lines.append(f"   Reason: {skip_reason}")
        else:
            summary_lines.append(f"   Task was skipped due to condition")
    
    summary_lines.append(f"═══════════════════════════════════════════════════════════")
    
    return '\n'.join(summary_lines)


def extract_register_from_output(output_lines, execution_id, hosts, variables=None):
    """
    Extract register variables and their stdout from Ansible verbose output.
    Returns raw artifact data that can be used to create Artifact models.
    """
    import json  # Import json at the top of the function
    artifacts_data = []
    print(f"Starting artifact extraction for {len(hosts)} hosts")
    
    # Create comprehensive hostname list for matching  
    hostnames = []
    hostname_variations = set()  # Use set to avoid duplicates
    
    # Add GUI-configured hosts
    for h in hosts:
        primary_hostname = None
        if hasattr(h, 'hostname'):
            primary_hostname = h.hostname
        elif hasattr(h, 'name'):
            primary_hostname = h.name
        elif isinstance(h, dict):
            primary_hostname = h.get('hostname', h.get('name', str(h)))
        else:
            primary_hostname = str(h)
        
        if primary_hostname:
            # Add the primary hostname
            hostname_variations.add(primary_hostname)
            
            # Add variations for IP addresses (e.g., 192.168.10.23 -> 23)
            if '.' in primary_hostname:
                # For IP addresses, add the last octet as a variation
                last_octet = primary_hostname.split('.')[-1]
                hostname_variations.add(last_octet)
                
            # Add variations without domain (e.g., host.domain.com -> host)
            if '.' in primary_hostname:
                short_name = primary_hostname.split('.')[0]
                hostname_variations.add(short_name)
    
    # Add dynamic IPs from variables (for variable-defined hosts)
    dynamic_ips = set()
    if variables:
        print(f"🔍 DEBUG: Checking for dynamic IPs in variables for artifact extraction: {variables}")
        # Check for 'ips' variable first, then 'hosts' variable
        ips_value = variables.get('ips') or variables.get('hosts')
        print(f"🔍 DEBUG: Found ips/hosts value for artifacts: '{ips_value}'")
        if ips_value and isinstance(ips_value, str):
            # Split comma-separated IPs and add them to hostname variations
            for ip in ips_value.split(','):
                ip = ip.strip()
                if ip and ip not in ['all', 'targets']:  # Skip special keywords
                    dynamic_ips.add(ip)
                    hostname_variations.add(ip)
                    
                    # Add variations for dynamic IP addresses too
                    if '.' in ip:
                        last_octet = ip.split('.')[-1]
                        hostname_variations.add(last_octet)
                        short_name = ip.split('.')[0]
                        hostname_variations.add(short_name)
                    
                    print(f"🔍 DEBUG: Added dynamic IP to artifact extraction: {ip}")
    
    print(f"🔍 DEBUG: Total dynamic IPs found for artifacts: {len(dynamic_ips)} - {list(dynamic_ips)}")
    print(f"🔍 DEBUG: Total GUI hosts for artifacts: {len(hosts)}")
    
    if not hostname_variations and not hosts:
        print("⚠️  No hosts or variables provided for extraction")
        return artifacts_data
    
    hostnames = list(hostname_variations)
    print(f"🔍 Looking for these hostname variations: {hostnames}")
    print(f"🔍 Host objects type: {[type(h) for h in hosts]}")
    if hosts:
        print(f"🔍 First host attributes: {dir(hosts[0]) if hasattr(hosts[0], '__dict__') else 'No attributes'}")
    
    current_task = None
    
    for i, line in enumerate(output_lines):
        try:
            # Debug: Print first few lines and any lines with potential host results
            if i < 10:
                print(f"🔍 Line {i}: {line[:80]}...")
            
            # Debug: Show lines that might contain host results
            if any(pattern in line.lower() for pattern in ["ok:", "changed:", "failed:", "fatal:", "skipped:", "unreachable:"]):
                print(f"🔍 Potential host result line {i}: {line[:100]}...")
            
            # Detect task names
            if "TASK [" in line and "] **" in line:
                task_start = line.find("TASK [") + 6
                task_end = line.find("]", task_start)
                if task_end != -1:
                    current_task = line[task_start:task_end].strip()
                    print(f"📋 Found task: {current_task}")
            
            # Look for host task results - improved pattern matching
            found_match = False
            for hostname in hostnames:
                if (f"ok: [{hostname}]" in line or f"changed: [{hostname}]" in line or 
                    f"failed: [{hostname}]" in line or f"fatal: [{hostname}]" in line or
                    f"skipped: [{hostname}]" in line or f"unreachable: [{hostname}]" in line):
                    
                    print(f"🎯 MATCH FOUND! Line {i}: {line[:100]}...")
                    print(f"🎯 Matched hostname: {hostname}")
                    found_match = True
                    
                    # Determine task status
                    if "changed:" in line:
                        current_task_status = "changed"
                    elif "failed:" in line:
                        current_task_status = "failed"
                    elif "fatal:" in line:
                        current_task_status = "fatal"
                    elif "skipped:" in line:
                        current_task_status = "skipped"
                    elif "unreachable:" in line:
                        current_task_status = "unreachable"
                    else:
                        current_task_status = "ok"
                    
                    print(f"🔍 Found {current_task_status} result for {hostname}: {line[:100]}...")  # Debug: show matching lines
                    
                    # Check if this line has JSON output (same line)
                    if "=> {" in line and current_task:
                        try:
                            json_start = line.find("=> {") + 3
                            json_content = line[json_start:].strip()
                            print(f"🔍 DEBUG: Extracted JSON content (first 200 chars): {json_content[:200]}")
                            
                            # Try to parse the JSON - now handle all statuses including fatal/unreachable
                            register_data = json.loads(json_content)
                            print(f"🔍 DEBUG: Successfully parsed JSON with keys: {list(register_data.keys()) if isinstance(register_data, dict) else 'Not a dict'}")
                            
                            # Extract useful data from Ansible JSON output
                            register_name = f"{current_task.replace(' ', '_').lower()}_result"
                            
                            # Use the original hostname from the hosts list, not the matched pattern
                            original_hostname = hostname
                            for h in hosts:
                                host_name = getattr(h, 'hostname', getattr(h, 'name', str(h)))
                                if isinstance(h, dict):
                                    host_name = h.get('hostname', h.get('name', str(h)))
                                
                                # Check if this host matches the pattern we found
                                if (host_name == hostname or 
                                    (host_name.endswith(hostname) and '.' in host_name) or
                                    (host_name.split('.')[-1] == hostname and '.' in host_name)):
                                    original_hostname = host_name
                                    break
                            
                            # Extract only useful fields from register_data
                            useful_data = {}
                            if isinstance(register_data, dict):
                                print(f"🔍 DEBUG: Raw register_data keys: {list(register_data.keys())}")
                                
                                # Extract commonly useful fields
                                for field in ['msg', 'stdout', 'stderr', 'rc', 'changed', 'failed', 'skipped', 'unreachable']:
                                    if field in register_data:
                                        useful_data[field] = register_data[field]
                                        print(f"🔍 DEBUG: Found useful field '{field}': {register_data[field]}")
                                
                                # Add error-related fields
                                for field in ['failed_reason', 'reason', 'exception']:
                                    if field in register_data:
                                        useful_data[field] = register_data[field]
                                
                                # Special handling for command/shell module results
                                if 'cmd' in register_data:
                                    useful_data['command'] = register_data['cmd']
                                if 'start' in register_data and 'end' in register_data:
                                    useful_data['execution_time'] = f"{register_data['start']} - {register_data['end']}"
                                
                                # If no useful fields found, create a summary from available data
                                if not any(field in useful_data for field in ['msg', 'stdout', 'stderr']):
                                    summary_parts = []
                                    if 'changed' in register_data:
                                        status = "CHANGED" if register_data['changed'] else "OK"
                                        summary_parts.append(f"Status: {status}")
                                    
                                    if 'ansible_facts' in register_data:
                                        facts = register_data['ansible_facts']
                                        if isinstance(facts, dict):
                                            # Extract some meaningful facts
                                            if 'ansible_hostname' in facts:
                                                summary_parts.append(f"Host: {facts['ansible_hostname']}")
                                            if 'ansible_distribution' in facts:
                                                summary_parts.append(f"OS: {facts['ansible_distribution']}")
                                    
                                    if summary_parts:
                                        useful_data['msg'] = "; ".join(summary_parts)
                                    else:
                                        useful_data['msg'] = "Task completed successfully"
                                
                            else:
                                useful_data = {'raw_output': str(register_data)}
                            
                            # Add task metadata
                            useful_data['task_name'] = current_task
                            useful_data['host_name'] = original_hostname
                            useful_data['task_status'] = current_task_status
                            
                            artifact_data = {
                                'execution_id': execution_id,
                                'task_name': current_task,
                                'register_name': register_name,
                                'register_data': json.dumps(useful_data, indent=2),
                                'host_name': original_hostname,
                                'task_status': current_task_status
                            }
                            artifacts_data.append(artifact_data)
                            print(f"✅ Created artifact with raw data: {register_name} for {original_hostname}")
                            
                        except Exception as e:
                            print(f"⚠️  Failed to parse JSON for {hostname}: {e}")
                    
                    # Also check for multi-line JSON output (next lines after task result)
                    elif current_task and i + 1 < len(output_lines):
                        # Look ahead for JSON content in the next few lines
                        for j in range(1, min(10, len(output_lines) - i)):  # Check next 10 lines max
                            next_line = output_lines[i + j].strip()
                            
                            # Stop if we hit another task or host result
                            if ("TASK [" in next_line or 
                                any(f"ok: [{h}]" in next_line or f"changed: [{h}]" in next_line or f"failed: [{h}]" in next_line for h in hostnames)):
                                break
                            
                            # Look for JSON content - handle both single line and multi-line JSON
                            if next_line.strip().startswith("{"):
                                try:
                                    # Collect multi-line JSON
                                    json_lines = [next_line]
                                    brace_count = next_line.count('{') - next_line.count('}')
                                    
                                    # If JSON is complete on one line
                                    if brace_count == 0 and next_line.strip().endswith("}"):
                                        json_content = next_line
                                    else:
                                        # Collect additional lines until JSON is complete
                                        for json_line_idx in range(idx + 2, min(len(output_lines), idx + 20)):  # Look ahead max 20 lines
                                            if json_line_idx >= len(output_lines):
                                                break
                                            json_line = output_lines[json_line_idx].strip()
                                            if not json_line:
                                                continue
                                            
                                            json_lines.append(json_line)
                                            brace_count += json_line.count('{') - json_line.count('}')
                                            
                                            # Stop when JSON is complete
                                            if brace_count == 0:
                                                break
                                            
                                            # Stop if we hit another task or host result
                                            if ("TASK [" in json_line or 
                                                any(f"ok: [{h}]" in json_line or f"changed: [{h}]" in json_line or f"failed: [{h}]" in json_line for h in hostnames)):
                                                break
                                        
                                        json_content = '\n'.join(json_lines)
                                    
                                    print(f"🔍 DEBUG: Multi-line JSON content: {json_content[:300]}...")
                                    register_data = json.loads(json_content)
                                    
                                    # Extract useful data from multi-line Ansible JSON output
                                    register_name = f"{current_task.replace(' ', '_').lower()}_result"
                                    
                                    # Use the original hostname from the hosts list, not the matched pattern
                                    original_hostname = hostname
                                    for h in hosts:
                                        host_name = getattr(h, 'hostname', getattr(h, 'name', str(h)))
                                        if isinstance(h, dict):
                                            host_name = h.get('hostname', h.get('name', str(h)))
                                        
                                        # Check if this host matches the pattern we found
                                        if (host_name == hostname or 
                                            (host_name.endswith(hostname) and '.' in host_name) or
                                            (host_name.split('.')[-1] == hostname and '.' in host_name)):
                                            original_hostname = host_name
                                            break
                                    
                                    # Extract only useful fields from register_data
                                    useful_data = {}
                                    if isinstance(register_data, dict):
                                        print(f"🔍 DEBUG: Raw register_data keys: {list(register_data.keys())}")
                                        
                                        # Extract commonly useful fields
                                        for field in ['msg', 'stdout', 'stderr', 'rc', 'changed', 'failed', 'skipped', 'unreachable']:
                                            if field in register_data:
                                                useful_data[field] = register_data[field]
                                                print(f"🔍 DEBUG: Found useful field '{field}': {register_data[field]}")
                                        
                                        # Add error-related fields
                                        for field in ['failed_reason', 'reason', 'exception']:
                                            if field in register_data:
                                                useful_data[field] = register_data[field]
                                        
                                        # Special handling for command/shell module results
                                        if 'cmd' in register_data:
                                            useful_data['command'] = register_data['cmd']
                                        if 'start' in register_data and 'end' in register_data:
                                            useful_data['execution_time'] = f"{register_data['start']} - {register_data['end']}"
                                        
                                        # If no useful fields found, create a summary from available data
                                        if not any(field in useful_data for field in ['msg', 'stdout', 'stderr']):
                                            summary_parts = []
                                            if 'changed' in register_data:
                                                status = "CHANGED" if register_data['changed'] else "OK"
                                                summary_parts.append(f"Status: {status}")
                                            
                                            if 'ansible_facts' in register_data:
                                                facts = register_data['ansible_facts']
                                                if isinstance(facts, dict):
                                                    # Extract some meaningful facts
                                                    if 'ansible_hostname' in facts:
                                                        summary_parts.append(f"Host: {facts['ansible_hostname']}")
                                                    if 'ansible_distribution' in facts:
                                                        summary_parts.append(f"OS: {facts['ansible_distribution']}")
                                            
                                            if summary_parts:
                                                useful_data['msg'] = "; ".join(summary_parts)
                                            else:
                                                useful_data['msg'] = "Task completed successfully"
                                        
                                    else:
                                        useful_data = {'raw_output': str(register_data)}
                                    
                                    # Add task metadata
                                    useful_data['task_name'] = current_task
                                    useful_data['host_name'] = original_hostname
                                    useful_data['task_status'] = current_task_status
                                    
                                    artifact_data = {
                                        'execution_id': execution_id,
                                        'task_name': current_task,
                                        'register_name': register_name,
                                        'register_data': json.dumps(useful_data, indent=2),
                                        'host_name': original_hostname,
                                        'task_status': current_task_status
                                    }
                                    artifacts_data.append(artifact_data)
                                    print(f"✅ Created multi-line artifact with raw data: {register_name} for {original_hostname}")
                                    break
                                    
                                except Exception as e:
                                    print(f"⚠️  Failed to parse multi-line JSON for {hostname}: {e}")
                                    continue
                    
                    # Also create a basic artifact even without JSON (for tasks that don't output JSON)
                    if current_task:
                        # Check if we already created an artifact for this task/host combination
                        existing_artifact = any(
                            a['task_name'] == current_task and a['host_name'] == hostname 
                            for a in artifacts_data
                        )
                        
                        if not existing_artifact and (current_task not in ['Gathering Facts'] or current_task_status in ['fatal', 'unreachable', 'failed']):
                            # Create artifact for meaningful tasks (skip Gathering Facts) but always create for failures
                            register_name = f"{current_task.replace(' ', '_').lower()}_result"
                            
                            # Use the original hostname from the hosts list, not the matched pattern
                            original_hostname = hostname
                            for h in hosts:
                                host_name = getattr(h, 'hostname', getattr(h, 'name', str(h)))
                                if isinstance(h, dict):
                                    host_name = h.get('hostname', h.get('name', str(h)))
                                
                                # Check if this host matches the pattern we found
                                if (host_name == hostname or 
                                    (host_name.endswith(hostname) and '.' in host_name) or
                                    (host_name.split('.')[-1] == hostname and '.' in host_name)):
                                    original_hostname = host_name
                                    break
                            
                            # Create basic useful data for tasks without JSON output
                            basic_data = {
                                'task_name': current_task,
                                'host_name': original_hostname,
                                'task_status': current_task_status,
                                'msg': f"Task '{current_task}' completed with status: {current_task_status}"
                            }
                            
                            # Extract more detailed information from the ansible output line
                            # Try to find actual output/message content in the line
                            extracted_msg = None
                            
                            # Look for output in different ansible formats
                            if "=> " in line:
                                parts = line.split("=> ", 1)
                                if len(parts) > 1:
                                    content = parts[1].strip()
                                    extracted_msg = content
                                    
                                    # Clean up common ansible formatting for non-JSON content
                                    if extracted_msg.startswith('"') and extracted_msg.endswith('"'):
                                        extracted_msg = extracted_msg[1:-1]
                            
                            # Look for shell command output patterns
                            elif "| " in line and (" rc=" in line or " changed=" in line):
                                # Format: output | SUCCESS | rc=0 >>
                                parts = line.split(" | ")
                                if len(parts) >= 2:
                                    # Get the content after the status
                                    for part in parts:
                                        if ">>" in part:
                                            extracted_msg = part.split(">>", 1)[-1].strip()
                                            break
                            
                            # Look for specific error messages in failure cases
                            elif "failed:" in line or "fatal:" in line:
                                # Try to extract error details
                                if "msg=" in line:
                                    msg_start = line.find("msg=") + 4
                                    if line[msg_start] == '"':
                                        # Find closing quote
                                        msg_end = line.find('"', msg_start + 1)
                                        if msg_end != -1:
                                            extracted_msg = line[msg_start+1:msg_end]
                                elif "stderr=" in line:
                                    stderr_start = line.find("stderr=") + 7
                                    if line[stderr_start] == '"':
                                        stderr_end = line.find('"', stderr_start + 1)
                                        if stderr_end != -1:
                                            extracted_msg = f"Error: {line[stderr_start+1:stderr_end]}"
                            
                            # Update message and status based on line content
                            if "UNREACHABLE" in line:
                                basic_data['msg'] = extracted_msg or "Host is unreachable - connection failed"
                                basic_data['failed'] = True
                                basic_data['unreachable'] = True
                            elif "failed:" in line:
                                basic_data['msg'] = extracted_msg or "Task execution failed - check task configuration"
                                basic_data['failed'] = True
                            elif "fatal:" in line:
                                basic_data['msg'] = extracted_msg or "Fatal error during task execution"
                                basic_data['failed'] = True
                                basic_data['fatal'] = True
                            elif "changed:" in line:
                                basic_data['msg'] = extracted_msg or f"Task '{current_task}' completed successfully with changes"
                                basic_data['changed'] = True
                            elif "skipped:" in line:
                                basic_data['msg'] = extracted_msg or f"Task '{current_task}' was skipped (condition not met)"
                                basic_data['skipped'] = True
                            elif "ok:" in line:
                                basic_data['msg'] = extracted_msg or f"Task '{current_task}' completed successfully"
                                basic_data['changed'] = False
                            else:
                                # Use extracted message if available, otherwise use default
                                if extracted_msg:
                                    basic_data['msg'] = extracted_msg
                            
                            # Look ahead for multi-line output (like shell command output)
                            if not extracted_msg and i + 1 < len(output_lines):
                                next_line = output_lines[i + 1].strip()
                                # Check if next line contains command output or results
                                if (next_line and not next_line.startswith("TASK [") and 
                                    not any(status in next_line for status in ["ok:", "changed:", "failed:", "fatal:", "skipped:"])):
                                    # This might be output from the previous task
                                    if len(next_line) > 10 and not next_line.startswith("---"):  # Skip ansible separators
                                        # Check a few more lines for additional context
                                        multi_line_output = [next_line]
                                        for j in range(i + 2, min(i + 5, len(output_lines))):
                                            candidate_line = output_lines[j].strip()
                                            if (candidate_line and not candidate_line.startswith("TASK [") and 
                                                not any(status in candidate_line for status in ["ok:", "changed:", "failed:", "fatal:", "skipped:"]) and
                                                not candidate_line.startswith("---")):
                                                multi_line_output.append(candidate_line)
                                            else:
                                                break
                                        
                                        if multi_line_output and len(' '.join(multi_line_output)) > 20:
                                            # Use the multi-line output as the message
                                            basic_data['msg'] = ' '.join(multi_line_output)
                                            basic_data['stdout'] = '\n'.join(multi_line_output)
                            
                            artifact_data = {
                                'execution_id': execution_id,
                                'task_name': current_task,
                                'register_name': register_name,
                                'register_data': json.dumps(basic_data, indent=2),
                                'host_name': original_hostname,
                                'task_status': current_task_status
                            }
                            artifacts_data.append(artifact_data)
                            print(f"✅ Created enhanced artifact with extracted message: {register_name} for {original_hostname}")
                            if extracted_msg:
                                print(f"   📝 Extracted message: {extracted_msg[:100]}...")
                            elif 'stdout' in basic_data:
                                print(f"   📋 Found multi-line output: {basic_data['stdout'][:100]}...")
                    
                    break
            
            # Also check for special unreachable pattern: fatal: [host-192-168-10-141]: UNREACHABLE!
            if not found_match and "UNREACHABLE!" in line and "fatal:" in line:
                # Extract hostname from pattern like "fatal: [host-192-168-10-141]: UNREACHABLE!"
                import re
                match = re.search(r'fatal: \[(.*?)\]: UNREACHABLE!', line)
                if match:
                    unreachable_host = match.group(1)
                    print(f"🚫 Found unreachable host: {unreachable_host}")
                    
                    # Find the matching original hostname
                    original_hostname = unreachable_host
                    for h in hosts:
                        host_name = getattr(h, 'hostname', getattr(h, 'name', str(h)))
                        if isinstance(h, dict):
                            host_name = h.get('hostname', h.get('name', str(h)))
                        
                        # Check if this matches the unreachable host pattern
                        if (host_name in unreachable_host or 
                            unreachable_host.replace('host-', '').replace('-', '.') == host_name):
                            original_hostname = host_name
                            break
                    
                    if current_task and current_task not in ['Gathering Facts']:
                        # Create artifact for unreachable host
                        register_name = f"{current_task.replace(' ', '_').lower()}_result"
                        summary = create_task_summary(current_task, "unreachable", original_hostname, None, line)
                        
                        # Check if we already have this artifact
                        existing_unreachable = any(
                            a['task_name'] == current_task and a['host_name'] == original_hostname 
                            for a in artifacts_data
                        )
                        
                        if not existing_unreachable:
                            artifact_data = {
                                'execution_id': execution_id,
                                'task_name': current_task,
                                'register_name': register_name,
                                'register_data': summary,
                                'host_name': original_hostname,
                                'task_status': 'unreachable'
                            }
                            artifacts_data.append(artifact_data)
                            print(f"✅ Created unreachable host artifact: {register_name} for {original_hostname}")
        
        except Exception as e:
            print(f"Error processing line {i}: {e}")
    
    print(f"🎯 Extracted {len(artifacts_data)} artifact data items")
    return artifacts_data

def analyze_ansible_output(output, hosts, variables=None):
    """
    Analyze Ansible output to determine success/failure status for each host.
    Also tracks task-level failures to detect partial failures within successful hosts.
    Returns a dictionary with detailed analysis including task failures.
    """
    host_results = {}
    task_failures = {}  # Track task failures per host
    
    # Initialize all GUI hosts as unknown
    for host in hosts:
        host_results[host.hostname] = 'unknown'
        task_failures[host.hostname] = {'failed_tasks': 0, 'total_tasks': 0}
    
    # Also add dynamic IPs from variables if hosts is empty
    dynamic_hostnames = []
    if len(hosts) == 0 and variables:
        ips_value = variables.get('ips') or variables.get('hosts')
        if ips_value and isinstance(ips_value, str):
            for ip in ips_value.split(','):
                ip = ip.strip()
                if ip and ip not in ['all', 'targets']:
                    dynamic_hostnames.append(ip)
                    host_results[ip] = 'unknown'
                    task_failures[ip] = {'failed_tasks': 0, 'total_tasks': 0}
        print(f"🔍 DEBUG: Added dynamic hostnames for analysis: {dynamic_hostnames}")
    
    # Combine all hostnames to check
    all_hostnames = [h.hostname for h in hosts] + dynamic_hostnames
    print(f"🔍 DEBUG: Analyzing output for hostnames: {all_hostnames}")
    
    lines = output.split('\n')
    
    # First pass: Track individual task results
    current_task = None
    task_processed_per_host = {}  # Track which tasks we've already counted per host
    
    for line in lines:
        # Detect task names
        if "TASK [" in line and "] **" in line:
            current_task = line.split("TASK [")[1].split("]")[0].strip()
            # Reset task processing tracking for new task
            task_processed_per_host = {}
            continue
            
        # Track task results for each host (avoid double counting)
        if current_task:
            for hostname in all_hostnames:
                task_key = f"{current_task}_{hostname}"
                
                # Skip if we already processed this task for this host
                if task_key in task_processed_per_host:
                    continue
                
                # Count successful tasks
                if f"ok: [{hostname}]" in line or f"changed: [{hostname}]" in line:
                    task_failures[hostname]['total_tasks'] += 1
                    task_processed_per_host[task_key] = True
                    print(f"Task success: {current_task} on {hostname}")
                    
                # Count failed tasks
                elif f"failed: [{hostname}]" in line or f"fatal: [{hostname}]" in line:
                    task_failures[hostname]['total_tasks'] += 1
                    task_failures[hostname]['failed_tasks'] += 1
                    task_processed_per_host[task_key] = True
                    print(f"Task failure detected: {current_task} on {hostname}")
                    
                # Count skipped tasks (don't count as failures, but count as total)
                elif f"skipped: [{hostname}]" in line:
                    task_failures[hostname]['total_tasks'] += 1
                    task_processed_per_host[task_key] = True
                    print(f"Task skipped: {current_task} on {hostname}")
    
    # Second pass: Look for Ansible play recap section which shows final host status
    in_recap = False
    for line in lines:
        if 'PLAY RECAP' in line:
            in_recap = True
            continue
            
        if in_recap and line.strip():
            # Parse recap lines like: "hostname : ok=5 changed=2 unreachable=0 failed=0"
            # Also handle dynamic IPs that might not be in the hosts list
            line_lower = line.lower()
            
            # Check all known hosts first
            for host in hosts:
                if host.hostname in line:
                    if 'unreachable=' in line and 'failed=' in line:
                        # Extract failed and unreachable counts
                        try:
                            failed_match = line.split('failed=')[1].split()[0]
                            unreachable_match = line.split('unreachable=')[1].split()[0]
                            failed_count = int(failed_match)
                            unreachable_count = int(unreachable_match)
                            
                            if unreachable_count > 0:
                                # Host is unreachable - complete failure
                                host_results[host.hostname] = 'failed'
                                print(f"Host {host.hostname} marked as failed: {unreachable_count} unreachable")
                            elif failed_count > 0:
                                # Host is reachable but some tasks failed - partial success
                                host_results[host.hostname] = 'partial'
                                print(f"Host {host.hostname} marked as partial: {failed_count} tasks failed according to PLAY RECAP")
                            else:
                                # Host completed successfully - no failures
                                host_results[host.hostname] = 'success'
                                print(f"Host {host.hostname} marked as success: no failed tasks in PLAY RECAP")
                        except (ValueError, IndexError):
                            # If we can't parse, check for other indicators
                            if 'unreachable=' in line and 'unreachable=0' not in line:
                                host_results[host.hostname] = 'failed'
                                print(f"Host {host.hostname} marked as failed: unreachable detected in recap (parsing failed)")
                            elif 'failed=' in line and 'failed=0' not in line:
                                host_results[host.hostname] = 'partial'
                                print(f"Host {host.hostname} marked as partial: failed tasks detected in recap (parsing failed)")
                            else:
                                host_results[host.hostname] = 'success'
                                print(f"Host {host.hostname} marked as success: no failures detected in recap (parsing failed)")
            
            # Also check for dynamic IPs in the recap that might not be in hosts list
            if ':' in line and ('ok=' in line or 'failed=' in line):
                # Try to extract IP/hostname from the line
                try:
                    recap_host = line.split(':')[0].strip()
                    if recap_host and recap_host not in [h.hostname for h in hosts]:
                        # This is a dynamic host, add it to results
                        if 'unreachable=' in line and 'failed=' in line:
                            failed_match = line.split('failed=')[1].split()[0]
                            unreachable_match = line.split('unreachable=')[1].split()[0]
                            failed_count = int(failed_match)
                            unreachable_count = int(unreachable_match)
                            
                            if unreachable_count > 0:
                                host_results[recap_host] = 'failed'
                                print(f"Dynamic host {recap_host} marked as failed: {unreachable_count} unreachable")
                            elif failed_count > 0:
                                host_results[recap_host] = 'partial'
                                print(f"Dynamic host {recap_host} marked as partial: {failed_count} tasks failed")
                            else:
                                host_results[recap_host] = 'success'
                                print(f"Dynamic host {recap_host} marked as success: no failed tasks")
                            
                            # Initialize task_failures for dynamic host
                            if recap_host not in task_failures:
                                task_failures[recap_host] = {'failed_tasks': failed_count, 'total_tasks': failed_count}
                except (ValueError, IndexError) as e:
                    print(f"Failed to parse dynamic host recap line: {line}, error: {e}")
    
    # If no recap found, look for other indicators
    if all(status == 'unknown' for status in host_results.values()):
        # Look for fatal errors or connection failures
        for host in hosts:
            if f"UNREACHABLE! => {host.hostname}" in output or f"FAILED! => {host.hostname}" in output:
                host_results[host.hostname] = 'failed'
            elif f"ok: [{host.hostname}]" in output or f"changed: [{host.hostname}]" in output:
                # Check for task failures
                failed_tasks = task_failures[host.hostname]['failed_tasks']
                successful_tasks = task_failures[host.hostname]['successful_tasks']
                
                if failed_tasks > 0 and successful_tasks > 0:
                    # Some tasks failed, some succeeded = partial
                    host_results[host.hostname] = 'partial'
                elif failed_tasks > 0 and successful_tasks == 0:
                    # All tasks failed = failed
                    host_results[host.hostname] = 'failed'
                else:
                    # No tasks failed = success
                    host_results[host.hostname] = 'success'
    
    # Default unknown hosts to success if we couldn't determine status but no explicit failures were found
    for host_name, status in host_results.items():
        if status == 'unknown':
            # Check if there were any explicit failures for this host
            failed_tasks = task_failures[host_name]['failed_tasks']
            successful_tasks = task_failures[host_name]['successful_tasks']
            
            if failed_tasks > 0 and successful_tasks > 0:
                # Some tasks failed, some succeeded = partial
                host_results[host_name] = 'partial'
                print(f"Host {host_name} defaulted to partial: had {failed_tasks} failed tasks and {successful_tasks} successful tasks")
            elif failed_tasks > 0 and successful_tasks == 0:
                # All tasks failed = failed
                host_results[host_name] = 'failed'
                print(f"Host {host_name} defaulted to failed: had {failed_tasks} failed tasks and no successful tasks")
            elif 'UNREACHABLE!' in output or 'FAILED!' in output or 'fatal:' in output:
                # Only mark as failed if there are explicit failure indicators in the output
                host_results[host_name] = 'failed'
                print(f"Host {host_name} defaulted to failed: explicit failure indicators found")
            else:
                # If no failures detected, assume success
                host_results[host_name] = 'success'
                print(f"Host {host_name} defaulted to success: no failures detected")
    
    # Add task failure info to results
    result_data = {
        'host_results': host_results,
        'task_failures': task_failures
    }
    
    return result_data

def run_ansible_playbook_multi_host_safe(task_id, playbook_data, host_data, username, password, variables=None):
    """
    Safe wrapper that recreates objects from data to avoid session issues.
    """
    # Log the content being used for execution
    print(f"🔄 EXECUTION THREAD: Starting execution with content length {len(playbook_data['content'])} chars")
    
    # Create simple objects from data
    class SimplePlaybook:
        def __init__(self, data):
            self.id = data['id']
            self.name = data['name']
            self.content = data['content']
    
    class SimpleHost:
        def __init__(self, host_dict):
            self.id = host_dict['id']
            self.name = host_dict['name']
            self.hostname = host_dict['hostname']
            self.description = host_dict.get('description', '')
            self.os_type = host_dict.get('os_type', 'linux')
            self.port = host_dict.get('port', 22)
        
        def to_dict(self):
            return {
                'id': self.id,
                'name': self.name,
                'hostname': self.hostname,
                'description': self.description,
                'os_type': self.os_type,
                'port': self.port
            }
    
    # Recreate objects
    playbook = SimplePlaybook(playbook_data)
    hosts = [SimpleHost(host_dict) for host_dict in host_data]
    
    # Call the original function
    return run_ansible_playbook_multi_host(task_id, playbook, hosts, username, password, variables)

def run_ansible_playbook_multi_host(task_id, playbook, hosts, username, password, variables=None):
    print(f"🔍 DEBUG: run_ansible_playbook_multi_host called")
    print(f"🔍 DEBUG: task_id={task_id}, hosts={hosts}, len(hosts)={len(hosts) if hosts else 'None'}")
    print(f"🔍 DEBUG: variables={variables}")
    print(f"Starting multi-host playbook execution for task {task_id} on {len(hosts)} hosts")
    
    # Initialize variables that might be used in exception handling
    full_output = ""
    status_details = ""
    error_lines = []
    overall_status = 'failed'
    task_started_at = None
    task_finished_at = None
    
    with app.app_context():
        task = Task.query.get(task_id)
        if not task:
            print(f"Task {task_id} not found")
            return
            
        task.status = 'running'
        task.started_at = datetime.utcnow()
        db.session.commit()
        print(f"Task {task_id} status updated to running")
    
    # Emit status update
    socketio.emit('task_update', {
        'task_id': str(task_id),
        'status': 'running',
        'message': f'Starting execution of {playbook.name} on {len(hosts)} hosts'
    })
    
    try:
        # Create temporary inventory file with all hosts
        with tempfile.NamedTemporaryFile(mode='w', suffix='.ini', delete=False) as inv_file:
            # Determine connection type based on playbook OS type
            playbook_os_type = getattr(playbook, 'os_type', 'linux')
            is_windows_playbook = playbook_os_type.lower() == 'windows'
            
            print(f"🖥️ Playbook OS type: {playbook_os_type}, Windows playbook: {is_windows_playbook}")
            
            if is_windows_playbook:
                # For Windows playbooks, treat all hosts as Windows hosts
                windows_hosts = hosts
                linux_hosts = []
                print(f"🪟 Windows playbook detected - using WinRM (port 5986) for all {len(hosts)} hosts")
            else:
                # For Linux playbooks, treat all hosts as Linux hosts
                linux_hosts = hosts
                windows_hosts = []
                print(f"🐧 Linux playbook detected - using SSH (port 22) for all {len(hosts)} hosts")
            
            # Add Linux hosts to targets group
            inv_content = "[targets]\n"
            for host in linux_hosts:
                port = getattr(host, 'port', 22)
                inv_content += f"{host.hostname} ansible_port={port} ansible_connection=ssh\n"
            
            # Add Windows hosts to targets group with WinRM connection
            for host in windows_hosts:
                # Extract port from description or use default
                description = getattr(host, 'description', '') or ''
                port = 5986
                if 'WinRM port' in description:
                    import re
                    port_match = re.search(r'port (\d+)', description)
                    if port_match:
                        port = int(port_match.group(1))
                inv_content += f"{host.hostname} ansible_port={port} ansible_connection=winrm ansible_winrm_server_cert_validation=ignore\n"
            
            # Add dynamic IPs from variables if 'ips' or 'hosts' variable is provided
            dynamic_ips = set()

            if variables:
                # Check for 'ips' variable first, then 'hosts' variable
                ips_value = variables.get('ips') or variables.get('hosts')

                if ips_value and isinstance(ips_value, str):
                    # Split comma-separated IPs and add them to inventory with appropriate connection settings
                    for ip in ips_value.split(','):
                        ip = ip.strip()
                        if ip and ip not in ['all', 'targets']:  # Skip special keywords
                            dynamic_ips.add(ip)
                            if is_windows_playbook:
                                # Add Windows dynamic IPs with WinRM settings
                                inv_content += f"{ip} ansible_port=5986 ansible_connection=winrm ansible_winrm_server_cert_validation=ignore\n"
                            else:
                                # Add Linux dynamic IPs with SSH settings
                                inv_content += f"{ip} ansible_port=22 ansible_connection=ssh\n"

            


            


            
            # Add Windows hosts to a win group
            if windows_hosts:
                inv_content += "\n[win]\n"
                for host in windows_hosts:
                    inv_content += f"{host.hostname}\n"
            
            # Also add to 'all' group for playbooks that use 'hosts: all'
            inv_content += "\n[all]\n"
            for host in hosts:
                inv_content += f"{host.hostname}\n"
            
            # Add dynamic IPs to 'all' group as well
            for ip in dynamic_ips:
                inv_content += f"{ip}\n"
            
            # Add variables for Linux hosts
            inv_content += "\n[all:vars]\n"
            inv_content += f"ansible_user={username}\n"
            
            if password:
                inv_content += f"ansible_ssh_pass={password}\n"
                inv_content += f"ansible_become_pass={password}\n"
                inv_content += "ansible_ssh_common_args=-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=yes -o PreferredAuthentications=password\n"
            else:
                inv_content += "ansible_ssh_common_args=-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=no -o PreferredAuthentications=publickey\n"
            
            inv_content += "ansible_host_key_checking=False\n"
            inv_content += "ansible_ssh_timeout=30\n"
            inv_content += "ansible_connect_timeout=30\n"
            
            # Add Windows-specific variables
            if windows_hosts:
                inv_content += "\n[win:vars]\n"
                inv_content += f"ansible_user={username}\n"
                if password:
                    inv_content += f"ansible_password={password}\n"
                inv_content += "ansible_winrm_scheme=https\n"
                inv_content += "ansible_connection=winrm\n"
                inv_content += "ansible_winrm_server_cert_validation=ignore\n"
                inv_content += "ansible_become_method=runas\n"
                inv_content += "ansible_winrm_transport=ntlm\n"
                inv_content += "ansible_winrm_port=5986\n"
            
            inv_file.write(inv_content)
            inventory_path = inv_file.name
        
        print(f"Created multi-host inventory file: {inventory_path}")
        if password:
            print(f"Using password authentication for user: {username}")
        else:
            print(f"Using SSH key authentication for user: {username}")
        
        # Debug: Print inventory content
        with open(inventory_path, 'r') as f:
            print(f"Multi-host inventory content:\n{f.read()}")
        
        # Test sshpass availability
        try:
            sshpass_test = subprocess.run(['which', 'sshpass'], capture_output=True, text=True)
            print(f"sshpass available: {sshpass_test.returncode == 0}")
            if sshpass_test.returncode != 0:
                print("sshpass not found - password authentication may fail")
        except Exception as e:
            print(f"Error checking sshpass: {e}")
        
        # Get playbook file path
        playbook_path = os.path.join(PLAYBOOKS_DIR, f"{playbook.name}.yml")
        print(f"Playbook path: {playbook_path}")
        
        # CRITICAL: Always write the current playbook content to the file before execution
        # Write the playbook content to file before execution
        print(f"🔄 Writing current playbook content to file before execution")
        print(f"🔄 Content length: {len(playbook.content)} characters")
        print(f"🔄 Content preview (first 100 chars): {playbook.content[:100]}...")
        try:
            os.makedirs(PLAYBOOKS_DIR, exist_ok=True)
            with open(playbook_path, 'w', encoding='utf-8') as f:
                f.write(playbook.content)
            print(f"✅ Playbook file written successfully: {playbook_path}")
        except Exception as write_error:
            print(f"❌ Failed to write playbook file: {write_error}")
            raise Exception(f"Failed to write playbook file: {write_error}")
        
        # Check if playbook file exists (should always exist now)
        if not os.path.exists(playbook_path):
            raise Exception(f"Playbook file not found: {playbook_path}")
        
        # Set environment variables for Ansible
        env = os.environ.copy()
        env.update({
            'ANSIBLE_HOST_KEY_CHECKING': 'False',
            'ANSIBLE_SSH_ARGS': '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=yes -o PreferredAuthentications=password',
            'ANSIBLE_TIMEOUT': '30',
            'ANSIBLE_CONNECT_TIMEOUT': '30',
            'ANSIBLE_SSH_TIMEOUT': '30',
            'ANSIBLE_SSH_RETRIES': '3',
            'ANSIBLE_PERSISTENT_CONNECT_TIMEOUT': '30',  # Persistent connection timeout
            'ANSIBLE_COMMAND_TIMEOUT': '60',  # Individual command timeout
            'ANSIBLE_FORKS': str(min(20, max(5, len(hosts) * 2))),  # Dynamic forks based on host count
            'ANSIBLE_GATHERING': 'smart',  # Optimize fact gathering - only gather when needed
            'ANSIBLE_PIPELINING': 'True',  # Reduce SSH overhead by using fewer connections
            'ANSIBLE_SSH_CONTROL_PATH_DIR': '/tmp/ansible-ssh-%%h-%%p-%%r',  # Optimize SSH connection sharing
            'ANSIBLE_SSH_CONTROL_MASTER': 'auto',  # Reuse SSH connections
            'ANSIBLE_SSH_CONTROL_PERSIST': '60s',  # Keep connections alive for 60 seconds
            'PYTHONUNBUFFERED': '1',  # Force Python to flush output immediately
            'ANSIBLE_FORCE_COLOR': 'false',  # Disable color codes that might interfere
            'ANSIBLE_STDOUT_CALLBACK': 'default'  # Use default callback for consistent output
        })
        
        print(f"🚀 Optimized execution: {len(hosts)} hosts with {env.get('ANSIBLE_FORKS')} forks")
        
        # Create artifacts directory
        artifacts_dir = f'/tmp/ansible_artifacts_{task_id}'
        os.makedirs(artifacts_dir, exist_ok=True)
        
        # Copy playbook files to artifacts directory so they're available to Ansible
        try:
            with app.app_context():
                playbook_files = PlaybookFile.query.filter_by(playbook_id=playbook.id).all()
                if playbook_files:
                    # Since files are stored in PLAYBOOKS_DIR, just make that available
                    if not variables:
                        variables = {}
                    variables['playbook_files_dir'] = PLAYBOOKS_DIR
                    print(f"Added playbook_files_dir variable: {PLAYBOOKS_DIR}")
                    print(f"Available files: {[pf.filename for pf in playbook_files]}")
        except Exception as e:
            print(f"Warning: Could not access playbook files: {e}")
            # Continue execution without files - this is not a critical error
        
        # Run ansible-playbook command against all hosts
        cmd = [
            'ansible-playbook',
            '-i', inventory_path,
            playbook_path,
            '-vvv',  # Maximum verbosity for debugging
            '-e', 'ansible_host_key_checking=False',
            '-e', f'ansible_user={username}'
        ]
        
        # Add authentication-specific parameters
        if password:
            cmd.extend([
                '-e', f'ansible_ssh_pass={password}',
                '-e', f'ansible_password={password}',  # For WinRM connections
                '-e', f'ansible_become_pass={password}',  # Add sudo password
                '-e', 'ansible_ssh_common_args="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=yes -o PreferredAuthentications=password"',
                '--ssh-common-args', '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=yes -o PreferredAuthentications=password'
            ])
        else:
            cmd.extend([
                '-e', 'ansible_ssh_common_args="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=no -o PreferredAuthentications=publickey"',
                '--ssh-common-args', '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=no -o PreferredAuthentications=publickey'
            ])
        
        
        # Add user-defined variables to the command
        if variables:
            for var_name, var_value in variables.items():
                cmd.extend(['-e', f'{var_name}={var_value}'])
        
        print(f"Executing multi-host command: {' '.join(cmd)}")
        
        # Start process with timeout protection
        import signal
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,  # Keep stderr separate for better handling
            text=True,
            bufsize=1,  # Line buffered for real-time output
            universal_newlines=True,
            env=env,
            start_new_session=True  # Allow process group management for timeout handling
        )
        
        output_lines = []
        error_lines = []
        max_output_lines = 5000  # Limit memory usage for large outputs
        host_status_tracker = {host.hostname: {'status': 'running', 'tasks_completed': 0, 'tasks_failed': 0} for host in hosts}
        
        # Emit initial status for all hosts
        initial_status = f"\n🚀 MULTI-HOST EXECUTION STARTED\n{'='*50}\n"
        initial_status += f"📋 Target IPs ({len(hosts)}):\n"
        
        # Test WebSocket connectivity with initial message
        # WebSocket test removed - connection confirmed working
        for host in hosts:
            initial_status += f"   🖥️  IP {host.hostname} ({host.name}) - Status: RUNNING\n"
        initial_status += f"{'='*50}\n"
        initial_status += f"💡 Watch for real-time IP status updates below...\n"
        
        socketio.emit('task_output', {
            'task_id': str(task_id),
            'output': initial_status
        })
        
        # Read output in real-time with timeout protection
        print(f"Starting to read output for task {task_id}")
        line_count = 0
        
        # Use a more robust approach for real-time output with timeout protection
        import sys
        import time
        last_output_time = time.time()
        max_silence_timeout = 300  # 5 minutes of no output = timeout
        
        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            
            # Check for process timeout (no output for too long)
            current_time = time.time()
            if not line and (current_time - last_output_time) > max_silence_timeout:
                print(f"⚠️  Process timeout: No output for {max_silence_timeout}s, terminating...")
                try:
                    process.terminate()
                    time.sleep(5)
                    if process.poll() is None:
                        process.kill()
                except Exception as e:
                    print(f"Error terminating process: {e}")
                break
            if line:
                last_output_time = current_time  # Update last output time
                line = line.strip()
                line_count += 1
                print(f"Task {task_id} - Line {line_count}: {line[:100]}...")  # Debug log
                
                # Memory management: keep only recent lines for artifact extraction
                if len(output_lines) >= max_output_lines:
                    # Keep last 1000 lines for artifact extraction, discard older ones
                    output_lines = output_lines[-1000:]
                    print(f"⚠️  Memory optimization: Trimmed output to last 1000 lines (was {max_output_lines})")
                
                output_lines.append(line)
                
                # Always emit the original line first
                websocket_data = {
                    'task_id': str(task_id),
                    'output': line
                }
                print(f"🔴 WEBSOCKET DEBUG: About to emit task_output for task {task_id}")
                print(f"🔴 WEBSOCKET DEBUG: Data = {websocket_data}")
                try:
                    socketio.emit('task_output', websocket_data)
                    print(f"🔴 WEBSOCKET DEBUG: Successfully emitted task_output")
                except Exception as e:
                    print(f"🔴 WEBSOCKET ERROR: Failed to emit task_output: {e}")
                print(f"Emitted line to WebSocket: {line[:50]}...")  # Debug log
                
                # Force flush to ensure real-time delivery
                sys.stdout.flush()
                
                # Analyze line for host-specific status updates
                status_update = analyze_realtime_output(line, hosts, host_status_tracker)
                if status_update:
                    # Emit the status update as a separate line
                    socketio.emit('task_output', {
                        'task_id': str(task_id),
                        'output': status_update
                    })
        
        print(f"Finished reading output for task {task_id}. Total lines: {line_count}")
        
        # Wait for process to complete with 2-minute timeout
        import signal
        import psutil
        
        TASK_TIMEOUT = 300  # 5 minutes in seconds
        
        try:
            process.wait(timeout=TASK_TIMEOUT)
        except subprocess.TimeoutExpired:
            print(f"🚨 TIMEOUT: Task exceeded {TASK_TIMEOUT} seconds (5 minutes), terminating...")
            
            # Kill the entire process group to ensure all child processes are terminated
            try:
                parent_pid = process.pid
                parent = psutil.Process(parent_pid)
                children = parent.children(recursive=True)
                
                # Terminate children first
                for child in children:
                    try:
                        child.terminate()
                    except psutil.NoSuchProcess:
                        pass
                
                # Terminate parent
                parent.terminate()
                
                # Wait a bit for graceful termination
                try:
                    parent.wait(timeout=5)
                except psutil.TimeoutExpired:
                    # Force kill if still running
                    for child in children:
                        try:
                            child.kill()
                        except psutil.NoSuchProcess:
                            pass
                    parent.kill()
                    
            except psutil.NoSuchProcess:
                pass  # Process already terminated
            except Exception as e:
                print(f"Error terminating process: {e}")
            
            # Mark task as failed due to timeout
            with app.app_context():
                task = Task.query.get(task_id)
                if task:
                    task.status = 'failed'
                    task.finished_at = datetime.utcnow()
                    task.error_output = f"Task timeout: Execution exceeded {TASK_TIMEOUT} seconds (5 minutes) and was terminated."
                    db.session.commit()
                    
                    # Create execution history for timeout
                    history = ExecutionHistory(
                        playbook_id=task.playbook_id,
                        host_id=task.host_id,
                        status='failed',
                        started_at=task.started_at,
                        finished_at=task.finished_at,
                        output=task.output or '',
                        error_output=task.error_output,
                        host_list=task.host_list,
                        webhook_id=None
                    )
                    db.session.add(history)
                    db.session.commit()
                    
                    # Emit timeout notification
                    socketio.emit('task_update', {
                        'task_id': str(task_id),
                        'status': 'failed',
                        'message': f'Task terminated due to timeout ({TASK_TIMEOUT}s - 5 minutes)'
                    })
                    
                    socketio.emit('task_output', {
                        'task_id': str(task_id),
                        'output': f'❌ TASK TIMEOUT: Execution exceeded {TASK_TIMEOUT} seconds (5 minutes) and was automatically terminated.'
                    })
            
            return  # Exit the function early due to timeout
        
        # Get any remaining stderr
        stderr_output = process.stderr.read()
        if stderr_output:
            error_lines.append(stderr_output)
        
        # Analyze the output to determine success/failure per host
        full_output = '\n'.join(output_lines)
        analysis_result = analyze_ansible_output(full_output, hosts, variables)
        host_results = analysis_result['host_results']
        task_failures = analysis_result['task_failures']
        
        # Determine overall status based on host results and task failures
        successful_hosts = [h for h, status in host_results.items() if status == 'success']
        failed_hosts = [h for h, status in host_results.items() if status == 'failed']
        partial_hosts = [h for h, status in host_results.items() if status == 'partial']
        
        # Total hosts should include both original hosts and any dynamic hosts found in results
        total_hosts_in_results = len(host_results)
        
        print(f"Host status summary:")
        print(f"  Successful hosts: {successful_hosts}")
        print(f"  Failed hosts: {failed_hosts}")
        print(f"  Partial hosts: {partial_hosts}")
        print(f"  Original hosts: {len(hosts)}")
        print(f"  Total hosts in results: {total_hosts_in_results}")
        
        # Calculate overall status based on actual results, not just original host count
        if total_hosts_in_results == 0:
            # No hosts were processed - this is a failure
            overall_status = 'failed'
            print(f"Overall status: FAILED (no hosts processed)")
        elif len(failed_hosts) == total_hosts_in_results:
            # All processed hosts failed
            overall_status = 'failed'
            print(f"Overall status: FAILED (all {total_hosts_in_results} processed hosts failed)")
        elif len(successful_hosts) == total_hosts_in_results:
            # All processed hosts succeeded completely
            overall_status = 'completed'
            print(f"Overall status: COMPLETED (all {total_hosts_in_results} processed hosts succeeded)")
        elif len(successful_hosts) > 0 and len(failed_hosts) == 0:
            # Some succeeded, some partial, but none completely failed
            overall_status = 'completed'
            print(f"Overall status: COMPLETED ({len(successful_hosts)} success, {len(partial_hosts)} partial - no complete failures)")
        else:
            # Mixed results: some hosts failed, some succeeded, or some had partial task failures
            overall_status = 'partial'
            print(f"Overall status: PARTIAL (mixed results: {len(successful_hosts)} success, {len(partial_hosts)} partial, {len(failed_hosts)} failed)")
        
        # Create detailed status message
        status_details = f"\n{'='*50}\nEXECUTION SUMMARY\n{'='*50}\n"
        status_details += f"Total Hosts Processed: {total_hosts_in_results}\n"
        status_details += f"Successful: {len(successful_hosts)} hosts\n"
        status_details += f"Partial: {len(partial_hosts)} hosts\n"
        status_details += f"Failed: {len(failed_hosts)} hosts\n"
        status_details += f"Overall Status: {overall_status.upper()}\n\n"
        
        if successful_hosts:
            status_details += f"✅ SUCCESSFUL HOSTS (All tasks completed):\n"
            for host in successful_hosts:
                tasks_info = task_failures.get(host, {})
                status_details += f"   • {host} ({tasks_info.get('total_tasks', 0)} tasks)\n"
            status_details += "\n"
            
        if partial_hosts:
            status_details += f"⚠️ PARTIAL SUCCESS HOSTS (Some tasks failed):\n"
            for host in partial_hosts:
                tasks_info = task_failures.get(host, {})
                failed_count = tasks_info.get('failed_tasks', 0)
                total_count = tasks_info.get('total_tasks', 0)
                status_details += f"   • {host} ({failed_count}/{total_count} tasks failed)\n"
            status_details += "\n"
            
        if failed_hosts:
            status_details += f"❌ FAILED HOSTS:\n"
            for host in failed_hosts:
                tasks_info = task_failures.get(host, {})
                status_details += f"   • {host} ({tasks_info.get('total_tasks', 0)} tasks attempted)\n"
            status_details += "\n"
        
        status_details += f"{'='*50}\n"
        
        # Update task status and capture timestamps
        task_started_at = None
        task_finished_at = None
        with app.app_context():
            task = Task.query.get(task_id)
            if task:
                task.output = full_output + status_details
                task.error_output = '\n'.join(error_lines) if error_lines else None
                task.status = overall_status
                task.finished_at = datetime.utcnow()
                
                # Capture timestamps for history creation
                task_started_at = task.started_at
                task_finished_at = task.finished_at
                
                # Emit final task status update
                socketio.emit('task_update', {
                    'task_id': str(task_id),
                    'status': overall_status
                })
                
                # Commit task updates first
                db.session.commit()
                print(f"Task {task_id} status updated and committed")
        
        print(f"Multi-host task {task_id} completed with status: {overall_status}")
        
        print(f"🔍 DEBUG: About to create ExecutionHistory - reached end of execution")
        print(f"🔍 DEBUG: overall_status={overall_status}, hosts={len(hosts) if hosts else 'None'}")
        
        # Emit completion
        socketio.emit('task_update', {
            'task_id': str(task_id),
            'status': overall_status,
            'message': f'Execution completed with status: {overall_status}'
        })
        
        # Clean up
        os.unlink(inventory_path)
        
    except Exception as e:
        print(f"Error in multi-host playbook execution: {str(e)}")
        overall_status = 'failed'
        full_output = f"Error in multi-host playbook execution: {str(e)}"
        status_details = f"\n{'='*50}\nEXECUTION FAILED\n{'='*50}\nError: {str(e)}\n{'='*50}\n"
        error_lines = [str(e)]
        with app.app_context():
            task = Task.query.get(task_id)
            if task:
                task.status = 'failed'
                task.error_output = str(e)
                task.finished_at = datetime.utcnow()
                task_started_at = task.started_at
                task_finished_at = task.finished_at
                db.session.commit()
        
        socketio.emit('task_update', {
            'task_id': str(task_id),
            'status': 'failed',
            'message': f'Execution error: {str(e)}'
        })
    
    # ALWAYS create ExecutionHistory record regardless of success or failure
    print(f"🔍 DEBUG: About to create ExecutionHistory for task {task_id}")
    print(f"🔍 DEBUG: hosts parameter: {hosts} (length: {len(hosts) if hosts else 'None'})")
    
    with app.app_context():
        try:
            import json
            # Re-query hosts to ensure they're bound to the current session
            if hosts:
                print(f"🔍 DEBUG: Using UI hosts path")
                host_ids = [host.id for host in hosts]
                fresh_hosts = Host.query.filter(Host.id.in_(host_ids)).all()
                host_list_json = json.dumps([host.to_dict() for host in fresh_hosts])
                primary_host_id = fresh_hosts[0].id if fresh_hosts else None
            else:
                print(f"🔍 DEBUG: Using dynamic IPs path (no hosts selected)")
                # For dynamic execution without specific hosts
                host_ids = []
                fresh_hosts = []
                host_list_json = json.dumps([])
                primary_host_id = None

            # Get task info for history creation
            task = Task.query.get(task_id)
            if task:
                print(f"Creating execution history for task {task_id}")
                print(f"Playbook ID: {playbook.id}, Host IDs: {host_ids}")
                print(f"Username: {username}, Status: {overall_status}")
                
                history = ExecutionHistory(
                    playbook_id=playbook.id,
                    host_id=primary_host_id,  # Use primary host for record (can be None for dynamic executions)
                    user_id=task.user_id,  # Store the actual user who initiated the task
                    status=overall_status,
                    started_at=task_started_at,
                    finished_at=task_finished_at,
                    output=full_output + status_details,
                    error_output='\n'.join(error_lines) if error_lines else None,
                    username=username,  # Keep SSH username for backward compatibility
                    host_list=host_list_json,
                    webhook_id=None
                )
                
                print(f"📋 Creating ExecutionHistory record:")
                print(f"   Playbook ID: {playbook.id}")
                print(f"   Host ID: {primary_host_id} ({'UI Host' if primary_host_id else 'Dynamic IPs'})")
                print(f"   Status: {overall_status}")
                print(f"   Host List JSON: {host_list_json}")
                
                db.session.add(history)
                db.session.commit()
                print(f"✅ Successfully created execution history with ID: {history.id}")
                
                # Extract artifacts from the output
                if full_output:
                    try:
                        print(f"🔍 Extracting artifacts from main execution output for history {history.id}")
                        output_lines_for_artifacts = full_output.split('\n')
                        print(f"📄 Total output lines for artifact extraction: {len(output_lines_for_artifacts)}")
                        
                        # Use the existing artifact extraction function
                        extracted_artifacts_data = extract_register_from_output(output_lines_for_artifacts, history.id, hosts, variables)
                        
                        # Create and save all artifacts within app context
                        artifacts_created = []
                        for artifact_data in extracted_artifacts_data:
                            artifact = Artifact(
                                execution_id=artifact_data['execution_id'],
                                task_name=artifact_data['task_name'],
                                register_name=artifact_data['register_name'],
                                register_data=artifact_data['register_data'],
                                host_name=artifact_data['host_name'],
                                task_status=artifact_data['task_status']
                            )
                            db.session.add(artifact)
                            artifacts_created.append(artifact)
                        
                        if artifacts_created:
                            db.session.commit()
                            print(f"✅ Saved {len(artifacts_created)} artifacts for execution {history.id}")
                        else:
                            print(f"⚠️  No artifacts found in output for execution {history.id}")
                        
                    except Exception as artifact_error:
                        print(f"❌ Error extracting artifacts: {artifact_error}")
                        import traceback
                        traceback.print_exc()
                        db.session.rollback()
                
                # Verify the record was saved
                saved_history = ExecutionHistory.query.get(history.id)
                if saved_history:
                    print(f"🔍 Verification: ExecutionHistory record exists in database")
                    print(f"   ID: {saved_history.id}")
                    print(f"   Status: {saved_history.status}")
                    print(f"   Host ID: {saved_history.host_id}")
                else:
                    print(f"❌ ERROR: ExecutionHistory record NOT found in database!")
                    
        except Exception as history_error:
            print(f"Error creating execution history: {history_error}")
            import traceback
            traceback.print_exc()
            db.session.rollback()

def run_ansible_playbook(task_id, playbook, host, username, password, variables=None):
    print(f"Starting playbook execution for task {task_id}")
    
    with app.app_context():
        task = Task.query.get(task_id)
        if not task:
            print(f"Task {task_id} not found")
            return
            
        task.status = 'running'
        task.started_at = datetime.utcnow()
        db.session.commit()
        print(f"Task {task_id} status updated to running")
    
    # Emit status update
    socketio.emit('task_update', {
        'task_id': str(task_id),
        'status': 'running',
        'message': f'Starting execution of {playbook.name} on {host.hostname}'
    })
    
    try:
        # Create temporary inventory file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.ini', delete=False) as inv_file:
            # Add host to both 'targets' and 'all' groups for compatibility
            if host.hostname != host.name:
                inv_content = f"[targets]\n{host.name} ansible_host={host.hostname}\n\n[all]\n{host.name} ansible_host={host.hostname}\n\n[all:vars]\n"
            else:
                inv_content = f"[targets]\n{host.hostname}\n\n[all]\n{host.hostname}\n\n[all:vars]\n"
            inv_content += f"ansible_user={username}\n"
            
            # Add password if provided, otherwise use SSH key authentication
            if password:
                inv_content += f"ansible_ssh_pass={password}\n"
                inv_content += f"ansible_become_pass={password}\n"  # Add sudo password
                inv_content += "ansible_ssh_common_args=-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=yes -o PreferredAuthentications=password\n"
            else:
                # Use SSH key authentication
                inv_content += "ansible_ssh_common_args=-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=no -o PreferredAuthentications=publickey\n"
            
            # Common settings
            inv_content += "ansible_host_key_checking=False\n"
            inv_content += "ansible_connection=ssh\n"
            inv_content += "ansible_ssh_timeout=30\n"
            inv_content += "ansible_connect_timeout=30\n"
            
            inv_file.write(inv_content)
            inventory_path = inv_file.name
        
        print(f"Created inventory file: {inventory_path}")
        if password:
            print(f"Using password authentication for user: {username}")
        else:
            print(f"Using SSH key authentication for user: {username}")
        
        # Debug: Print inventory content
        with open(inventory_path, 'r') as f:
            print(f"Inventory content:\n{f.read()}")
        
        # Test sshpass availability
        try:
            sshpass_test = subprocess.run(['which', 'sshpass'], capture_output=True, text=True)
            print(f"sshpass available: {sshpass_test.returncode == 0}")
            if sshpass_test.returncode != 0:
                print("sshpass not found - password authentication may fail")
        except Exception as e:
            print(f"Error checking sshpass: {e}")
        
        # Get playbook file path
        playbook_path = os.path.join(PLAYBOOKS_DIR, f"{playbook.name}.yml")
        print(f"Playbook path: {playbook_path}")
        
        # CRITICAL: Always write the current playbook content to the file before execution
        # Write the playbook content to file before execution
        print(f"🔄 Writing current playbook content to file before execution")
        print(f"🔄 Content length: {len(playbook.content)} characters")
        print(f"🔄 Content preview (first 100 chars): {playbook.content[:100]}...")
        try:
            os.makedirs(PLAYBOOKS_DIR, exist_ok=True)
            with open(playbook_path, 'w', encoding='utf-8') as f:
                f.write(playbook.content)
            print(f"✅ Playbook file written successfully: {playbook_path}")
        except Exception as write_error:
            print(f"❌ Failed to write playbook file: {write_error}")
            raise Exception(f"Failed to write playbook file: {write_error}")
        
        # Check if playbook file exists (should always exist now)
        if not os.path.exists(playbook_path):
            raise Exception(f"Playbook file not found: {playbook_path}")
        
        # Test basic connectivity first
        print(f"Testing connectivity to {host.hostname}...")
        test_cmd = [
            'ansible',
            'all',
            '-i', inventory_path,
            '-m', 'ping',
            '-vvv'
        ]
        
        try:
            test_result = subprocess.run(test_cmd, capture_output=True, text=True, env=env, timeout=30)
            print(f"Connectivity test result: {test_result.returncode}")
            print(f"Test stdout: {test_result.stdout}")
            print(f"Test stderr: {test_result.stderr}")
        except subprocess.TimeoutExpired:
            print("Connectivity test timed out")
        except Exception as e:
            print(f"Connectivity test error: {e}")
        
        # Run ansible-playbook command
        cmd = [
            'ansible-playbook',
            '-i', inventory_path,
            playbook_path,
            '-vvv',  # Maximum verbosity for debugging
            '-e', 'ansible_host_key_checking=False',
            '-e', f'ansible_user={username}'
        ]
        
        # Add authentication-specific parameters
        if password:
            cmd.extend([
                '-e', f'ansible_ssh_pass={password}',
                '-e', f'ansible_password={password}',  # For WinRM connections
                '-e', f'ansible_become_pass={password}',  # Add sudo password
                '-e', 'ansible_ssh_common_args="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=yes -o PreferredAuthentications=password"',
                '--ssh-common-args', '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=yes -o PreferredAuthentications=password'
            ])
        else:
            cmd.extend([
                '-e', 'ansible_ssh_common_args="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=no -o PreferredAuthentications=publickey"',
                '--ssh-common-args', '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=no -o PreferredAuthentications=publickey'
            ])
        
        
        # Add user-defined variables to the command
        if variables:
            for var_name, var_value in variables.items():
                cmd.extend(['-e', f'{var_name}={var_value}'])
        
        print(f"Executing command: {' '.join(cmd)}")
        
        # Set environment variables for Ansible
        env = os.environ.copy()
        base_env = {
            'ANSIBLE_HOST_KEY_CHECKING': 'False',
            'ANSIBLE_TIMEOUT': '30',
            'ANSIBLE_CONNECT_TIMEOUT': '30',
            'ANSIBLE_SSH_TIMEOUT': '30',
            'ANSIBLE_SSH_RETRIES': '3',
            'PYTHONUNBUFFERED': '1',  # Force Python to flush output immediately
            'ANSIBLE_FORCE_COLOR': 'false',  # Disable color codes that might interfere
            'ANSIBLE_STDOUT_CALLBACK': 'default'  # Use default callback for consistent output
        }
        
        # Set authentication-specific environment variables
        if password:
            base_env['ANSIBLE_SSH_ARGS'] = '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=yes -o PreferredAuthentications=password'
        else:
            base_env['ANSIBLE_SSH_ARGS'] = '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=no -o PreferredAuthentications=publickey'
        
        env.update(base_env)
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
            env=env
        )
        
        output_lines = []
        error_lines = []
        
        # Read output in real-time
        for line in iter(process.stdout.readline, ''):
            line = line.strip()
            if line:
                output_lines.append(line)
                socketio.emit('task_output', {
                    'task_id': str(task_id),
                    'output': line
                })
        
        # Wait for process to complete
        process.wait()
        
        # Get any remaining stderr
        stderr_output = process.stderr.read()
        if stderr_output:
            error_lines.append(stderr_output)
        
        # Update task status
        with app.app_context():
            task = Task.query.get(task_id)
            if task:
                task.output = '\n'.join(output_lines)
                task.error_output = '\n'.join(error_lines) if error_lines else None
                task.status = 'completed' if process.returncode == 0 else 'failed'
                task.finished_at = datetime.utcnow()
                
                # Create history record
                import json
                host_list_json = json.dumps([host.to_dict()])
                
                history = ExecutionHistory(
                    playbook_id=playbook.id,
                    host_id=host.id,
                    user_id=task.user_id,  # Store the actual user who initiated the task
                    status=task.status,
                    started_at=task.started_at,
                    finished_at=task.finished_at,
                    output=task.output,
                    error_output=task.error_output,
                    username=username,
                    host_list=host_list_json,
                    webhook_id=None
                )
                
                db.session.add(history)
                db.session.commit()
                print(f"Task {task_id} completed with status: {task.status}")
        
        # Emit completion
        socketio.emit('task_update', {
            'task_id': str(task_id),
            'status': task.status,
            'message': f'Execution {"completed" if task.status == "completed" else "failed"}'
        })
        
        # Clean up
        os.unlink(inventory_path)
        
    except Exception as e:
        print(f"Error in playbook execution: {str(e)}")
        with app.app_context():
            task = Task.query.get(task_id)
            if task:
                task.status = 'failed'
                task.error_output = str(e)
                task.finished_at = datetime.utcnow()
                db.session.commit()
        
        socketio.emit('task_update', {
            'task_id': str(task_id),
            'status': 'failed',
            'message': f'Error: {str(e)}'
        })

# API Token endpoints
@app.route('/api/tokens', methods=['GET'])
def get_api_tokens():
    tokens = ApiToken.query.order_by(ApiToken.created_at.desc()).all()
    return jsonify([token.to_dict() for token in tokens])

@app.route('/api/tokens', methods=['POST'])
def create_api_token():
    data = request.json
    
    # Generate a secure token
    token = secrets.token_hex(32)  # 64 character hex string
    
    api_token = ApiToken(
        name=data['name'],
        token=token,
        description=data.get('description', ''),
        enabled=data.get('enabled', True),
        expires_at=datetime.fromisoformat(data['expires_at']) if data.get('expires_at') else None
    )
    
    try:
        db.session.add(api_token)
        db.session.commit()
        return jsonify(api_token.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/tokens/<token_id>', methods=['PUT'])
def update_api_token(token_id):
    api_token = ApiToken.query.get_or_404(token_id)
    data = request.json
    
    if 'name' in data:
        api_token.name = data['name']
    if 'description' in data:
        api_token.description = data['description']
    if 'enabled' in data:
        api_token.enabled = data['enabled']
    if 'expires_at' in data:
        api_token.expires_at = datetime.fromisoformat(data['expires_at']) if data['expires_at'] else None
    
    api_token.updated_at = datetime.utcnow()
    
    try:
        db.session.commit()
        return jsonify(api_token.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/tokens/<token_id>', methods=['DELETE'])
def delete_api_token(token_id):
    api_token = ApiToken.query.get_or_404(token_id)
    
    try:
        db.session.delete(api_token)
        db.session.commit()
        return jsonify({'message': 'API token deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/tokens/<token_id>/regenerate', methods=['POST'])
def regenerate_api_token(token_id):
    api_token = ApiToken.query.get_or_404(token_id)
    
    # Generate new token
    api_token.token = secrets.token_hex(32)
    api_token.updated_at = datetime.utcnow()
    api_token.usage_count = 0  # Reset usage count
    api_token.last_used = None  # Reset last used
    
    try:
        db.session.commit()
        return jsonify(api_token.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

def authenticate_api_token(token):
    """Authenticate API token and update usage statistics"""
    if not token:
        return None
    
    api_token = ApiToken.query.filter_by(token=token, enabled=True).first()
    if not api_token:
        return None
    
    # Check if token is expired
    if api_token.expires_at and api_token.expires_at < datetime.utcnow():
        return None
    
    # Update usage statistics
    api_token.last_used = datetime.utcnow()
    api_token.usage_count += 1
    db.session.commit()
    
    return api_token

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

def initialize_database():
    """Initialize database schema and seed with default data"""
    try:
        with app.app_context():
            from database_init import initialize_database as init_db
            init_db()
    except Exception as e:
        print(f"Database initialization error: {e}")

# Initialize database on app startup
initialize_database()

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True) 