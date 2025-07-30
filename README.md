# Ansible Automation Platform

A modern web-based platform for automating Ansible playbook execution with a beautiful UI, real-time monitoring, and comprehensive management features.

## Features

- 🎯 **Playbook Management** - Create, edit, and organize your Ansible playbooks
- 🖥️ **Host Management** - Manage your server inventory
- 🔧 **VSCode-like Editor** - Monaco editor with YAML syntax highlighting
- 🔐 **Secure Execution** - SSH authentication modal for secure connections
- 📊 **Real-time Monitoring** - Live task execution with WebSocket streaming
- 📚 **Execution History** - Complete audit trail of all playbook runs
- 🐳 **Docker Compose** - Easy deployment with containerization
- 💾 **PostgreSQL Database** - Reliable data persistence
- 🌐 **Nginx Reverse Proxy** - Production-ready web server

## Architecture

- **Frontend**: React 18 with Ant Design UI components
- **Backend**: Python Flask with SQLAlchemy ORM
- **Database**: PostgreSQL 15
- **Web Server**: Nginx
- **Real-time**: WebSocket with Socket.IO
- **Deployment**: Docker Compose

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Git for cloning the repository

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ansible-automation-platform
   ```

2. **Start the application**
   
   **Linux/Mac:**
   ```bash
   chmod +x start.sh
   ./start.sh
   ```
   
   **Windows:**
   ```cmd
   start.bat
   ```
   
   **Manual start:**
   ```bash
   docker-compose up --build -d
   ```

3. **Access the application**
   - Open your browser and navigate to `http://localhost`
   - The application will be running on port 80

### Default Configuration

- **Frontend**: http://localhost (via Nginx)
- **Backend API**: http://localhost/api
- **Database**: PostgreSQL on port 5432
- **WebSocket**: http://localhost/ws

## Usage Guide

### 1. Managing Playbooks

1. Navigate to **Playbooks** in the left sidebar
2. Click **New Playbook** to create a playbook
3. Enter playbook name, description, and YAML content
4. Save the playbook

### 2. Managing Hosts

1. Go to **Hosts** section
2. Click **New Host** to add a server
3. Enter host name, hostname/IP, and description
4. Save the host configuration

### 3. Running Playbooks

1. Navigate to **Run Playbook**
2. Select a playbook from the dropdown
3. Choose a target host
4. Click **Execute Playbook**
5. Enter SSH credentials in the authentication modal
6. Monitor execution in real-time

### 4. Monitoring Tasks

1. Visit **Running Tasks** to see active executions
2. Click **View** on any task to see live output
3. Real-time updates via WebSocket connections

### 5. Viewing History

1. Check **History** for past executions
2. Filter by status, user, or date
3. View detailed output and error logs

## Configuration

### Environment Variables

You can customize the application by modifying the `docker-compose.yml` file:

```yaml
environment:
  POSTGRES_DB: ansible_automation
  POSTGRES_USER: ansible_user
  POSTGRES_PASSWORD: ansible_password
  DATABASE_URL: postgresql://ansible_user:ansible_password@postgres:5432/ansible_automation
```

### Custom Playbooks Directory

Playbooks are stored in the `./playbooks` directory, which is mounted as a Docker volume.

## Development

### Backend Development

```bash
cd backend
pip install -r requirements.txt
export DATABASE_URL=postgresql://ansible_user:ansible_password@localhost:5432/ansible_automation
python app.py
```

### Frontend Development

```bash
cd frontend
npm install
npm start
```

## API Documentation

### Playbooks API
- `GET /api/playbooks` - List all playbooks
- `POST /api/playbooks` - Create new playbook
- `PUT /api/playbooks/{id}` - Update playbook
- `DELETE /api/playbooks/{id}` - Delete playbook

### Hosts API
- `GET /api/hosts` - List all hosts
- `POST /api/hosts` - Create new host
- `PUT /api/hosts/{id}` - Update host
- `DELETE /api/hosts/{id}` - Delete host

### Tasks API
- `GET /api/tasks` - List running tasks
- `GET /api/tasks/{id}` - Get task details
- `POST /api/execute` - Execute playbook

### History API
- `GET /api/history` - Get execution history

## Security Considerations

- SSH credentials are never stored permanently
- All database connections use environment variables
- Ansible playbooks run in isolated containers
- User authentication required for execution

## Troubleshooting

### Common Issues

1. **Database authentication failed**
   ```bash
   # Stop containers and remove volumes
   docker-compose down -v
   # Rebuild and restart
   docker-compose up --build -d
   ```

2. **Cannot connect to database**
   - Ensure PostgreSQL container is running: `docker-compose ps`
   - Check database credentials in docker-compose.yml
   - Wait for database to be ready (can take 30-60 seconds)

3. **Playbook execution fails**
   - Verify SSH credentials
   - Check host connectivity
   - Review playbook syntax
   - Ensure Ansible is installed in backend container

4. **WebSocket connection issues**
   - Ensure backend is running
   - Check browser console for errors
   - Verify Nginx proxy configuration

5. **Frontend build errors**
   - Clear node_modules: `docker-compose down && docker-compose up --build`
   - Check for missing dependencies

### Logs

View application logs:
```bash
docker-compose logs backend
docker-compose logs frontend
docker-compose logs nginx
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the logs for error details 