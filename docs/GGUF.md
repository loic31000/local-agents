# 🦙 Support GGUF - Modèles locaux avec GPU

Le framework supporte maintenant les modèles **GGUF** en plus d'Ollama, avec accélération GPU (AMD ROCm / NVIDIA CUDA / Apple Metal).

## 📋 Comparaison Ollama vs GGUF

| Feature | Ollama | GGUF Direct |
|---------|--------|-------------|
| Installation | Simple | Compilation requise |
| GPU Auto | ✅ | ✅ |
| Modèles HuggingFace | Via import | ✅ Direct |
| Quantizations custom | Limité | ✅ Toutes |
| Contrôle mémoire | Non | ✅ Oui |
| Performance | Bon | Optimal |

**Recommandation**: Utilise **Ollama** pour la simplicité, **GGUF** pour les performances max ou modèles custom.

---

## 🚀 Installation

### Automatique (détecte ton GPU)

```bash
./scripts/install-gguf.sh
```

### Manuelle

```bash
# CPU only
pip install llama-cpp-python --break-system-packages

# NVIDIA CUDA
CMAKE_ARGS="-DLLAMA_CUDA=on" pip install llama-cpp-python --break-system-packages --force-reinstall --no-cache-dir

# AMD ROCm
CMAKE_ARGS="-DLLAMA_HIPBLAS=on" pip install llama-cpp-python --break-system-packages --force-reinstall --no-cache-dir

# Apple Metal
CMAKE_ARGS="-DLLAMA_METAL=on" pip install llama-cpp-python --break-system-packages --force-reinstall --no-cache-dir

# + HuggingFace pour télécharger
pip install huggingface_hub --break-system-packages
```

---

## 📦 Télécharger des modèles

### Modèles populaires pré-configurés

```bash
# Liste les modèles populaires
python -m agents.common.gguf_loader list --popular

# Télécharger
python -m agents.common.gguf_loader download mistral-7b-q4
python -m agents.common.gguf_loader download llama3-8b-q4
python -m agents.common.gguf_loader download phi3-mini-q4
python -m agents.common.gguf_loader download codellama-7b-q4
python -m agents.common.gguf_loader download deepseek-coder-6.7b-q4
```

### Depuis HuggingFace

```bash
# Format: repo_id filename
python -m agents.common.gguf_loader download "TheBloke/Mixtral-8x7B-Instruct-v0.1-GGUF/mixtral-8x7b-instruct-v0.1.Q4_K_M.gguf"
```

### Modèles disponibles

| Modèle | Taille | RAM GPU | Usage |
|--------|--------|---------|-------|
| `phi3-mini-q4` | 2.4 GB | 3 GB | Rapide, bon CPU |
| `mistral-7b-q4` | 4.4 GB | 5 GB | Équilibré, bon français |
| `llama3-8b-q4` | 4.9 GB | 6 GB | Très performant |
| `codellama-7b-q4` | 4.2 GB | 5 GB | Code |
| `deepseek-coder-6.7b-q4` | 4.0 GB | 5 GB | Code (excellent) |
| `solar-10.7b-q4` | 6.5 GB | 8 GB | Multilingue |

---

## 💻 Utilisation

### CLI

```bash
# Infos système/GPU
python -m agents.common.gguf_loader info

# Liste modèles locaux
python -m agents.common.gguf_loader list

# Tester un modèle
python -m agents.common.gguf_loader run mistral-7b-instruct-v0.2.Q4_K_M --prompt "Salut !"

# Avec options GPU
python -m agents.common.gguf_loader run mistral-7b-instruct-v0.2.Q4_K_M --gpu-layers -1
```

### Dans le code Python

```python
from agents.common.llm_client import LLMClient

# Avec GGUF
client = LLMClient(
    backend="gguf",
    model_path="~/.local-agents/models/mistral-7b-instruct-v0.2.Q4_K_M.gguf",
    n_gpu_layers=-1  # -1 = tout sur GPU
)

# Générer
result = client.generate("Explique Docker en 3 phrases")
print(result.text)
print(f"Durée: {result.duration_ms}ms")
print(f"Tokens/sec: {result.tokens_per_sec}")

# Async
result = await client.agenerate("Code fibonacci en Python")

# Changer de modèle
client.switch_model("~/.local-agents/models/codellama-7b-instruct.Q4_K_M.gguf")

# Ou revenir à Ollama
client.switch_backend("ollama", model="llama3.2:3b")
```

### Avec le GGUFModelManager

```python
from agents.common.gguf_loader import GGUFModelManager

manager = GGUFModelManager()

# Télécharger
manager.download_popular("mistral-7b-q4")

# Charger
loader = manager.load("mistral-7b-instruct-v0.2.Q4_K_M", n_gpu_layers=-1)

# Générer
response = loader.generate(
    prompt="Salut !",
    system_prompt="Tu es un assistant serviable.",
    temperature=0.7,
    max_tokens=500
)

# Streaming
for chunk in loader.generate("Raconte une histoire", stream=True):
    print(chunk, end="", flush=True)

# Infos
info = loader.get_info()
print(f"Backend GPU: {info.backend}")  # cuda, rocm, metal, cpu

# Décharger
loader.unload()
```

---

## ⚙️ Configuration avancée

### GPU Layers

```python
# Tout sur GPU (si assez de VRAM)
loader = GGUFLoader("model.gguf", n_gpu_layers=-1)

# Moitié sur GPU (économiser VRAM)
loader = GGUFLoader("model.gguf", n_gpu_layers=20)

# CPU only
loader = GGUFLoader("model.gguf", n_gpu_layers=0)
```

### Contexte et mémoire

```python
loader = GGUFLoader(
    "model.gguf",
    n_ctx=8192,       # Contexte plus grand (plus de RAM)
    n_gpu_layers=-1,  # Tout sur GPU
    n_threads=8       # Threads CPU (0 = auto)
)
```

---

## 🔧 Troubleshooting

### "llama-cpp-python non installé"

```bash
# Réinstaller avec le bon backend
./scripts/install-gguf.sh
```

### "CUDA/ROCm non détecté"

```bash
# NVIDIA: vérifier drivers
nvidia-smi

# AMD: installer ROCm
# https://rocm.docs.amd.com/projects/install-on-linux/en/latest/
```

### "Out of memory"

```python
# Réduire les layers GPU
loader = GGUFLoader("model.gguf", n_gpu_layers=20)  # Au lieu de -1

# Ou utiliser un modèle plus petit
manager.download_popular("phi3-mini-q4")  # 2.4 GB au lieu de 4.4 GB
```

### "Modèle lent"

```bash
# Vérifier que le GPU est utilisé
python -m agents.common.gguf_loader info

# Si "cpu", réinstaller avec le bon backend
./scripts/install-gguf.sh
```

---

## 📊 Performance attendue

### GPU NVIDIA RTX 3080 (10GB)

| Modèle | Tokens/sec | Latence |
|--------|-----------|---------|
| phi3-mini-q4 | ~80-100 | ~50ms |
| mistral-7b-q4 | ~40-60 | ~100ms |
| llama3-8b-q4 | ~35-50 | ~120ms |

### GPU AMD RX 6800 XT (16GB)

| Modèle | Tokens/sec | Latence |
|--------|-----------|---------|
| phi3-mini-q4 | ~60-80 | ~70ms |
| mistral-7b-q4 | ~30-45 | ~150ms |
| llama3-8b-q4 | ~25-40 | ~180ms |

### CPU (Ryzen 7 5800X)

| Modèle | Tokens/sec | Latence |
|--------|-----------|---------|
| phi3-mini-q4 | ~15-20 | ~300ms |
| mistral-7b-q4 | ~8-12 | ~800ms |
| llama3-8b-q4 | ~6-10 | ~1000ms |

---

## 🔗 Ressources

- [llama.cpp](https://github.com/ggerganov/llama.cpp) - Moteur GGUF
- [llama-cpp-python](https://github.com/abetlen/llama-cpp-python) - Bindings Python
- [HuggingFace GGUF](https://huggingface.co/models?library=gguf) - Modèles disponibles
- [TheBloke](https://huggingface.co/TheBloke) - Quantizations populaires
