#!/bin/bash
set -e

# =============================================================================
# Local Agents — Installation complète Linux (zero to hero)
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[ OK ]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERRO]${NC} $1"; exit 1; }
log_step()    { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# =============================================================================
# DÉTECTION OS
# =============================================================================
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        OS_LIKE=$ID_LIKE
    else
        log_error "Impossible de détecter l'OS."
    fi
}

install_pkg() {
    case "$OS" in
        ubuntu|debian) sudo apt-get install -y -q "$@" ;;
        fedora)        sudo dnf install -y "$@" ;;
        arch|manjaro)  sudo pacman -S --noconfirm "$@" ;;
        *)
            if echo "$OS_LIKE" | grep -q "debian"; then
                sudo apt-get install -y -q "$@"
            else
                log_error "Distribution non supportée: $OS. Installe manuellement: $*"
            fi
            ;;
    esac
}

# =============================================================================
# BANNER
# =============================================================================
echo -e "${CYAN}"
echo "  ██╗      ██████╗  ██████╗ █████╗ ██╗      █████╗  ██████╗ ███████╗███╗   ██╗████████╗███████╗"
echo "  ██║     ██╔═══██╗██╔════╝██╔══██╗██║     ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██╔════╝"
echo "  ██║     ██║   ██║██║     ███████║██║     ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ███████╗"
echo "  ██║     ██║   ██║██║     ██╔══██║██║     ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ╚════██║"
echo "  ███████╗╚██████╔╝╚██████╗██║  ██║███████╗██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ███████║"
echo "  ╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝"
echo -e "${NC}"
echo -e "  Framework d'agents IA 100% local — Installation Linux\n"

# =============================================================================
# ÉTAPE 1 — PRÉREQUIS SYSTÈME
# =============================================================================
log_step "ÉTAPE 1/8 — Prérequis système"
detect_os
log_info "OS détecté : $OS"

sudo apt-get update -q 2>/dev/null || sudo dnf check-update -q 2>/dev/null || true

for pkg in git curl wget build-essential; do
    if ! command -v "$pkg" &>/dev/null; then
        log_info "Installation de $pkg..."
        install_pkg "$pkg"
    else
        log_success "$pkg déjà installé"
    fi
done

# =============================================================================
# ÉTAPE 2 — DOCKER
# =============================================================================
log_step "ÉTAPE 2/8 — Docker"

if command -v docker &>/dev/null; then
    log_success "Docker déjà installé : $(docker --version)"
else
    log_info "Installation de Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    log_success "Docker installé"
    log_warn "Reconnecte-toi (ou lance 'newgrp docker') pour utiliser Docker sans sudo"
fi

if ! docker compose version &>/dev/null; then
    log_info "Installation de Docker Compose plugin..."
    install_pkg docker-compose-plugin
fi
log_success "Docker Compose : $(docker compose version --short)"

# =============================================================================
# ÉTAPE 3 — GO
# =============================================================================
log_step "ÉTAPE 3/8 — Go"

if command -v go &>/dev/null; then
    log_success "Go déjà installé : $(go version)"
else
    log_info "Téléchargement de Go 1.22..."
    GO_VERSION="1.22.5"
    wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz
    sudo rm -rf /usr/local/go
    sudo tar -C /usr/local -xzf /tmp/go.tar.gz
    rm /tmp/go.tar.gz

    echo 'export PATH=$PATH:/usr/local/go/bin' >> "$HOME/.bashrc"
    echo 'export PATH=$PATH:/usr/local/go/bin' >> "$HOME/.profile"
    export PATH=$PATH:/usr/local/go/bin
    log_success "Go installé : $(go version)"
fi

# =============================================================================
# ÉTAPE 4 — PYTHON
# =============================================================================
log_step "ÉTAPE 4/8 — Python"

if command -v python3 &>/dev/null; then
    log_success "Python déjà installé : $(python3 --version)"
else
    log_info "Installation de Python 3..."
    install_pkg python3 python3-pip python3-venv
fi

# =============================================================================
# ÉTAPE 5 — JUST (task runner)
# =============================================================================
log_step "ÉTAPE 5/8 — Just"

if command -v just &>/dev/null; then
    log_success "Just déjà installé : $(just --version)"
else
    log_info "Installation de Just..."
    curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to /usr/local/bin
    log_success "Just installé"
fi

# =============================================================================
# ÉTAPE 6 — OLLAMA
# =============================================================================
log_step "ÉTAPE 6/8 — Ollama"

if command -v ollama &>/dev/null; then
    log_success "Ollama déjà installé"
else
    log_info "Installation d'Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
    log_success "Ollama installé"
fi

# Démarrer Ollama en arrière-plan si pas actif
if ! curl -s http://localhost:11434/api/tags &>/dev/null; then
    log_info "Démarrage d'Ollama..."
    ollama serve &>/dev/null &
    sleep 5
fi

# =============================================================================
# ÉTAPE 7 — CLONE & CONFIG
# =============================================================================
log_step "ÉTAPE 7/8 — Projet & Configuration"

INSTALL_DIR="$HOME/local-agents"

if [ -d "$INSTALL_DIR" ]; then
    log_warn "Dossier $INSTALL_DIR déjà existant — mise à jour..."
    cd "$INSTALL_DIR"
    git pull
else
    log_info "Clonage du projet..."
    git clone https://github.com/loic31000/local-agents.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Fichier .env
if [ ! -f ".env" ]; then
    cp .env.example .env
    log_success ".env créé depuis .env.example"
fi

echo ""
echo -e "${YELLOW}━━━ Configuration des tokens (optionnel — Entrée pour ignorer) ━━━${NC}"

read -rp "  DISCORD_TOKEN (bot Jarvis) : " DISCORD_TOKEN_INPUT
read -rp "  CYBERDEFENCE_DISCORD_WEBHOOK : " WEBHOOK_INPUT

if [ -n "$DISCORD_TOKEN_INPUT" ]; then
    sed -i "s|^DISCORD_TOKEN=.*|DISCORD_TOKEN=$DISCORD_TOKEN_INPUT|" .env
    log_success "DISCORD_TOKEN configuré"
fi

if [ -n "$WEBHOOK_INPUT" ]; then
    sed -i "s|^CYBERDEFENCE_DISCORD_WEBHOOK=.*|CYBERDEFENCE_DISCORD_WEBHOOK=$WEBHOOK_INPUT|" .env
    log_success "CYBERDEFENCE_DISCORD_WEBHOOK configuré"
fi

# GPU detection
log_info "Détection GPU..."
if command -v nvidia-smi &>/dev/null; then
    log_success "GPU NVIDIA détecté — activation CUDA"
    sed -i "s|^GPU_ENABLED=.*|GPU_ENABLED=true|" .env
    sed -i "s|^GPU_TYPE=.*|GPU_TYPE=nvidia|" .env
elif command -v rocm-smi &>/dev/null; then
    log_success "GPU AMD détecté — activation ROCm"
    sed -i "s|^GPU_ENABLED=.*|GPU_ENABLED=true|" .env
    sed -i "s|^GPU_TYPE=.*|GPU_TYPE=amd|" .env
else
    log_warn "Pas de GPU détecté — mode CPU"
fi

# =============================================================================
# ÉTAPE 8 — LANCEMENT
# =============================================================================
log_step "ÉTAPE 8/8 — Lancement"

log_info "Build et démarrage des containers Docker..."
docker compose up -d --build

log_info "Attente démarrage des services (20s)..."
sleep 20

log_info "Téléchargement du modèle par défaut (llama3.2:latest)..."
docker compose exec ollama ollama pull llama3.2:latest || \
    log_warn "Pull échoué — lance manuellement : docker compose exec ollama ollama pull llama3.2:latest"

# =============================================================================
# VÉRIFICATION FINALE
# =============================================================================
echo ""
echo -e "${CYAN}━━━ VÉRIFICATION FINALE ━━━${NC}"

check_service() {
    local name=$1
    local url=$2
    if curl -s "$url" &>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $name"
    else
        echo -e "  ${RED}✗${NC} $name — vérifier avec : docker compose logs"
    fi
}

check_service "Orchestrateur" "http://localhost:8081/api/health"
check_service "CyberDefence"  "http://localhost:8086/health"
check_service "Ollama"        "http://localhost:11434/api/tags"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ Local Agents installé avec succès !${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  🌐 Dashboard  : ${CYAN}http://localhost:8081${NC}"
echo -e "  🛡️  CyberDefence : ${CYAN}http://localhost:8086/status${NC}"
echo -e "  📁 Projet     : ${CYAN}$INSTALL_DIR${NC}"
echo ""
echo -e "  Commandes utiles :"
echo -e "    cd $INSTALL_DIR"
echo -e "    just status       # état des services"
echo -e "    just logs         # logs en direct"
echo -e "    just test-api     # tests API"
echo -e "    just security-status  # état CyberDefence"
echo ""
