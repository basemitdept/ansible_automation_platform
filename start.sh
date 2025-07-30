#!/bin/bash

echo "🚀 Starting Ansible Automation Platform..."

# Stop any existing containers
echo "Stopping existing containers..."
docker-compose down -v

echo "Building and starting services..."
docker-compose up --build -d

echo "Waiting for services to start..."
sleep 10

echo "Checking service status..."
docker-compose ps

echo "🎉 Application should be available at: http://localhost"
echo ""
echo "Services:"
echo "- Frontend: http://localhost"
echo "- Backend API: http://localhost/api"
echo "- Database: localhost:5432"
echo ""
echo "To view logs, run:"
echo "  docker-compose logs -f [service-name]"
echo ""
echo "Available services: postgres, backend, frontend, nginx" 