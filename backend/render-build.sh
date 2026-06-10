#!/bin/bash
set -e

echo "Building AutoMaintainer backend..."

# ============================================
# Rust/Cargo Configuration for Render
# ============================================
export CARGO_HOME=/opt/render/project/src/.cargo
export CARGO_TARGET_DIR=/opt/render/project/src/.cargo/target
export PATH="$CARGO_HOME/bin:$PATH"

# Create writable cargo directory
mkdir -p $CARGO_HOME

# Install Rust toolchain if not available
if ! command -v cargo &> /dev/null; then
    echo "Installing Rust toolchain..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env 2>/dev/null || true
fi

echo "Rust version: $(rustc --version 2>/dev/null || echo 'not available')"
echo "Cargo version: $(cargo --version 2>/dev/null || echo 'not available')"

# ============================================
# Python Dependencies
# ============================================
echo "Installing Python dependencies..."
# Enable PyO3 ABI3 compatibility for newer Python versions like 3.14
# This suppresses the PyO3 version check and allows pydantic-core to build
export PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1
# Upgrade pip first
pip install --upgrade pip

# Install requirements with verbose output for debugging
pip install -r requirements.txt -v

# ============================================
# Post-Install Verification
# ============================================
echo "Verifying installations..."
python -c "import pydantic; print(f'Pydantic: {pydantic.__version__}')"
python -c "import tree_sitter; print('Tree-sitter: OK')"

echo "Backend build completed successfully!"
