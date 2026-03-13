# 📡 Protocole d'échange Orchestrateur ↔ Agents

Ce document décrit le protocole de communication entre l'orchestrateur Go et les agents Python.

## Vue d'ensemble

```
┌─────────────────┐         JSON/HTTP         ┌─────────────────┐
│   Orchestrateur │ ◄─────────────────────────► │     Agent       │
│       (Go)      │                            │    (Python)     │
└─────────────────┘                            └─────────────────┘
        │                                              │
        │  1. TaskRequest                              │
        │ ─────────────────────────────────────────►   │
        │                                              │
        │  2. TaskResponse (streaming ou final)        │
        │ ◄─────────────────────────────────────────   │
        │                                              │
```

## 1. TaskRequest (Orchestrateur → Agent)

Envoyé par l'orchestrateur pour demander l'exécution d'une tâche.

### Schéma JSON

```json
{
  "request_id": "string (UUID v4, obligatoire)",
  "timestamp": "string (ISO 8601, obligatoire)",
  "agent_id": "string (obligatoire)",
  "task": {
    "type": "string (obligatoire: chat|command|tool)",
    "message": "string (obligatoire)",
    "context": {
      "conversation_id": "string (optionnel)",
      "history": [
        {
          "role": "string (user|assistant|system)",
          "content": "string",
          "timestamp": "string (ISO 8601)"
        }
      ],
      "metadata": {
        "channel_id": "string (optionnel)",
        "user_id": "string (optionnel)",
        "guild_id": "string (optionnel)"
      }
    }
  },
  "config": {
    "model": "string (optionnel, override du modèle)",
    "temperature": "number (optionnel, 0.0-1.0)",
    "max_tokens": "integer (optionnel)",
    "timeout_ms": "integer (optionnel, défaut: 30000)",
    "stream": "boolean (optionnel, défaut: false)"
  },
  "tools": [
    {
      "name": "string",
      "enabled": "boolean"
    }
  ]
}
```

### Exemple

```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-03-13T19:30:00Z",
  "agent_id": "coder",
  "task": {
    "type": "chat",
    "message": "Code une fonction fibonacci en Python",
    "context": {
      "conversation_id": "conv-123",
      "history": [
        {
          "role": "user",
          "content": "Salut !",
          "timestamp": "2024-03-13T19:29:00Z"
        },
        {
          "role": "assistant", 
          "content": "Bonjour ! Comment puis-je t'aider ?",
          "timestamp": "2024-03-13T19:29:05Z"
        }
      ],
      "metadata": {
        "channel_id": "123456789",
        "user_id": "987654321"
      }
    }
  },
  "config": {
    "model": "llama3.2:3b",
    "temperature": 0.7,
    "timeout_ms": 60000,
    "stream": true
  },
  "tools": [
    {"name": "filesystem", "enabled": true},
    {"name": "terminal", "enabled": true}
  ]
}
```

---

## 2. TaskResponse (Agent → Orchestrateur)

Réponse de l'agent après traitement.

### Schéma JSON

```json
{
  "request_id": "string (UUID, obligatoire - doit correspondre à la requête)",
  "timestamp": "string (ISO 8601, obligatoire)",
  "agent_id": "string (obligatoire)",
  "status": "string (obligatoire: success|error|partial|streaming)",
  "response": {
    "type": "string (obligatoire: text|code|action|mixed)",
    "content": "string (obligatoire)",
    "format": "string (optionnel: plain|markdown|json)",
    "language": "string (optionnel, pour type=code: python|javascript|go|...)",
    "actions_taken": [
      {
        "tool": "string",
        "action": "string",
        "params": {},
        "result": "string",
        "success": "boolean"
      }
    ]
  },
  "error": {
    "code": "string (obligatoire si status=error)",
    "message": "string (obligatoire si status=error)",
    "details": "string (optionnel)",
    "recoverable": "boolean (optionnel)"
  },
  "metrics": {
    "duration_ms": "integer",
    "tokens_used": "integer",
    "model_used": "string"
  }
}
```

### Codes d'erreur

| Code | Description | Recoverable |
|------|-------------|-------------|
| `ERR_TIMEOUT` | Timeout dépassé | Oui |
| `ERR_MODEL_NOT_FOUND` | Modèle Ollama non disponible | Oui |
| `ERR_OLLAMA_UNAVAILABLE` | Serveur Ollama inaccessible | Oui |
| `ERR_INVALID_REQUEST` | Requête malformée | Non |
| `ERR_TOOL_FAILED` | Échec d'un outil | Oui |
| `ERR_PERMISSION_DENIED` | Permission refusée | Non |
| `ERR_RATE_LIMITED` | Trop de requêtes | Oui |
| `ERR_INTERNAL` | Erreur interne agent | Non |

### Exemple - Succès

```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-03-13T19:30:05Z",
  "agent_id": "coder",
  "status": "success",
  "response": {
    "type": "code",
    "content": "def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)\n\n# Test\nfor i in range(10):\n    print(fibonacci(i))",
    "format": "markdown",
    "language": "python"
  },
  "metrics": {
    "duration_ms": 2340,
    "tokens_used": 156,
    "model_used": "llama3.2:3b"
  }
}
```

### Exemple - Erreur

```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-03-13T19:30:35Z",
  "agent_id": "coder",
  "status": "error",
  "error": {
    "code": "ERR_TIMEOUT",
    "message": "Le modèle n'a pas répondu dans le délai imparti",
    "details": "Timeout après 60000ms",
    "recoverable": true
  },
  "metrics": {
    "duration_ms": 60000
  }
}
```

---

## 3. Streaming (WebSocket)

Pour les réponses en streaming, l'agent envoie des chunks progressifs.

### StreamChunk

```json
{
  "request_id": "string",
  "chunk_id": "integer (0, 1, 2, ...)",
  "type": "string (start|chunk|end|error)",
  "content": "string (le fragment de texte)",
  "done": "boolean"
}
```

### Exemple de flux

```json
{"request_id": "abc", "chunk_id": 0, "type": "start", "content": "", "done": false}
{"request_id": "abc", "chunk_id": 1, "type": "chunk", "content": "def ", "done": false}
{"request_id": "abc", "chunk_id": 2, "type": "chunk", "content": "fibonacci", "done": false}
{"request_id": "abc", "chunk_id": 3, "type": "chunk", "content": "(n):\n", "done": false}
{"request_id": "abc", "chunk_id": 4, "type": "end", "content": "", "done": true}
```

---

## 4. Health Check

Les agents doivent exposer un endpoint de health check.

### Request
```
GET /health
```

### Response
```json
{
  "status": "string (healthy|degraded|unhealthy)",
  "agent_id": "string",
  "version": "string",
  "uptime_seconds": "integer",
  "last_request": "string (ISO 8601, optionnel)",
  "capabilities": ["string"],
  "model_available": "boolean"
}
```

---

## 5. Enregistrement d'agent

Quand un agent démarre, il s'enregistre auprès de l'orchestrateur.

### RegisterRequest (Agent → Orchestrateur)

```json
{
  "agent_id": "string",
  "name": "string",
  "description": "string",
  "version": "string",
  "endpoint": "string (URL de l'agent)",
  "capabilities": ["chat", "code", "tools"],
  "tools": ["filesystem", "terminal", "git"],
  "default_model": "string",
  "supported_models": ["string"]
}
```

### RegisterResponse (Orchestrateur → Agent)

```json
{
  "success": "boolean",
  "agent_id": "string",
  "config": {
    "model": "string",
    "timeout_ms": "integer"
  },
  "error": "string (si success=false)"
}
```

---

## 6. Validation

### Champs obligatoires par message

| Message | Champs obligatoires |
|---------|---------------------|
| TaskRequest | `request_id`, `timestamp`, `agent_id`, `task.type`, `task.message` |
| TaskResponse | `request_id`, `timestamp`, `agent_id`, `status` |
| TaskResponse (error) | + `error.code`, `error.message` |
| StreamChunk | `request_id`, `chunk_id`, `type`, `done` |
| Health | `status`, `agent_id` |
| Register | `agent_id`, `name`, `endpoint` |

### Validation des types

- `request_id` : UUID v4 format
- `timestamp` : ISO 8601 avec timezone (ex: `2024-03-13T19:30:00Z`)
- `status` : enum `[success, error, partial, streaming]`
- `type` (task) : enum `[chat, command, tool]`
- `type` (response) : enum `[text, code, action, mixed]`

---

## 7. Exemples d'implémentation

### Python (Agent)

```python
from dataclasses import dataclass
from enum import Enum
from typing import Optional, List, Dict, Any
import uuid
from datetime import datetime

class TaskType(Enum):
    CHAT = "chat"
    COMMAND = "command"
    TOOL = "tool"

class ResponseStatus(Enum):
    SUCCESS = "success"
    ERROR = "error"
    PARTIAL = "partial"
    STREAMING = "streaming"

@dataclass
class TaskRequest:
    request_id: str
    timestamp: str
    agent_id: str
    task_type: TaskType
    message: str
    context: Optional[Dict] = None
    config: Optional[Dict] = None
    tools: Optional[List[Dict]] = None
    
    @classmethod
    def from_json(cls, data: dict) -> 'TaskRequest':
        return cls(
            request_id=data['request_id'],
            timestamp=data['timestamp'],
            agent_id=data['agent_id'],
            task_type=TaskType(data['task']['type']),
            message=data['task']['message'],
            context=data['task'].get('context'),
            config=data.get('config'),
            tools=data.get('tools')
        )

@dataclass  
class TaskResponse:
    request_id: str
    agent_id: str
    status: ResponseStatus
    content: str = ""
    response_type: str = "text"
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    duration_ms: int = 0
    
    def to_json(self) -> dict:
        result = {
            "request_id": self.request_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "agent_id": self.agent_id,
            "status": self.status.value,
            "response": {
                "type": self.response_type,
                "content": self.content,
                "format": "markdown"
            },
            "metrics": {
                "duration_ms": self.duration_ms
            }
        }
        if self.status == ResponseStatus.ERROR:
            result["error"] = {
                "code": self.error_code,
                "message": self.error_message
            }
        return result
```

### Go (Orchestrateur)

```go
type TaskRequest struct {
    RequestID string    `json:"request_id"`
    Timestamp time.Time `json:"timestamp"`
    AgentID   string    `json:"agent_id"`
    Task      struct {
        Type    string                 `json:"type"`
        Message string                 `json:"message"`
        Context map[string]interface{} `json:"context,omitempty"`
    } `json:"task"`
    Config map[string]interface{} `json:"config,omitempty"`
    Tools  []ToolConfig           `json:"tools,omitempty"`
}

type TaskResponse struct {
    RequestID string `json:"request_id"`
    Timestamp string `json:"timestamp"`
    AgentID   string `json:"agent_id"`
    Status    string `json:"status"`
    Response  struct {
        Type    string `json:"type"`
        Content string `json:"content"`
        Format  string `json:"format,omitempty"`
    } `json:"response,omitempty"`
    Error   *ErrorInfo `json:"error,omitempty"`
    Metrics *Metrics   `json:"metrics,omitempty"`
}
```
