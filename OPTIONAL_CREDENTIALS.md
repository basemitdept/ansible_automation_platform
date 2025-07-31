# Optional SSH Credentials for Task Execution

## 🎯 Overview

SSH credentials are now **optional** for both manual UI execution and webhook execution. The system supports multiple authentication methods to provide flexibility and security.

## 🔐 Authentication Methods

### **1. SSH Keys (Recommended)**
- **No credentials needed** in the request
- Uses SSH keys from the system running the application
- Most secure method - no passwords stored or transmitted

### **2. Saved Credentials**
- Pre-configured username/password pairs
- Stored securely in the database
- Convenient for repeated use

### **3. Custom Credentials**
- Enter username/password for one-time use
- Not stored in the database
- Useful for temporary or unique access

## 🖥️ UI Usage

### **In Playbook Editor:**

1. **Select Authentication Method:**
   - **"No credentials (SSH keys)"** - Uses SSH key authentication
   - **Saved credential** - Select from dropdown
   - **"Use Custom Credentials"** - Enter username/password

2. **SSH Keys Option:**
   - Green text: "No credentials (SSH keys)"
   - Key icon for easy identification
   - No additional input required

3. **Execute:**
   - Click "Execute Playbook"
   - System uses selected authentication method
   - Success message indicates which method was used

## 🔗 Webhook Usage

### **Simple Call (SSH Keys):**
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "env": "production"
    }
  }' \
  http://localhost/api/webhook/trigger/YOUR_WEBHOOK_TOKEN
```

### **With Credentials:**
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "credentials": {
      "username": "deploy_user",
      "password": "secure_password"
    },
    "variables": {
      "env": "production"
    }
  }' \
  http://localhost/api/webhook/trigger/YOUR_WEBHOOK_TOKEN
```

## ⚙️ Backend Configuration

### **Default SSH User:**
```bash
# Set environment variable (default: 'ansible')
export ANSIBLE_SSH_USER=your_default_username
```

### **SSH Key Requirements:**
- SSH keys must be set up between the application server and target hosts
- Default user (ansible) must have SSH access to target hosts
- SSH keys should be in standard location (`~/.ssh/`)

## 🔧 How It Works

### **Authentication Priority:**
1. **Explicit credentials** (if provided)
2. **Default webhook credentials** (if configured)  
3. **SSH keys** with default user

### **Ansible Configuration:**
- **With password**: Uses `PasswordAuthentication=yes`
- **SSH keys only**: Uses `PasswordAuthentication=no` and `PreferredAuthentications=publickey`
- **Host key checking**: Disabled for convenience

## 📊 Benefits

### **Security:**
- SSH keys are more secure than passwords
- No passwords stored in webhook requests
- Follows SSH best practices

### **Convenience:**
- No need to manage passwords in automation
- Works with existing SSH infrastructure
- Supports both methods for flexibility

### **Flexibility:**
- Choose authentication method per execution
- Mix and match as needed
- Fallback options available

## 🛠️ Setup Requirements

### **For SSH Key Authentication:**
1. **Generate SSH keys** on the application server
2. **Copy public key** to target hosts for the default user
3. **Test connection** manually first
4. **Set ANSIBLE_SSH_USER** environment variable if needed

### **Example Setup:**
```bash
# On application server
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa

# Copy to target hosts
ssh-copy-id ansible@target-host-1
ssh-copy-id ansible@target-host-2

# Test connection
ssh ansible@target-host-1 'whoami'
```

## ✅ Testing

### **Test SSH Key Access:**
```bash
# From application server
ssh your_default_user@target_host 'echo "SSH keys working"'
```

### **Test UI Execution:**
1. Select "No credentials (SSH keys)"
2. Execute a simple playbook
3. Check task output for success

### **Test Webhook:**
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{}' \
  http://localhost/api/webhook/trigger/YOUR_WEBHOOK_TOKEN
```

SSH credentials are now completely optional - use what works best for your infrastructure! 🚀