```markdown
# 📋 ROADMAP — Local Agents v4.5.0 "Lightning Framework" 🚀

## Architecture

| Couche | Composants |
|--------|------------|
| 🟢 Mock Layer | Dev/Démo instantané — 0.5s |
| 🟡 Observer Bus | Logs · Métriques · Stats realtime |
| 🔵 Orchestrateur Go | Web:8081 · Discord · CLI · Router + 5 Workers |
| 🟢 Agents Pool | `coder` `files` `email` `discord` `cyberdefence` |
| 🟣 LoRA Router | coder-lora · cyber-lora · fr-lora · auto-switch |
| 🔴 LLM Backends | Ollama (défaut) · GGUF · ⏸️ BitNet (2027) |

---

## ✅ Terminé — v1.0 → v4.2

| Feature | Statut | Détails |
|---------|--------|---------|
| Orchestrateur Go | ✅ | Routing + Queue + WebSocket + API REST + 5 workers |
| 6 Agents Live | ✅ | `coder` `files` `email` `discord` `cyberdefence` |
| Discord Jarvis | ✅ | v3.0.0 — commandes naturelles + modération |
| Dashboard Web | ✅ | Chat + CyberDefence + Paramètres + modèles Ollama |
| Docker + Just | ✅ | `just start/stop/restart` + 4 configs YAML |
| CyberDefence v1.1.0 | ✅ | Prompt injection + SQL + anti-replay + alertes Discord |
| Tests sécurité | ✅ | 5/5 passés — CRITICAL/WARNING Discord temps réel |
| Scripts install | ✅ | `install.ps1` Windows + `install.sh` Linux — 1 commande |
| Nettoyage scripts | ✅ | `setup.sh` + `start_agents.sh` supprimés |
| `.env.example` | ✅ | `GPU_ENABLED`, `GPU_TYPE`, `DISCORD_TOKEN` standardisé |

---

## ✅ Terminé — Mock Layer v4.1.0

| Backend | RAM | Temps | CPU |
|---------|-----|-------|-----|
| 🟢 Mock Layer | 0 MB | 0.5s | 0% |
| 🟡 Ollama 3B | 3.5 GB | 5–8s | 85% |

```bash
just mock-on    # Dev instantané
just prod       # Ollama production
```

---

## ⏸️ En pause — BitNet (reporter 2027)

> BitNet b1.58 est trop expérimental sur Windows. Bloqué sur le toolset `ClangCL`
> absent de VS BuildTools. À reprendre sous Linux/WSL2 ou en 2027.

| Problème | Détail |
|----------|--------|
| ClangCL manquant | VS BuildTools 2022 ne l'installe pas correctement |
| lld-link mainCRTStartup | Linkage CRT cassé avec clang 22 + Ninja |
| setup_env.py | `NotImplementedError` sur Windows |

**Alternative recommandée** : `ollama pull qwen2.5-coder:1.5b` — 30 t/s CPU, zéro compilation.

---

## 🔥 Priorité #1 — LoRA Dynamique v4.3.0 *(1 semaine)*

Chaque agent charge automatiquement son adapteur LoRA selon le contexte du message.

| Adapteur | Déclenché par |
|----------|---------------|
| `coder-lora` | "code python", "fonction", "bug" |
| `cyber-lora` | "scan IP", "exploit", "pentest" |
| `fr-lora` | messages en français |

```yaml
lora:
  base_model: "ollama/qwen2.5-coder:1.5b"
  auto_switch: true
  adapters:
    coder: "loras/coder.pt"
    cyberdefence: "loras/cyber.pt"
```

---

## 👁️ Priorité #2 — Observer Bus v4.3.0 *(2 jours)*

| Événement | Action déclenchée |
|-----------|------------------|
| Mock hit | Dashboard +1 |
| LoRA switch | Stats realtime |
| Agent error | Alerte CyberDefence |
| Perf spike | `/api/metrics` |

---

## 🤝 Inspiration CoPaw — v4.4.0 *(À réfléchir)*

**Benchmark CoPaw (AgentScope/Alibaba)** : multi-canaux + ReMe mémoire. À évaluer pour différenciation.

| Feature CoPaw | Intérêt | Statut | Complexité |
|---------------|---------|--------|------------|
| **ReMe Memory** | ✅ Haute | ⏳ Plan | 🟡 Moyen |
| **Multi-canaux** | ⚠️ Moyen | 📋 TODO | 🟠 Difficile |
| **MCP Tools** | ✅ Haute | 📋 TODO | 🟢 Facile |

### 🎯 1️⃣ ReMe Memory Store *(v4.4.1)*
```
- SQLite/JSON par agent — cross-session
- `memory/agent_coder/conversations.db`
- Récupération contexte 30j max
```
**Impact** : Garde l'historique Discord même après `docker compose down`

### 🎯 2️⃣ MCP Endpoint *(v4.4.2)*
```
POST /api/mcp/{tool}
- Standardise outils externes (VSCode, Git, terminal)
- Compatible AgentScope ecosystem
```
**Impact** : Marketplace compatible 2027

### 🎯 3️⃣ Telegram Bot *(Optionnel v4.5.0)*
```
@JarvisTelegram parallèle à Discord
- 2ème canal Jarvis
```
**Impact** : +20% utilisateurs (Telegram > Discord dev FR)

---

## 🛠️ Plan v4.5.0 *(4 semaines)*

| Semaine | Objectif | Statut |
|---------|----------|--------|
| 1 | Mock Layer + tests instantanés | ✅ |
| 2 | LoRA Router — 10 agents spécialisés | 🔥 En cours |
| 3 | Observer Bus + CyberDef étendu | ⏳ |
| 4 | **Release v4.5.0 "Lightning Framework"** | ⏳ |

---

## 🔮 Vision 2027 — Marketplace

| Agent | Spécialité |
|-------|------------|
| 👑 Coder Pro | Python · JS · Go · Rust |
| ₿ Crypto Expert | Smart contracts · MEV bots Solana |
| 🎮 GameDev | Unity C# · Godot · Pygame |
| 🛡️ Pentest Pro | Burp · Metasploit · Nmap auto |
| 🤖 ML Engineer | PyTorch · TensorFlow · datasets |
| 🇫🇷 Français Tech | Docs · code · emails techniques |

```bash
just marketplace install crypto   # Agent Crypto live
just marketplace list             # Voir tous les LoRA disponibles
```

---

## 📊 Évolution

| Version | Agents | Perf | Features |
|---------|--------|------|----------|
| ✅ v4.0 | 6 | Ollama | Discord + Web |
| ✅ v4.2 | 6 | Mock 52x | CyberDef + Scripts |
| 🔥 v4.5 | 10+ | LoRA auto | LoRA + Observer |
| ⭐ 2027 | 50+ | **ReMe + MCP** | Marketplace + Multi-canaux |

---

## 🎯 Prochaines étapes *(7 jours)*

1. ✅ `just mock-on` — tests 0.5s
2. 🔥 **LoRA Router v4.3.0** — 10 agents spécialisés
3. 👁️ **Observer Bus** — 100% observabilité
4. 🤝 **ReMe Memory** (CoPaw) — évaluer v4.4.1
5. `git push v4.5.0` — release GitHub

---

⭐ [github.com/loic31000/local-agents](https://github.com/loic31000/local-agents) — Local Agents · Framework IA Local #1 (2026–2027)


**Local Agents > CoPaw** sur sécurité + simplicité, mais **ReMe + MCP** = killer features 2027 ! 🎯
