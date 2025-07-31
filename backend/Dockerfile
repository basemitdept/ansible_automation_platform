FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including SSH server
RUN apt-get update && apt-get install -y \
    openssh-client \
    openssh-server \
    sshpass \
    rsync \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Configure SSH server for localhost access
RUN mkdir /var/run/sshd \
    && echo 'root:ansible' | chpasswd \
    && sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config \
    && sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config \
    && sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config \
    && sed -i 's/UsePAM yes/UsePAM no/' /etc/ssh/sshd_config

# Create ansible user for SSH access
RUN useradd -m -s /bin/bash ansible \
    && echo 'ansible:ansible' | chpasswd \
    && usermod -aG sudo ansible \
    && echo 'ansible ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Generate SSH host keys
RUN ssh-keygen -A

# Set up SSH keys for localhost access
RUN mkdir -p /root/.ssh && chmod 700 /root/.ssh
RUN ssh-keygen -t rsa -f /root/.ssh/id_rsa -N '' -q
RUN mkdir -p /home/ansible/.ssh && chmod 700 /home/ansible/.ssh
RUN cp /root/.ssh/id_rsa.pub /home/ansible/.ssh/authorized_keys
RUN chmod 600 /home/ansible/.ssh/authorized_keys
RUN chown -R ansible:ansible /home/ansible/.ssh

# Configure SSH client to skip host key checking for localhost
RUN echo "Host localhost" >> /root/.ssh/config \
    && echo "    StrictHostKeyChecking no" >> /root/.ssh/config \
    && echo "    UserKnownHostsFile /dev/null" >> /root/.ssh/config \
    && chmod 600 /root/.ssh/config

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create playbooks directory
RUN mkdir -p /app/playbooks

# Expose ports for Flask app and SSH
EXPOSE 5000 22

# Create startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"] 