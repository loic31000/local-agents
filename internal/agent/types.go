package agent

import (
	"context"
	"time"
)

// Agent représente un agent spécialisé
type Agent interface {
	// Info retourne les informations de l'agent
	Info() AgentInfo

	// Execute exécute une tâche
	Execute(ctx context.Context, task *Task) (*Result, error)

	// CanHandle vérifie si l'agent peut traiter cette tâche
	CanHandle(task *Task) bool

	// Tools retourne les outils disponibles pour cet agent
	Tools() []Tool

	// Active un agent
	Enable()

	// Desactive un agent
	Disable()
}

// AgentInfo contient les métadonnées d'un agent
type AgentInfo struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Model        string   `json:"model"`
	Capabilities []string `json:"capabilities"`
	Enabled      bool     `json:"enabled"`
}

// Task représente une tâche à exécuter
type Task struct {
	ID        string                 `json:"id"`
	AgentID   string                 `json:"agent_id"`
	Type      TaskType               `json:"type"`
	Input     string                 `json:"input"`
	Context   map[string]interface{} `json:"context,omitempty"`
	Priority  int                    `json:"priority"`
	CreatedAt time.Time              `json:"created_at"`
	Timeout   time.Duration          `json:"timeout,omitempty"`
	ParentID  string                 `json:"parent_id,omitempty"` // Pour les sous-tâches
}

// TaskType définit le type de tâche
type TaskType string

const (
	TaskTypeChat     TaskType = "chat"
	TaskTypeAction   TaskType = "action"
	TaskTypeAnalyze  TaskType = "analyze"
	TaskTypeGenerate TaskType = "generate"
	TaskTypeAutomate TaskType = "automate"
)

// Result représente le résultat d'une tâche
type Result struct {
	TaskID      string                 `json:"task_id"`
	AgentID     string                 `json:"agent_id"`
	Success     bool                   `json:"success"`
	Output      string                 `json:"output"`
	Data        map[string]interface{} `json:"data,omitempty"`
	Actions     []ActionTaken          `json:"actions,omitempty"`
	Error       string                 `json:"error,omitempty"`
	Duration    time.Duration          `json:"duration"`
	TokensUsed  int                    `json:"tokens_used,omitempty"`
	CompletedAt time.Time              `json:"completed_at"`
}

// ActionTaken représente une action effectuée par l'agent
type ActionTaken struct {
	Tool      string                 `json:"tool"`
	Action    string                 `json:"action"`
	Params    map[string]interface{} `json:"params,omitempty"`
	Result    interface{}            `json:"result,omitempty"`
	Success   bool                   `json:"success"`
	Error     string                 `json:"error,omitempty"`
	Timestamp time.Time              `json:"timestamp"`
}

// Tool représente un outil utilisable par un agent
type Tool interface {
	// Name retourne le nom de l'outil
	Name() string

	// Description retourne la description pour le LLM
	Description() string

	// Schema retourne le schéma JSON des paramètres
	Schema() map[string]interface{}

	// Execute exécute l'outil avec les paramètres donnés
	Execute(ctx context.Context, params map[string]interface{}) (interface{}, error)
}

// Conversation représente une conversation avec historique
type Conversation struct {
	ID        string    `json:"id"`
	AgentID   string    `json:"agent_id"`
	Messages  []Message `json:"messages"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Message représente un message dans une conversation
type Message struct {
	Role      string     `json:"role"` // system, user, assistant, tool
	Content   string     `json:"content"`
	ToolCalls []ToolCall `json:"tool_calls,omitempty"`
	Timestamp time.Time  `json:"timestamp"`
}

// ToolCall représente un appel d'outil par le LLM
type ToolCall struct {
	ID     string                 `json:"id"`
	Tool   string                 `json:"tool"`
	Params map[string]interface{} `json:"params"`
	Result interface{}            `json:"result,omitempty"`
	Error  string                 `json:"error,omitempty"`
}
