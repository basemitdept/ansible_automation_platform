from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from sqlalchemy import text
from models import db, Playbook, Host, HostGroup, Task, ExecutionHistory, Artifact, Credential, Webhook, ApiToken
import os
import threading
import subprocess
import tempfile
from datetime import datetime
import json
import time
import secrets

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'your-secret-key-here'

db.init_app(app)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

PLAYBOOKS_DIR = '/app/playbooks'

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
                # Create tables
                db.create_all()
                print("Database tables created successfully!")
                break
        except Exception as e:
            retry_count += 1
            print(f"Database connection attempt {retry_count}/{max_retries} failed: {str(e)}")
            if retry_count >= max_retries:
                print("Max retries reached. Database initialization failed.")
                raise
            print(f"Retrying in 3 seconds...")
            time.sleep(3)

# Initialize database
init_database()

# Playbook routes
@app.route('/api/playbooks', methods=['GET'])
def get_playbooks():
    playbooks = Playbook.query.all()
    return jsonify([pb.to_dict() for pb in playbooks])

@app.route('/api/playbooks', methods=['POST'])
def create_playbook():
    data = request.json
    
    # Save playbook content to file
    playbook_file = os.path.join(PLAYBOOKS_DIR, f"{data['name']}.yml")
    os.makedirs(PLAYBOOKS_DIR, exist_ok=True)
    
    with open(playbook_file, 'w') as f:
        f.write(data['content'])
    
    # Handle variables - convert to JSON string if provided
    variables_json = None
    if 'variables' in data and data['variables']:
        variables_json = json.dumps(data['variables'])
    
    playbook = Playbook(
        name=data['name'],
        content=data['content'],
        description=data.get('description', ''),
        variables=variables_json
    )
    
    try:
        db.session.add(playbook)
        db.session.commit()
        return jsonify(playbook.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

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
    playbook.updated_at = datetime.utcnow()
    
    try:
        db.session.commit()
        return jsonify(playbook.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/playbooks/<playbook_id>', methods=['DELETE'])
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
        
        # Finally delete the playbook
        db.session.execute(db.text("DELETE FROM playbooks WHERE id = :playbook_id"), {"playbook_id": playbook_id})
        
        db.session.commit()
        
        return jsonify({'message': 'Playbook deleted successfully'}), 200
        
    except Exception as e:
        print(f"Error deleting playbook: {str(e)}")
        db.session.rollback()
        return jsonify({'error': f'Failed to delete playbook: {str(e)}'}), 500

# Host Group routes
@app.route('/api/host-groups', methods=['GET'])
def get_host_groups():
    groups = HostGroup.query.all()
    return jsonify([group.to_dict() for group in groups])

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
    hosts = Host.query.all()
    return jsonify([host.to_dict() for host in hosts])

@app.route('/api/hosts', methods=['POST'])
def create_host():
    data = request.json
    host = Host(
        name=data['name'],
        hostname=data['hostname'],
        description=data.get('description', ''),
        group_id=data.get('group_id')
    )
    
    try:
        db.session.add(host)
        db.session.commit()
        return jsonify(host.to_dict()), 201
    except Exception as e:
        db.session.rollback()
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
    host.group_id = data.get('group_id', host.group_id)
    host.updated_at = datetime.utcnow()
    
    try:
        db.session.commit()
        return jsonify(host.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/hosts/<host_id>', methods=['DELETE'])
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
    artifacts = Artifact.query.filter_by(execution_id=execution_id).order_by(Artifact.created_at.desc()).all()
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
        
        # Validate required fields
        if not data.get('name') or not data.get('username') or not data.get('password'):
            return jsonify({'error': 'Name, username, and password are required'}), 400
        
        # If this is set as default, unset other defaults
        if data.get('is_default'):
            Credential.query.filter_by(is_default=True).update({'is_default': False})
        
        credential = Credential(
            name=data['name'],
            username=data['username'],
            password=data['password'],  # In production, this should be encrypted
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
        
        # If this is set as default, unset other defaults
        if data.get('is_default') and not credential.is_default:
            Credential.query.filter_by(is_default=True).update({'is_default': False})
        
        credential.name = data.get('name', credential.name)
        credential.username = data.get('username', credential.username)
        if data.get('password'):  # Only update password if provided
            credential.password = data['password']
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
def execute_playbook():
    data = request.json
    playbook_id = data['playbook_id']
    host_ids = data.get('host_ids', [])  # Support multiple hosts
    host_id = data.get('host_id')  # Support single host for backward compatibility
    username = data.get('username')
    password = data.get('password')
    variables = data.get('variables', {})  # User-provided variable values
    
    # Make SSH credentials optional - use default if not provided
    if not username:
        username = os.environ.get('ANSIBLE_SSH_USER', 'ansible')
        print(f"Using default SSH user: {username} (SSH key authentication)")
    
    # Note: password can be None - Ansible will use SSH keys if no password provided
    
    playbook = Playbook.query.get_or_404(playbook_id)
    
    # Handle both single host and multiple hosts
    if host_id and not host_ids:
        host_ids = [host_id]
    elif not host_ids:
        # Allow empty host_ids if using dynamic targets via variables
        if not variables or 'ips' not in variables:
            return jsonify({'error': 'No hosts specified and no dynamic targets (ips variable) provided'}), 400
        host_ids = []  # Empty host list for dynamic targets
    
    # Get all selected hosts
    hosts = []
    for host_id in host_ids:
        host = Host.query.get_or_404(host_id)
        hosts.append(host)
    
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
            status='pending',
            host_list=host_list_json
        )
    else:
        # Dynamic targets from variables
        host_list_json = json.dumps([])
        dynamic_targets = variables.get('ips', 'dynamic targets') if variables else 'dynamic targets'
        target_info = f"Dynamic execution targeting: {dynamic_targets}"
        
        task = Task(
            playbook_id=playbook_id,
            host_id=None,  # No specific host for dynamic execution
            status='pending',
            host_list=host_list_json
        )
    
    db.session.add(task)
    db.session.commit()
    
    # Store the execution information in the task output initially
    task.output = target_info
    db.session.commit()
    
    # Execute the playbook against all hosts in a single run
    try:
        # Update task status to running and set actual start time
        task.status = 'running'
        task.started_at = datetime.utcnow()
        db.session.commit()
        
        # Emit initial task status update
        socketio.emit('task_update', {
            'task_id': str(task.id),
            'status': 'running'
        })
        
        thread = threading.Thread(
            target=run_ansible_playbook_multi_host,
            args=(task.id, playbook, hosts, username, password, variables)
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
        'message': f'Started playbook execution on {len(hosts)} host(s)',
        'task': task.to_dict(),
        'hosts': [host.name for host in hosts]
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
        status='pending',
        host_list=host_list_json
    )
    db.session.add(task)
    db.session.commit()
    
    # Store IDs and data for thread execution to avoid session issues
    task_id = task.id
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
            args=(task_id, playbook_data, host_objects, username, password, variables)
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

def run_webhook_playbook(task_id, playbook_data, host_objects, username, password, variables=None):
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
        
        def to_dict(self):
            return {
                'id': self.id,
                'name': self.name,
                'hostname': self.hostname,
                'description': self.description
            }
    
    playbook = SimplePlaybook(playbook_data)
    hosts = [SimpleHost(host_dict) for host_dict in host_objects]
    
    # Use the existing multi-host execution logic
    try:
        # Call the existing function but with our recreated objects
        run_ansible_playbook_multi_host_internal(task_id, playbook, hosts, username, password, variables)
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
                    webhook_id=None
                )
                db.session.add(history)
                db.session.commit()

def run_ansible_playbook_multi_host_internal(task_id, playbook, hosts, username, password, variables=None):
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
            # Add hosts to both 'targets' and 'all' groups for compatibility
            inv_content = "[targets]\n"
            for host in hosts:
                # Add both the hostname and an alias using the host's name for flexibility
                if host.hostname != host.name:
                    inv_content += f"{host.name} ansible_host={host.hostname}\n"
                else:
                    inv_content += f"{host.hostname}\n"
            
            # Add dynamic IPs from variables if 'ips' variable is provided
            dynamic_ips = set()
            if variables and 'ips' in variables:
                ips_value = variables['ips']
                if isinstance(ips_value, str):
                    # Split comma-separated IPs and add them to inventory
                    for ip in ips_value.split(','):
                        ip = ip.strip()
                        if ip and ip not in ['all', 'targets']:  # Skip special keywords
                            dynamic_ips.add(ip)
                            inv_content += f"{ip}\n"
            
            # Also add to 'all' group for playbooks that use 'hosts: all'
            inv_content += "\n[all]\n"
            for host in hosts:
                # Add both the hostname and an alias using the host's name for flexibility
                if host.hostname != host.name:
                    inv_content += f"{host.name} ansible_host={host.hostname}\n"
                else:
                    inv_content += f"{host.hostname}\n"
            
            # Add dynamic IPs to 'all' group as well
            for ip in dynamic_ips:
                inv_content += f"{ip}\n"
            
            # Add host variables section that applies to all hosts
            inv_content += f"\n[all:vars]\n"
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
        
        print(f"Created multi-host inventory file: {inventory_path}")
        if password:
            print(f"Using SSH password authentication for user: {username}")
        else:
            print(f"Using SSH key authentication for user: {username}")
        
        # Get playbook file path
        playbook_path = os.path.join(PLAYBOOKS_DIR, f"{playbook.name}.yml")
        print(f"Playbook path: {playbook_path}")
        
        # Check if playbook file exists
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
        
        # Wait for process to complete
        process.wait()
        
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
                    status=final_status,
                    started_at=task.started_at,
                    finished_at=task.finished_at,
                    output=task.output,
                    error_output=task.error_output,
                    username='webhook',  # Mark as webhook execution
                    host_list=task.host_list,
                    webhook_id=None  # We don't have webhook_id in this context, but could be added
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
                        output_artifacts = extract_register_from_output(output_lines, history.id, hosts)
                        
                        # Save all artifacts
                        for artifact in output_artifacts:
                            db.session.add(artifact)
                        
                        print(f"Saved {len(output_artifacts)} artifacts for webhook execution {history.id}")
                        
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

def extract_register_from_output(output_lines, execution_id, hosts):
    """
    Extract register variables and their stdout from Ansible verbose output.
    Discovers actual register variables from playbook tasks.
    """
    artifacts = []
    print(f"Starting artifact extraction for {len(hosts)} hosts")
    print(f"Total output lines to process: {len(output_lines)}")
    
    current_task = None
    current_host = None
    current_task_status = None  # Track the status of the current task being processed
    in_json_block = False
    json_lines = []
    
    for i, line in enumerate(output_lines):
        try:
            # Print every 50th line for debugging
            if i % 50 == 0:
                print(f"Processing line {i}: {line[:100]}...")
            
            # Detect task names
            if "TASK [" in line and "] **" in line:
                current_task = line.split("TASK [")[1].split("]")[0].strip()
                print(f"Found task: {current_task}")
                current_task_status = None  # Reset status for new task
                in_json_block = False
                json_lines = []
            
            # Look for host task results
            for host in hosts:
                hostname = host.hostname
                
                # Detect when a task completes on a host with output (including failed tasks)
                task_status = None
                if f"ok: [{hostname}]" in line:
                    task_status = "ok"
                elif f"changed: [{hostname}]" in line:
                    task_status = "changed"
                elif f"failed: [{hostname}]" in line:
                    task_status = "failed"
                elif f"fatal: [{hostname}]" in line:
                    task_status = "fatal"
                elif f"unreachable: [{hostname}]" in line:
                    task_status = "unreachable"
                elif f"skipped: [{hostname}]" in line:
                    task_status = "skipped"
                
                if task_status:
                    current_host = hostname
                    current_task_status = task_status  # Store the status for multi-line JSON processing
                    print(f"Found {task_status} result for {hostname}: {line[:100]}...")
                    
                    # Check if this line has JSON output
                    if "=> {" in line:
                        print(f"Found JSON output for {hostname} in task {current_task} (status: {task_status})")
                        # Start collecting JSON
                        json_start = line.find("=> {") + 3
                        json_content = line[json_start:]
                        json_lines = [json_content]
                        in_json_block = True
                        
                        # Check if JSON is complete on this line
                        if json_content.count("{") <= json_content.count("}"):
                            in_json_block = False
                            process_json_output(json_lines, current_task, hostname, artifacts, execution_id, task_status)
                            json_lines = []
                    
                    # Also check for simple output without JSON
                    elif "=>" in line and not "=> {" in line:
                        print(f"Found simple output for {hostname} (status: {task_status}): {line}")
                        # Extract simple output
                        output_start = line.find("=>") + 2
                        simple_output = line[output_start:].strip()
                        if simple_output and current_task:
                            register_name = determine_register_name(current_task, {})
                            artifact = Artifact(
                                execution_id=execution_id,
                                task_name=current_task,
                                register_name=register_name,
                                register_data=json.dumps({
                                    "stdout": simple_output,
                                    "task": current_task,
                                    "host": hostname,
                                    "status": task_status
                                }, indent=2),
                                host_name=hostname,
                                task_status=task_status
                            )
                            artifacts.append(artifact)
                            print(f"Created simple artifact: {register_name} for {hostname} (status: {task_status})")
                    
                elif in_json_block and current_host == hostname:
                    # Continue collecting multi-line JSON
                    json_lines.append(line)
                    print(f"Continuing JSON collection: {line[:50]}...")
                    
                    # Check if JSON block is complete
                    full_json = "\n".join(json_lines)
                    if full_json.count("{") <= full_json.count("}"):
                        in_json_block = False
                        # Use the stored task status from when JSON collection started
                        process_json_output(json_lines, current_task, hostname, artifacts, execution_id, current_task_status or "ok")
                        json_lines = []
                            
        except Exception as e:
            print(f"Error processing line {i}: {e}")
    
    print(f"Total artifacts extracted: {len(artifacts)}")
    return artifacts

def process_json_output(json_lines, task_name, hostname, artifacts, execution_id, task_status="ok"):
    """
    Process JSON output from Ansible task and extract register data.
    Handles both successful and failed tasks.
    """
    try:
        full_json = "\n".join(json_lines).strip()
        print(f"Processing JSON for {hostname}: {full_json[:100]}...")
        
        # Parse the JSON
        json_data = json.loads(full_json)
        
        if not isinstance(json_data, dict):
            return
        
        # Extract different types of output
        register_data = {}
        output_parts = []
        
        # 1. Shell/Command stdout
        if 'stdout' in json_data and json_data['stdout']:
            register_data['stdout'] = json_data['stdout']
            output_parts.append(f"STDOUT:\n{json_data['stdout']}")
            print(f"Found stdout: {json_data['stdout'][:50]}...")
        
        # 2. Shell/Command stdout_lines
        if 'stdout_lines' in json_data and json_data['stdout_lines']:
            stdout_lines_content = '\n'.join(json_data['stdout_lines'])
            if not register_data.get('stdout'):  # Only if we don't already have stdout
                register_data['stdout'] = stdout_lines_content
                output_parts.append(f"STDOUT:\n{stdout_lines_content}")
            register_data['stdout_lines'] = json_data['stdout_lines']
            print(f"Found stdout_lines: {len(json_data['stdout_lines'])} lines")
        
        # 3. stderr_lines
        if 'stderr_lines' in json_data and json_data['stderr_lines']:
            stderr_content = '\n'.join(json_data['stderr_lines'])
            register_data['stderr'] = stderr_content
            output_parts.append(f"STDERR:\n{stderr_content}")
            print(f"Found stderr_lines: {len(json_data['stderr_lines'])} lines")
        
        # 4. stderr (single string)
        if 'stderr' in json_data and json_data['stderr'] and not register_data.get('stderr'):
            register_data['stderr'] = json_data['stderr']
            output_parts.append(f"STDERR:\n{json_data['stderr']}")
            print(f"Found stderr: {json_data['stderr'][:50]}...")
        
        # 5. Debug messages
        if 'msg' in json_data and json_data['msg']:
            register_data['msg'] = json_data['msg']
            output_parts.append(f"MESSAGE:\n{json_data['msg']}")
            register_data['type'] = 'debug_message'
            print(f"Found debug message: {json_data['msg'][:50]}...")
        
        # 6. Command info
        if 'cmd' in json_data:
            cmd_info = f"COMMAND: {json_data['cmd']}"
            if 'rc' in json_data:
                cmd_info += f"\nRETURN CODE: {json_data['rc']}"
            if 'start' in json_data and 'end' in json_data:
                cmd_info += f"\nDURATION: {json_data['start']} - {json_data['end']}"
            
            register_data['command_info'] = cmd_info
            output_parts.append(cmd_info)
        
        # 7. File operations
        if 'dest' in json_data and 'state' in json_data:
            file_info = f"FILE: {json_data['dest']}\nSTATE: {json_data['state']}"
            if 'mode' in json_data:
                file_info += f"\nMODE: {json_data['mode']}"
            register_data['file_info'] = file_info
            output_parts.append(file_info)
            register_data['type'] = 'file_operation'
        
        # 8. Stat results
        if 'stat' in json_data:
            stat_info = json.dumps(json_data['stat'], indent=2)
            file_stats = f"FILE STATISTICS:\n{stat_info}"
            register_data['stat_info'] = file_stats
            output_parts.append(file_stats)
            register_data['type'] = 'stat_result'
        
        # Create artifact if we found meaningful data
        if register_data and output_parts:
            # Combine all output parts
            combined_output = "\n\n".join(output_parts)
            
            # Try to determine the register variable name from the task
            register_name = determine_register_name(task_name, json_data)
            
            artifact = Artifact(
                execution_id=execution_id,
                task_name=task_name or "Unknown Task",
                register_name=register_name,
                register_data=json.dumps({
                    "stdout": combined_output,
                    "task": task_name,
                    "host": hostname,
                    "status": task_status,
                    "raw_data": register_data,
                    "full_data": json_data
                }, indent=2),
                host_name=hostname,
                task_status=task_status
            )
            artifacts.append(artifact)
            print(f"Created artifact: {register_name} for {hostname} with {len(output_parts)} output sections (status: {task_status})")
        
    except json.JSONDecodeError as e:
        print(f"JSON decode error for {hostname}: {e}")
    except Exception as e:
        print(f"Error processing JSON for {hostname}: {e}")

def determine_register_name(task_name, json_data):
    """
    Try to determine the register variable name based on task name and content.
    """
    if not task_name:
        return "unknown_register"
    
    # Convert task name to a register-like name
    register_name = task_name.lower().replace(" ", "_").replace("-", "_")
    
    # Add type suffix based on content
    if 'stdout' in json_data:
        register_name += "_result"
    elif 'msg' in json_data:
        register_name += "_debug"
    elif 'stat' in json_data:
        register_name += "_stat"
    elif 'dest' in json_data:
        register_name += "_file"
    else:
        register_name += "_output"
    
    return register_name

def analyze_ansible_output(output, hosts):
    """
    Analyze Ansible output to determine success/failure status for each host.
    Also tracks task-level failures to detect partial failures within successful hosts.
    Returns a dictionary with detailed analysis including task failures.
    """
    host_results = {}
    task_failures = {}  # Track task failures per host
    
    # Initialize all hosts as unknown
    for host in hosts:
        host_results[host.hostname] = 'unknown'
        task_failures[host.hostname] = {'failed_tasks': 0, 'total_tasks': 0}
    
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
            for host in hosts:
                hostname = host.hostname
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
                if task_failures[host.hostname]['failed_tasks'] > 0:
                    host_results[host.hostname] = 'partial'
                else:
                    host_results[host.hostname] = 'success'
    
    # Default unknown hosts to success if we couldn't determine status but no explicit failures were found
    for host_name, status in host_results.items():
        if status == 'unknown':
            # Check if there were any explicit failures for this host
            if task_failures[host_name]['failed_tasks'] > 0:
                host_results[host_name] = 'partial'
                print(f"Host {host_name} defaulted to partial: had {task_failures[host_name]['failed_tasks']} failed tasks")
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

def run_ansible_playbook_multi_host(task_id, playbook, hosts, username, password, variables=None):
    print(f"Starting multi-host playbook execution for task {task_id} on {len(hosts)} hosts")
    
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
            # Add hosts to both 'targets' and 'all' groups for compatibility
            inv_content = "[targets]\n"
            for host in hosts:
                # Add both the hostname and an alias using the host's name for flexibility
                if host.hostname != host.name:
                    inv_content += f"{host.name} ansible_host={host.hostname}\n"
                else:
                    inv_content += f"{host.hostname}\n"
            
            # Add dynamic IPs from variables if 'ips' variable is provided
            dynamic_ips = set()
            if variables and 'ips' in variables:
                ips_value = variables['ips']
                if isinstance(ips_value, str):
                    # Split comma-separated IPs and add them to inventory
                    for ip in ips_value.split(','):
                        ip = ip.strip()
                        if ip and ip not in ['all', 'targets']:  # Skip special keywords
                            dynamic_ips.add(ip)
                            inv_content += f"{ip}\n"
            
            # Also add to 'all' group for playbooks that use 'hosts: all'
            inv_content += "\n[all]\n"
            for host in hosts:
                # Add both the hostname and an alias using the host's name for flexibility
                if host.hostname != host.name:
                    inv_content += f"{host.name} ansible_host={host.hostname}\n"
                else:
                    inv_content += f"{host.hostname}\n"
            
            # Add dynamic IPs to 'all' group as well
            for ip in dynamic_ips:
                inv_content += f"{ip}\n"
            
            # Add host variables section that applies to all hosts
            inv_content += f"\n[all:vars]\n"
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
        
        # Check if playbook file exists
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
        
        print(f"Optimized execution: {len(hosts)} hosts with {env.get('ANSIBLE_FORKS')} forks")
        
        # Create artifacts directory
        artifacts_dir = f'/tmp/ansible_artifacts_{task_id}'
        os.makedirs(artifacts_dir, exist_ok=True)
        
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
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,  # Keep stderr separate for better handling
            text=True,
            bufsize=1,  # Line buffered for real-time output
            universal_newlines=True,
            env=env
        )
        
        output_lines = []
        error_lines = []
        host_status_tracker = {host.hostname: {'status': 'running', 'tasks_completed': 0, 'tasks_failed': 0} for host in hosts}
        
        # Emit initial status for all hosts
        initial_status = f"\n🚀 MULTI-HOST EXECUTION STARTED\n{'='*50}\n"
        initial_status += f"📋 Target IPs ({len(hosts)}):\n"
        for host in hosts:
            initial_status += f"   🖥️  IP {host.hostname} ({host.name}) - Status: RUNNING\n"
        initial_status += f"{'='*50}\n"
        initial_status += f"💡 Watch for real-time IP status updates below...\n"
        
        socketio.emit('task_output', {
            'task_id': str(task_id),
            'output': initial_status
        })
        
        # Read output in real-time
        print(f"Starting to read output for task {task_id}")
        line_count = 0
        
        # Use a more robust approach for real-time output
        import sys
        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            if line:
                line = line.strip()
                line_count += 1
                print(f"Task {task_id} - Line {line_count}: {line[:100]}...")  # Debug log
                
                output_lines.append(line)
                
                # Always emit the original line first
                socketio.emit('task_output', {
                    'task_id': str(task_id),
                    'output': line
                })
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
        
        # Wait for process to complete
        process.wait()
        
        # Get any remaining stderr
        stderr_output = process.stderr.read()
        if stderr_output:
            error_lines.append(stderr_output)
        
        # Analyze the output to determine success/failure per host
        full_output = '\n'.join(output_lines)
        analysis_result = analyze_ansible_output(full_output, hosts)
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
                
        # Create history record for the multi-host execution (outside the task update context)
        history = None
        with app.app_context():
            try:
                import json
                # Re-query hosts to ensure they're bound to the current session
                host_ids = [host.id for host in hosts]
                fresh_hosts = Host.query.filter(Host.id.in_(host_ids)).all()
                host_list_json = json.dumps([host.to_dict() for host in fresh_hosts])
                
                print(f"Creating execution history for task {task_id}")
                print(f"Playbook ID: {playbook.id}, Host IDs: {host_ids}")
                print(f"Username: {username}, Status: {overall_status}")
                
                history = ExecutionHistory(
                    playbook_id=playbook.id,
                    host_id=fresh_hosts[0].id,  # Use primary host for record
                    status=overall_status,
                    started_at=task_started_at,
                    finished_at=task_finished_at,
                    output=full_output + status_details,
                    error_output='\n'.join(error_lines) if error_lines else None,
                    username=username,
                    host_list=host_list_json
                )
                
                db.session.add(history)
                db.session.commit()
                print(f"Successfully created execution history with ID: {history.id}")
                
                # Extract and save artifacts from output
                try:
                    print(f"Extracting artifacts from output for execution {history.id}")
                    print(f"Total output lines: {len(output_lines)}")
                    
                    # Debug: Print some sample lines
                    for i, line in enumerate(output_lines[:20]):
                        if any(host.hostname in line for host in fresh_hosts):
                            print(f"Debug line {i}: {line[:100]}...")
                    
                    output_artifacts = extract_register_from_output(output_lines, history.id, fresh_hosts)
                    
                    # Save all artifacts
                    for artifact in output_artifacts:
                        db.session.add(artifact)
                    
                    db.session.commit()
                    print(f"Saved {len(output_artifacts)} artifacts for execution {history.id}")
                    
                    # Clean up artifacts directory
                    import shutil
                    try:
                        shutil.rmtree(artifacts_dir)
                    except:
                        pass
                        
                except Exception as e:
                    print(f"Error extracting artifacts: {e}")
                    import traceback
                    traceback.print_exc()
                
            except Exception as history_error:
                print(f"Error creating execution history: {history_error}")
                import traceback
                traceback.print_exc()
                db.session.rollback()
                history = None
                print("Skipping artifact extraction - no execution history created")
                
        print(f"Multi-host task {task_id} completed with status: {overall_status}")
        
        # Create status message based on results
        if overall_status == 'completed':
            status_msg = f'All {len(hosts)} hosts completed successfully'
        elif overall_status == 'failed':
            status_msg = f'All {len(hosts)} hosts failed'
        else:
            status_msg = f'Partial success: {len(successful_hosts)}/{len(hosts)} hosts succeeded'
        
        # Emit final status summary in the console
        final_summary = f"\n🏁 FINAL EXECUTION SUMMARY\n{'='*60}\n"
        final_summary += f"📊 Overall Status: {overall_status.upper()}\n"
        final_summary += f"📈 Results: {len(successful_hosts)} successful, {len(partial_hosts)} partial, {len(failed_hosts)} failed\n\n"
        
        # Show IP addresses prominently
        if successful_hosts:
            final_summary += f"✅ SUCCESSFUL IPS ({len(successful_hosts)}):\n"
            for host in successful_hosts:
                host_obj = next((h for h in hosts if h.hostname == host), None)
                if host_obj:
                    tasks_info = task_failures.get(host, {})
                    final_summary += f"   🟢 {host} ({host_obj.name}) - All {tasks_info.get('total_tasks', 0)} tasks completed\n"
            final_summary += "\n"
        
        if partial_hosts:
            final_summary += f"⚠️ PARTIAL SUCCESS IPS ({len(partial_hosts)}):\n"
            for host in partial_hosts:
                host_obj = next((h for h in hosts if h.hostname == host), None)
                if host_obj:
                    tasks_info = task_failures.get(host, {})
                    failed_count = tasks_info.get('failed_tasks', 0)
                    total_count = tasks_info.get('total_tasks', 0)
                    final_summary += f"   🟡 {host} ({host_obj.name}) - {failed_count}/{total_count} tasks failed\n"
            final_summary += "\n"
        
        if failed_hosts:
            final_summary += f"❌ FAILED IPS ({len(failed_hosts)}):\n"
            for host in failed_hosts:
                host_obj = next((h for h in hosts if h.hostname == host), None)
                if host_obj:
                    tasks_info = task_failures.get(host, {})
                    final_summary += f"   🔴 {host} ({host_obj.name}) - Execution failed ({tasks_info.get('total_tasks', 0)} tasks attempted)\n"
            final_summary += "\n"
        
        # Add a separate IP-only summary for quick reference
        final_summary += f"📋 QUICK IP REFERENCE:\n"
        if successful_hosts:
            final_summary += f"✅ Success: {', '.join(successful_hosts)}\n"
        if partial_hosts:
            final_summary += f"⚠️ Partial: {', '.join(partial_hosts)}\n"
        if failed_hosts:
            final_summary += f"❌ Failed: {', '.join(failed_hosts)}\n"
        
        final_summary += f"{'='*60}\n"
        final_summary += f"⏰ Execution completed at: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
        
        socketio.emit('task_output', {
            'task_id': str(task_id),
            'output': final_summary
        })
        
        # Emit completion
        socketio.emit('task_update', {
            'task_id': str(task_id),
            'status': overall_status,
            'message': status_msg
        })
        
        # Clean up
        os.unlink(inventory_path)
        
    except Exception as e:
        print(f"Error in multi-host playbook execution: {str(e)}")
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
            'message': f'Multi-host execution error: {str(e)}'
        })

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
        
        # Check if playbook file exists
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
                    status=task.status,
                    started_at=task.started_at,
                    finished_at=task.finished_at,
                    output=task.output,
                    error_output=task.error_output,
                    username=username,
                    host_list=host_list_json
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

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True) 