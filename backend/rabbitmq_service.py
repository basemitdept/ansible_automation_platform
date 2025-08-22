import pika
import json
import threading
import time
import os
import logging
from datetime import datetime
from models import db, Task, ExecutionHistory, User

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RabbitMQService:
    def __init__(self):
        self.connection = None
        self.channel = None
        self.queue_name = 'ansible_execution_queue'
        self.exchange_name = 'ansible_execution_exchange'
        self.routing_key = 'ansible.execution'
        self.is_connected = False
        self.worker_thread = None
        self.should_stop = False
        
        # RabbitMQ configuration
        self.host = os.environ.get('RABBITMQ_HOST', 'localhost')
        self.port = int(os.environ.get('RABBITMQ_PORT', 5672))
        self.user = os.environ.get('RABBITMQ_USER', 'guest')
        self.password = os.environ.get('RABBITMQ_PASS', 'guest')
        self.vhost = os.environ.get('RABBITMQ_VHOST', '/')
        
    def connect(self):
        """Establish connection to RabbitMQ"""
        try:
            # Create connection parameters
            credentials = pika.PlainCredentials(self.user, self.password)
            parameters = pika.ConnectionParameters(
                host=self.host,
                port=self.port,
                virtual_host=self.vhost,
                credentials=credentials,
                heartbeat=600,
                blocked_connection_timeout=300
            )
            
            # Establish connection
            self.connection = pika.BlockingConnection(parameters)
            self.channel = self.connection.channel()
            
            # Declare exchange and queue
            self.channel.exchange_declare(
                exchange=self.exchange_name,
                exchange_type='direct',
                durable=True
            )
            
            self.channel.queue_declare(
                queue=self.queue_name,
                durable=True,
                arguments={
                    'x-message-ttl': 86400000,  # 24 hours in milliseconds
                    'x-max-length': 1000  # Maximum 1000 messages in queue
                }
            )
            
            self.channel.queue_bind(
                exchange=self.exchange_name,
                queue=self.queue_name,
                routing_key=self.routing_key
            )
            
            # Set QoS for fair dispatch
            self.channel.basic_qos(prefetch_count=1)
            
            self.is_connected = True
            logger.info(f"Successfully connected to RabbitMQ at {self.host}:{self.port}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {str(e)}")
            self.is_connected = False
            return False
    
    def disconnect(self):
        """Close RabbitMQ connection"""
        try:
            if self.channel:
                self.channel.close()
            if self.connection:
                self.connection.close()
            self.is_connected = False
            logger.info("Disconnected from RabbitMQ")
        except Exception as e:
            logger.error(f"Error disconnecting from RabbitMQ: {str(e)}")
    
    def publish_execution_request(self, execution_data):
        """Publish an execution request to the queue"""
        if not self.is_connected:
            if not self.connect():
                raise Exception("Cannot publish message: RabbitMQ not connected")
        
        try:
            # Add timestamp to the message
            execution_data['timestamp'] = datetime.utcnow().isoformat()
            execution_data['status'] = 'queued'
            
            message = json.dumps(execution_data)
            
            self.channel.basic_publish(
                exchange=self.exchange_name,
                routing_key=self.routing_key,
                body=message,
                properties=pika.BasicProperties(
                    delivery_mode=2,  # Make message persistent
                    content_type='application/json'
                )
            )
            
            logger.info(f"Published execution request to queue: {execution_data.get('task_id')}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to publish execution request: {str(e)}")
            return False
    
    def start_worker(self):
        """Start the worker thread to process queued messages"""
        if self.worker_thread and self.worker_thread.is_alive():
            logger.warning("Worker thread is already running")
            return
        
        self.should_stop = False
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()
        logger.info("Started RabbitMQ worker thread")
    
    def stop_worker(self):
        """Stop the worker thread"""
        self.should_stop = True
        if self.worker_thread:
            self.worker_thread.join(timeout=5)
        logger.info("Stopped RabbitMQ worker thread")
    
    def _worker_loop(self):
        """Main worker loop to process messages from the queue"""
        while not self.should_stop:
            try:
                if not self.is_connected:
                    if not self.connect():
                        logger.warning("Failed to connect to RabbitMQ, retrying in 5 seconds...")
                        time.sleep(5)
                        continue
                
                # Start consuming messages
                self.channel.basic_consume(
                    queue=self.queue_name,
                    on_message_callback=self._process_message,
                    auto_ack=False
                )
                
                logger.info("Started consuming messages from RabbitMQ queue")
                
                # Start consuming (this will block until connection is lost)
                self.channel.start_consuming()
                
            except pika.exceptions.AMQPConnectionError as e:
                logger.error(f"RabbitMQ connection lost: {str(e)}")
                self.is_connected = False
                time.sleep(5)  # Wait before reconnecting
                
            except Exception as e:
                logger.error(f"Error in worker loop: {str(e)}")
                time.sleep(5)
    
    def _process_message(self, ch, method, properties, body):
        """Process a single message from the queue"""
        try:
            # Parse the message
            execution_data = json.loads(body.decode('utf-8'))
            task_id = execution_data.get('task_id')
            
            logger.info(f"Processing execution request for task {task_id}")
            
            # Import here to avoid circular imports
            from app import app, socketio
            
            # Update task status to processing
            with app.app_context():
                task = Task.query.get(task_id)
                if task:
                    task.status = 'processing'
                    task.output = f"Processing queued request at {datetime.utcnow().isoformat()}"
                    db.session.commit()
                    
                    # Emit status update via WebSocket
                    socketio.emit('task_update', {
                        'task_id': str(task_id),
                        'status': 'processing',
                        'message': 'Processing queued request'
                    })
            
            # Process the execution
            success = self._execute_playbook(execution_data)
            
            if success:
                # Acknowledge the message
                ch.basic_ack(delivery_tag=method.delivery_tag)
                logger.info(f"Successfully processed task {task_id}")
            else:
                # Reject the message and requeue it
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
                logger.error(f"Failed to process task {task_id}, message requeued")
                
        except Exception as e:
            logger.error(f"Error processing message: {str(e)}")
            # Reject the message and requeue it
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
    
    def _execute_playbook(self, execution_data):
        """Execute the playbook with the given data"""
        try:
            task_id = execution_data['task_id']
            playbook_data = execution_data['playbook_data']
            host_data = execution_data['host_data']
            username = execution_data['username']
            password = execution_data['password']
            variables = execution_data.get('variables', {})
            is_webhook = execution_data.get('is_webhook', False)
            webhook_id = execution_data.get('webhook_id')
            
            # Import here to avoid circular imports
            from app import app, socketio, run_ansible_playbook_multi_host_safe, run_webhook_playbook
            
            # Update task status to running
            with app.app_context():
                task = Task.query.get(task_id)
                if task:
                    task.status = 'running'
                    task.started_at = datetime.utcnow()
                    db.session.commit()
                    
                    # Emit status update
                    execution_type = "webhook" if is_webhook else "manual"
                    socketio.emit('task_update', {
                        'task_id': str(task_id),
                        'status': 'running',
                        'message': f'Starting {execution_type} execution from queue'
                    })
            
            # Execute the playbook using the appropriate function
            if is_webhook:
                # Use webhook execution function
                run_webhook_playbook(
                    task_id, playbook_data, host_data, username, password, variables, webhook_id
                )
            else:
                # Use regular execution function
                run_ansible_playbook_multi_host_safe(
                    task_id, playbook_data, host_data, username, password, variables
                )
            
            return True
            
        except Exception as e:
            logger.error(f"Error executing playbook: {str(e)}")
            
            # Update task status to failed
            with app.app_context():
                task = Task.query.get(task_id)
                if task:
                    task.status = 'failed'
                    task.error_output = f"Queue execution failed: {str(e)}"
                    db.session.commit()
                    
                    # Emit failure status
                    socketio.emit('task_update', {
                        'task_id': str(task_id),
                        'status': 'failed',
                        'message': f'Queue execution failed: {str(e)}'
                    })
            
            return False
    
    def get_queue_status(self):
        """Get current queue status"""
        if not self.is_connected:
            return None
        
        try:
            # Declare queue to get its properties
            method = self.channel.queue_declare(
                queue=self.queue_name,
                durable=True,
                passive=True
            )
            
            return {
                'queue_name': self.queue_name,
                'message_count': method.method.message_count,
                'consumer_count': method.method.consumer_count,
                'is_connected': self.is_connected
            }
        except Exception as e:
            logger.error(f"Error getting queue status: {str(e)}")
            return None

# Global instance
rabbitmq_service = RabbitMQService()

def init_rabbitmq():
    """Initialize RabbitMQ service"""
    try:
        if rabbitmq_service.connect():
            rabbitmq_service.start_worker()
            logger.info("RabbitMQ service initialized successfully")
            return True
        else:
            logger.error("Failed to initialize RabbitMQ service")
            return False
    except Exception as e:
        logger.error(f"Error initializing RabbitMQ service: {str(e)}")
        return False

def cleanup_rabbitmq():
    """Cleanup RabbitMQ service"""
    try:
        rabbitmq_service.stop_worker()
        rabbitmq_service.disconnect()
        logger.info("RabbitMQ service cleaned up")
    except Exception as e:
        logger.error(f"Error cleaning up RabbitMQ service: {str(e)}")
