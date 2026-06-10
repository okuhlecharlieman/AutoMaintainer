#!/bin/bash
# Render build script for AutoMaintainer backend

echo "Building AutoMaintainer backend..."

# Install Python dependencies
pip install -r requirements.txt

echo "Backend build completed successfully!"