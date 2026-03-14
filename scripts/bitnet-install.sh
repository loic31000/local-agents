#!/usr/bin/env bash
# =============================================================================
# BitNet Install — microsoft/bitnet-b1.58-2B-4T
# Compatible Linux (Ubuntu/Debian) et macOS
# =============================================================================
set -euo pipefail

BITNET_DIR="$HOME/.local-agents/models/bitnet"
MODEL_ID="microsoft/bitnet-b1.58-2B-4T"
BITNET_REPO="https://github.com/microsoft/BitNet"
LOG_FILE="/tmp/bitnet-install.log"

# ── Couleurs ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()    { echo -e "\n${BOLD}━━━ $* ${NC}"; }

# ── Header ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ██████╗ ██╗████████╗███╗   ██╗███████╗████████╗"
echo "  ██╔══██╗██║╚══██╔══╝████╗  ██║██╔════╝╚══██╔══╝"
echo "  ██████╔╝██║   ██║   ██╔██╗ ██║█████╗     ██║   "
echo "  ██╔══██╗██║   ██║   ██║╚██╗██║██╔══╝     ██║   "
echo "  ██████╔╝██║   ██║   ██║ ╚████║███████╗   ██║   "
echo "  ╚═════╝ ╚═╝   ╚═╝   ╚═╝  ╚═══╝╚══════╝   ╚═╝   "
echo -e "${NC}"
echo -e "  Modèle  : ${GREEN}${MODEL_ID}${NC}"
echo -e "  Dossier : ${BLUE}${BITNET_DIR}${NC}"
echo -e "  Perf    : ~1-2s/réponse | 1.2GB RAM | 6x vs Ollama\n"

# ── Détection OS ──────────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"
info "OS : $OS / Arch : $ARCH"

# ── Prérequis ─────────────────────────────────────────────────────────────────
step "Vérification des prérequis"

check_cmd() {
    if command -v "$1" &>/dev/null; then
        ok "$1 trouvé"
    else
        warn "$1 manquant — installation..."
        if [[ "$OS" == "Linux" ]]; then
            sudo apt-get install -y "$2" >> "$LOG_FILE" 2>&1 || warn "Impossible d'installer $2, continuons"
        elif [[ "$OS" == "Darwin" ]]; then
            brew install "$2" >> "$LOG_FILE" 2>&1 || warn "Impossible d'installer $2 via brew"
        fi
    fi
}

check_cmd python3  python3
check_cmd pip3     python3-pip
check_cmd git      git
check_cmd cmake    cmake

# Python version check
PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
info "Python version : $PYTHON_VERSION"
python3 -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" || \
    error "Python 3.10+ requis (actuel: $PYTHON_VERSION)"

# ── Dossier modèle ────────────────────────────────────────────────────────────
step "Préparation du dossier"
mkdir -p "$BITNET_DIR"
ok "Dossier créé : $BITNET_DIR"

# ── Installation Python bindings ──────────────────────────────────────────────
step "Installation des dépendances Python"

# huggingface_hub pour télécharger le modèle
pip3 install --quiet huggingface_hub >> "$LOG_FILE" 2>&1
ok "huggingface_hub installé"

# Essai d'installation du package bitnet officiel
info "Tentative installation package bitnet..."
if pip3 install --quiet bitnet >> "$LOG_FILE" 2>&1; then
    ok "Package bitnet installé"
    BITNET_BACKEND="python"
else
    warn "Package bitnet non disponible via pip — fallback sur llama.cpp"

    # Installer llama-cpp-python (compatible avec les modèles BitNet GGUF)
    info "Installation llama-cpp-python..."

    # Détection GPU pour compilation
    if command -v nvcc &>/dev/null; then
        info "CUDA détecté — compilation avec support NVIDIA"
        CMAKE_ARGS="-DLLAMA_CUDA=on" pip3 install --quiet llama-cpp-python >> "$LOG_FILE" 2>&1
    elif [[ "$OS" == "Darwin" ]] && [[ "$ARCH" == "arm64" ]]; then
        info "Apple Silicon détecté — compilation avec Metal"
        CMAKE_ARGS="-DLLAMA_METAL=on" pip3 install --quiet llama-cpp-python >> "$LOG_FILE" 2>&1
    else
        info "CPU only — compilation standard"
        pip3 install --quiet llama-cpp-python >> "$LOG_FILE" 2>&1
    fi

    if pip3 show llama-cpp-python &>/dev/null; then
        ok "llama-cpp-python installé"
        BITNET_BACKEND="llamacpp"
    else
        error "Impossible d'installer llama-cpp-python. Voir $LOG_FILE"
    fi
fi

# ── Téléchargement du modèle ──────────────────────────────────────────────────
step "Téléchargement du modèle ${MODEL_ID}"

MODEL_MARKER="$BITNET_DIR/.downloaded"

if [[ -f "$MODEL_MARKER" ]]; then
    ok "Modèle déjà téléchargé (supprimer $MODEL_MARKER pour forcer)"
else
    info "Téléchargement depuis HuggingFace (peut prendre quelques minutes)..."
    python3 << PYEOF
from huggingface_hub import snapshot_download
import sys

try:
    path = snapshot_download(
        repo_id="${MODEL_ID}",
        local_dir="${BITNET_DIR}/model",
        ignore_patterns=["*.md", "*.txt", "original/*"],
    )
    print(f"  Modèle téléchargé dans : {path}")
except Exception as e:
    print(f"ERREUR : {e}", file=sys.stderr)
    sys.exit(1)
PYEOF

    # Chercher un fichier GGUF si disponible
    GGUF_FILE=$(find "$BITNET_DIR/model" -name "*.gguf" 2>/dev/null | head -1 || true)
    if [[ -n "$GGUF_FILE" ]]; then
        ok "Fichier GGUF trouvé : $GGUF_FILE"
        # Créer un lien symbolique pour accès unifié
        ln -sf "$GGUF_FILE" "$BITNET_DIR/model/model.gguf" 2>/dev/null || true
    fi

    touch "$MODEL_MARKER"
    ok "Modèle téléchargé"
fi

# ── Vérification ─────────────────────────────────────────────────────────────
step "Vérification de l'installation"

python3 << PYEOF
import sys
sys.path.insert(0, ".")

try:
    from agents.common.bitnet_provider import BitNetProvider
    p = BitNetProvider()
    info = p.get_model_info()
    print(f"  Backend : {info['mode']}")
    print(f"  Disponible : {info['available']}")
    print(f"  Modèle téléchargé : {info['model_downloaded']}")
    if info['available'] and info['model_downloaded']:
        print("  STATUS : OK")
    else:
        print("  STATUS : PARTIEL (voir ci-dessus)")
except Exception as e:
    print(f"  Erreur de vérification : {e}")
    print("  L'installation a peut-être réussi mais la vérification a échoué.")
PYEOF

# ── Config ────────────────────────────────────────────────────────────────────
step "Mise à jour de la configuration"

# Ajouter BitNet dans config.yaml si absent
if ! grep -q "bitnet" config.yaml 2>/dev/null; then
    cat >> config.yaml << 'YAML'

# BitNet (ajouté par bitnet-install)
bitnet:
  model_id: "microsoft/bitnet-b1.58-2B-4T"
  model_path: "~/.local-agents/models/bitnet/model"
  n_threads: 4
  context_size: 2048
YAML
    ok "Section bitnet ajoutée dans config.yaml"
fi

# ── Résumé ────────────────────────────────────────────────────────────────────
echo -e "\n${GREEN}${BOLD}━━━ Installation terminée ━━━${NC}\n"
echo -e "  ${GREEN}✓${NC} Backend  : ${BITNET_BACKEND:-python}"
echo -e "  ${GREEN}✓${NC} Modèle   : $MODEL_ID"
echo -e "  ${GREEN}✓${NC} Dossier  : $BITNET_DIR"
echo ""
echo -e "  Pour utiliser BitNet :"
echo -e "  ${BLUE}just bitnet-on${NC}         → activer BitNet globalement"
echo -e "  ${BLUE}just prod${NC}              → mode production (BitNet)"
echo -e "  ${BLUE}@Jarvis !backend bitnet${NC} → activer depuis Discord"
echo -e "  ${BLUE}just bench${NC}             → comparer Mock / BitNet / Ollama"
echo ""
echo -e "  Logs d'installation : ${BLUE}$LOG_FILE${NC}\n"
