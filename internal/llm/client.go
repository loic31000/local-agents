package llm

import "context"

// LLMClient interface commune pour OllamaClient et LlamaCppClient
// Permet de switcher de backend sans changer le reste du code
type LLMClient interface {
	Chat(ctx context.Context, model string, messages []Message, opts *Options) (*ChatResponse, error)
	ChatStream(ctx context.Context, model string, messages []Message, opts *Options, callback StreamCallback) (*ChatResponse, error)
	ListModels(ctx context.Context) ([]string, error)
	Ping(ctx context.Context) error
}

// Message représente un message dans la conversation
type Message struct {
	Role    string `json:"role"`    // system, user, assistant
	Content string `json:"content"`
}

// Options de génération LLM
type Options struct {
	Temperature   float64 `json:"temperature,omitempty"`
	TopP          float64 `json:"top_p,omitempty"`
	TopK          int     `json:"top_k,omitempty"`
	NumPredict    int     `json:"num_predict,omitempty"`
	RepeatPenalty float64 `json:"repeat_penalty,omitempty"`
}

// ChatResponse représente une réponse de chat
type ChatResponse struct {
	Model     string  `json:"model"`
	Message   Message `json:"message"`
	Done      bool    `json:"done"`
	CreatedAt string  `json:"created_at"`
}

// StreamCallback est appelée pour chaque token en streaming
type StreamCallback func(token string) error
