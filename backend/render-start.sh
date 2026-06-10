#!/bin/bash
# Render start script for AutoMaintainer backend

echo "Starting AutoMaintainer backend..."

# Start the FastAPI app with uvicorn
uvicorn main:app --host 0.0.0.0 --port $PORT

echo "Backend started successfully!"