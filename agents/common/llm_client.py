"""
Client LLM unifié pour Local Agents.

Supporte:
- Ollama (API HTTP)
- GGUF direct (llama-cpp-python avec GPU)

Usage:
    from agents.common.llm_client import LLMClient
    
    # Avec Ollama (défaut)
    client = LLMClient()
    response = client.generate("Salut !")
    
    # Avec GGUF
    client = LLMClient(backend="gguf", model_path="~/.local-agents/models/mistral-7b.gguf")
    response = client.generate("Salut !")
    
    # Changer de modèle à la volée
    client.switch_model("llama3.2:3b")  # Ollama
    client.switch_model("path/to/model.gguf")  # GGUF
"""

import os
import sys
import json
import asyncio
import aiohttp
import time
from pathlib import Path
from typing import Optional, Dict, List, Any, Union, Generator, AsyncGenerator
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from common.logger import get_logger

logger = get_logger("llm_client")


class LLMBackend(Enum):
    """Backends LLM supportés."""
    OLLAMA = "ollama"
    GGUF = "gguf"


@dataclass
class GenerationConfig:
    """Configuration de génération."""
    temperature: float = 0.7
    top_p: float = 0.95
    top_k: int = 40
    max_tokens: int = 512
    repeat_penalty: float = 1.1
    stop: List[str] = field(default_factory=list)
    stream: bool = False


@dataclass
class GenerationResult:
    """Résultat de génération."""
    text: str
    model: str
    backend: LLMBackend
    duration_ms: int
    tokens_used: int = 0
    tokens_per_sec: float = 0.0


class BaseLLMProvider(ABC):
    """Interface de base pour les providers LLM."""
    
    @abstractmethod
    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        config: Optional[GenerationConfig] = None
    ) -> GenerationResult:
        pass
    
    @abstractmethod
    async def agenerate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        config: Optional[GenerationConfig] = None
    ) -> GenerationResult:
        pass
    
    @abstractmethod
    def list_models(self) -> List[str]:
        pass
    
    @abstractmethod
    def get_model_info(self) -> Dict[str, Any]:
        pass


class OllamaProvider(BaseLLMProvider):
    """Provider Ollama (API HTTP)."""
    
    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        model: str = "llama3.2:3b",
        timeout: int = 120
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session
    
    async def _close_session(self):
        if self._session and not self._session.closed:
            await self._session.close()
    
    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        config: Optional[GenerationConfig] = None
    ) -> GenerationResult:
        """Génération synchrone."""
        return asyncio.run(self.agenerate(prompt, system_prompt, config))
    
    async def agenerate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        config: Optional[GenerationConfig] = None
    ) -> GenerationResult:
        """Génération asynchrone."""
        config = config or GenerationConfig()
        
        # Construire le prompt
        full_prompt = ""
        if system_prompt:
            full_prompt = f"{system_prompt}\n\n"
        full_prompt += prompt
        
        payload = {
            "model": self.model,
            "prompt": full_prompt,
            "stream": False,
            "options": {
                "temperature": config.temperature,
                "top_p": config.top_p,
                "top_k": config.top_k,
                "num_predict": config.max_tokens,
                "repeat_penalty": config.repeat_penalty,
            }
        }
        
        if config.stop:
            payload["options"]["stop"] = config.stop
        
        start_time = time.time()
        
        session = await self._get_session()
        timeout = aiohttp.ClientTimeout(total=self.timeout)
        
        try:
            async with session.post(
                f"{self.base_url}/api/generate",
                json=payload,
                timeout=timeout
            ) as resp:
                if resp.status != 200:
                    error = await resp.text()
                    raise RuntimeError(f"Ollama error {resp.status}: {error}")
                
                data = await resp.json()
                
                duration_ms = int((time.time() - start_time) * 1000)
                text = data.get("response", "").strip()
                
                # Calculer tokens/sec si dispo
                eval_count = data.get("eval_count", 0)
                eval_duration = data.get("eval_duration", 0)
                tokens_per_sec = 0.0
                if eval_duration > 0:
                    tokens_per_sec = eval_count / (eval_duration / 1e9)
                
                return GenerationResult(
                    text=text,
                    model=self.model,
                    backend=LLMBackend.OLLAMA,
                    duration_ms=duration_ms,
                    tokens_used=eval_count,
                    tokens_per_sec=round(tokens_per_sec, 1)
                )
                
        except asyncio.TimeoutError:
            raise RuntimeError(f"Ollama timeout après {self.timeout}s")
    
    def list_models(self) -> List[str]:
        """Liste les modèles Ollama disponibles."""
        return asyncio.run(self._alist_models())
    
    async def _alist_models(self) -> List[str]:
        session = await self._get_session()
        try:
            async with session.get(
                f"{self.base_url}/api/tags",
                timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return [m["name"] for m in data.get("models", [])]
        except Exception as e:
            logger.error(f"Erreur list_models: {e}")
        return []
    
    def get_model_info(self) -> Dict[str, Any]:
        return {
            "name": self.model,
            "backend": "ollama",
            "base_url": self.base_url
        }
    
    def switch_model(self, model: str):
        """Change le modèle actif."""
        self.model = model
        logger.info(f"Modèle Ollama changé: {model}")


class GGUFProvider(BaseLLMProvider):
    """Provider GGUF (llama-cpp-python)."""
    
    def __init__(
        self,
        model_path: str,
        n_ctx: int = 4096,
        n_gpu_layers: int = -1,
        n_threads: int = 0
    ):
        self.model_path = Path(model_path).expanduser()
        self.n_ctx = n_ctx
        self.n_gpu_layers = n_gpu_layers
        self.n_threads = n_threads
        
        self._loader = None
        self._load_model()
    
    def _load_model(self):
        """Charge le modèle GGUF."""
        try:
            from common.gguf_loader import GGUFLoader
        except ImportError:
            raise ImportError("Module gguf_loader non trouvé")
        
        self._loader = GGUFLoader(
            model_path=str(self.model_path),
            n_ctx=self.n_ctx,
            n_gpu_layers=self.n_gpu_layers,
            n_threads=self.n_threads
        )
    
    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        config: Optional[GenerationConfig] = None
    ) -> GenerationResult:
        """Génération synchrone."""
        config = config or GenerationConfig()
        
        start_time = time.time()
        
        text = self._loader.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=config.max_tokens,
            temperature=config.temperature,
            top_p=config.top_p,
            top_k=config.top_k,
            stop=config.stop if config.stop else None,
            stream=False
        )
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        return GenerationResult(
            text=text,
            model=self.model_path.stem,
            backend=LLMBackend.GGUF,
            duration_ms=duration_ms
        )
    
    async def agenerate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        config: Optional[GenerationConfig] = None
    ) -> GenerationResult:
        """Génération asynchrone (exécute en thread pool)."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self.generate(prompt, system_prompt, config)
        )
    
    def list_models(self) -> List[str]:
        """Liste les modèles GGUF locaux."""
        try:
            from common.gguf_loader import GGUFModelManager
            manager = GGUFModelManager()
            return [m["name"] for m in manager.list_available()]
        except:
            return []
    
    def get_model_info(self) -> Dict[str, Any]:
        info = self._loader.get_info()
        return {
            "name": info.name,
            "backend": "gguf",
            "path": info.path,
            "size_gb": info.size_gb,
            "quantization": info.quantization,
            "gpu_layers": info.gpu_layers,
            "gpu_backend": info.backend.value
        }
    
    def switch_model(self, model_path: str):
        """Change le modèle actif."""
        self._loader.unload()
        self.model_path = Path(model_path).expanduser()
        self._load_model()
        logger.info(f"Modèle GGUF changé: {model_path}")
    
    def unload(self):
        """Décharge le modèle."""
        if self._loader:
            self._loader.unload()


class LLMClient:
    """
    Client LLM unifié.
    
    Supporte Ollama et GGUF de manière transparente.
    
    Usage:
        # Ollama (défaut)
        client = LLMClient()
        
        # GGUF
        client = LLMClient(backend="gguf", model_path="path/to/model.gguf")
        
        # Génération
        result = client.generate("Salut !")
        print(result.text)
        
        # Async
        result = await client.agenerate("Salut !")
    """
    
    def __init__(
        self,
        backend: str = "ollama",
        # Ollama options
        ollama_url: str = "http://localhost:11434",
        model: str = "llama3.2:3b",
        timeout: int = 120,
        # GGUF options
        model_path: Optional[str] = None,
        n_ctx: int = 4096,
        n_gpu_layers: int = -1,
        n_threads: int = 0
    ):
        self.backend_type = LLMBackend(backend.lower())
        
        if self.backend_type == LLMBackend.OLLAMA:
            self._provider = OllamaProvider(
                base_url=ollama_url,
                model=model,
                timeout=timeout
            )
        elif self.backend_type == LLMBackend.GGUF:
            if not model_path:
                raise ValueError("model_path requis pour backend GGUF")
            self._provider = GGUFProvider(
                model_path=model_path,
                n_ctx=n_ctx,
                n_gpu_layers=n_gpu_layers,
                n_threads=n_threads
            )
        else:
            raise ValueError(f"Backend inconnu: {backend}")
        
        logger.info(
            "LLMClient initialisé",
            backend=self.backend_type.value,
            model=model if self.backend_type == LLMBackend.OLLAMA else model_path
        )
    
    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 512,
        **kwargs
    ) -> GenerationResult:
        """Génère une réponse (synchrone)."""
        config = GenerationConfig(
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs
        )
        return self._provider.generate(prompt, system_prompt, config)
    
    async def agenerate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 512,
        **kwargs
    ) -> GenerationResult:
        """Génère une réponse (asynchrone)."""
        config = GenerationConfig(
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs
        )
        return await self._provider.agenerate(prompt, system_prompt, config)
    
    def list_models(self) -> List[str]:
        """Liste les modèles disponibles."""
        return self._provider.list_models()
    
    def get_info(self) -> Dict[str, Any]:
        """Retourne les infos du modèle actif."""
        return self._provider.get_model_info()
    
    def switch_model(self, model: str):
        """
        Change le modèle actif.
        
        Pour Ollama: nom du modèle (ex: "llama3.2:3b")
        Pour GGUF: chemin vers le fichier .gguf
        """
        self._provider.switch_model(model)
    
    def switch_backend(
        self,
        backend: str,
        **kwargs
    ):
        """
        Change de backend (ollama <-> gguf).
        
        Args:
            backend: "ollama" ou "gguf"
            **kwargs: Options du nouveau backend
        """
        # Cleanup ancien provider
        if hasattr(self._provider, 'unload'):
            self._provider.unload()
        
        self.backend_type = LLMBackend(backend.lower())
        
        if self.backend_type == LLMBackend.OLLAMA:
            self._provider = OllamaProvider(
                base_url=kwargs.get("ollama_url", "http://localhost:11434"),
                model=kwargs.get("model", "llama3.2:3b"),
                timeout=kwargs.get("timeout", 120)
            )
        elif self.backend_type == LLMBackend.GGUF:
            self._provider = GGUFProvider(
                model_path=kwargs["model_path"],
                n_ctx=kwargs.get("n_ctx", 4096),
                n_gpu_layers=kwargs.get("n_gpu_layers", -1),
                n_threads=kwargs.get("n_threads", 0)
            )
        
        logger.info(f"Backend changé: {backend}")


# ============================================================
# Factory pour création simplifiée
# ============================================================

def create_client(
    backend: str = "auto",
    **kwargs
) -> LLMClient:
    """
    Crée un client LLM.
    
    Args:
        backend: "ollama", "gguf", ou "auto" (détection)
        **kwargs: Options du backend
    
    Returns:
        LLMClient configuré
    """
    if backend == "auto":
        # Auto-détection: si model_path fourni -> GGUF, sinon Ollama
        if "model_path" in kwargs:
            backend = "gguf"
        else:
            backend = "ollama"
    
    return LLMClient(backend=backend, **kwargs)


# ============================================================
# Test CLI
# ============================================================

async def test_client():
    """Test du client."""
    print("\n🧪 Test LLMClient\n")
    
    # Test Ollama
    print("📡 Test Ollama...")
    try:
        client = LLMClient(backend="ollama", model="phi3:mini")
        models = client.list_models()
        print(f"   Modèles: {models}")
        
        result = await client.agenerate("Dis bonjour en 5 mots max.")
        print(f"   Réponse: {result.text}")
        print(f"   Durée: {result.duration_ms}ms")
        print(f"   ✅ Ollama OK")
    except Exception as e:
        print(f"   ❌ Ollama erreur: {e}")
    
    print()


if __name__ == "__main__":
    asyncio.run(test_client())
