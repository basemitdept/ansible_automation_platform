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
    os_type = db.Column(db.String(50), nullable=False, default='linux')  # OS type column
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
        
        return {
            'id': str(self.id),
            'name': self.name,
            'content': self.content,
            'description': self.description,
            'variables': variables_data,
            'os_type': self.os_type,
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
            host_count = 0
            if hasattr(self, 'hosts') and self.hosts:
                host_count = len(self.hosts)
            
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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # These columns might not exist initially, so we'll handle them dynamically
    # os_type = db.Column(db.String(50), nullable=False, default='linux')
    # port = db.Column(db.Integer, nullable=False, default=22)
    
    group = db.relationship('HostGroup', backref='hosts')
    
    def to_dict(self):
        try:
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
            
            return {
                'id': str(self.id),
                'name': self.name,
                'hostname': self.hostname,
                'description': self.description,
                'os_type': self.os_type,
                'port': self.port,
                'group_id': str(self.group_id) if self.group_id else None,
                'group': group_data,
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
                'os_type': self.os_type if hasattr(self, 'os_type') else 'linux',
                'port': self.port if hasattr(self, 'port') else 22,
                'group_id': None,
                'group': None,
                'created_at': None,
                'updated_at': None
            }

class Task(db.Model):
    __tablename__ = 'tasks'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    playbook_id = db.Column(db.String(36), db.ForeignKey('playbooks.id'), nullable=False)
    host_id = db.Column(db.String(36), db.ForeignKey('hosts.id'), nullable=True)
    status = db.Column(db.String(50), default='pending')
    started_at = db.Column(db.DateTime)
    finished_at = db.Column(db.DateTime)
    output = db.Column(db.Text)
    error_output = db.Column(db.Text)
    host_list = db.Column(db.Text)  # JSON string of all hosts in multi-host execution
    
    playbook = db.relationship('Playbook', backref='tasks')
    host = db.relationship('Host', backref='tasks')
    # Note: User and Webhook relationships will be added when those tables exist
    
    # Virtual properties for fields that don't exist in database yet
    @property
    def serial_id(self):
        """Virtual serial_id property - will be replaced with real column when migrated"""
        try:
            # Use execution history count to match history serial_id
            # Count all executions that started at or before this task's start time
            if self.started_at:
                return ExecutionHistory.query.filter(ExecutionHistory.started_at <= self.started_at).count() + 1
            else:
                # For pending tasks, estimate based on current execution count + 1
                return ExecutionHistory.query.count() + 1
        except:
            return None
    
    @property
    def user_id(self):
        """Virtual user_id property - will be replaced with real column when migrated"""
        return None  # Will be set when users table exists
    
    @property
    def webhook_id(self):
        """Virtual webhook_id property - will be replaced with real column when migrated"""
        return None  # Will be set when webhooks integration is completed
    
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
        
        return {
            'id': str(self.id),
            'serial_id': self.serial_id,
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
            'user': {'username': 'admin', 'name': 'Admin User'},  # Temporary admin user until users table exists
            'webhook_id': str(self.webhook_id) if self.webhook_id else None,
            'webhook': None,  # Webhook relationship will be added when needed
            'hosts': hosts_data  # List of all hosts in multi-host execution
        }

class Credential(db.Model):
    __tablename__ = 'credentials'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(100), nullable=False)  # Display name for the credential
    username = db.Column(db.String(100), nullable=False)  # SSH username
    password = db.Column(db.String(255), nullable=False)  # SSH password (should be encrypted in production)
    description = db.Column(db.Text)  # Optional description
    is_default = db.Column(db.Boolean, default=False)  # Mark as default credential
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
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
    host_ids = db.Column(db.Text, nullable=False)  # JSON array of host IDs
    token = db.Column(db.String(64), nullable=False, unique=True)  # Unique webhook token
    enabled = db.Column(db.Boolean, default=True)
    default_variables = db.Column(db.Text)  # JSON object of default variable values
    credential_id = db.Column(db.String(36), db.ForeignKey('credentials.id'))  # Optional default credential
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_triggered = db.Column(db.DateTime)
    trigger_count = db.Column(db.Integer, default=0)
    
    playbook = db.relationship('Playbook', backref='webhooks')
    credential = db.relationship('Credential', backref='webhooks')
    
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
            'description': self.description,
            'created_at': self.created_at.isoformat() + 'Z',
            'updated_at': self.updated_at.isoformat() + 'Z',
            'last_triggered': self.last_triggered.isoformat() + 'Z' if self.last_triggered else None,
            'trigger_count': self.trigger_count,
            'playbook': self.playbook.to_dict() if self.playbook else None,
            'credential': self.credential.to_dict() if self.credential else None,
            'webhook_url': f'/api/webhook/trigger/{self.token}'
        }

class ExecutionHistory(db.Model):
    __tablename__ = 'execution_history'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    playbook_id = db.Column(db.String(36), db.ForeignKey('playbooks.id'), nullable=False)
    host_id = db.Column(db.String(36), db.ForeignKey('hosts.id'), nullable=True)
    status = db.Column(db.String(50), nullable=False)
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    finished_at = db.Column(db.DateTime)
    output = db.Column(db.Text)
    error_output = db.Column(db.Text)
    username = db.Column(db.String(255))  # Keep for backward compatibility
    host_list = db.Column(db.Text)  # JSON string of all hosts in multi-host execution
    webhook_id = db.Column(db.String(36))  # Track webhook-triggered executions (no FK until webhooks table ready)
    
    playbook = db.relationship('Playbook', backref='history')
    host = db.relationship('Host', backref='history')
    # Note: User and Webhook relationships will be added when those tables exist
    
    # Virtual properties for fields that don't exist in database yet
    @property
    def serial_id(self):
        """Virtual serial_id property - will be replaced with real column when migrated"""
        try:
            # Count all executions that started at or before this execution's start time
            return ExecutionHistory.query.filter(ExecutionHistory.started_at <= self.started_at).count()
        except:
            return None
    
    @property
    def user_id(self):
        """Virtual user_id property - will be replaced with real column when migrated"""
        return None  # Will be set when users table exists
    
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
        
        return {
            'id': str(self.id),
            'serial_id': self.serial_id,
            'playbook_id': str(self.playbook_id),
            'host_id': str(self.host_id) if self.host_id else None,
            'user_id': str(self.user_id) if self.user_id else None,
            'status': self.status,
            'started_at': self.started_at.isoformat() + 'Z',
            'finished_at': self.finished_at.isoformat() + 'Z' if self.finished_at else None,
            'output': self.output,
            'error_output': self.error_output,
            'username': self.username,  # Use username field directly
            'webhook_id': str(self.webhook_id) if self.webhook_id else None,
            'playbook': self.playbook.to_dict() if self.playbook else None,
            'host': self.host.to_dict() if self.host else None,
            'user': {'username': 'admin', 'name': 'Admin User'},  # Temporary admin user until users table exists
            'hosts': hosts_data,  # List of all hosts in multi-host execution
            'webhook': None  # Webhook relationship will be added when needed
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