# Localhost SSH Setup for Backend Container

## 🎯 Overview

The backend container now includes SSH server configuration to allow running Ansible tasks on localhost (the container itself). This is useful for:

- Testing playbooks locally
- Running container management tasks
- Local file operations
- System monitoring within the container

## 🔧 What's Configured

### **SSH Server Setup**
- **SSH Server**: `openssh-server` installed and configured
- **SSH Port**: 22 (internal to container)
- **Root Access**: Enabled with password `ansible`
- **User Account**: `ansible` user with password `ansible`
- **Sudo Access**: `ansible` user has passwordless sudo

### **Automatic Setup**
- **SSH Keys**: Generated automatically on container start
- **Known Hosts**: localhost added to avoid host key verification
- **Service Start**: SSH service starts automatically with the container

## 🚀 Usage

### **1. Localhost Host Entry**
The system automatically creates a localhost host entry:
- **Name**: `localhost`
- **Hostname**: `localhost`
- **Description**: Local container for Ansible tasks

### **2. Localhost Credentials**
Automatically created credential:
- **Name**: `Localhost SSH`
- **Username**: `ansible`
- **Password**: `ansible`

### **3. Sample Playbook**
A test playbook `localhost-test` is created with tasks to:
- Get system information
- Display hostname
- Check disk space
- Create and write to test files

## 📋 How to Use

### **Method 1: UI Execution**
1. Go to **Playbook Editor & Executor**
2. Select any playbook (or the `localhost-test` sample)
3. Select **localhost** as target host
4. Select **Localhost SSH** credentials
5. Click **Execute Playbook**

### **Method 2: Webhook Execution**
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "test_var": "localhost_test"
    }
  }' \
  http://localhost/api/webhook/trigger/YOUR_WEBHOOK_TOKEN
```
*(Make sure webhook is configured with localhost host and localhost credentials)*

### **Method 3: Manual SSH Test**
Connect to the backend container and test SSH:
```bash
# Connect to backend container
docker exec -it automation-platform-backend-1 bash

# Test SSH connection
ssh ansible@localhost

# Or test with sshpass
sshpass -p 'ansible' ssh ansible@localhost 'whoami'
```

## 🔍 Verification

### **Check SSH Service**
```bash
# Inside backend container
service ssh status
netstat -tlnp | grep :22
```

### **Test Ansible Connection**
```bash
# Inside backend container
ansible localhost -m ping -u ansible -k
# Password: ansible
```

### **Check Logs**
```bash
# Container logs
docker logs automation-platform-backend-1

# SSH logs inside container
tail -f /var/log/auth.log
```

## ⚙️ Configuration

### **Environment Variables**
- `ANSIBLE_SSH_USER=ansible` - Default SSH user for webhooks

### **SSH Configuration**
- **Password Authentication**: Enabled
- **Root Login**: Enabled
- **Host Key Checking**: Disabled for localhost
- **Connection Timeout**: 30 seconds

### **User Permissions**
- `ansible` user has full sudo access
- Can install packages, modify files, restart services
- Home directory: `/home/ansible`

## 🛠️ Troubleshooting

### **SSH Connection Issues**
```bash
# Check SSH service
service ssh status

# Restart SSH if needed
service ssh restart

# Test connection with verbose output
ssh -v ansible@localhost
```

### **Permission Issues**
```bash
# Check user permissions
id ansible
sudo -l -U ansible

# Check SSH directory permissions
ls -la /home/ansible/.ssh/
```

### **Port Issues**
```bash
# Check if port 22 is listening
netstat -tlnp | grep :22
lsof -i :22
```

## 🎉 Benefits

- **Local Testing**: Test playbooks without external hosts
- **Container Management**: Manage the container itself via Ansible
- **Development**: Develop and test automation locally
- **Isolation**: Secure localhost-only operations

The localhost setup provides a complete Ansible testing environment within the backend container! 🚀