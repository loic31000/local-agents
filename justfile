# Local Agents - Command runner
# ============================

# Default recipe (help)
default:
    @just --list

# Install all dependencies
install:
    ./scripts/setup.sh install

# Build the orchestrator
build:
    ./scripts/setup.sh build

# Start all services
start:
    ./scripts/setup.sh start

# Stop all services
stop:
    ./scripts/setup.sh stop

# Restart all services
restart:
    ./scripts/setup.sh restart

# Show status
status:
    ./scripts/setup.sh status

# Show logs
logs:
    ./scripts/setup.sh logs

# Download Ollama models
models:
    ./scripts/setup.sh models

# Clean build artifacts
clean:
    rm -rf bin/ venv/ data/ logs/ .orchestrator.pid .discord.pid

# Full setup (install + build + models)
setup: install build models

# Run in development mode (with auto-restart)
dev:
    #!/usr/bin/env bash
    echo "Starting in development mode..."
    echo "Press Ctrl+C to stop"
    trap 'just stop' INT
    just start
    wait

# Test the installation
test:
    #!/usr/bin/env bash
    echo "Testing installation..."
    go version
    python3 --version
    ollama --version 2>/dev/null || echo "Ollama not installed"
    echo "Build test:"
    go build -o /tmp/orchestrator-test ./cmd/orchestrator && echo "✓ Go build successful" && rm /tmp/orchestrator-test
    echo "✓ All tests passed"