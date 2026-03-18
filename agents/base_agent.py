"""
Agent Python de base pour communiquer avec l'orchestrateur Go.
"""

import os
import asyncio
import json
import aiohttp
import websockets
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional
from enum import Enum


class TaskType(Enum):
    CHAT = "chat"
    ACTION = "action"
    ANALYZE = "analyze"
    GENERATE = "generate"
    AUTOMATE = "automate"


@dataclass
class Task:
    id: str
    agent_id: str
    type: TaskType
    input: str
    context: Dict[str, Any] = field(default_factory=dict)
    priority: int = 0
    created_at: datetime = field(default_factory=datetime.now)
    timeout: Optional[float] = None
    parent_id: Optional[str] = None


@dataclass
class Result:
    task_id: str
    agent_id: str
    success: bool
    output: str
    data: Dict[str, Any] = field(default_factory=dict)
    actions: List[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None
    duration: float = 0.0
    completed_at: datetime = field(default_factory=datetime.now)


class BaseAgent(ABC):
    """Classe de base pour tous les agents Python."""

    def __init__(
        self,
        agent_id: str,
        orchestrator_url: str = None,
        ws_url: str = None
    ):
        _base = os.getenv("ORCHESTRATOR_URL", "http://localhost:8080")
        self.agent_id = agent_id
        self.orchestrator_url = orchestrator_url or _base
        self.ws_url = ws_url or _base.replace("http://", "ws://").replace("https://", "wss://") + "/ws"
        self.session: Optional[aiohttp.ClientSession] = None
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.handlers: Dict[str, Callable] = {}
        self.running = False

    async def connect(self):
        """Connecter à l'orchestrateur."""
        self.session = aiohttp.ClientSession()
        
        # Vérifier la santé de l'orchestrateur
        async with self.session.get(f"{self.orchestrator_url}/api/health") as resp:
            if resp.status != 200:
                raise ConnectionError("Impossible de se connecter à l'orchestrateur")
            data = await resp.json()
            print(f"✅ Connecté à l'orchestrateur (version {data.get('version', 'unknown')})")

    async def connect_websocket(self):
        """Connecter via WebSocket pour les updates en temps réel."""
        self.ws = await websockets.connect(self.ws_url)
        print(f"🔌 WebSocket connecté")

    async def disconnect(self):
        """Déconnecter proprement."""
        if self.ws:
            await self.ws.close()
        if self.session:
            await self.session.close()
        print("👋 Déconnecté")

    async def send_task(self, task: Task) -> str:
        """Envoyer une tâche à l'orchestrateur."""
        payload = {
            "id": task.id,
            "agent_id": task.agent_id,
            "type": task.type.value,
            "input": task.input,
            "context": task.context,
            "priority": task.priority,
        }
        
        async with self.session.post(
            f"{self.orchestrator_url}/api/tasks",
            json=payload
        ) as resp:
            data = await resp.json()
            return data.get("task_id")

    async def get_result(self, task_id: str) -> Optional[Result]:
        """Récupérer le résultat d'une tâche."""
        async with self.session.get(
            f"{self.orchestrator_url}/api/tasks/{task_id}"
        ) as resp:
            data = await resp.json()
            
            if data.get("status") == "pending":
                return None
            
            return Result(
                task_id=data["task_id"],
                agent_id=data["agent_id"],
                success=data["success"],
                output=data["output"],
                data=data.get("data", {}),
                actions=data.get("actions", []),
                error=data.get("error"),
                duration=data.get("duration", 0),
            )

    async def chat(self, message: str) -> Result:
        """Envoyer un message de chat et attendre la réponse."""
        async with self.session.post(
            f"{self.orchestrator_url}/api/chat/{self.agent_id}",
            json={"message": message}
        ) as resp:
            data = await resp.json()
            return Result(
                task_id=data["task_id"],
                agent_id=data["agent_id"],
                success=data["success"],
                output=data["output"],
                data=data.get("data", {}),
                actions=data.get("actions", []),
                error=data.get("error"),
                duration=data.get("duration", 0),
            )

    async def listen_websocket(self):
        """Écouter les messages WebSocket."""
        while self.running:
            try:
                message = await self.ws.recv()
                data = json.loads(message)
                
                msg_type = data.get("type")
                if msg_type in self.handlers:
                    await self.handlers[msg_type](data)
                    
            except websockets.ConnectionClosed:
                print("⚠️ WebSocket déconnecté, reconnexion...")
                with open("doc/training/log.txt", "a") as logf:
                    logf.write("[INFO] Pause 1s avant reconnexion WebSocket...\n")
                await asyncio.sleep(1)
                await self.connect_websocket()
            except Exception as e:
                print(f"❌ Erreur WebSocket: {e}")

    def on(self, event_type: str, handler: Callable):
        """Enregistrer un handler pour un type d'événement."""
        self.handlers[event_type] = handler

    async def send_ws_message(self, msg_type: str, payload: Dict[str, Any]):
        """Envoyer un message via WebSocket."""
        message = json.dumps({
            "type": msg_type,
            "payload": payload
        })
        await self.ws.send(message)

    @abstractmethod
    async def handle_task(self, task: Task) -> Result:
        """Traiter une tâche - à implémenter par les sous-classes."""
        pass

    async def run(self):
        """Boucle principale de l'agent."""
        self.running = True
        await self.connect()
        await self.connect_websocket()
        
        # Handler par défaut pour les résultats
        @self.on("result")
        async def handle_result(data):
            result = data.get("result", {})
            print(f"📨 Résultat reçu: {result.get('task_id')}")
        
        try:
            await self.listen_websocket()
        finally:
            self.running = False
            await self.disconnect()


class InteractiveAgent(BaseAgent):
    """Agent interactif en ligne de commande."""

    async def handle_task(self, task: Task) -> Result:
        # Déléguer à l'orchestrateur
        result = await self.chat(task.input)
        return result

    async def interactive_loop(self):
        """Boucle interactive pour tester l'agent."""
        await self.connect()
        
        print(f"\n🤖 Agent {self.agent_id} prêt!")
        print("Tapez votre message (ou 'quit' pour quitter)\n")
        
        while True:
            try:
                user_input = input("Vous: ").strip()
                
                if user_input.lower() in ['quit', 'exit', 'q']:
                    break
                
                if not user_input:
                    continue
                
                result = await self.chat(user_input)
                
                if result.success:
                    print(f"\n🤖 Agent: {result.output}\n")
                    if result.actions:
                        print("📋 Actions effectuées:")
                        for action in result.actions:
                            status = "✅" if action.get("success") else "❌"
                            print(f"  {status} {action.get('tool')}: {action.get('action')}")
                        print()
                else:
                    print(f"\n❌ Erreur: {result.error}\n")
                    
            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"❌ Erreur: {e}")
        
        await self.disconnect()


async def main():
    """Exemple d'utilisation."""
    import sys
    
    agent_id = sys.argv[1] if len(sys.argv) > 1 else "coder"
    
    agent = InteractiveAgent(agent_id)
    await agent.interactive_loop()


if __name__ == "__main__":
    asyncio.run(main())
