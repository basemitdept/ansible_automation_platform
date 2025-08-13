from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import uuid
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='user')  # admin, editor, user
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def set_password(self, password):
        """Hash and set password"""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """Check password against hash"""
        return check_password_hash(self.password_hash, password)
    
    def has_permission(self, action):
        """Check if user has permission for an action"""
        if self.role == 'admin':
            return True
        elif self.role == 'editor':
            return action not in ['delete_user', 'delete_playbook', 'delete_host', 'delete_credential', 'delete_webhook', 'create_user', 'edit_user']
        elif self.role == 'user':
            return action in ['read', 'view']
        return False
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'username': self.username,
            'role': self.role,
            'created_at': self.created_at.isoformat() + 'Z',
            'updated_at': self.updated_at.isoformat() + 'Z'
        }

class Playbook(db.Model):
    __tablename__ = 'playbooks'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(255), nullable=False, unique=True)
    content = db.Column(db.Text, nullable=False)
    description = db.Column(db.Text)
    variables = db.Column(db.Text)  # JSON string storing variable definitions
    assigned_variables = db.Column(db.Text)  # JSON array of variable IDs assigned to this playbook
    os_type = db.Column(db.String(50), nullable=False, default='linux')  # OS type column
    # Git import metadata
    git_repo_url = db.Column(db.String(500))  # Git repository URL
    git_file_path = db.Column(db.String(500))  # File path within repo
    git_filename = db.Column(db.String(255))  # Filename in repo
    git_visibility = db.Column(db.String(20), default='public')  # 'public' or 'private'
    git_credential_id = db.Column(db.String(36))  # Reference to git token credential
    creation_method = db.Column(db.String(50), default='manual')  # 'manual' or 'git'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        import json
        # Parse variables if they exist
        variables_data = []
        if self.variables:
            try:
                variables_data = json.loads(self.variables)
            except:
                variables_data = []
        
        # Parse assigned variables if they exist
        assigned_variables_data = []
        if self.assigned_variables:
            try:
                assigned_variables_data = json.loads(self.assigned_variables)
            except:
                assigned_variables_data = []
        
        return {
            'id': str(self.id),
            'name': self.name,
            'content': self.content,
            'description': self.description,
            'variables': variables_data,
            'assigned_variables': assigned_variables_data,
            'os_type': self.os_type,
            'creation_method': self.creation_method or 'manual',
            'git_repo_url': self.git_repo_url,
            'git_file_path': self.git_file_path,
            'git_filename': self.git_filename,
            'git_visibility': self.git_visibility,
            'git_credential_id': self.git_credential_id,
            'created_at': self.created_at.isoformat() + 'Z',
            'updated_at': self.updated_at.isoformat() + 'Z'
        }

class HostGroup(db.Model):
    __tablename__ = 'host_groups'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(255), nullable=False, unique=True)
    description = db.Column(db.Text)
    color = db.Column(db.String(7), default='#1890ff')  # Hex color for UI display
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        try:
            import json
            
            # Count hosts that have this group in their group_ids JSON array OR single group_id
            host_count = 0
            
            # Count hosts with single group_id (old way)
            hosts_with_single_group = Host.query.filter_by(group_id=str(self.id)).count()
            
            # Count hosts with this group in their group_ids array (new way)
            hosts_with_multiple_groups = 0
            all_hosts = Host.query.filter(Host.group_ids.isnot(None)).all()
            
            for host in all_hosts:
                if host.group_ids:
                    try:
                        group_ids = json.loads(host.group_ids)
                        if str(self.id) in group_ids:
                            hosts_with_multiple_groups += 1
                    except:
                        continue
            
            # Total unique hosts (avoid double counting)
            host_count = hosts_with_single_group + hosts_with_multiple_groups
            
            # Subtract overlap (hosts that have both single group_id AND are in group_ids)
            overlap_count = 0
            hosts_with_single = Host.query.filter_by(group_id=str(self.id)).all()
            for host in hosts_with_single:
                if host.group_ids:
                    try:
                        group_ids = json.loads(host.group_ids)
                        if str(self.id) in group_ids:
                            overlap_count += 1
                    except:
                        continue
            
            host_count = host_count - overlap_count
            
            return {
                'id': str(self.id),
                'name': self.name,
                'description': self.description,
                'color': self.color,
                'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
                'updated_at': self.updated_at.isoformat() + 'Z' if self.updated_at else None,
                'host_count': host_count
            }
        except Exception as e:
            print(f"Error in HostGroup.to_dict(): {str(e)}")
            # Return minimal data if there's an error
            return {
                'id': str(self.id) if self.id else None,
                'name': self.name if hasattr(self, 'name') else 'Unknown',
                'description': self.description if hasattr(self, 'description') else '',
                'color': self.color if hasattr(self, 'color') else '#1890ff',
                'created_at': None,
                'updated_at': None,
                'host_count': 0
            }

class Host(db.Model):
    __tablename__ = 'hosts'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(255), nullable=False, unique=True)
    hostname = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    group_id = db.Column(db.String(36), db.ForeignKey('host_groups.id'), nullable=True)
    group_ids = db.Column(db.Text, nullable=True)  # JSON array for multiple groups
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # These columns might not exist initially, so we'll handle them dynamically
    os_type = db.Column(db.String(50), nullable=False, default='linux')
    port = db.Column(db.Integer, nullable=False, default=22)
    
    group = db.relationship('HostGroup', backref='hosts')
    
    def to_dict(self):
        try:
            import json
            
            # Handle primary group (backward compatibility)
            group_data = None
            if self.group:
                try:
                    group_data = {
                        'id': str(self.group.id),
                        'name': self.group.name,
                        'color': self.group.color,
                        'description': self.group.description
                    }
                except Exception as group_error:
                    print(f"Error serializing group for host {self.id}: {str(group_error)}")
                    group_data = None
            
            # Handle multiple groups from group_ids
            groups_data = []
            if hasattr(self, 'group_ids') and self.group_ids:
                try:
                    group_ids = json.loads(self.group_ids)
                    for group_id in group_ids:
                        group = HostGroup.query.get(group_id)
                        if group:
                            groups_data.append({
                                'id': str(group.id),
                                'name': group.name,
                                'color': group.color,
                                'description': group.description
                            })
                except Exception as groups_error:
                    print(f"Error serializing groups for host {self.id}: {str(groups_error)}")
                    groups_data = []
            
            # If no group_ids but has group_id, add primary group to groups list
            elif self.group_id and group_data:
                groups_data = [group_data]
            
            return {
                'id': str(self.id),
                'name': self.name,
                'hostname': self.hostname,
                'description': self.description,
                'os_type': getattr(self, 'os_type', 'linux'),
                'port': getattr(self, 'port', 22),
                'group_id': str(self.group_id) if self.group_id else None,
                'group': group_data,  # Primary group for backward compatibility
                'groups': groups_data,  # Multiple groups
                'group_ids': self.group_ids,  # Raw JSON string
                'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
                'updated_at': self.updated_at.isoformat() + 'Z' if self.updated_at else None
            }
        except Exception as e:
            print(f"Error in Host.to_dict(): {str(e)}")
            # Return minimal data if there's an error
            return {
                'id': str(self.id) if self.id else None,
                'name': self.name if hasattr(self, 'name') else 'Unknown',
                'hostname': self.hostname if hasattr(self, 'hostname') else 'Unknown',
                'description': self.description if hasattr(self, 'description') else '',
                'os_type': getattr(self, 'os_type', 'linux'),
                'port': getattr(self, 'port', 22),
                'group_id': None,
                'group': None,
                'groups': [],
                'group_ids': None,
                'created_at': None,
                'updated_at': None
            }

class Task(db.Model):
    __tablename__ = 'tasks'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    playbook_id = db.Column(db.String(36), db.ForeignKey('playbooks.id'), nullable=False)
    host_id = db.Column(db.String(36), db.ForeignKey('hosts.id'), nullable=True)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=True)  # Track who created the task
    status = db.Column(db.String(50), default='pending')
    started_at = db.Column(db.DateTime)
    finished_at = db.Column(db.DateTime)
    output = db.Column(db.Text)
    error_output = db.Column(db.Text)
    host_list = db.Column(db.Text)  # JSON string of all hosts in multi-host execution
    webhook_id = db.Column(db.String(36), db.ForeignKey('webhooks.id'), nullable=True)  # Track webhook-triggered tasks
    serial_id = db.Column(db.Integer, nullable=True)  # Sequential ID for display
    
    playbook = db.relationship('Playbook', backref='tasks')
    host = db.relationship('Host', backref='tasks')
    user = db.relationship('User', backref='tasks')  # User who created the task
    webhook = db.relationship('Webhook', backref='tasks')  # Webhook that triggered the task
    
    # Note: serial_id is now a real database column, no virtual property needed
    
    def get_global_serial_id(self):
        """Get global sequential ID - use stored serial_id if available, otherwise calculate"""
        # FIRST: Check if we have a stored serial_id
        if self.serial_id is not None:
            return self.serial_id
            
        # FALLBACK: Calculate next available ID for new tasks
        try:
            from sqlalchemy import func
            
            # Get the highest serial ID from existing tasks
            max_task_id = Task.query.with_entities(
                func.max(Task.serial_id)
            ).scalar() or 0
            
            # Get the highest serial ID from history
            max_history_id = ExecutionHistory.query.with_entities(
                func.max(ExecutionHistory.original_task_serial_id)
            ).scalar() or 0
            
            # Use whichever is higher + 1
            next_id = max(max_task_id, max_history_id) + 1
            
            return next_id
            
        except Exception as e:
            print(f"Error calculating task serial ID: {e}")
            # Final fallback
            return 1
    
    def to_dict(self):
        import json
        
        # Parse host list if available
        hosts_data = []
        if self.host_list:
            try:
                hosts_data = json.loads(self.host_list)
            except:
                hosts_data = []
        
        # If no host_list, use the single host
        if not hosts_data and self.host:
            hosts_data = [self.host.to_dict()]
        
        # Determine user data for display - show webhook name for webhook tasks, username for user tasks
        user_data = {'username': 'unknown', 'name': 'Unknown User'}
        if self.webhook_id and self.webhook:
            # For webhook executions, show the webhook name
            user_data = {
                'id': str(self.webhook_id),
                'username': self.webhook.name,
                'name': f'Webhook: {self.webhook.name}'
            }
        elif self.user:
            # For user executions, show the username
            user_data = {
                'id': str(self.user.id),
                'username': self.user.username,
                'name': self.user.username
            }

        # Determine executed_by_type for icon display
        executed_by_type = 'user'
        if self.webhook_id and self.webhook:
            executed_by_type = 'webhook'

        return {
            'id': str(self.id),
            'serial_id': self.get_global_serial_id(),
            'playbook_id': str(self.playbook_id),
            'host_id': str(self.host_id) if self.host_id else None,
            'user_id': str(self.user_id) if self.user_id else None,
            'status': self.status,
            'started_at': self.started_at.isoformat() + 'Z' if self.started_at else None,
            'finished_at': self.finished_at.isoformat() + 'Z' if self.finished_at else None,
            'output': self.output,
            'error_output': self.error_output,
            'playbook': self.playbook.to_dict() if self.playbook else None,
            'host': self.host.to_dict() if self.host else None,
            'user': user_data,
            'webhook_id': str(self.webhook_id) if self.webhook_id else None,
            'webhook': None,  # Webhook relationship will be added when needed
            'hosts': hosts_data,  # List of all hosts in multi-host execution
            'executed_by_type': executed_by_type
        }

class Credential(db.Model):
    __tablename__ = 'credentials'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(100), nullable=False)  # Display name for the credential
    credential_type = db.Column(db.String(50), nullable=False, default='ssh')  # 'ssh' or 'git_token'
    username = db.Column(db.String(100), nullable=True)  # SSH username (not required for git tokens)
    password = db.Column(db.String(255), nullable=True)  # SSH password or Git token (should be encrypted in production)
    token = db.Column(db.String(500), nullable=True)  # Git token field
    description = db.Column(db.Text)  # Optional description
    is_default = db.Column(db.Boolean, default=False)  # Mark as default credential
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'credential_type': getattr(self, 'credential_type', 'ssh'),
            'username': self.username,
            'description': self.description,
            'is_default': self.is_default,
            'created_at': self.created_at.isoformat() + 'Z',
            'updated_at': self.updated_at.isoformat() + 'Z'
        }

class Artifact(db.Model):
    __tablename__ = 'artifacts'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    execution_id = db.Column(db.String(36), db.ForeignKey('execution_history.id'), nullable=False)
    task_name = db.Column(db.String(255), nullable=False)  # Ansible task name
    register_name = db.Column(db.String(255), nullable=False)  # Variable name used in register
    register_data = db.Column(db.Text, nullable=False)  # JSON data from the register
    host_name = db.Column(db.String(255), nullable=False)  # Which host generated this artifact
    task_status = db.Column(db.String(50))  # 'ok', 'changed', 'failed', 'skipped'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    execution = db.relationship('ExecutionHistory', backref='artifacts')
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        print(f"🎯 ARTIFACT CREATED: {kwargs.get('task_name', 'Unknown')} for {kwargs.get('host_name', 'Unknown')}")
        register_data = kwargs.get('register_data', '')
        if 'msg' in register_data and '"msg": "{"' in register_data:
            print(f"⚠️  DETECTED PROBLEMATIC ARTIFACT WITH msg='{{': {kwargs.get('task_name', 'Unknown')}")
            print(f"⚠️  Register data preview: {register_data[:200]}...")
            import traceback
            print(f"⚠️  Creation stack trace:")
            traceback.print_stack()
    
    def to_dict(self):
        import json
        try:
            parsed_data = json.loads(self.register_data) if self.register_data else {}
        except:
            parsed_data = {'raw_data': self.register_data}
            
        return {
            'id': str(self.id),
            'execution_id': str(self.execution_id),
            'task_name': self.task_name,
            'register_name': self.register_name,
            'register_data': parsed_data,
            'host_name': self.host_name,
            'task_status': self.task_status,
            'created_at': self.created_at.isoformat() + 'Z'
        }

class Webhook(db.Model):
    __tablename__ = 'webhooks'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(255), nullable=False)
    playbook_id = db.Column(db.String(36), db.ForeignKey('playbooks.id'), nullable=False)
    host_ids = db.Column(db.Text, nullable=True)  # JSON array of host IDs (optional)
    token = db.Column(db.String(64), nullable=False, unique=True)  # Unique webhook token
    enabled = db.Column(db.Boolean, default=True)
    default_variables = db.Column(db.Text)  # JSON object of default variable values
    credential_id = db.Column(db.String(36), db.ForeignKey('credentials.id'))  # Optional default credential
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=True)  # Track who created the webhook
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_triggered = db.Column(db.DateTime)
    trigger_count = db.Column(db.Integer, default=0)
    
    playbook = db.relationship('Playbook', backref='webhooks')
    credential = db.relationship('Credential', backref='webhooks')
    user = db.relationship('User', backref='webhooks')  # User who created the webhook
    
    def to_dict(self):
        import json
        
        # Parse host IDs
        host_ids_data = []
        if self.host_ids:
            try:
                host_ids_data = json.loads(self.host_ids)
            except:
                host_ids_data = []
        
        # Parse default variables
        default_vars = {}
        if self.default_variables:
            try:
                default_vars = json.loads(self.default_variables)
            except:
                default_vars = {}
        
        return {
            'id': str(self.id),
            'name': self.name,
            'playbook_id': str(self.playbook_id),
            'host_ids': host_ids_data,
            'token': self.token,
            'enabled': self.enabled,
            'default_variables': default_vars,
            'credential_id': str(self.credential_id) if self.credential_id else None,
            'user_id': str(self.user_id) if self.user_id else None,
            'description': self.description,
            'created_at': self.created_at.isoformat() + 'Z',
            'updated_at': self.updated_at.isoformat() + 'Z',
            'last_triggered': self.last_triggered.isoformat() + 'Z' if self.last_triggered else None,
            'trigger_count': self.trigger_count,
            'playbook': self.playbook.to_dict() if self.playbook else None,
            'credential': self.credential.to_dict() if self.credential else None,
            'user': self.user.to_dict() if self.user else None,
            'webhook_url': f'/api/webhook/trigger/{self.token}'
        }

class ExecutionHistory(db.Model):
    __tablename__ = 'execution_history'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    playbook_id = db.Column(db.String(36), db.ForeignKey('playbooks.id'), nullable=False)
    host_id = db.Column(db.String(36), db.ForeignKey('hosts.id'), nullable=True)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=True)  # Track who executed the task
    status = db.Column(db.String(50), nullable=False)
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    finished_at = db.Column(db.DateTime)
    output = db.Column(db.Text)
    error_output = db.Column(db.Text)
    username = db.Column(db.String(255))  # Keep for backward compatibility (SSH username)
    host_list = db.Column(db.Text)  # JSON string of all hosts in multi-host execution
    webhook_id = db.Column(db.String(36))  # Track webhook-triggered executions (no FK until webhooks table ready)
    original_task_id = db.Column(db.String(36), unique=True, nullable=False) # The original task's UUID
    original_task_serial_id = db.Column(db.Integer)  # Store the original task's sequential ID
    
    playbook = db.relationship('Playbook', backref='history')
    host = db.relationship('Host', backref='history')
    user = db.relationship('User', backref='history')  # User who executed the task
    # Note: Webhook relationships will be added when those tables exist
    
    # Virtual properties for fields that don't exist in database yet
    @property
    def serial_id(self):
        """Virtual serial_id property - will be replaced with real column when migrated"""
        try:
            # Count all executions that started at or before this execution's start time
            return ExecutionHistory.query.filter(ExecutionHistory.started_at <= self.started_at).count()
        except:
            return None
    
    # user_id is now a real column, no virtual property needed
    
    def get_global_serial_id(self):
        """Get global sequential ID - ALWAYS use stored original_task_serial_id if available"""
        # FIRST: Check if we have the original task serial ID stored
        if self.original_task_serial_id:
            return self.original_task_serial_id
        
        # FALLBACK: Calculate based on position (for old records without original_task_serial_id)
        try:
            return ExecutionHistory.query.filter(
                ExecutionHistory.id <= self.id
            ).count()
        except:
            return 1
    
    def to_dict_light(self):
        """Lightweight version for dashboard and quick previews - excludes heavy output data"""
        import json
        
        # Parse host list for multi-host support (lightweight version)
        hosts_data = []
        if self.host_list:
            try:
                host_list_parsed = json.loads(self.host_list)
                # Create simplified host entries
                hosts_data = []
                for host_info in host_list_parsed:
                    hosts_data.append({
                        'id': host_info.get('id'),
                        'name': host_info.get('name'),
                        'hostname': host_info.get('hostname')
                    })
            except:
                hosts_data = []
        
        # If no host_list, use the single host
        if not hosts_data and self.host:
            hosts_data = [{
                'id': str(self.host.id),
                'name': self.host.name,
                'hostname': self.host.hostname
            }]
        
        # Optimize playbook data extraction
        playbook_data = None
        if self.playbook:
            playbook_data = {
                'id': str(self.playbook.id),
                'name': self.playbook.name
            }
        
        # Single host for compatibility (first host from the list)
        host_data = hosts_data[0] if hosts_data else None
        
        # Simplified user data
        user_data = {'username': 'unknown', 'name': 'Unknown User'}
        if self.webhook_id:
            try:
                webhook = Webhook.query.get(self.webhook_id)
                if webhook:
                    user_data = {
                        'id': str(self.webhook_id),
                        'username': webhook.name,
                        'name': f'Webhook: {webhook.name}'
                    }
            except:
                user_data = {'username': 'webhook', 'name': 'Webhook Trigger'}
        elif self.user:
            user_data = {
                'id': str(self.user.id),
                'username': self.user.username,
                'name': self.user.username
            }
        
        # Determine executed_by_type for icon display
        executed_by_type = 'webhook' if self.webhook_id else 'user'

        return {
            'id': str(self.id),
            'serial_id': self.get_global_serial_id(),
            'playbook_id': str(self.playbook_id),
            'status': self.status,
            'started_at': self.started_at.isoformat() + 'Z' if self.started_at else None,
            'finished_at': self.finished_at.isoformat() + 'Z' if self.finished_at else None,
            'playbook': playbook_data,
            'host': host_data,  # Single host for compatibility
            'hosts': hosts_data,  # All hosts for multi-host display
            'user': user_data,
            'executed_by_type': executed_by_type,
            # Exclude heavy fields: output, error_output only
        }

    def to_dict(self):
        import json
        
        # Parse host list if available (cached to avoid repeated parsing)
        hosts_data = []
        if self.host_list:
            try:
                hosts_data = json.loads(self.host_list)
            except:
                hosts_data = []
        
        # If no host_list, use the single host (optimize host.to_dict())
        if not hosts_data and self.host:
            hosts_data = [{
                'id': str(self.host.id),
                'name': self.host.name,
                'hostname': self.host.hostname,
                'description': self.host.description,
                'group_id': str(self.host.group_id) if self.host.group_id else None
            }]
        
        # Optimize playbook data extraction
        playbook_data = None
        if self.playbook:
            playbook_data = {
                'id': str(self.playbook.id),
                'name': self.playbook.name,
                'description': self.playbook.description
            }
        
        # Optimize user data extraction - show webhook name for webhook executions, username for user executions
        user_data = {'username': 'unknown', 'name': 'Unknown User'}
        if self.webhook_id:
            # For webhook executions, show the webhook name
            try:
                webhook = Webhook.query.get(self.webhook_id)
                if webhook:
                    user_data = {
                        'id': str(self.webhook_id),
                        'username': webhook.name,
                        'name': f'Webhook: {webhook.name}'
                    }
            except:
                user_data = {'username': 'webhook', 'name': 'Webhook Trigger'}
        elif self.user:
            # For user executions, show the username
            user_data = {
                'id': str(self.user.id),
                'username': self.user.username,
                'name': self.user.username  # User model only has username, no first_name/last_name
            }
        
        # Determine executed_by_type for icon display
        executed_by_type = 'user'
        if self.webhook_id:
            executed_by_type = 'webhook'

        return {
            'id': str(self.id),
            'serial_id': self.get_global_serial_id(),  # Use global sequential numbering
            'playbook_id': str(self.playbook_id),
            'host_id': str(self.host_id) if self.host_id else None,
            'user_id': str(self.user_id) if self.user_id else None,
            'status': self.status,
            'started_at': self.started_at.isoformat() + 'Z' if self.started_at else None,
            'finished_at': self.finished_at.isoformat() + 'Z' if self.finished_at else None,
            'output': self.output,
            'error_output': self.error_output,
            'username': self.username,  # Use username field directly
            'webhook_id': str(self.webhook_id) if self.webhook_id else None,
            'playbook': playbook_data,
            'host': hosts_data[0] if hosts_data else None,  # Single host for compatibility
            'user': user_data,
            'hosts': hosts_data,  # List of all hosts in multi-host execution
            'webhook': None,  # Webhook relationship will be added when needed
            'executed_by_type': executed_by_type,
            'original_task_id': self.original_task_id
        }

class ApiToken(db.Model):
    __tablename__ = 'api_tokens'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(255), nullable=False)
    token = db.Column(db.String(64), nullable=False, unique=True)
    enabled = db.Column(db.Boolean, default=True)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_used = db.Column(db.DateTime)
    usage_count = db.Column(db.Integer, default=0)
    expires_at = db.Column(db.DateTime)
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'token': self.token,
            'enabled': self.enabled,
            'description': self.description,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
            'updated_at': self.updated_at.isoformat() + 'Z' if self.updated_at else None,
            'last_used': self.last_used.isoformat() + 'Z' if self.last_used else None,
            'usage_count': self.usage_count or 0,
            'expires_at': self.expires_at.isoformat() + 'Z' if self.expires_at else None
        }

class PlaybookFile(db.Model):
    __tablename__ = 'playbook_files'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    playbook_id = db.Column(db.String(36), db.ForeignKey('playbooks.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)  # Original filename
    stored_filename = db.Column(db.String(255), nullable=False)  # Unique filename on disk
    file_path = db.Column(db.String(500), nullable=False)  # Full path to file
    file_size = db.Column(db.Integer, nullable=False)  # File size in bytes
    mime_type = db.Column(db.String(100))  # MIME type of the file
    description = db.Column(db.Text)  # Optional description
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    playbook = db.relationship('Playbook', backref='files')
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'playbook_id': str(self.playbook_id),
            'filename': self.filename,
            'stored_filename': self.stored_filename,
            'file_path': self.file_path,
            'file_size': self.file_size,
            'mime_type': self.mime_type,
            'description': self.description,
            'created_at': self.created_at.isoformat() + 'Z',
            'updated_at': self.updated_at.isoformat() + 'Z'
        }

class Variable(db.Model):
    __tablename__ = 'variables'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    key = db.Column(db.String(255), nullable=False, unique=True)  # Variable name/key
    value = db.Column(db.Text, nullable=False)  # Variable value
    description = db.Column(db.Text)  # Optional description
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=True)  # Track who created the variable
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = db.relationship('User', backref='variables')  # User who created the variable
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'key': self.key,
            'value': self.value,
            'description': self.description,
            'user_id': str(self.user_id) if self.user_id else None,
            'created_at': self.created_at.isoformat() + 'Z',
            'updated_at': self.updated_at.isoformat() + 'Z',
            'user': self.user.to_dict() if self.user else None
        } 

# Helper: Clean up duplicate ExecutionHistory records before adding unique constraint

def cleanup_duplicate_execution_history():
    """
    Removes duplicate ExecutionHistory records, keeping only the first for each original_task_id.
    Call this before applying a unique constraint migration.
    """
    from sqlalchemy import func
    session = db.session
    subq = session.query(
        ExecutionHistory.original_task_id,
        func.min(ExecutionHistory.id).label('min_id')
    ).group_by(ExecutionHistory.original_task_id).subquery()

    # Find all IDs to keep
    keep_ids = set(row.min_id for row in session.query(subq.c.min_id).all())

    # Delete all ExecutionHistory records not in keep_ids
    deleted = session.query(ExecutionHistory).filter(~ExecutionHistory.id.in_(keep_ids)).delete(synchronize_session=False)
    session.commit()
    print(f"Deleted {deleted} duplicate ExecutionHistory records.") 