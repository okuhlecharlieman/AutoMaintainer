#!/bin/bash
# Render start script for AutoMaintainer backend

set -e

echo "Starting AutoMaintainer backend..."

# If no explicit .env exists, copy the deploy template into place.
if [ ! -f .env ] && [ -f .env.render ]; then
  cp .env.render .env
  echo "Loaded .env from .env.render"
fi

# Start the FastAPI app with uvicorn
uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"

echo "Backend started successfully!"
