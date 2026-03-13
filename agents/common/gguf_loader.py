"""
Loader GGUF pour Local Agents.

Permet de charger des modèles GGUF directement avec support GPU (AMD ROCm / NVIDIA CUDA).
Alternative à Ollama pour plus de contrôle sur les modèles.

Usage:
    from agents.common.gguf_loader import GGUFLoader, download_model
    
    # Télécharger un modèle depuis HuggingFace
    model_path = download_model("TheBloke/Mistral-7B-Instruct-v0.2-GGUF", "mistral-7b-instruct-v0.2.Q4_K_M.gguf")
    
    # Charger le modèle
    loader = GGUFLoader(model_path, n_gpu_layers=-1)  # -1 = tout sur GPU
    
    # Générer
    response = loader.generate("Salut, comment ça va ?")
    print(response)
"""

import os
import sys
import json
import time
import hashlib
from pathlib import Path
from typing import Optional, Dict, List, Any, Generator
from dataclasses import dataclass, field
from enum import Enum

# Ajouter le chemin parent pour les imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from common.logger import get_logger

logger = get_logger("gguf_loader")

# Dossier par défaut pour les modèles
MODELS_DIR = Path.home() / ".local-agents" / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)


class GPUBackend(Enum):
    """Backends GPU supportés."""
    CPU = "cpu"
    CUDA = "cuda"      # NVIDIA
    ROCM = "rocm"      # AMD
    METAL = "metal"    # Apple Silicon
    VULKAN = "vulkan"  # Cross-platform


@dataclass
class ModelConfig:
    """Configuration d'un modèle GGUF."""
    path: str
    name: str = ""
    n_ctx: int = 4096           # Taille du contexte
    n_batch: int = 512          # Taille du batch
    n_gpu_layers: int = -1      # -1 = tout sur GPU, 0 = CPU only
    n_threads: int = 0          # 0 = auto
    use_mmap: bool = True       # Memory mapping
    use_mlock: bool = False     # Lock en RAM
    verbose: bool = False
    
    # Paramètres de génération par défaut
    temperature: float = 0.7
    top_p: float = 0.95
    top_k: int = 40
    repeat_penalty: float = 1.1
    max_tokens: int = 512
    stop: List[str] = field(default_factory=lambda: ["</s>", "User:", "\n\n"])


@dataclass
class ModelInfo:
    """Informations sur un modèle."""
    name: str
    path: str
    size_gb: float
    quantization: str
    parameters: str
    gpu_layers: int
    backend: GPUBackend


def detect_gpu_backend() -> GPUBackend:
    """Détecte le backend GPU disponible."""
    try:
        # Essayer CUDA (NVIDIA)
        import subprocess
        result = subprocess.run(["nvidia-smi"], capture_output=True, text=True)
        if result.returncode == 0:
            logger.info("GPU NVIDIA détecté (CUDA)")
            return GPUBackend.CUDA
    except FileNotFoundError:
        pass
    
    try:
        # Essayer ROCm (AMD)
        import subprocess
        result = subprocess.run(["rocm-smi"], capture_output=True, text=True)
        if result.returncode == 0:
            logger.info("GPU AMD détecté (ROCm)")
            return GPUBackend.ROCM
    except FileNotFoundError:
        pass
    
    # Vérifier Metal (macOS)
    if sys.platform == "darwin":
        logger.info("Apple Silicon détecté (Metal)")
        return GPUBackend.METAL
    
    logger.info("Pas de GPU détecté, utilisation CPU")
    return GPUBackend.CPU


def get_install_command(backend: GPUBackend) -> str:
    """Retourne la commande d'installation pour le backend."""
    commands = {
        GPUBackend.CPU: "pip install llama-cpp-python --break-system-packages",
        GPUBackend.CUDA: "CMAKE_ARGS='-DLLAMA_CUDA=on' pip install llama-cpp-python --break-system-packages --force-reinstall --no-cache-dir",
        GPUBackend.ROCM: "CMAKE_ARGS='-DLLAMA_HIPBLAS=on' pip install llama-cpp-python --break-system-packages --force-reinstall --no-cache-dir",
        GPUBackend.METAL: "CMAKE_ARGS='-DLLAMA_METAL=on' pip install llama-cpp-python --break-system-packages --force-reinstall --no-cache-dir",
        GPUBackend.VULKAN: "CMAKE_ARGS='-DLLAMA_VULKAN=on' pip install llama-cpp-python --break-system-packages --force-reinstall --no-cache-dir",
    }
    return commands.get(backend, commands[GPUBackend.CPU])


def download_model(
    repo_id: str,
    filename: str,
    models_dir: Optional[Path] = None
) -> Path:
    """
    Télécharge un modèle GGUF depuis HuggingFace.
    
    Args:
        repo_id: ID du repo HuggingFace (ex: "TheBloke/Mistral-7B-Instruct-v0.2-GGUF")
        filename: Nom du fichier GGUF (ex: "mistral-7b-instruct-v0.2.Q4_K_M.gguf")
        models_dir: Dossier de destination (défaut: ~/.local-agents/models)
    
    Returns:
        Path vers le modèle téléchargé
    """
    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        logger.error("huggingface_hub non installé. Run: pip install huggingface_hub --break-system-packages")
        raise ImportError("pip install huggingface_hub --break-system-packages")
    
    models_dir = models_dir or MODELS_DIR
    models_dir.mkdir(parents=True, exist_ok=True)
    
    # Vérifier si déjà téléchargé
    local_path = models_dir / filename
    if local_path.exists():
        logger.info(f"Modèle déjà présent: {local_path}")
        return local_path
    
    logger.info(f"Téléchargement de {repo_id}/{filename}...")
    start_time = time.time()
    
    try:
        downloaded_path = hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            local_dir=models_dir,
            local_dir_use_symlinks=False
        )
        
        duration = time.time() - start_time
        size_gb = os.path.getsize(downloaded_path) / (1024**3)
        logger.info(f"Téléchargé en {duration:.1f}s ({size_gb:.2f} GB)")
        
        return Path(downloaded_path)
        
    except Exception as e:
        logger.error(f"Erreur téléchargement: {e}")
        raise


class GGUFLoader:
    """
    Loader pour modèles GGUF avec support GPU.
    
    Usage:
        loader = GGUFLoader("path/to/model.gguf", n_gpu_layers=-1)
        response = loader.generate("Hello!")
    """
    
    def __init__(
        self,
        model_path: str,
        n_ctx: int = 4096,
        n_gpu_layers: int = -1,
        n_threads: int = 0,
        verbose: bool = False
    ):
        """
        Initialise le loader GGUF.
        
        Args:
            model_path: Chemin vers le fichier .gguf
            n_ctx: Taille du contexte (défaut: 4096)
            n_gpu_layers: Couches sur GPU (-1 = toutes, 0 = CPU only)
            n_threads: Threads CPU (0 = auto)
            verbose: Logs verbeux
        """
        self.model_path = Path(model_path)
        self.config = ModelConfig(
            path=str(self.model_path),
            name=self.model_path.stem,
            n_ctx=n_ctx,
            n_gpu_layers=n_gpu_layers,
            n_threads=n_threads,
            verbose=verbose
        )
        
        self.backend = detect_gpu_backend()
        self.llm = None
        
        self._load_model()
    
    def _load_model(self):
        """Charge le modèle avec llama-cpp-python."""
        try:
            from llama_cpp import Llama
        except ImportError:
            cmd = get_install_command(self.backend)
            logger.error(f"llama-cpp-python non installé. Run:\n{cmd}")
            raise ImportError(f"Installez llama-cpp-python:\n{cmd}")
        
        if not self.model_path.exists():
            raise FileNotFoundError(f"Modèle non trouvé: {self.model_path}")
        
        logger.info(
            f"Chargement du modèle",
            model=self.config.name,
            backend=self.backend.value,
            gpu_layers=self.config.n_gpu_layers
        )
        
        start_time = time.time()
        
        self.llm = Llama(
            model_path=str(self.model_path),
            n_ctx=self.config.n_ctx,
            n_batch=self.config.n_batch,
            n_gpu_layers=self.config.n_gpu_layers,
            n_threads=self.config.n_threads or os.cpu_count(),
            use_mmap=self.config.use_mmap,
            use_mlock=self.config.use_mlock,
            verbose=self.config.verbose
        )
        
        duration = time.time() - start_time
        logger.info(f"Modèle chargé en {duration:.2f}s")
    
    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        top_k: Optional[int] = None,
        stop: Optional[List[str]] = None,
        stream: bool = False
    ) -> str | Generator[str, None, None]:
        """
        Génère une réponse.
        
        Args:
            prompt: Le prompt utilisateur
            system_prompt: Prompt système (optionnel)
            max_tokens: Nombre max de tokens à générer
            temperature: Température (0.0-2.0)
            top_p: Top-p sampling
            top_k: Top-k sampling
            stop: Tokens de stop
            stream: Si True, retourne un générateur
        
        Returns:
            Texte généré ou générateur si stream=True
        """
        if self.llm is None:
            raise RuntimeError("Modèle non chargé")
        
        # Construire le prompt complet
        full_prompt = ""
        if system_prompt:
            full_prompt = f"<|system|>\n{system_prompt}</s>\n"
        full_prompt += f"<|user|>\n{prompt}</s>\n<|assistant|>\n"
        
        # Paramètres
        params = {
            "max_tokens": max_tokens or self.config.max_tokens,
            "temperature": temperature or self.config.temperature,
            "top_p": top_p or self.config.top_p,
            "top_k": top_k or self.config.top_k,
            "repeat_penalty": self.config.repeat_penalty,
            "stop": stop or self.config.stop,
            "stream": stream
        }
        
        logger.debug(f"Génération", prompt_length=len(prompt), params=params)
        start_time = time.time()
        
        if stream:
            return self._stream_generate(full_prompt, params, start_time)
        else:
            return self._sync_generate(full_prompt, params, start_time)
    
    def _sync_generate(self, prompt: str, params: dict, start_time: float) -> str:
        """Génération synchrone."""
        output = self.llm(prompt, **params)
        
        text = output["choices"][0]["text"]
        duration_ms = int((time.time() - start_time) * 1000)
        tokens = output.get("usage", {}).get("completion_tokens", 0)
        
        logger.info(
            "Génération terminée",
            duration_ms=duration_ms,
            tokens=tokens,
            tokens_per_sec=round(tokens / (duration_ms / 1000), 1) if duration_ms > 0 else 0
        )
        
        return text.strip()
    
    def _stream_generate(self, prompt: str, params: dict, start_time: float) -> Generator[str, None, None]:
        """Génération en streaming."""
        total_tokens = 0
        
        for output in self.llm(prompt, **params):
            chunk = output["choices"][0]["text"]
            total_tokens += 1
            yield chunk
        
        duration_ms = int((time.time() - start_time) * 1000)
        logger.info(
            "Streaming terminé",
            duration_ms=duration_ms,
            tokens=total_tokens
        )
    
    def get_info(self) -> ModelInfo:
        """Retourne les infos du modèle."""
        size_gb = os.path.getsize(self.model_path) / (1024**3)
        
        # Extraire quantization du nom
        name = self.model_path.stem.lower()
        quant = "unknown"
        for q in ["q4_k_m", "q4_k_s", "q5_k_m", "q5_k_s", "q8_0", "q6_k", "q3_k", "q2_k", "f16", "f32"]:
            if q in name:
                quant = q.upper()
                break
        
        # Extraire taille du nom
        params = "unknown"
        for p in ["1b", "3b", "7b", "8b", "13b", "30b", "34b", "70b"]:
            if p in name:
                params = p.upper()
                break
        
        return ModelInfo(
            name=self.config.name,
            path=str(self.model_path),
            size_gb=round(size_gb, 2),
            quantization=quant,
            parameters=params,
            gpu_layers=self.config.n_gpu_layers,
            backend=self.backend
        )
    
    def unload(self):
        """Décharge le modèle de la mémoire."""
        if self.llm:
            del self.llm
            self.llm = None
            logger.info("Modèle déchargé")


class GGUFModelManager:
    """
    Gestionnaire de modèles GGUF.
    
    Usage:
        manager = GGUFModelManager()
        manager.download("TheBloke/Mistral-7B-Instruct-v0.2-GGUF", "mistral-7b-instruct-v0.2.Q4_K_M.gguf")
        
        loader = manager.load("mistral-7b-instruct-v0.2.Q4_K_M")
        response = loader.generate("Hello!")
    """
    
    # Modèles populaires pré-configurés
    POPULAR_MODELS = {
        "mistral-7b-q4": {
            "repo": "TheBloke/Mistral-7B-Instruct-v0.2-GGUF",
            "file": "mistral-7b-instruct-v0.2.Q4_K_M.gguf",
            "size": "4.4 GB",
            "desc": "Excellent pour le français, équilibré"
        },
        "llama3-8b-q4": {
            "repo": "QuantFactory/Meta-Llama-3-8B-Instruct-GGUF",
            "file": "Meta-Llama-3-8B-Instruct.Q4_K_M.gguf",
            "size": "4.9 GB",
            "desc": "Dernier Llama, très performant"
        },
        "phi3-mini-q4": {
            "repo": "microsoft/Phi-3-mini-4k-instruct-gguf",
            "file": "Phi-3-mini-4k-instruct-q4.gguf",
            "size": "2.4 GB",
            "desc": "Petit et rapide, bon pour CPU"
        },
        "codellama-7b-q4": {
            "repo": "TheBloke/CodeLlama-7B-Instruct-GGUF",
            "file": "codellama-7b-instruct.Q4_K_M.gguf",
            "size": "4.2 GB",
            "desc": "Spécialisé code"
        },
        "deepseek-coder-6.7b-q4": {
            "repo": "TheBloke/deepseek-coder-6.7B-instruct-GGUF",
            "file": "deepseek-coder-6.7b-instruct.Q4_K_M.gguf",
            "size": "4.0 GB",
            "desc": "Excellent pour le code"
        },
        "solar-10.7b-q4": {
            "repo": "TheBloke/SOLAR-10.7B-Instruct-v1.0-GGUF",
            "file": "solar-10.7b-instruct-v1.0.Q4_K_M.gguf",
            "size": "6.5 GB",
            "desc": "Très performant, multilingue"
        },
    }
    
    def __init__(self, models_dir: Optional[Path] = None):
        self.models_dir = models_dir or MODELS_DIR
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.loaded_models: Dict[str, GGUFLoader] = {}
        self.backend = detect_gpu_backend()
    
    def list_available(self) -> List[Dict[str, str]]:
        """Liste les modèles disponibles localement."""
        models = []
        for f in self.models_dir.glob("*.gguf"):
            size_gb = f.stat().st_size / (1024**3)
            models.append({
                "name": f.stem,
                "path": str(f),
                "size": f"{size_gb:.2f} GB"
            })
        return models
    
    def list_popular(self) -> Dict[str, Dict]:
        """Liste les modèles populaires pré-configurés."""
        return self.POPULAR_MODELS.copy()
    
    def download(
        self,
        repo_id: str,
        filename: str,
        alias: Optional[str] = None
    ) -> Path:
        """Télécharge un modèle."""
        path = download_model(repo_id, filename, self.models_dir)
        logger.info(f"Modèle téléchargé: {path}")
        return path
    
    def download_popular(self, name: str) -> Path:
        """Télécharge un modèle populaire par son alias."""
        if name not in self.POPULAR_MODELS:
            available = ", ".join(self.POPULAR_MODELS.keys())
            raise ValueError(f"Modèle inconnu: {name}. Disponibles: {available}")
        
        model = self.POPULAR_MODELS[name]
        return self.download(model["repo"], model["file"])
    
    def load(
        self,
        name_or_path: str,
        n_ctx: int = 4096,
        n_gpu_layers: int = -1
    ) -> GGUFLoader:
        """
        Charge un modèle.
        
        Args:
            name_or_path: Nom du modèle (sans .gguf) ou chemin complet
            n_ctx: Taille du contexte
            n_gpu_layers: Couches GPU (-1 = toutes)
        
        Returns:
            GGUFLoader prêt à générer
        """
        # Trouver le chemin
        path = Path(name_or_path)
        if not path.exists():
            path = self.models_dir / f"{name_or_path}.gguf"
        if not path.exists():
            path = self.models_dir / name_or_path
        if not path.exists():
            raise FileNotFoundError(f"Modèle non trouvé: {name_or_path}")
        
        # Vérifier si déjà chargé
        key = str(path)
        if key in self.loaded_models:
            logger.debug(f"Modèle déjà chargé: {path.stem}")
            return self.loaded_models[key]
        
        # Charger
        loader = GGUFLoader(
            model_path=str(path),
            n_ctx=n_ctx,
            n_gpu_layers=n_gpu_layers
        )
        self.loaded_models[key] = loader
        
        return loader
    
    def unload(self, name_or_path: str):
        """Décharge un modèle."""
        path = Path(name_or_path)
        if not path.exists():
            path = self.models_dir / f"{name_or_path}.gguf"
        
        key = str(path)
        if key in self.loaded_models:
            self.loaded_models[key].unload()
            del self.loaded_models[key]
    
    def unload_all(self):
        """Décharge tous les modèles."""
        for loader in self.loaded_models.values():
            loader.unload()
        self.loaded_models.clear()
    
    def delete(self, name_or_path: str) -> bool:
        """Supprime un modèle du disque."""
        path = Path(name_or_path)
        if not path.exists():
            path = self.models_dir / f"{name_or_path}.gguf"
        
        if path.exists():
            # D'abord décharger si chargé
            self.unload(str(path))
            # Supprimer
            path.unlink()
            logger.info(f"Modèle supprimé: {path}")
            return True
        return False


# ============================================================
# CLI pour tester
# ============================================================

def main():
    """CLI de test."""
    import argparse
    
    parser = argparse.ArgumentParser(description="GGUF Model Manager")
    subparsers = parser.add_subparsers(dest="command", help="Commandes")
    
    # List
    list_parser = subparsers.add_parser("list", help="Liste les modèles")
    list_parser.add_argument("--popular", action="store_true", help="Afficher les modèles populaires")
    
    # Download
    dl_parser = subparsers.add_parser("download", help="Télécharge un modèle")
    dl_parser.add_argument("name", help="Nom du modèle populaire ou repo_id/filename")
    
    # Run
    run_parser = subparsers.add_parser("run", help="Teste un modèle")
    run_parser.add_argument("model", help="Nom ou chemin du modèle")
    run_parser.add_argument("--prompt", "-p", default="Salut, comment ça va ?", help="Prompt")
    run_parser.add_argument("--gpu-layers", "-g", type=int, default=-1, help="GPU layers (-1=all)")
    
    # Info
    info_parser = subparsers.add_parser("info", help="Infos GPU/système")
    
    args = parser.parse_args()
    
    manager = GGUFModelManager()
    
    if args.command == "list":
        if args.popular:
            print("\n📦 Modèles populaires disponibles:\n")
            for name, info in manager.list_popular().items():
                print(f"  {name}")
                print(f"    └─ {info['desc']}")
                print(f"    └─ Taille: {info['size']}")
                print()
        else:
            models = manager.list_available()
            if models:
                print("\n📁 Modèles locaux:\n")
                for m in models:
                    print(f"  {m['name']} ({m['size']})")
            else:
                print("\n❌ Aucun modèle local. Utilisez 'download' pour en télécharger.")
    
    elif args.command == "download":
        if args.name in manager.POPULAR_MODELS:
            path = manager.download_popular(args.name)
        else:
            # Format: repo_id/filename
            parts = args.name.rsplit("/", 1)
            if len(parts) == 2:
                path = manager.download(parts[0], parts[1])
            else:
                print(f"❌ Format invalide. Utilisez 'repo_id/filename' ou un nom populaire.")
                print(f"   Modèles populaires: {', '.join(manager.POPULAR_MODELS.keys())}")
                return
        print(f"✅ Téléchargé: {path}")
    
    elif args.command == "run":
        print(f"\n🔄 Chargement de {args.model}...")
        loader = manager.load(args.model, n_gpu_layers=args.gpu_layers)
        
        info = loader.get_info()
        print(f"✅ Modèle: {info.name}")
        print(f"   Backend: {info.backend.value}")
        print(f"   Taille: {info.size_gb} GB")
        print(f"   Quantization: {info.quantization}")
        print(f"\n💬 Prompt: {args.prompt}\n")
        
        response = loader.generate(args.prompt)
        print(f"🤖 Réponse:\n{response}")
    
    elif args.command == "info":
        backend = detect_gpu_backend()
        print(f"\n🖥️ Système:")
        print(f"   Backend GPU: {backend.value}")
        print(f"   Dossier modèles: {MODELS_DIR}")
        print(f"\n📦 Installation recommandée:")
        print(f"   {get_install_command(backend)}")
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
