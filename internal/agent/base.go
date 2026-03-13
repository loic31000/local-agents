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
	ollamaClient *llm.OllamaClient
	tools        []Tool
	conversation *Conversation
}

// NewBaseAgent crée un nouvel agent de base
func NewBaseAgent(info AgentInfo, systemPrompt string, client *llm.OllamaClient) *BaseAgent {
	return &BaseAgent{
		info:         info,
		systemPrompt: systemPrompt,
		ollamaClient: client,
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

	// Construire les messages
	messages := a.buildMessages(task)

	// Déterminer le modèle à utiliser (possibilité d'override via task.Context)
	model := a.info.Model
	if task != nil && task.Context != nil {
		if m, ok := task.Context["model"].(string); ok && m != "" && m != "default" {
			model = m
		}
	}

	// Appeler le LLM
	response, err := a.ollamaClient.Chat(ctx, model, messages, &llm.Options{
		Temperature: 0.7,
	})
	if err != nil {
		return &Result{
			TaskID:      task.ID,
			AgentID:     a.info.ID,
			Success:     false,
			Error:       err.Error(),
			Duration:    time.Since(startTime),
			CompletedAt: time.Now(),
		}, err
	}

	// Parser la réponse pour détecter les appels d'outils
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

	// Ajouter à l'historique
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

// buildMessages construit la liste des messages pour le LLM
func (a *BaseAgent) buildMessages(task *Task) []llm.Message {
	messages := make([]llm.Message, 0)

	// System prompt avec description des outils
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

	messages = append(messages, llm.Message{
		Role:    "system",
		Content: systemPrompt,
	})

	// Ajouter l'historique de conversation (limité aux 10 derniers messages)
	historyStart := 0
	if len(a.conversation.Messages) > 10 {
		historyStart = len(a.conversation.Messages) - 10
	}
	for _, msg := range a.conversation.Messages[historyStart:] {
		messages = append(messages, llm.Message{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	// Ajouter la nouvelle tâche
	messages = append(messages, llm.Message{
		Role:    "user",
		Content: task.Input,
	})

	return messages
}

// processResponse traite la réponse du LLM et exécute les outils si nécessaire
func (a *BaseAgent) processResponse(ctx context.Context, content string) (string, []ActionTaken, error) {
	actions := make([]ActionTaken, 0)

	// Regex pour détecter les appels d'outils
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

		// Parser l'appel d'outil
		var toolCall struct {
			Tool   string                 `json:"tool"`
			Params map[string]interface{} `json:"params"`
		}
		if err := json.Unmarshal([]byte(match[1]), &toolCall); err != nil {
			continue
		}

		// Trouver et exécuter l'outil
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

		// Remplacer l'appel d'outil par le résultat dans la sortie
		if action.Success {
			resultJSON, _ := json.Marshal(action.Result)
			output = strings.Replace(output, match[0],
				fmt.Sprintf("[Outil %s exécuté avec succès: %s]", action.Tool, string(resultJSON)), 1)
		} else {
			output = strings.Replace(output, match[0],
				fmt.Sprintf("[Erreur outil %s: %s]", action.Tool, action.Error), 1)
		}
	}

	return output, actions, nil
}

// ResetConversation réinitialise l'historique de conversation
func (a *BaseAgent) ResetConversation() {
	a.conversation = &Conversation{
		ID:        fmt.Sprintf("conv-%d", time.Now().UnixNano()),
		AgentID:   a.info.ID,
		Messages:  make([]Message, 0),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
}

// GetConversation retourne la conversation actuelle
func (a *BaseAgent) GetConversation() *Conversation {
	return a.conversation
}
