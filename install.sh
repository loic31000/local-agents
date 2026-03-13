#!/bin/bash

# =============================================================================
# Local Agents - One-liner installer
# =============================================================================
# This script detects your platform and installs missing dependencies:
# - Go 1.22+
# - Python 3.10+
# - Ollama
# - just (command runner)
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[!]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Linux)
            if [ -f /etc/os-release ]; then
                . /etc/os-release
                OS="$ID"
                VERSION="$VERSION_ID"
            else
                OS="linux"
            fi
            ;;
        Darwin)
            OS="macos"
            ;;
        *)
            log_error "Unsupported OS: $(uname -s)"
            exit 1
            ;;
    esac
    log_info "Detected OS: $OS"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install Go
install_go() {
    if command_exists go; then
        GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
        if [ "$(printf '%s\n' "$GO_VERSION" "1.22" | sort -V | head -n1)" = "1.22" ]; then
            log_success "Go $GO_VERSION is already installed"
            return
        fi
    fi

    log_info "Installing Go 1.22+..."

    case "$OS" in
        ubuntu|debian)
            sudo apt update
            sudo apt install -y wget
            ;;
        fedora|centos|rhel)
            sudo dnf install -y wget || sudo yum install -y wget
            ;;
        arch)
            sudo pacman -S --noconfirm wget
            ;;
        macos)
            if ! command_exists brew; then
                log_info "Installing Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi
            ;;
    esac

    # Download and install Go
    GO_VERSION="1.22.0"
    GO_TAR="go${GO_VERSION}.$(uname -s | tr '[:upper:]' '[:lower:]')-amd64.tar.gz"
    GO_URL="https://go.dev/dl/${GO_TAR}"

    log_info "Downloading Go $GO_VERSION..."
    wget -q "$GO_URL" -O "/tmp/$GO_TAR"

    log_info "Installing Go..."
    sudo rm -rf /usr/local/go
    sudo tar -C /usr/local -xzf "/tmp/$GO_TAR"
    rm "/tmp/$GO_TAR"

    # Add to PATH
    if ! grep -q "/usr/local/go/bin" ~/.bashrc; then
        echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
        echo 'export PATH=$PATH:~/go/bin' >> ~/.bashrc
    fi
    export PATH=$PATH:/usr/local/go/bin

    log_success "Go installed: $(go version)"
}

# Install Python
install_python() {
    if command_exists python3; then
        PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
        if [ "$(printf '%s\n' "$PYTHON_VERSION" "3.10" | sort -V | head -n1)" = "3.10" ]; then
            log_success "Python $PYTHON_VERSION is already installed"
            return
        fi
    fi

    log_info "Installing Python 3.10+..."

    case "$OS" in
        ubuntu|debian)
            sudo apt update
            sudo apt install -y python3 python3-pip python3-venv
            ;;
        fedora|centos|rhel)
            sudo dnf install -y python3 python3-pip || sudo yum install -y python3 python3-pip
            ;;
        arch)
            sudo pacman -S --noconfirm python python-pip
            ;;
        macos)
            if command_exists brew; then
                brew install python3
            else
                log_error "Homebrew not found. Please install Python manually."
                exit 1
            fi
            ;;
    esac

    log_success "Python installed: $(python3 --version)"
}

# Install Ollama
install_ollama() {
    if command_exists ollama; then
        log_success "Ollama is already installed"
        return
    fi

    log_info "Installing Ollama..."

    case "$OS" in
        linux|ubuntu|debian|fedora|centos|rhel|arch)
            curl -fsSL https://ollama.com/install.sh | sh
            ;;
        macos)
            if command_exists brew; then
                brew install ollama
            else
                curl -fsSL https://ollama.com/install.sh | sh
            fi
            ;;
    esac

    log_success "Ollama installed"
}

# Install just
install_just() {
    if command_exists just; then
        log_success "just is already installed"
        return
    fi

    log_info "Installing just (command runner)..."

    # Install just using the official installer
    curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to ~/.local/bin

    # Add to PATH
    if ! grep -q "~/.local/bin" ~/.bashrc; then
        echo 'export PATH=$PATH:~/.local/bin' >> ~/.bashrc
    fi
    export PATH=$PATH:~/.local/bin

    log_success "just installed: $(just --version)"
}

# Main installation
main() {
    echo "========================================"
    echo "🤖 Local Agents - One-liner Installer"
    echo "========================================"
    echo ""

    detect_os

    echo ""
    log_info "Checking and installing dependencies..."
    echo ""

    install_go
    install_python
    install_ollama
    install_just

    echo ""
    log_success "All dependencies installed!"
    echo ""
    echo "Next steps:"
    echo "1. Clone the repository:"
    echo "   git clone https://github.com/loic31000/local-agents.git"
    echo "   cd local-agents"
    echo ""
    echo "2. Configure your environment:"
    echo "   cp .env.example .env"
    echo "   nano .env  # Add your Discord token"
    echo ""
    echo "3. Setup and start:"
    echo "   just setup"
    echo "   just start"
    echo ""
    echo "4. Open your browser:"
    echo "   http://localhost:8080"
    echo ""
    echo "For help: just --list"
}

# Run main
main "$@"