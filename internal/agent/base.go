package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/ton-user/local-agents/internal/llm"
)

// BaseAgent implémente la logique commune à tous les agents
type BaseAgent struct {
	info         AgentInfo
	systemPrompt string
	router       *llm.BackendRouter // ← remplace ollamaClient
	tools        []Tool
	conversation *Conversation
}

// NewBaseAgent crée un nouvel agent de base
func NewBaseAgent(info AgentInfo, systemPrompt string, client *llm.OllamaClient) *BaseAgent {
	return &BaseAgent{
		info:         info,
		systemPrompt: systemPrompt,
		router:       llm.NewBackendRouter(client.BaseURL()),
		tools:        make([]Tool, 0),
		conversation: &Conversation{
			ID:        fmt.Sprintf("conv-%d", time.Now().UnixNano()),
			AgentID:   info.ID,
			Messages:  make([]Message, 0),
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		},
	}
}

// Info retourne les informations de l'agent
func (a *BaseAgent) Info() AgentInfo {
	return a.info
}

// Tools retourne les outils disponibles
func (a *BaseAgent) Tools() []Tool {
	return a.tools
}

// AddTool ajoute un outil à l'agent
func (a *BaseAgent) AddTool(tool Tool) {
	a.tools = append(a.tools, tool)
}

// CanHandle vérifie si l'agent peut traiter cette tâche
func (a *BaseAgent) CanHandle(task *Task) bool {
	return task.AgentID == a.info.ID || task.AgentID == ""
}

// Execute exécute une tâche
func (a *BaseAgent) Execute(ctx context.Context, task *Task) (*Result, error) {
	startTime := time.Now()

	messages := a.buildMessages(task)

	// Déterminer le modèle — pour Mock, passer l'agent_id comme modèle
	model := a.info.Model
	if a.router.ActiveBackend() == llm.BackendMock {
		model = a.info.ID // MockClient utilise l'ID agent pour choisir la réponse
	} else if task != nil && task.Context != nil {
		if m, ok := task.Context["model"].(string); ok && m != "" && m != "default" {
			model = m
		}
	}

	// Router vers le bon backend (Mock / Ollama)
	response, err := a.router.Chat(ctx, model, messages, &llm.Options{
		Temperature: 0.7,
	})
	if err != nil {
		return &Result{
			TaskID:      task.ID,
			AgentID:     a.info.ID,
			Success:     false,
			Error:       fmt.Sprintf("[%s] %s", a.router.ActiveBackend(), err.Error()),
			Duration:    time.Since(startTime),
			CompletedAt: time.Now(),
		}, err
	}

	output, actions, err := a.processResponse(ctx, response.Message.Content)
	if err != nil {
		return &Result{
			TaskID:      task.ID,
			AgentID:     a.info.ID,
			Success:     false,
			Output:      response.Message.Content,
			Error:       err.Error(),
			Duration:    time.Since(startTime),
			CompletedAt: time.Now(),
		}, nil
	}

	a.conversation.Messages = append(a.conversation.Messages, Message{
		Role:      "user",
		Content:   task.Input,
		Timestamp: task.CreatedAt,
	})
	a.conversation.Messages = append(a.conversation.Messages, Message{
		Role:      "assistant",
		Content:   output,
		Timestamp: time.Now(),
	})
	a.conversation.UpdatedAt = time.Now()

	return &Result{
		TaskID:      task.ID,
		AgentID:     a.info.ID,
		Success:     true,
		Output:      output,
		Actions:     actions,
		Duration:    time.Since(startTime),
		CompletedAt: time.Now(),
	}, nil
}

func (a *BaseAgent) buildMessages(task *Task) []llm.Message {
	messages := make([]llm.Message, 0)

	systemPrompt := a.systemPrompt
	if len(a.tools) > 0 {
		systemPrompt += "\n\n## Outils disponibles\n\n"
		systemPrompt += "Tu peux utiliser les outils suivants en utilisant le format:\n"
		systemPrompt += "```tool\n{\"tool\": \"nom_outil\", \"params\": {...}}\n```\n\n"
		for _, tool := range a.tools {
			schemaJSON, _ := json.MarshalIndent(tool.Schema(), "", "  ")
			systemPrompt += fmt.Sprintf("### %s\n%s\nParamètres:\n```json\n%s\n```\n\n",
				tool.Name(), tool.Description(), string(schemaJSON))
		}
	}

	messages = append(messages, llm.Message{Role: "system", Content: systemPrompt})

	historyStart := 0
	if len(a.conversation.Messages) > 10 {
		historyStart = len(a.conversation.Messages) - 10
	}
	for _, msg := range a.conversation.Messages[historyStart:] {
		messages = append(messages, llm.Message{Role: msg.Role, Content: msg.Content})
	}

	messages = append(messages, llm.Message{Role: "user", Content: task.Input})
	return messages
}

func (a *BaseAgent) processResponse(ctx context.Context, content string) (string, []ActionTaken, error) {
	actions := make([]ActionTaken, 0)
	toolPattern := regexp.MustCompile("(?s)```tool\\s*\\n(.+?)\\n```")
	matches := toolPattern.FindAllStringSubmatch(content, -1)

	if len(matches) == 0 {
		return content, actions, nil
	}

	output := content
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		var toolCall struct {
			Tool   string                 `json:"tool"`
			Params map[string]interface{} `json:"params"`
		}
		if err := json.Unmarshal([]byte(match[1]), &toolCall); err != nil {
			continue
		}
		action := ActionTaken{
			Tool:      toolCall.Tool,
			Action:    "execute",
			Params:    toolCall.Params,
			Timestamp: time.Now(),
		}
		for _, tool := range a.tools {
			if tool.Name() == toolCall.Tool {
				result, err := tool.Execute(ctx, toolCall.Params)
				if err != nil {
					action.Success = false
					action.Error = err.Error()
				} else {
					action.Success = true
					action.Result = result
				}
				break
			}
		}
		actions = append(actions, action)
		if action.Success {
			resultJSON, _ := json.Marshal(action.Result)
			output = strings.Replace(output, match[0],
				fmt.Sprintf("[Outil %s exécuté: %s]", action.Tool, string(resultJSON)), 1)
		} else {
			output = strings.Replace(output, match[0],
				fmt.Sprintf("[Erreur outil %s: %s]", action.Tool, action.Error), 1)
		}
	}
	return output, actions, nil
}

func (a *BaseAgent) ResetConversation() {
	a.conversation = &Conversation{
		ID:        fmt.Sprintf("conv-%d", time.Now().UnixNano()),
		AgentID:   a.info.ID,
		Messages:  make([]Message, 0),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
}

func (a *BaseAgent) GetConversation() *Conversation {
	return a.conversation
}

func (a *BaseAgent) Enable() {
	a.info.Enabled = true
}

func (a *BaseAgent) Disable() {
	a.info.Enabled = false
}
