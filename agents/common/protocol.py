"""
Protocole d'échange entre orchestrateur et agents.

Ce module implémente les classes pour les messages du protocole.
Voir docs/PROTOCOL.md pour la documentation complète.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, List, Dict, Any
import uuid
import json


class TaskType(str, Enum):
    """Types de tâches supportés."""
    CHAT = "chat"
    COMMAND = "command"
    TOOL = "tool"


class ResponseStatus(str, Enum):
    """Statuts de réponse."""
    SUCCESS = "success"
    ERROR = "error"
    PARTIAL = "partial"
    STREAMING = "streaming"


class ResponseType(str, Enum):
    """Types de réponse."""
    TEXT = "text"
    CODE = "code"
    ACTION = "action"
    MIXED = "mixed"


class ErrorCode(str, Enum):
    """Codes d'erreur standardisés."""
    TIMEOUT = "ERR_TIMEOUT"
    MODEL_NOT_FOUND = "ERR_MODEL_NOT_FOUND"
    OLLAMA_UNAVAILABLE = "ERR_OLLAMA_UNAVAILABLE"
    INVALID_REQUEST = "ERR_INVALID_REQUEST"
    TOOL_FAILED = "ERR_TOOL_FAILED"
    PERMISSION_DENIED = "ERR_PERMISSION_DENIED"
    RATE_LIMITED = "ERR_RATE_LIMITED"
    INTERNAL = "ERR_INTERNAL"


@dataclass
class ContextMessage:
    """Message dans l'historique de conversation."""
    role: str  # user, assistant, system
    content: str
    timestamp: Optional[str] = None


@dataclass
class TaskContext:
    """Contexte d'une tâche."""
    conversation_id: Optional[str] = None
    history: List[ContextMessage] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TaskConfig:
    """Configuration d'une tâche."""
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    timeout_ms: int = 30000
    stream: bool = False


@dataclass
class ToolConfig:
    """Configuration d'un outil."""
    name: str
    enabled: bool = True


@dataclass
class TaskRequest:
    """
    Requête de tâche envoyée par l'orchestrateur.
    
    Champs obligatoires:
    - request_id
    - timestamp
    - agent_id
    - task_type
    - message
    """
    request_id: str
    timestamp: str
    agent_id: str
    task_type: TaskType
    message: str
    context: Optional[TaskContext] = None
    config: Optional[TaskConfig] = None
    tools: List[ToolConfig] = field(default_factory=list)
    
    @classmethod
    def from_json(cls, data: dict) -> 'TaskRequest':
        """Parse une requête depuis un dict JSON."""
        task = data.get('task', {})
        
        # Parse context
        context = None
        if 'context' in task:
            ctx_data = task['context']
            history = [
                ContextMessage(
                    role=m['role'],
                    content=m['content'],
                    timestamp=m.get('timestamp')
                )
                for m in ctx_data.get('history', [])
            ]
            context = TaskContext(
                conversation_id=ctx_data.get('conversation_id'),
                history=history,
                metadata=ctx_data.get('metadata', {})
            )
        
        # Parse config
        config = None
        if 'config' in data:
            cfg_data = data['config']
            config = TaskConfig(
                model=cfg_data.get('model'),
                temperature=cfg_data.get('temperature'),
                max_tokens=cfg_data.get('max_tokens'),
                timeout_ms=cfg_data.get('timeout_ms', 30000),
                stream=cfg_data.get('stream', False)
            )
        
        # Parse tools
        tools = [
            ToolConfig(name=t['name'], enabled=t.get('enabled', True))
            for t in data.get('tools', [])
        ]
        
        return cls(
            request_id=data['request_id'],
            timestamp=data['timestamp'],
            agent_id=data['agent_id'],
            task_type=TaskType(task['type']),
            message=task['message'],
            context=context,
            config=config,
            tools=tools
        )
    
    @classmethod
    def create(
        cls,
        agent_id: str,
        message: str,
        task_type: TaskType = TaskType.CHAT,
        **kwargs
    ) -> 'TaskRequest':
        """Crée une nouvelle requête avec ID et timestamp générés."""
        return cls(
            request_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc).isoformat(),
            agent_id=agent_id,
            task_type=task_type,
            message=message,
            **kwargs
        )


@dataclass
class ActionTaken:
    """Action exécutée par un outil."""
    tool: str
    action: str
    params: Dict[str, Any] = field(default_factory=dict)
    result: Optional[str] = None
    success: bool = True


@dataclass
class ResponseContent:
    """Contenu de la réponse."""
    type: ResponseType
    content: str
    format: str = "plain"  # plain, markdown, json
    language: Optional[str] = None  # Pour type=code
    actions_taken: List[ActionTaken] = field(default_factory=list)


@dataclass
class ErrorInfo:
    """Information d'erreur."""
    code: ErrorCode
    message: str
    details: Optional[str] = None
    recoverable: bool = True


@dataclass
class Metrics:
    """Métriques de la réponse."""
    duration_ms: int = 0
    tokens_used: Optional[int] = None
    model_used: Optional[str] = None


@dataclass
class TaskResponse:
    """
    Réponse de l'agent à une tâche.
    
    Champs obligatoires:
    - request_id (doit correspondre à la requête)
    - timestamp
    - agent_id
    - status
    """
    request_id: str
    timestamp: str
    agent_id: str
    status: ResponseStatus
    response: Optional[ResponseContent] = None
    error: Optional[ErrorInfo] = None
    metrics: Optional[Metrics] = None
    
    def to_json(self) -> dict:
        """Convertit en dict JSON."""
        result = {
            "request_id": self.request_id,
            "timestamp": self.timestamp,
            "agent_id": self.agent_id,
            "status": self.status.value,
        }
        
        if self.response:
            result["response"] = {
                "type": self.response.type.value,
                "content": self.response.content,
                "format": self.response.format,
            }
            if self.response.language:
                result["response"]["language"] = self.response.language
            if self.response.actions_taken:
                result["response"]["actions_taken"] = [
                    {
                        "tool": a.tool,
                        "action": a.action,
                        "params": a.params,
                        "result": a.result,
                        "success": a.success,
                    }
                    for a in self.response.actions_taken
                ]
        
        if self.error:
            result["error"] = {
                "code": self.error.code.value,
                "message": self.error.message,
            }
            if self.error.details:
                result["error"]["details"] = self.error.details
            result["error"]["recoverable"] = self.error.recoverable
        
        if self.metrics:
            result["metrics"] = {
                "duration_ms": self.metrics.duration_ms,
            }
            if self.metrics.tokens_used:
                result["metrics"]["tokens_used"] = self.metrics.tokens_used
            if self.metrics.model_used:
                result["metrics"]["model_used"] = self.metrics.model_used
        
        return result
    
    def to_json_string(self) -> str:
        """Convertit en string JSON."""
        return json.dumps(self.to_json(), ensure_ascii=False)
    
    @classmethod
    def success(
        cls,
        request_id: str,
        agent_id: str,
        content: str,
        response_type: ResponseType = ResponseType.TEXT,
        format: str = "markdown",
        duration_ms: int = 0,
        **kwargs
    ) -> 'TaskResponse':
        """Crée une réponse de succès."""
        return cls(
            request_id=request_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            agent_id=agent_id,
            status=ResponseStatus.SUCCESS,
            response=ResponseContent(
                type=response_type,
                content=content,
                format=format,
                **kwargs
            ),
            metrics=Metrics(duration_ms=duration_ms)
        )
    
    @classmethod
    def error(
        cls,
        request_id: str,
        agent_id: str,
        code: ErrorCode,
        message: str,
        details: Optional[str] = None,
        recoverable: bool = True,
        duration_ms: int = 0
    ) -> 'TaskResponse':
        """Crée une réponse d'erreur."""
        return cls(
            request_id=request_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            agent_id=agent_id,
            status=ResponseStatus.ERROR,
            error=ErrorInfo(
                code=code,
                message=message,
                details=details,
                recoverable=recoverable
            ),
            metrics=Metrics(duration_ms=duration_ms)
        )


@dataclass
class StreamChunk:
    """Chunk pour le streaming."""
    request_id: str
    chunk_id: int
    type: str  # start, chunk, end, error
    content: str = ""
    done: bool = False
    
    def to_json(self) -> dict:
        return {
            "request_id": self.request_id,
            "chunk_id": self.chunk_id,
            "type": self.type,
            "content": self.content,
            "done": self.done
        }


@dataclass
class HealthStatus:
    """Statut de santé de l'agent."""
    status: str  # healthy, degraded, unhealthy
    agent_id: str
    version: str
    uptime_seconds: int
    last_request: Optional[str] = None
    capabilities: List[str] = field(default_factory=list)
    model_available: bool = True
    
    def to_json(self) -> dict:
        return {
            "status": self.status,
            "agent_id": self.agent_id,
            "version": self.version,
            "uptime_seconds": self.uptime_seconds,
            "last_request": self.last_request,
            "capabilities": self.capabilities,
            "model_available": self.model_available
        }


@dataclass
class RegisterRequest:
    """Requête d'enregistrement d'agent."""
    agent_id: str
    name: str
    description: str
    endpoint: str
    version: str = "1.0.0"
    capabilities: List[str] = field(default_factory=list)
    tools: List[str] = field(default_factory=list)
    default_model: Optional[str] = None
    supported_models: List[str] = field(default_factory=list)
    
    def to_json(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "endpoint": self.endpoint,
            "capabilities": self.capabilities,
            "tools": self.tools,
            "default_model": self.default_model,
            "supported_models": self.supported_models
        }


# Validation helpers
def validate_request(data: dict) -> List[str]:
    """
    Valide une requête et retourne la liste des erreurs.
    
    Returns:
        Liste vide si valide, sinon liste des erreurs
    """
    errors = []
    
    required = ['request_id', 'timestamp', 'agent_id', 'task']
    for field in required:
        if field not in data:
            errors.append(f"Missing required field: {field}")
    
    if 'task' in data:
        task = data['task']
        if 'type' not in task:
            errors.append("Missing required field: task.type")
        if 'message' not in task:
            errors.append("Missing required field: task.message")
        if 'type' in task and task['type'] not in [t.value for t in TaskType]:
            errors.append(f"Invalid task type: {task['type']}")
    
    return errors


def validate_response(data: dict) -> List[str]:
    """
    Valide une réponse et retourne la liste des erreurs.
    """
    errors = []
    
    required = ['request_id', 'timestamp', 'agent_id', 'status']
    for field in required:
        if field not in data:
            errors.append(f"Missing required field: {field}")
    
    if 'status' in data:
        if data['status'] not in [s.value for s in ResponseStatus]:
            errors.append(f"Invalid status: {data['status']}")
        
        if data['status'] == 'error':
            if 'error' not in data:
                errors.append("Error response missing error field")
            elif 'code' not in data.get('error', {}):
                errors.append("Error response missing error.code")
            elif 'message' not in data.get('error', {}):
                errors.append("Error response missing error.message")
    
    return errors
