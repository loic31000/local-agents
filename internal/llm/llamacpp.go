package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// LlamaCppClient communique avec llama-server (llama.cpp)
// via l'API OpenAI-compatible : http://localhost:8081/v1/chat/completions
type LlamaCppClient struct {
	baseURL    string
	modelName  string // nom affiché seulement (llama-server charge 1 modèle fixe)
	httpClient *http.Client
}

// ---- Structures OpenAI-compatible ----

type openAIRequest struct {
	Model       string          `json:"model"`
	Messages    []openAIMessage `json:"messages"`
	Stream      bool            `json:"stream"`
	Temperature float64         `json:"temperature,omitempty"`
	TopP        float64         `json:"top_p,omitempty"`
	MaxTokens   int             `json:"max_tokens,omitempty"`
	RepeatPenalty float64       `json:"repeat_penalty,omitempty"`
}

type openAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIResponse struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Model   string `json:"model"`
	Choices []struct {
		Index   int           `json:"index"`
		Message openAIMessage `json:"message"`
		Delta   openAIMessage `json:"delta"`
		FinishReason string   `json:"finish_reason"`
	} `json:"choices"`
}

// NewLlamaCppClient crée un client pour llama-server
// baseURL exemple: "http://localhost:8081"
// modelName: nom logique (pour affichage seulement)
func NewLlamaCppClient(baseURL, modelName string) *LlamaCppClient {
	return &LlamaCppClient{
		baseURL:   strings.TrimRight(baseURL, "/"),
		modelName: modelName,
		httpClient: &http.Client{
			Timeout: 10 * time.Minute, // LLM locaux peuvent être lents
		},
	}
}

// Ping vérifie que llama-server tourne
func (c *LlamaCppClient) Ping(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/health", nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("llama-server not reachable at %s : %w", c.baseURL, err)
	}
	defer resp.Body.Close()

	// llama-server renvoie 200 ou 503 (model loading)
	if resp.StatusCode == http.StatusServiceUnavailable {
		return fmt.Errorf("llama-server démarre encore, attends quelques secondes")
	}
	return nil
}

// Chat envoie une requête et retourne la réponse complète
func (c *LlamaCppClient) Chat(ctx context.Context, model string, messages []Message, opts *Options) (*ChatResponse, error) {
	oapiMsgs := toOpenAIMessages(messages)

	reqBody := openAIRequest{
		Model:    "local-model", // llama-server ignore ce champ, il utilise le modèle chargé
		Messages: oapiMsgs,
		Stream:   false,
	}
	if opts != nil {
		reqBody.Temperature = opts.Temperature
		reqBody.TopP = opts.TopP
		if opts.NumPredict > 0 {
			reqBody.MaxTokens = opts.NumPredict
		}
		reqBody.RepeatPenalty = opts.RepeatPenalty
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		c.baseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("llama-server error (%d): %s", resp.StatusCode, string(b))
	}

	var oResp openAIResponse
	if err := json.NewDecoder(resp.Body).Decode(&oResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if len(oResp.Choices) == 0 {
		return nil, fmt.Errorf("réponse vide du modèle")
	}

	return &ChatResponse{
		Model: c.modelName,
		Message: Message{
			Role:    oResp.Choices[0].Message.Role,
			Content: oResp.Choices[0].Message.Content,
		},
		Done:      true,
		CreatedAt: time.Now().Format(time.RFC3339),
	}, nil
}

// ChatStream envoie une requête avec streaming (Server-Sent Events)
func (c *LlamaCppClient) ChatStream(ctx context.Context, model string, messages []Message, opts *Options, callback StreamCallback) (*ChatResponse, error) {
	oapiMsgs := toOpenAIMessages(messages)

	reqBody := openAIRequest{
		Model:    "local-model",
		Messages: oapiMsgs,
		Stream:   true,
	}
	if opts != nil {
		reqBody.Temperature = opts.Temperature
		reqBody.TopP = opts.TopP
		if opts.NumPredict > 0 {
			reqBody.MaxTokens = opts.NumPredict
		}
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		c.baseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("llama-server error (%d): %s", resp.StatusCode, string(b))
	}

	var fullContent strings.Builder
	scanner := bufio.NewScanner(resp.Body)

	for scanner.Scan() {
		line := scanner.Text()

		// SSE format : "data: {...}" ou "data: [DONE]"
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var chunk openAIResponse
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		if len(chunk.Choices) > 0 {
			token := chunk.Choices[0].Delta.Content
			if token != "" {
				fullContent.WriteString(token)
				if callback != nil {
					if err := callback(token); err != nil {
						return nil, fmt.Errorf("callback error: %w", err)
					}
				}
			}
		}
	}

	return &ChatResponse{
		Model: c.modelName,
		Message: Message{
			Role:    "assistant",
			Content: fullContent.String(),
		},
		Done:      true,
		CreatedAt: time.Now().Format(time.RFC3339),
	}, nil
}

// ListModels retourne les modèles disponibles sur llama-server
func (c *LlamaCppClient) ListModels(ctx context.Context) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/v1/models", nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		// llama-server renvoie parfois juste le nom du fichier
		return []string{c.modelName}, nil
	}

	models := make([]string, 0, len(result.Data))
	for _, m := range result.Data {
		models = append(models, m.ID)
	}
	if len(models) == 0 {
		models = []string{c.modelName}
	}
	return models, nil
}

// ---- helpers ----

func toOpenAIMessages(msgs []Message) []openAIMessage {
	out := make([]openAIMessage, len(msgs))
	for i, m := range msgs {
		out[i] = openAIMessage{Role: m.Role, Content: m.Content}
	}
	return out
}
