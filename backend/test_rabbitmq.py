#!/usr/bin/env python3
"""
Test script for RabbitMQ integration
This script tests the RabbitMQ connection and message publishing/consuming.
"""

import os
import sys
import json
import time
from datetime import datetime

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from rabbitmq_service import RabbitMQService

def test_rabbitmq_connection():
    """Test RabbitMQ connection"""
    print("Testing RabbitMQ connection...")
    
    service = RabbitMQService()
    
    try:
        if service.connect():
            print("✅ RabbitMQ connection successful")
            
            # Test queue status
            status = service.get_queue_status()
            if status:
                print(f"✅ Queue status: {status}")
            else:
                print("⚠️ Could not get queue status")
            
            service.disconnect()
            return True
        else:
            print("❌ RabbitMQ connection failed")
            return False
    except Exception as e:
        print(f"❌ RabbitMQ connection error: {str(e)}")
        return False

def test_message_publishing():
    """Test message publishing"""
    print("\nTesting message publishing...")
    
    service = RabbitMQService()
    
    try:
        if not service.connect():
            print("❌ Cannot test publishing - connection failed")
            return False
        
        # Create a test message
        test_data = {
            'task_id': 999,
            'playbook_data': {
                'id': 1,
                'name': 'test-playbook',
                'content': '---\n- hosts: localhost\n  tasks:\n    - name: Test task\n      debug:\n        msg: "Hello World"',
                'os_type': 'linux'
            },
            'host_data': [],
            'username': 'test-user',
            'password': None,
            'variables': {},
            'user_id': 'test-user-id'
        }
        
        # Publish the message
        if service.publish_execution_request(test_data):
            print("✅ Message published successfully")
            
            # Wait a moment and check queue status
            time.sleep(1)
            status = service.get_queue_status()
            if status and status.get('message_count', 0) > 0:
                print(f"✅ Message found in queue: {status}")
            else:
                print("⚠️ Message not found in queue")
            
            service.disconnect()
            return True
        else:
            print("❌ Message publishing failed")
            service.disconnect()
            return False
            
    except Exception as e:
        print(f"❌ Message publishing error: {str(e)}")
        service.disconnect()
        return False

def test_worker_startup():
    """Test worker startup (without actually processing messages)"""
    print("\nTesting worker startup...")
    
    service = RabbitMQService()
    
    try:
        if not service.connect():
            print("❌ Cannot test worker - connection failed")
            return False
        
        # Start worker
        service.start_worker()
        print("✅ Worker started successfully")
        
        # Wait a moment
        time.sleep(2)
        
        # Stop worker
        service.stop_worker()
        print("✅ Worker stopped successfully")
        
        service.disconnect()
        return True
        
    except Exception as e:
        print(f"❌ Worker test error: {str(e)}")
        service.disconnect()
        return False

def main():
    """Main test function"""
    print("=" * 60)
    print("RabbitMQ Integration Test")
    print("=" * 60)
    
    # Check environment variables
    required_vars = ['RABBITMQ_HOST', 'RABBITMQ_USER', 'RABBITMQ_PASS']
    missing_vars = [var for var in required_vars if not os.environ.get(var)]
    
    if missing_vars:
        print(f"❌ Missing environment variables: {missing_vars}")
        print("Please set the required environment variables:")
        for var in missing_vars:
            print(f"  export {var}=<value>")
        return False
    
    print(f"RabbitMQ Host: {os.environ.get('RABBITMQ_HOST')}")
    print(f"RabbitMQ User: {os.environ.get('RABBITMQ_USER')}")
    print(f"RabbitMQ Port: {os.environ.get('RABBITMQ_PORT', '5672')}")
    print()
    
    # Run tests
    tests = [
        ("Connection Test", test_rabbitmq_connection),
        ("Message Publishing Test", test_message_publishing),
        ("Worker Startup Test", test_worker_startup)
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"Running {test_name}...")
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {str(e)}")
            results.append((test_name, False))
        print()
    
    # Print summary
    print("=" * 60)
    print("Test Results Summary")
    print("=" * 60)
    
    passed = 0
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name}: {status}")
        if result:
            passed += 1
    
    print()
    print(f"Overall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! RabbitMQ integration is working correctly.")
        return True
    else:
        print("⚠️ Some tests failed. Please check the configuration and try again.")
        return False

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
