# Webhook Token Authentication System

## 🔐 Overview

The webhook system now includes **API token authentication** to secure webhook endpoints. All webhook API calls now require a valid API token to prevent unauthorized access.

## 🚀 Features

### **1. API Token Management**
- **Create/Edit/Delete** API tokens
- **Regenerate** tokens for security
- **Enable/Disable** tokens
- **Expiration dates** (optional)
- **Usage tracking** (count & last used)
- **Token visibility** toggle (show/hide)

### **2. Secure Webhook Calls**
- **Bearer token authentication** required
- **Permission denied** without valid token
- **Usage statistics** tracking
- **Automatic expiration** handling

## 📋 How to Use

### **Step 1: Create API Token**
1. Go to **Webhooks** page
2. Click **API Tokens** tab
3. Click **New API Token**
4. Fill in:
   - **Name**: e.g., "Production API Access"
   - **Description**: Purpose of the token
   - **Enabled**: Toggle on/off
   - **Expiration**: Optional expiration date
5. Click **Create Token**
6. **Copy the token** (store securely!)

### **Step 2: Call Webhook with Token**

**Simple call (uses SSH keys)**
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "env": "production",
      "version": "1.2.3"
    }
  }' \
  https://your-domain.com/api/webhook/trigger/WEBHOOK_TOKEN_HERE
```
*Uses SSH key authentication with default user (configurable via `ANSIBLE_SSH_USER` env var)*

**With specific SSH credentials (optional)**
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "env": "production",
      "version": "1.2.3"
    },
    "credentials": {
      "username": "deploy_user",
      "password": "secure_password"
    }
  }' \
  https://your-domain.com/api/webhook/trigger/WEBHOOK_TOKEN_HERE
```

**Using webhook's default credentials**
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "env": "production",
      "version": "1.2.3"
    }
  }' \
  https://your-domain.com/api/webhook/trigger/WEBHOOK_TOKEN_HERE
```
*(Uses default credential configured for the webhook)*

### **Step 3: Handle Authentication Errors**
Without token:
```json
{
  "error": "Permission denied. API token required in Authorization header."
}
```

With invalid token:
```json
{
  "error": "Permission denied. Invalid or expired API token."
}
```

**SSH Authentication Methods:**
1. **SSH Keys** (default): Uses SSH keys from the system running the webhook
2. **Password**: Provide credentials in request or configure webhook default
3. **Webhook Default**: Configure default credentials in the UI

**Environment Configuration:**
```bash
# Set default SSH user for webhooks (default: 'ansible')
export ANSIBLE_SSH_USER=your_ssh_username
```

## 🛠️ Database Changes

### **New Table: `api_tokens`**
```sql
CREATE TABLE api_tokens (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    description TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP,
    usage_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP
);
```

### **Migration Required**
Run the migration script:
```bash
psql -d your_database -f backend/api_tokens_migration.sql
```

## 🔧 API Endpoints

### **Token Management**
- `GET /api/tokens` - List all tokens
- `POST /api/tokens` - Create new token
- `PUT /api/tokens/:id` - Update token
- `DELETE /api/tokens/:id` - Delete token
- `POST /api/tokens/:id/regenerate` - Regenerate token

### **Webhook Trigger (Updated)**
- `POST /api/webhook/trigger/:webhook_token`
  - **Headers**: `Authorization: Bearer <api_token>`
  - **Body**: Webhook payload

## 🎯 UI Features

### **Webhooks Tab**
- List all webhooks
- Create/edit webhooks
- Copy webhook URLs
- Regenerate webhook tokens

### **API Tokens Tab**
- List all API tokens
- Create/edit/delete tokens
- Show/hide token values
- Copy tokens to clipboard
- View usage statistics
- Track expiration status

## 🔒 Security Features

1. **Secure Token Generation**: 64-character hex tokens
2. **Bearer Authentication**: Standard OAuth 2.0 format
3. **Usage Tracking**: Monitor token usage
4. **Expiration Support**: Time-based token expiry
5. **Enable/Disable**: Quick token control
6. **Token Masking**: Hide sensitive values in UI

## 📊 Usage Examples

### **Create Token via API**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI/CD Pipeline",
    "description": "Token for automated deployments",
    "enabled": true,
    "expires_at": "2024-12-31T23:59:59Z"
  }' \
  http://localhost:5000/api/tokens
```

### **Successful Webhook Call**
```bash
curl -X POST \
  -H "Authorization: Bearer abc123def456..." \
  -H "Content-Type: application/json" \
  -d '{"variables": {"env": "prod"}}' \
  http://localhost:5000/api/webhook/trigger/webhook_token_here
```

**Response:**
```json
{
  "message": "Webhook triggered successfully",
  "task_id": "task-uuid-here",
  "playbook": "deploy-app",
  "hosts": 3,
  "variables": {"env": "prod"}
}
```

## 🚨 Important Notes

1. **Backward Compatibility**: Old webhook URLs still work but require tokens
2. **Token Storage**: Store tokens securely (environment variables, secrets)
3. **Regular Rotation**: Regenerate tokens periodically
4. **Monitor Usage**: Check token usage statistics regularly
5. **Default Token**: A default token is created during migration

## 🔄 Migration Steps

1. **Run Database Migration**:
   ```bash
   psql -d ansible_portal -f backend/api_tokens_migration.sql
   ```

2. **Restart Backend**:
   ```bash
   docker-compose restart backend
   ```

3. **Create API Tokens**:
   - Go to Webhooks → API Tokens tab
   - Create tokens for your integrations

4. **Update Webhook Clients**:
   - Add `Authorization: Bearer <token>` header
   - Test webhook calls

## ✅ Testing

Test the new authentication:

```bash
# Without token (should fail)
curl -X POST http://localhost:5000/api/webhook/trigger/your_webhook_token

# With token (should succeed)
curl -X POST \
  -H "Authorization: Bearer your_api_token" \
  http://localhost:5000/api/webhook/trigger/your_webhook_token
```

The system is now secure and ready for production use! 🎉