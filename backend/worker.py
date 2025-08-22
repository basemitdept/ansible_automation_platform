#!/usr/bin/env python3
"""
Standalone RabbitMQ Worker for Ansible Automation
This script can be run independently to process queued execution requests.
"""

import os
import sys
import time
import logging
import signal
from datetime import datetime

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from rabbitmq_service import RabbitMQService
from models import db, Task, Playbook, Host
from app import app, socketio, run_ansible_playbook_multi_host_safe

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('worker.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class StandaloneWorker:
    def __init__(self):
        self.rabbitmq_service = RabbitMQService()
        self.running = False
        
    def start(self):
        """Start the standalone worker"""
        logger.info("Starting standalone RabbitMQ worker...")
        
        # Set up signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        try:
            # Initialize RabbitMQ connection
            if not self.rabbitmq_service.connect():
                logger.error("Failed to connect to RabbitMQ")
                return False
            
            self.running = True
            logger.info("Worker started successfully")
            
            # Start processing messages
            self._process_messages()
            
        except KeyboardInterrupt:
            logger.info("Received interrupt signal, shutting down...")
        except Exception as e:
            logger.error(f"Worker error: {str(e)}")
        finally:
            self.stop()
    
    def stop(self):
        """Stop the worker"""
        logger.info("Stopping worker...")
        self.running = False
        self.rabbitmq_service.disconnect()
        logger.info("Worker stopped")
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info(f"Received signal {signum}, shutting down...")
        self.stop()
        sys.exit(0)
    
    def _process_messages(self):
        """Process messages from RabbitMQ queue"""
        logger.info("Starting message processing...")
        
        try:
            # Start consuming messages
            self.rabbitmq_service.channel.basic_consume(
                queue=self.rabbitmq_service.queue_name,
                on_message_callback=self._handle_message,
                auto_ack=False
            )
            
            logger.info("Waiting for messages...")
            
            # Start consuming (this will block until interrupted)
            while self.running:
                try:
                    self.rabbitmq_service.channel.start_consuming()
                except KeyboardInterrupt:
                    break
                except Exception as e:
                    logger.error(f"Error in message processing: {str(e)}")
                    if self.running:
                        time.sleep(5)  # Wait before retrying
                        
        except Exception as e:
            logger.error(f"Error starting message processing: {str(e)}")
    
    def _handle_message(self, ch, method, properties, body):
        """Handle a single message from the queue"""
        try:
            import json
            execution_data = json.loads(body.decode('utf-8'))
            task_id = execution_data.get('task_id')
            
            logger.info(f"Processing execution request for task {task_id}")
            
            # Process the execution within Flask app context
            with app.app_context():
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
            
            # Update task status to running
            task = Task.query.get(task_id)
            if task:
                task.status = 'running'
                task.started_at = datetime.utcnow()
                db.session.commit()
                
                # Emit status update via WebSocket
                socketio.emit('task_update', {
                    'task_id': str(task_id),
                    'status': 'running',
                    'message': 'Starting execution from standalone worker'
                })
            
            # Execute the playbook using the existing function
            run_ansible_playbook_multi_host_safe(
                task_id, playbook_data, host_data, username, password, variables
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Error executing playbook: {str(e)}")
            
            # Update task status to failed
            task = Task.query.get(task_id)
            if task:
                task.status = 'failed'
                task.error_output = f"Worker execution failed: {str(e)}"
                db.session.commit()
                
                # Emit failure status
                socketio.emit('task_update', {
                    'task_id': str(task_id),
                    'status': 'failed',
                    'message': f'Worker execution failed: {str(e)}'
                })
            
            return False

def main():
    """Main entry point"""
    print("=" * 60)
    print("Ansible Automation RabbitMQ Worker")
    print("=" * 60)
    
    # Check environment variables
    required_env_vars = ['DATABASE_URL', 'RABBITMQ_HOST']
    missing_vars = [var for var in required_env_vars if not os.environ.get(var)]
    
    if missing_vars:
        print(f"Error: Missing required environment variables: {missing_vars}")
        print("Please set the following environment variables:")
        for var in missing_vars:
            print(f"  - {var}")
        sys.exit(1)
    
    # Create and start worker
    worker = StandaloneWorker()
    
    try:
        worker.start()
    except KeyboardInterrupt:
        print("\nShutting down worker...")
    except Exception as e:
        print(f"Worker error: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    main()
