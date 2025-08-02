// Permission utility functions

export const hasPermission = (user, action) => {
  if (!user) return false;
  
  const { role } = user;
  
  // Admin has all permissions
  if (role === 'admin') {
    return true;
  }
  
  // Editor permissions (can create and modify but cannot delete)
  if (role === 'editor') {
    const deniedActions = [
      'delete_user',
      'delete_playbook', 
      'delete_host',
      'delete_credential',
      'delete_webhook',
      'delete_task',
      'delete_history',
      'create_user',
      'edit_user'
    ];
    return !deniedActions.includes(action);
  }
  
  // User permissions (read-only)
  if (role === 'user') {
    const allowedActions = [
      'read',
      'view',
      'view_playbooks',
      'view_hosts', 
      'view_credentials',
      'view_webhooks',
      'view_tasks',
      'view_history'
    ];
    return allowedActions.includes(action);
  }
  
  return false;
};

export const canCreate = (user) => hasPermission(user, 'create');
export const canEdit = (user) => hasPermission(user, 'edit');
export const canDelete = (user) => hasPermission(user, 'delete');
export const canExecute = (user) => hasPermission(user, 'execute');

export const getRoleColor = (role) => {
  switch (role) {
    case 'admin':
      return '#ff4d4f';
    case 'editor':
      return '#1890ff';
    case 'user':
      return '#52c41a';
    default:
      return '#d9d9d9';
  }
};

export const getRolePermissions = (role) => {
  switch (role) {
    case 'admin':
      return 'Full access to all features including user management';
    case 'editor':
      return 'Can create and modify resources but cannot delete';
    case 'user':
      return 'Read-only access to view resources and execution history';
    default:
      return 'Unknown role';
  }
};