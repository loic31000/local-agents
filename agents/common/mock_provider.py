"""
Mock LLM Provider — réponses intelligentes par agent pour développement.

Zéro latence, zéro RAM, zéro GPU.
Idéal pour tester l'orchestration, le protocole, le dashboard sans LLM.

Usage:
    client = LLMClient(backend="mock")
    result = client.generate("génère une fonction Python", agent_id="coder")
    # → réponse réaliste ~0.3s
"""

import asyncio
import random
import time
import re
from dataclasses import dataclass
from typing import Optional, Dict, List, Any

from common.logger import get_logger

logger = get_logger("mock_provider")

# ─── Réponses par agent ────────────────────────────────────────────────────────

MOCK_RESPONSES: Dict[str, List[str]] = {

    "coder": [
        '''Voici une implémentation Python propre :

```python
def process_data(items: list[dict]) -> list[dict]:
    """Traite et filtre une liste d'éléments."""
    return [
        {**item, "processed": True}
        for item in items
        if item.get("active", False)
    ]

# Exemple d'utilisation
data = [{"id": 1, "active": True}, {"id": 2, "active": False}]
result = process_data(data)
print(result)  # [{"id": 1, "active": True, "processed": True}]
```

La fonction utilise une list comprehension pour filtrer et transformer en une seule passe. Complexité O(n).''',

        '''Voici le code demandé :

```python
import asyncio
import aiohttp
from typing import Optional

async def fetch_json(url: str, timeout: int = 30) -> Optional[dict]:
    """Récupère du JSON depuis une URL de manière asynchrone."""
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout)) as resp:
                if resp.status == 200:
                    return await resp.json()
                return None
        except Exception as e:
            print(f"Erreur: {e}")
            return None
```

Gestion des erreurs incluse, timeout configurable.''',

        '''Analyse du code :

**Problèmes détectés :**
- Pas de gestion d'exceptions sur les appels réseau
- Variable `data` non initialisée avant utilisation
- La boucle peut causer un index out of range si la liste est vide

**Corrections suggérées :**

```python
# Avant
for i in range(len(data)):
    print(data[i])

# Après — plus pythonique et sûr
for item in data or []:
    print(item)
```

Refactoring complet disponible si nécessaire.''',
    ],

    "files": [
        '''Voici les fichiers trouvés correspondant à votre recherche :

```
./src/main.py          (2.3 KB) — modifié il y a 2h
./src/utils.py         (1.1 KB) — modifié il y a 1j
./tests/test_main.py   (856 B)  — modifié il y a 3j
./README.md            (4.2 KB) — modifié il y a 1 semaine
```

4 fichiers trouvés. Souhaitez-vous en lire un en particulier ?''',

        '''Fichier lu avec succès :

```
Contenu de config.yaml (145 lignes) :

server:
  host: "0.0.0.0"
  port: 8081

ollama:
  base_url: "http://localhost:11434"
  default_model: "llama3.2:3b"
...
```

Le fichier est valide YAML. Aucune erreur de syntaxe détectée.''',

        '''Fichier créé avec succès : `output/rapport.md`

- Taille : 2.4 KB
- Lignes : 87
- Encodage : UTF-8

Chemin complet : `/home/user/projects/output/rapport.md`''',
    ],

    "email": [
        '''Email rédigé et prêt à l'envoi :

**À :** destinataire@exemple.com
**Objet :** Suivi de notre réunion du {date}

Bonjour,

Suite à notre échange, je me permets de vous faire un récapitulatif des points abordés.

[Corps de l'email]

Cordialement,
[Votre nom]

---
Voulez-vous modifier quelque chose avant l'envoi ?''',

        '''Email envoyé avec succès !

- **Destinataire :** contact@exemple.com
- **Objet :** Rapport mensuel
- **Envoyé le :** {timestamp}
- **ID message :** msg_7f3a92bc

Confirmation de livraison : en attente (généralement < 30s).''',
    ],

    "social": [
        '''Post Twitter/X rédigé (280 caractères max) :

> 🚀 Nouveau projet open source : Local Agents — framework d'agents IA 100% local.
> Orchestrateur Go + agents Python + bot Discord.
> Zéro cloud, zéro abonnement. #OpenSource #AI #LocalLLM

**Caractères :** 178/280 ✅
Voulez-vous l'ajuster ou publier tel quel ?''',

        '''Post LinkedIn rédigé :

**Titre :** Pourquoi j'ai choisi un LLM local pour mon projet

**Contenu :**
Après 6 mois d'utilisation d'APIs cloud, j'ai migré vers une stack 100% locale...

[Suite du post]

**Hashtags suggérés :** #IA #OpenSource #DéveloppementLogiciel #LocalFirst

Portée estimée : 200-800 impressions selon votre réseau.''',
    ],

    "discord": [
        "Bien sûr ! Je peux t'aider avec ça. Dis-moi ce dont tu as besoin et je m'en occupe.",
        "Voici ce que j'ai trouvé sur le sujet. Est-ce que ça répond à ta question ?",
        "Commande exécutée avec succès. Le serveur a été mis à jour.",
        "Je surveille le serveur en permanence. Tout semble normal pour l'instant. 🟢",
    ],

    "cyberdefence": [
        "Analyse de sécurité terminée. Aucune anomalie détectée dans les 15 dernières minutes.",
        "Alerte traitée. L'IP a été bloquée et l'événement enregistré dans le journal.",
        "Rapport de sécurité : 142 requêtes inspectées, 3 bloquées (2.1%), 0 incident critique.",
    ],

    # Réponses génériques pour les agents sans mapping spécifique
    "_default": [
        "J'ai analysé votre demande et voici ma réponse : [Réponse simulée par le Mock Layer].",
        "Traitement effectué avec succès. Résultat disponible.",
        "Voici ce que j'ai trouvé concernant votre requête.",
        "Opération terminée. Tout s'est bien passé.",
    ],
}

# ─── Délais simulés réalistes ─────────────────────────────────────────────────

MOCK_DELAYS = {
    "coder":       (0.3, 0.6),   # code generation — légèrement plus long
    "files":       (0.1, 0.3),   # opérations fichiers — rapide
    "email":       (0.2, 0.4),
    "social":      (0.2, 0.4),
    "discord":     (0.1, 0.2),   # bot Discord — très rapide
    "cyberdefence":(0.05, 0.1),  # no LLM — quasi instantané
    "_default":    (0.2, 0.5),
}


class MockProvider:
    """
    Provider LLM simulé avec réponses intelligentes par agent.

    - Délais réalistes par type d'agent
    - Réponses contextuelles (détecte le type de demande)
    - Métriques de performance simulées
    - Zéro dépendance externe
    """

    def __init__(self, agent_id: str = "_default", simulate_delay: bool = True):
        self.agent_id = agent_id
        self.simulate_delay = simulate_delay
        self._call_count = 0
        logger.info(f"MockProvider initialisé pour agent '{agent_id}'")

    def _get_delay(self) -> float:
        delays = MOCK_DELAYS.get(self.agent_id, MOCK_DELAYS["_default"])
        return random.uniform(*delays)

    def _pick_response(self, prompt: str) -> str:
        """Choisit une réponse en fonction du contexte du prompt."""
        responses = MOCK_RESPONSES.get(self.agent_id, MOCK_RESPONSES["_default"])
        prompt_lower = prompt.lower()

        # Sélection contextuelle pour le coder
        if self.agent_id == "coder":
            if any(w in prompt_lower for w in ["bug", "erreur", "problème", "fix", "debug", "analyse"]):
                return MOCK_RESPONSES["coder"][2]  # analyse/debug
            elif any(w in prompt_lower for w in ["async", "http", "api", "fetch", "request"]):
                return MOCK_RESPONSES["coder"][1]  # async code
            else:
                return MOCK_RESPONSES["coder"][0]  # code général

        # Sélection contextuelle pour files
        if self.agent_id == "files":
            if any(w in prompt_lower for w in ["lire", "read", "contenu", "afficher"]):
                return MOCK_RESPONSES["files"][1]
            elif any(w in prompt_lower for w in ["créer", "create", "écrire", "write", "sauvegarder"]):
                return MOCK_RESPONSES["files"][2]
            else:
                return MOCK_RESPONSES["files"][0]  # search

        # Sélection contextuelle pour social
        if self.agent_id == "social":
            if any(w in prompt_lower for w in ["linkedin", "professionnel"]):
                return MOCK_RESPONSES["social"][1]
            else:
                return MOCK_RESPONSES["social"][0]  # twitter

        # Par défaut : rotation
        self._call_count += 1
        return responses[self._call_count % len(responses)]

    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        config: Any = None,
    ):
        """Génération synchrone simulée."""
        from common.llm_client import GenerationResult, LLMBackend

        delay = self._get_delay() if self.simulate_delay else 0
        if delay > 0:
            with open("doc/training/log.txt", "a") as logf:
                logf.write(f"[MOCK_PROVIDER] Pause {delay}s (sync)...\n")
            time.sleep(delay)

        text = self._pick_response(prompt)
        duration_ms = int(delay * 1000)

        return GenerationResult(
            text=text,
            model=f"mock/{self.agent_id}",
            backend=LLMBackend.MOCK,
            duration_ms=duration_ms,
            tokens_used=len(text.split()),
            tokens_per_sec=round(len(text.split()) / max(delay, 0.001), 1),
        )

    async def agenerate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        config: Any = None,
    ):
        """Génération asynchrone simulée."""
        from common.llm_client import GenerationResult, LLMBackend

        delay = self._get_delay() if self.simulate_delay else 0
        if delay > 0:
            with open("doc/training/log.txt", "a") as logf:
                logf.write(f"[MOCK_PROVIDER] Pause {delay}s (async)...\n")
            await asyncio.sleep(delay)

        text = self._pick_response(prompt)
        duration_ms = int(delay * 1000)

        return GenerationResult(
            text=text,
            model=f"mock/{self.agent_id}",
            backend=LLMBackend.MOCK,
            duration_ms=duration_ms,
            tokens_used=len(text.split()),
            tokens_per_sec=round(len(text.split()) / max(delay, 0.001), 1),
        )

    def list_models(self) -> List[str]:
        return [f"mock/{agent}" for agent in MOCK_RESPONSES.keys() if not agent.startswith("_")]

    def get_model_info(self) -> Dict[str, Any]:
        return {
            "name": f"mock/{self.agent_id}",
            "backend": "mock",
            "agent_id": self.agent_id,
            "ram_mb": 0,
            "latency_ms": "100-600",
            "simulate_delay": self.simulate_delay,
        }

    def switch_model(self, agent_id: str):
        self.agent_id = agent_id
        logger.info(f"MockProvider: agent_id changé → {agent_id}")
