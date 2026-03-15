"""
Patch pour agents/common/llm_client.py
Ajoute Mock comme backend.

Appliquer avec :
    python3 scripts/apply_llm_patch.py
"""

# ─── 1. Dans la classe LLMBackend ─────────────────────────────────────────────
#
# AVANT :
#     class LLMBackend(Enum):
#         OLLAMA = "ollama"
#         GGUF   = "gguf"
#
# APRÈS :
#     class LLMBackend(Enum):
#         OLLAMA  = "ollama"
#         GGUF    = "gguf"
#         MOCK    = "mock"

# ─── 2. Dans LLMClient.__init__ ───────────────────────────────────────────────
#
# Ajouter après le bloc elif self.backend_type == LLMBackend.GGUF: ... :
#
#     elif self.backend_type == LLMBackend.MOCK:
#         from common.mock_provider import MockProvider
#         self._provider = MockProvider(
#             agent_id=kwargs.pop("agent_id", "_default"),
#             simulate_delay=kwargs.pop("simulate_delay", True),
#         )

# ─── 3. Dans create_client — détection automatique du backend ─────────────────
#
# Remplacer le bloc "auto" par :
#
#     if backend == "auto":
#         import os
#         backend = os.getenv("BACKEND", "")
#         if not backend:
#             if "model_path" in kwargs:
#                 backend = "gguf"
#             else:
#                 backend = "ollama"

# ─── Script d'application automatique ────────────────────────────────────────

from pathlib import Path


def apply_patch():
    target = Path("agents/common/llm_client.py")
    if not target.exists():
        print(f"ERREUR : {target} introuvable")
        return False

    content = target.read_text()

    # Patch 1 : ajouter MOCK à LLMBackend
    old = '''class LLMBackend(Enum):
    """Backends LLM supportés."""
    OLLAMA = "ollama"
    GGUF = "gguf"'''

    new = '''class LLMBackend(Enum):
    """Backends LLM supportés."""
    OLLAMA  = "ollama"
    GGUF    = "gguf"
    MOCK    = "mock"'''

    if old not in content:
        print("WARN : Patch 1 déjà appliqué ou structure modifiée")
    else:
        content = content.replace(old, new, 1)
        print("OK : Patch 1 — LLMBackend.MOCK ajouté")

    # Patch 2 : ajouter MockProvider dans __init__
    old2 = '''        else:
            raise ValueError(f"Backend inconnu: {backend}")'''

    new2 = '''        elif self.backend_type == LLMBackend.MOCK:
            from common.mock_provider import MockProvider
            self._provider = MockProvider(
                agent_id=kwargs.pop("agent_id", "_default"),
                simulate_delay=kwargs.pop("simulate_delay", True),
            )

        else:
            raise ValueError(f"Backend inconnu: {backend}")'''

    if old2 not in content:
        print("WARN : Patch 2 déjà appliqué ou structure modifiée")
    else:
        content = content.replace(old2, new2, 1)
        print("OK : Patch 2 — MockProvider dans __init__")

    # Patch 3 : auto-détection depuis BACKEND envvar
    old3 = '''    if backend == "auto":
        # Auto-détection: si model_path fourni -> GGUF, sinon Ollama
        if "model_path" in kwargs:
            backend = "gguf"
        else:
            backend = "ollama"'''

    new3 = '''    if backend == "auto":
        import os
        env_backend = os.getenv("BACKEND", "")
        if env_backend and env_backend in ("mock", "ollama", "gguf"):
            backend = env_backend
        elif "model_path" in kwargs:
            backend = "gguf"
        else:
            backend = "ollama"'''

    if old3 not in content:
        print("WARN : Patch 3 déjà appliqué ou structure modifiée")
    else:
        content = content.replace(old3, new3, 1)
        print("OK : Patch 3 — auto-détection BACKEND envvar")

    target.write_text(content)
    print(f"\nPatch appliqué sur {target}")
    return True


if __name__ == "__main__":
    apply_patch()
