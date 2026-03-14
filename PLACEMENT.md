# 📁 Guide de placement des fichiers

## Fichiers Go à placer dans le projet

```
C:\Users\romano\local-agents\
│
├── internal\
│   ├── llm\
│   │   ├── client.go       ← NOUVEAU  (copie depuis les fichiers téléchargés)
│   │   ├── llamacpp.go     ← NOUVEAU  (copie depuis les fichiers téléchargés)
│   │   └── ollama.go       ← REMPLACE l'existant
│   │
│   └── agent\
│       └── base.go         ← REMPLACE l'existant
│
├── cmd\
│   └── orchestrator\
│       └── main.go         ← REMPLACE l'existant
│
├── config.yaml             ← REMPLACE l'existant (racine du projet)
│
├── start_llama.bat         ← NOUVEAU (racine)
├── run_agent.bat           ← NOUVEAU (racine)
└── build_from_source.bat   ← NOUVEAU (racine, si tu veux compiler)
```

---

## Commandes PowerShell pour copier rapidement

Depuis le dossier où tu as extrait les fichiers téléchargés :

```powershell
# Depuis le dossier téléchargements (adapte le chemin)
$SRC = "C:\Users\romano\Downloads\local-agents-files"
$DST = "C:\Users\romano\local-agents"

# Fichiers internes Go
Copy-Item "$SRC\client.go"   "$DST\internal\llm\client.go"   -Force
Copy-Item "$SRC\llamacpp.go" "$DST\internal\llm\llamacpp.go" -Force
Copy-Item "$SRC\ollama.go"   "$DST\internal\llm\ollama.go"   -Force
Copy-Item "$SRC\base.go"     "$DST\internal\agent\base.go"   -Force
Copy-Item "$SRC\main.go"     "$DST\cmd\orchestrator\main.go" -Force
Copy-Item "$SRC\config.yaml" "$DST\config.yaml"              -Force

# Scripts
Copy-Item "$SRC\start_llama.bat"        "$DST\" -Force
Copy-Item "$SRC\run_agent.bat"          "$DST\" -Force
Copy-Item "$SRC\build_from_source.bat"  "$DST\" -Force
```

---

## Étape suivante : obtenir llama-server.exe

### Option A — Télécharger le binaire (PLUS SIMPLE, 5 min)

1. Va sur https://github.com/ggerganov/llama.cpp/releases/latest
2. Télécharge **`llama-b****-bin-win-cuda-cu12.4.1-x64.zip`**
   *(remplace `****` par le dernier numéro de build)*
3. Extrait **TOUT** le contenu dans `C:\Users\romano\local-agents\`
   - `llama-server.exe`
   - tous les `.dll`
4. Extrait aussi le contenu du zip `cudart-llama-bin-win-cuda-12.4-x64.zip` dans le même dossier
5. Lance `start_llama.bat`

### Option B — Compiler depuis les sources (llama.cpp déjà présent)

Tu as déjà `llama.cpp\` dans ton projet, donc :

**Prérequis :**
- [CMake](https://cmake.org/download/) — active "Add to PATH"
- [CUDA Toolkit 12.4](https://developer.nvidia.com/cuda-downloads)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/fr/downloads/) — composant "C++"

```powershell
.\build_from_source.bat
```

Durée : ~10-15 minutes la première fois.

---

## Vérifier que tout fonctionne

```powershell
# Terminal 1 - lance le modèle
.\start_llama.bat

# Terminal 2 (après "llama server listening") - lance l'agent
.\run_agent.bat
```

Interface web → **http://localhost:8080**

---

## Version CUDA : laquelle choisir ?

Tu as téléchargé `cudart-llama-bin-win-cuda-12.4`. Prends donc :
```
llama-b****-bin-win-cuda-cu12.4.1-x64.zip
```

Pour confirmer ta version CUDA :
```powershell
nvidia-smi
# Regarde "CUDA Version" en haut à droite
```
