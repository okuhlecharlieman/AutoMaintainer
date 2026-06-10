#!/bin/bash
# Render build script for AutoMaintainer frontend

echo "Building AutoMaintainer frontend..."

# Install dependencies
npm install

# Build the Next.js app
npm run build

echo "Frontend build completed successfully!"