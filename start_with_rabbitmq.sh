#!/bin/bash

# Ansible Automation with RabbitMQ Startup Script
# This script starts the complete system with RabbitMQ integration

set -e

echo "=================================================="
echo "Ansible Automation with RabbitMQ Integration"
echo "=================================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install it and try again."
    exit 1
fi

echo "✅ Docker and docker-compose are available"

# Stop any existing containers
echo "🛑 Stopping any existing containers..."
docker-compose down

# Start all services
echo "🚀 Starting all services with RabbitMQ..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."

# Wait for PostgreSQL
echo "   Waiting for PostgreSQL..."
until docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
    sleep 2
done
echo "   ✅ PostgreSQL is ready"

# Wait for RabbitMQ
echo "   Waiting for RabbitMQ..."
until docker-compose exec -T rabbitmq rabbitmq-diagnostics ping > /dev/null 2>&1; do
    sleep 2
done
echo "   ✅ RabbitMQ is ready"

# Wait for backend
echo "   Waiting for backend..."
until curl -s http://localhost:5003/api/health > /dev/null 2>&1; do
    sleep 2
done
echo "   ✅ Backend is ready"

# Wait for frontend
echo "   Waiting for frontend..."
until curl -s http://localhost:3000 > /dev/null 2>&1; do
    sleep 2
done
echo "   ✅ Frontend is ready"

echo ""
echo "🎉 All services are running!"
echo ""
echo "📋 Service URLs:"
echo "   Frontend:     http://localhost:3000"
echo "   Backend API:  http://localhost:5003"
echo "   RabbitMQ UI:  http://localhost:15672"
echo "   Nginx:        http://localhost:80"
echo ""
echo "🔑 RabbitMQ Management:"
echo "   Username: ansible_user"
echo "   Password: ansible_password"
echo ""
echo "📊 Health Check:"
echo "   curl http://localhost:5003/api/health"
echo ""
echo "📋 Queue Status:"
echo "   curl http://localhost:5003/api/queue/status"
echo ""
echo "🛑 To stop all services:"
echo "   docker-compose down"
echo ""
echo "📖 For more information, see RABBITMQ_INTEGRATION.md"
echo ""

# Show current status
echo "📊 Current System Status:"
echo "=================================================="

# Check health
echo "Health Check:"
curl -s http://localhost:5003/api/health | jq '.' 2>/dev/null || curl -s http://localhost:5003/api/health

echo ""
echo "Queue Status:"
curl -s http://localhost:5003/api/queue/status | jq '.' 2>/dev/null || curl -s http://localhost:5003/api/queue/status

echo ""
echo "=================================================="
echo "✅ System is ready to use!"
echo "=================================================="
