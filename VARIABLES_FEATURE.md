# Variables Feature Implementation

## Overview
The Variables feature allows you to create global key-value pairs that can be assigned to specific Ansible playbooks. Variables must be explicitly assigned to playbooks before they can be used, providing fine-grained control over which variables are available to which playbooks.

## How It Works

### 1. Creating Variables
- Navigate to the **Variables** page in the sidebar menu
- Click "Add Variable" to create a new variable
- Enter a key (e.g., `basem`), value (e.g., `alaraj`), and optional description
- Variables are stored globally and can be used in any playbook

### 2. Using Variables in Playbooks
In your playbook content, use the standard Ansible variable syntax:
```yaml
---
- name: Example Playbook
  hosts: all
  tasks:
    - name: Display user name
      debug:
        msg: "Hello {{ basem }}!"
    
    - name: Create user directory
      file:
        path: "/home/{{ basem }}"
        state: directory
```

### 3. Assigning Variables to Playbooks
When creating or editing a playbook:
1. Use the "Assigned Variables" dropdown to select which global variables should be available
2. Only assigned variables can be used by the playbook during execution
3. Multiple variables can be assigned to a single playbook
4. Variables can be assigned to multiple playbooks

### 4. Executing Playbooks with Variables
When you run a playbook:
1. The system automatically detects variables in your playbook (anything in `{{ }}` format)
2. If an assigned global variable exists for a detected variable, it's available for use
3. Green tags show "Using Assigned", orange tags show "Assigned Available"
4. Red tags show "Not Assigned" - these variables need manual values or must be assigned to the playbook

## Example Usage

### Step 1: Create a Variable
- Key: `basem`
- Value: `alaraj`
- Description: "User name for system tasks"

### Step 2: Use in Playbook
```yaml
---
- name: User Management Playbook
  hosts: all
  become: yes
  tasks:
    - name: Create user
      user:
        name: "{{ basem }}"
        state: present
    
    - name: Set message
      debug:
        msg: "User {{ basem }} has been created"
```

### Step 3: Assign Variable to Playbook
- Go to the Playbooks page and edit your playbook
- In the "Assigned Variables" dropdown, select the `basem` variable
- Save the playbook

### Step 4: Execute
- Select your playbook in the Run Playbook page
- The system detects the `basem` variable
- Shows "Using Assigned" tag with the value `alaraj`
- When executed, `{{ basem }}` becomes `alaraj`

## Features

### Variables Management Page
- **Create**: Add new variables with validation
- **Edit**: Update existing variables
- **Delete**: Remove variables (with confirmation)
- **Search/Filter**: Find variables easily
- **User Tracking**: See who created each variable

### Smart Variable Detection
- Automatically scans playbook content for `{{ variable_name }}` patterns
- Shows which variables have assigned values available
- Allows mixing assigned and custom values in the same playbook
- Clear indicators for assigned vs unassigned variables

### Execution Integration
- Variables are passed to Ansible as extra vars (`-e key=value`)
- Full compatibility with Ansible's variable system
- Variables work with all Ansible modules and features

## Technical Implementation

### Backend
- **Model**: `Variable` table stores key-value pairs with metadata
- **API**: RESTful endpoints for CRUD operations (`/api/variables`)
- **Execution**: Variables passed as `-e` parameters to `ansible-playbook`

### Frontend
- **Component**: `Variables.js` provides management interface
- **Integration**: `PlaybookEditor.js` enhanced with variable detection
- **UI**: Intuitive tags and buttons for variable management

### Database Schema
```sql
CREATE TABLE variables (
    id VARCHAR(36) PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    user_id VARCHAR(36),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

## Security & Best Practices

### Variable Naming
- Use valid Ansible variable names: start with letter/underscore, contain only letters, numbers, underscores
- Use descriptive names: `server_ip` instead of `ip`
- Follow consistent naming conventions

### Value Management
- Avoid sensitive data in variables (use Ansible Vault for secrets)
- Keep values simple and readable
- Document complex variables with descriptions

### User Management
- Variables are global - any user can see and use them
- Only users with appropriate permissions can create/edit/delete
- Track who created variables for accountability

## Examples

### Common Variables
```
server_ip = 192.168.1.100
app_name = my-application
environment = production
admin_user = basem
database_host = db.example.com
```

### Playbook Usage
```yaml
---
- name: Deploy Application
  hosts: "{{ server_ip }}"
  vars:
    app_path: "/opt/{{ app_name }}"
  tasks:
    - name: Create app directory
      file:
        path: "{{ app_path }}"
        owner: "{{ admin_user }}"
        state: directory
    
    - name: Update configuration
      template:
        src: app.conf.j2
        dest: "{{ app_path }}/config.conf"
      vars:
        db_host: "{{ database_host }}"
        env: "{{ environment }}"
```

## Troubleshooting

### Variable Not Detected
- Ensure you're using `{{ variable_name }}` syntax (with spaces optional)
- Check that the variable name contains only valid characters
- Refresh the playbook editor after making changes

### Variable Not Applied
- Verify the variable exists in the Variables page
- Check that you're using the correct variable name (case-sensitive)
- Ensure the value doesn't contain special characters that need escaping

### Permission Issues
- Check user role permissions for creating/editing variables
- Contact an administrator if you need access to variables management

## Migration from Manual Variables
If you were previously entering variables manually each time:
1. Identify commonly used values in your playbooks
2. Create global variables for these values
3. Update playbooks to use the variable syntax
4. Global variables will be automatically suggested when running playbooks

This feature significantly streamlines playbook management and reduces manual input while maintaining full flexibility for custom values when needed.
