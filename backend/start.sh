#!/bin/bash

# Start SSH service
echo "Starting SSH service..."
service ssh start

# Check if SSH is running
if pgrep sshd > /dev/null; then
    echo "SSH service started successfully"
else
    echo "Failed to start SSH service"
    exit 1
fi

# Add localhost to known_hosts to avoid host key verification
mkdir -p ~/.ssh
ssh-keyscan -H localhost >> ~/.ssh/known_hosts 2>/dev/null
ssh-keyscan -H 127.0.0.1 >> ~/.ssh/known_hosts 2>/dev/null

# Test SSH key connection to localhost
echo "Testing SSH key connection to localhost..."
ssh -o ConnectTimeout=5 -o BatchMode=yes ansible@localhost 'echo "SSH key authentication successful"' || {
    echo "Warning: SSH key authentication test failed"
    echo "Falling back to password authentication test..."
    sshpass -p 'ansible' ssh -o ConnectTimeout=5 ansible@localhost 'echo "SSH password authentication successful"' || {
        echo "Warning: Both SSH key and password authentication failed, but continuing..."
    }
}

# Start Flask application
echo "Starting Flask application..."
exec python app.py