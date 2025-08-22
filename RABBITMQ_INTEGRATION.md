# RabbitMQ Integration for Ansible Automation

This document describes the RabbitMQ integration that has been implemented to queue API requests and deliver them when the application is ready.

## Overview

The RabbitMQ integration provides a robust message queuing system that allows the Ansible automation platform to:

1. **Queue API requests** instead of processing them immediately
2. **Process requests asynchronously** when the application is ready
3. **Handle high load** by distributing work across multiple workers
4. **Provide reliability** with message persistence and acknowledgment
5. **Scale horizontally** by running multiple worker instances

## Architecture

### Components

1. **RabbitMQ Server**: Message broker that stores and routes messages
2. **Producer (Flask App)**: Publishes execution requests to the queue
3. **Consumer (Worker)**: Processes queued messages and executes playbooks
4. **Queue Management**: API endpoints for monitoring and controlling the queue

### Message Flow

```
API Request → Flask App → RabbitMQ Queue → Worker → Ansible Execution
```

## Configuration

### Environment Variables

The following environment variables are used for RabbitMQ configuration:

```bash
RABBITMQ_HOST=rabbitmq          # RabbitMQ server hostname
RABBITMQ_PORT=5672              # RabbitMQ server port
RABBITMQ_USER=ansible_user      # RabbitMQ username
RABBITMQ_PASS=ansible_password  # RabbitMQ password
RABBITMQ_VHOST=/                # RabbitMQ virtual host
```

### Docker Compose

RabbitMQ is automatically configured in the `docker-compose.yml` file:

```yaml
rabbitmq:
  image: rabbitmq:3-management
  environment:
    RABBITMQ_DEFAULT_USER: ansible_user
    RABBITMQ_DEFAULT_PASS: ansible_password
    RABBITMQ_DEFAULT_VHOST: /
  ports:
    - "5672:5672"      # AMQP protocol
    - "15672:15672"    # Management UI
  volumes:
    - rabbitmq_data:/var/lib/rabbitmq
```

## Usage

### Starting the System

1. **Start all services**:
   ```bash
   docker-compose up -d
   ```

2. **Check RabbitMQ status**:
   ```bash
   curl http://localhost:5003/api/health
   ```

3. **Monitor queue status**:
   ```bash
   curl http://localhost:5003/api/queue/status
   ```

### Queue Management

#### Check Queue Status
```bash
GET /api/queue/status
```

Response:
```json
{
  "status": "success",
  "queue": {
    "queue_name": "ansible_execution_queue",
    "message_count": 5,
    "consumer_count": 1,
    "is_connected": true
  },
  "timestamp": "2024-01-01T12:00:00"
}
```

#### Control Queue Worker
```bash
POST /api/queue/control
Content-Type: application/json

{
  "action": "start"    # or "stop", "restart"
}
```

### Standalone Worker

You can run a standalone worker process independently:

```bash
cd backend
python worker.py
```

This is useful for:
- Scaling horizontally (run multiple workers)
- Processing messages when the main app is down
- Debugging queue issues

## API Changes

### Execute Endpoint

The `/api/execute` endpoint now queues requests instead of processing them immediately:

**Before**:
```json
{
  "message": "Started playbook execution on 2 host(s)",
  "task": {...},
  "hosts": ["host1", "host2"]
}
```

**After**:
```json
{
  "message": "Queued playbook execution on 2 host(s)",
  "task": {...},
  "hosts": ["host1", "host2"],
  "queued": true
}
```

### Task Status

Tasks now have additional status values:

- `queued`: Request is waiting in the queue
- `processing`: Worker is processing the request
- `running`: Ansible execution is running
- `completed`: Execution completed successfully
- `failed`: Execution failed

## Monitoring

### RabbitMQ Management UI

Access the RabbitMQ management interface at:
```
http://localhost:15672
```

Username: `ansible_user`
Password: `ansible_password`

### Health Check

The health endpoint now includes RabbitMQ status:

```bash
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "database": "connected",
  "rabbitmq": {
    "queue_name": "ansible_execution_queue",
    "message_count": 0,
    "consumer_count": 1,
    "is_connected": true
  }
}
```

## Error Handling

### Fallback Mechanism

If RabbitMQ is unavailable, the system falls back to immediate execution:

1. Try to queue the request
2. If queuing fails, execute immediately
3. Log the fallback for monitoring

### Message Acknowledgment

- Messages are acknowledged only after successful processing
- Failed messages are requeued for retry
- Messages have a TTL of 24 hours to prevent infinite loops

## Benefits

### Reliability
- **Message Persistence**: Messages survive server restarts
- **Acknowledgment**: Messages are only removed after successful processing
- **Retry Logic**: Failed messages are automatically requeued

### Scalability
- **Horizontal Scaling**: Run multiple worker instances
- **Load Distribution**: Work is distributed across available workers
- **Resource Management**: Prevents overwhelming the system

### Monitoring
- **Queue Metrics**: Monitor message count and processing rate
- **Health Checks**: Integrated health monitoring
- **Management UI**: Visual queue management interface

## Troubleshooting

### Common Issues

1. **RabbitMQ Connection Failed**
   - Check if RabbitMQ container is running
   - Verify environment variables
   - Check network connectivity

2. **Messages Not Processing**
   - Ensure worker is running
   - Check queue status
   - Verify message format

3. **High Message Count**
   - Scale up workers
   - Check for processing errors
   - Monitor system resources

### Logs

Check logs for debugging:

```bash
# Application logs
docker-compose logs backend

# RabbitMQ logs
docker-compose logs rabbitmq

# Worker logs (if running standalone)
tail -f backend/worker.log
```

## Future Enhancements

1. **Priority Queues**: Different priority levels for different types of requests
2. **Dead Letter Queues**: Handle messages that fail repeatedly
3. **Message Routing**: Route different types of requests to different queues
4. **Metrics Collection**: Collect detailed processing metrics
5. **Auto-scaling**: Automatically scale workers based on queue size
