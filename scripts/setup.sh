#!/bin/bash

# =============================================================================
# Local Agents - Script d'installation et de démarrage
# =============================================================================

set -e

# Répertoire du projet
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonctions utilitaires
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================
# 🔐 CHARGER LE FICHIER .env
# ============================================
load_env() {
    if [ -f "$PROJECT_DIR/.env" ]; then
        log_info "Chargement de .env..."
        set -a
        source "$PROJECT_DIR/.env"
        set +a
        log_success "Variables d'environnement chargées"
    else
        if [ -f "$PROJECT_DIR/.env.example" ]; then
            log_warn ".env non trouvé !"
            log_warn "Copie .env.example vers .env et configure tes tokens :"
            log_warn "  cp .env.example .env"
            log_warn "  nano .env"
        fi
    fi
}

# Charger .env au démarrage
load_env

# Vérifier les prérequis
check_prerequisites() {
    log_info "Vérification des prérequis..."
    
    # Go
    if command -v go &> /dev/null; then
        GO_VERSION=$(go version | awk '{print $3}')
        log_success "Go installé: $GO_VERSION"
    else
        log_error "Go n'est pas installé. Installe-le depuis https://go.dev/dl/"
        exit 1
    fi
    
    # Python
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 --version)
        log_success "Python installé: $PYTHON_VERSION"
    else
        log_error "Python 3 n'est pas installé"
        exit 1
    fi
    
    # Ollama
    if command -v ollama &> /dev/null; then
        log_success "Ollama installé"
    else
        log_warn "Ollama n'est pas installé"
        echo ""
        echo "Pour installer Ollama:"
        echo "  Linux/macOS: curl -fsSL https://ollama.com/install.sh | sh"
        echo "  Windows: Télécharge depuis https://ollama.com/download"
        echo ""
        read -p "Continuer sans Ollama? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Installer les dépendances Go
install_go_deps() {
    log_info "Installation des dépendances Go..."
    
    go mod download
    go mod tidy
    
    log_success "Dépendances Go installées"
}

# Installer les dépendances Python
install_python_deps() {
    log_info "Installation des dépendances Python..."
    
    # Créer un virtualenv si nécessaire
    if [ ! -d "venv" ]; then
        python3 -m venv venv
        log_success "Virtualenv créé"
    fi
    
    # Activer et installer
    source venv/bin/activate
    pip install --upgrade pip
    pip install aiohttp websockets discord.py python-dotenv
    
    log_success "Dépendances Python installées"
}

# Télécharger les modèles Ollama
download_models() {
    log_info "Téléchargement des modèles Ollama..."
    
    if ! command -v ollama &> /dev/null; then
        log_warn "Ollama non disponible, skip des modèles"
        return
    fi
    
    # Vérifier si Ollama tourne
    if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        log_warn "Ollama n'est pas démarré. Lance 'ollama serve' d'abord."
        return
    fi
    
    # Modèles à télécharger
    MODELS=("llama3.2:3b" "phi3:mini")
    
    for model in "${MODELS[@]}"; do
        log_info "Téléchargement de $model..."
        ollama pull "$model" || log_warn "Échec du téléchargement de $model"
    done
    
    log_success "Modèles téléchargés"
}

# Créer les dossiers nécessaires
create_directories() {
    log_info "Création des dossiers..."
    
    mkdir -p data logs bin
    
    log_success "Dossiers créés"
}

# Compiler l'orchestrateur
build_orchestrator() {
    log_info "Compilation de l'orchestrateur..."
    
    mkdir -p bin
    go build -o bin/orchestrator ./cmd/orchestrator
    
    log_success "Orchestrateur compilé: bin/orchestrator"
}

# Démarrer l'orchestrateur
start_orchestrator() {
    log_info "Démarrage de l'orchestrateur..."
    
    ./bin/orchestrator &
    ORCHESTRATOR_PID=$!
    
    # Attendre qu'il soit prêt
    sleep 2
    
    if curl -s http://localhost:8080/api/health > /dev/null; then
        log_success "Orchestrateur démarré (PID: $ORCHESTRATOR_PID)"
        echo $ORCHESTRATOR_PID > .orchestrator.pid
    else
        log_error "L'orchestrateur n'a pas démarré correctement"
        kill $ORCHESTRATOR_PID 2>/dev/null
        exit 1
    fi
}

# Démarrer le bot Discord
start_discord_bot() {
    if [ -z "$DISCORD_BOT_TOKEN" ]; then
        log_warn "DISCORD_BOT_TOKEN non défini, bot Discord non démarré"
        log_warn "Configure ton token dans .env ou avec: export DISCORD_BOT_TOKEN='...'"
        return
    fi
    
    log_info "Démarrage du bot Discord..."
    
    source venv/bin/activate
    python agents/discord/bot.py &
    DISCORD_PID=$!
    
    echo $DISCORD_PID > .discord.pid
    log_success "Bot Discord démarré (PID: $DISCORD_PID)"
}

# Arrêter tous les services
stop_all() {
    log_info "Arrêt des services..."
    
    if [ -f .orchestrator.pid ]; then
        kill $(cat .orchestrator.pid) 2>/dev/null || true
        rm .orchestrator.pid
        log_success "Orchestrateur arrêté"
    fi
    
    if [ -f .discord.pid ]; then
        kill $(cat .discord.pid) 2>/dev/null || true
        rm .discord.pid
        log_success "Bot Discord arrêté"
    fi
}

# Afficher l'aide
show_help() {
    echo "Local Agents - Script d'installation et de gestion"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  install     Installer toutes les dépendances"
    echo "  build       Compiler l'orchestrateur"
    echo "  start       Démarrer tous les services"
    echo "  stop        Arrêter tous les services"
    echo "  restart     Redémarrer tous les services"
    echo "  status      Afficher le statut des services"
    echo "  logs        Afficher les logs"
    echo "  models      Télécharger les modèles Ollama"
    echo "  help        Afficher cette aide"
    echo ""
    echo "Configuration:"
    echo "  Copie .env.example vers .env et configure tes tokens."
    echo "  Le fichier .env est automatiquement chargé au démarrage."
    echo ""
}

# Afficher le statut
show_status() {
    echo ""
    echo "=== Statut des services ==="
    echo ""
    
    # Ollama
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo -e "Ollama:        ${GREEN}●${NC} En ligne"
        
        # Lister les modèles
        models=$(curl -s http://localhost:11434/api/tags | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | tr '\n' ', ' | sed 's/,$//')
        echo -e "  Modèles:     $models"
    else
        echo -e "Ollama:        ${RED}●${NC} Hors ligne"
    fi
    
    # Orchestrateur
    if curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
        echo -e "Orchestrateur: ${GREEN}●${NC} En ligne (http://localhost:8080)"
        
        # Nombre d'agents
        agents=$(curl -s http://localhost:8080/api/health | grep -o '"agents":[0-9]*' | cut -d':' -f2)
        echo -e "  Agents:      $agents"
    else
        echo -e "Orchestrateur: ${RED}●${NC} Hors ligne"
    fi
    
    # Bot Discord
    if [ -f .discord.pid ] && kill -0 $(cat .discord.pid) 2>/dev/null; then
        echo -e "Bot Discord:   ${GREEN}●${NC} En ligne"
    else
        echo -e "Bot Discord:   ${YELLOW}●${NC} Non démarré"
    fi
    
    # Variables d'environnement
    echo ""
    echo "=== Configuration ==="
    if [ -n "$DISCORD_BOT_TOKEN" ]; then
        echo -e "DISCORD_BOT_TOKEN: ${GREEN}●${NC} Configuré"
    else
        echo -e "DISCORD_BOT_TOKEN: ${RED}●${NC} Non configuré"
    fi
    
    echo ""
}

# Main
case "${1:-help}" in
    install)
        check_prerequisites
        create_directories
        install_go_deps
        install_python_deps
        log_success "Installation terminée!"
        echo ""
        echo "Prochaines étapes:"
        echo "  1. Copie la config:  cp .env.example .env"
        echo "  2. Édite .env:       nano .env"
        echo "  3. Lance Ollama:     ollama serve"
        echo "  4. Télécharge modèles: $0 models"
        echo "  5. Compile:          $0 build"
        echo "  6. Démarre:          $0 start"
        ;;
    build)
        build_orchestrator
        ;;
    start)
        start_orchestrator
        start_discord_bot
        echo ""
        echo "Interface web: http://localhost:8080"
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all
        sleep 1
        start_orchestrator
        start_discord_bot
        ;;
    status)
        show_status
        ;;
    logs)
        if [ -f logs/agents.log ]; then
            tail -f logs/agents.log
        else
            log_warn "Pas de fichier de logs trouvé"
        fi
        ;;
    models)
        download_models
        ;;
    help|*)
        show_help
        ;;
esac
