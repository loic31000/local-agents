#!/bin/bash
# =============================================================================
# Installation support GGUF pour Local Agents
# Détecte automatiquement GPU (AMD ROCm / NVIDIA CUDA) et installe llama-cpp-python
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         🦙 Installation Support GGUF - Local Agents          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Détection du système
OS="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    OS="windows"
fi

echo -e "${BLUE}[INFO]${NC} Système détecté: $OS"

# Détection GPU
GPU="cpu"
GPU_INFO=""

# NVIDIA
if command -v nvidia-smi &> /dev/null; then
    GPU="cuda"
    GPU_INFO=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
    echo -e "${GREEN}[OK]${NC} GPU NVIDIA détecté: $GPU_INFO"
fi

# AMD ROCm
if command -v rocm-smi &> /dev/null; then
    GPU="rocm"
    GPU_INFO=$(rocm-smi --showproductname 2>/dev/null | grep "Card series" | head -1 || echo "AMD GPU")
    echo -e "${GREEN}[OK]${NC} GPU AMD (ROCm) détecté: $GPU_INFO"
fi

# AMD (sans ROCm installé)
if [[ "$GPU" == "cpu" ]] && lspci 2>/dev/null | grep -i "vga\|3d\|display" | grep -qi "amd\|radeon"; then
    echo -e "${YELLOW}[WARN]${NC} GPU AMD détecté mais ROCm non installé"
    echo -e "${YELLOW}[INFO]${NC} Pour activer le GPU AMD, installez ROCm:"
    echo -e "         https://rocm.docs.amd.com/projects/install-on-linux/en/latest/"
    GPU="rocm_needed"
fi

# Apple Silicon
if [[ "$OS" == "macos" ]] && [[ $(uname -m) == "arm64" ]]; then
    GPU="metal"
    GPU_INFO="Apple Silicon"
    echo -e "${GREEN}[OK]${NC} Apple Silicon détecté (Metal)"
fi

if [[ "$GPU" == "cpu" ]]; then
    echo -e "${YELLOW}[WARN]${NC} Aucun GPU compatible détecté, utilisation CPU"
fi

echo ""

# Installation llama-cpp-python
echo -e "${BLUE}[INFO]${NC} Installation de llama-cpp-python..."

# Commande d'installation selon GPU
case $GPU in
    cuda)
        echo -e "${BLUE}[INFO]${NC} Compilation avec support CUDA (NVIDIA)..."
        CMAKE_ARGS="-DLLAMA_CUDA=on" pip install llama-cpp-python --break-system-packages --force-reinstall --no-cache-dir
        ;;
    rocm)
        echo -e "${BLUE}[INFO]${NC} Compilation avec support ROCm (AMD)..."
        CMAKE_ARGS="-DLLAMA_HIPBLAS=on" pip install llama-cpp-python --break-system-packages --force-reinstall --no-cache-dir
        ;;
    metal)
        echo -e "${BLUE}[INFO]${NC} Compilation avec support Metal (Apple)..."
        CMAKE_ARGS="-DLLAMA_METAL=on" pip install llama-cpp-python --break-system-packages --force-reinstall --no-cache-dir
        ;;
    rocm_needed)
        echo -e "${YELLOW}[WARN]${NC} Installation CPU. Installez ROCm pour GPU AMD."
        pip install llama-cpp-python --break-system-packages --force-reinstall --no-cache-dir
        ;;
    *)
        echo -e "${BLUE}[INFO]${NC} Installation CPU..."
        pip install llama-cpp-python --break-system-packages --force-reinstall --no-cache-dir
        ;;
esac

# Installation huggingface_hub pour télécharger les modèles
echo -e "${BLUE}[INFO]${NC} Installation de huggingface_hub..."
pip install huggingface_hub --break-system-packages

# Créer le dossier des modèles
MODELS_DIR="$HOME/.local-agents/models"
mkdir -p "$MODELS_DIR"
echo -e "${GREEN}[OK]${NC} Dossier modèles créé: $MODELS_DIR"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    ✅ Installation terminée                   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "GPU Backend: ${YELLOW}$GPU${NC}"
echo -e "Modèles dir: ${YELLOW}$MODELS_DIR${NC}"
echo ""
echo -e "${BLUE}Prochaines étapes:${NC}"
echo ""
echo "1. Télécharger un modèle GGUF:"
echo -e "   ${YELLOW}python -m agents.common.gguf_loader download mistral-7b-q4${NC}"
echo ""
echo "2. Tester le modèle:"
echo -e "   ${YELLOW}python -m agents.common.gguf_loader run mistral-7b-instruct-v0.2.Q4_K_M${NC}"
echo ""
echo "3. Ou utiliser dans le code:"
echo -e "   ${YELLOW}from agents.common.llm_client import LLMClient${NC}"
echo -e "   ${YELLOW}client = LLMClient(backend='gguf', model_path='~/.local-agents/models/model.gguf')${NC}"
echo ""

# Test rapide
echo -e "${BLUE}[INFO]${NC} Test de l'installation..."
python -c "from llama_cpp import Llama; print('✅ llama-cpp-python OK')" 2>/dev/null || echo -e "${RED}[ERROR]${NC} llama-cpp-python non fonctionnel"
python -c "from huggingface_hub import hf_hub_download; print('✅ huggingface_hub OK')" 2>/dev/null || echo -e "${RED}[ERROR]${NC} huggingface_hub non fonctionnel"

echo ""
echo -e "${GREEN}Done!${NC} 🎉"
