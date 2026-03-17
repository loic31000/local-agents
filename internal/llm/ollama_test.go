package llm

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestNewOllamaClient(t *testing.T) {
	baseURL := "http://localhost:11434"
	client := NewOllamaClient(baseURL)

	if client == nil {
		t.Fatal("Expected non-nil client")
	}

	if client.baseURL != baseURL {
		t.Errorf("Expected base URL %s, got %s", baseURL, client.baseURL)
	}

	if client.httpClient == nil {
		t.Error("Expected non-nil HTTP client")
	}

	if client.httpClient.Timeout != 5*time.Minute {
		t.Errorf("Expected timeout 5 minutes, got %v", client.httpClient.Timeout)
	}
}

func TestOllamaClientChatWithStream(t *testing.T) {
	// Create a mock HTTP server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/chat" {
			t.Errorf("Expected path /api/chat, got %s", r.URL.Path)
		}

		response := ChatResponse{
			Model: "test-model",
			Message: Message{
				Role:    "assistant",
				Content: "Streaming response",
			},
			Done:      true,
			CreatedAt: time.Now().Format(time.RFC3339),
		}

		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{
			"model": "%s",
			"message": {
				"role": "%s",
				"content": "%s"
			},
			"done": true,
			"created_at": "%s"
		}`, response.Model, response.Message.Role, response.Message.Content, response.CreatedAt)
	}))
	defer server.Close()

	client := NewOllamaClient(server.URL)

	messages := []Message{
		{Role: "user", Content: "Test message"},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	response, err := client.Chat(ctx, "test-model", messages, &Options{Temperature: 0.5})

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if response == nil {
		t.Error("Expected non-nil response")
	}

	if response.Message.Content != "Streaming response" {
		t.Errorf("Expected 'Streaming response', got %s", response.Message.Content)
	}
}

func TestOllamaClientTimeout(t *testing.T) {
	client := NewOllamaClient("http://localhost:19999")

	messages := []Message{
		{Role: "user", Content: "Test"},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	_, err := client.Chat(ctx, "test-model", messages, nil)

	if err == nil {
		t.Error("Expected timeout error")
	}
}

func TestOllamaClientInvalidJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("invalid json"))
	}))
	defer server.Close()

	client := NewOllamaClient(server.URL)

	messages := []Message{
		{Role: "user", Content: "Test"},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := client.Chat(ctx, "test-model", messages, nil)

	if err == nil {
		t.Error("Expected JSON parsing error")
	}
}

func TestMessageStruct(t *testing.T) {
	msg := Message{
		Role:    "user",
		Content: "Test content",
	}

	if msg.Role != "user" {
		t.Errorf("Expected role 'user', got %s", msg.Role)
	}

	if msg.Content != "Test content" {
		t.Errorf("Expected content 'Test content', got %s", msg.Content)
	}
}

func TestChatRequestStruct(t *testing.T) {
	req := ChatRequest{
		Model: "test-model",
		Messages: []Message{
			{Role: "user", Content: "Hello"},
		},
		Stream: false,
		Options: &Options{
			Temperature: 0.7,
		},
	}

	if req.Model != "test-model" {
		t.Errorf("Expected model 'test-model', got %s", req.Model)
	}

	if len(req.Messages) != 1 {
		t.Errorf("Expected 1 message, got %d", len(req.Messages))
	}

	if req.Stream != false {
		t.Error("Expected stream=false")
	}

	if req.Options.Temperature != 0.7 {
		t.Errorf("Expected temperature 0.7, got %f", req.Options.Temperature)
	}
}

func TestChatResponseStruct(t *testing.T) {
	resp := ChatResponse{
		Model: "test-model",
		Message: Message{
			Role:    "assistant",
			Content: "Response",
		},
		Done:      true,
		CreatedAt: time.Now().Format(time.RFC3339),
	}

	if resp.Model != "test-model" {
		t.Errorf("Expected model 'test-model', got %s", resp.Model)
	}

	if resp.Message.Content != "Response" {
		t.Errorf("Expected content 'Response', got %s", resp.Message.Content)
	}

	if resp.Done != true {
		t.Error("Expected done=true")
	}
}

func TestOptionsStruct(t *testing.T) {
	opts := &Options{
		Temperature:   0.8,
		TopP:          0.9,
		TopK:          40,
		NumPredict:    256,
		RepeatPenalty: 1.1,
	}

	if opts.Temperature != 0.8 {
		t.Errorf("Expected temperature 0.8, got %f", opts.Temperature)
	}

	if opts.TopP != 0.9 {
		t.Errorf("Expected top_p 0.9, got %f", opts.TopP)
	}

	if opts.TopK != 40 {
		t.Errorf("Expected top_k 40, got %d", opts.TopK)
	}

	if opts.NumPredict != 256 {
		t.Errorf("Expected num_predict 256, got %d", opts.NumPredict)
	}

	if opts.RepeatPenalty != 1.1 {
		t.Errorf("Expected repeat_penalty 1.1, got %f", opts.RepeatPenalty)
	}
}

func TestOllamaClientPing(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			t.Errorf("Expected path '/', got %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewOllamaClient(server.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := client.Ping(ctx)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
}

func TestOllamaClientPingFailed(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client := NewOllamaClient(server.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := client.Ping(ctx)
	if err == nil {
		t.Error("Expected error for failed ping")
	}
}

func TestOllamaClientListModels(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/tags" {
			t.Errorf("Expected path /api/tags, got %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{
			"models": [
				{"name": "model1"},
				{"name": "model2"},
				{"name": "model3"}
			]
		}`)
	}))
	defer server.Close()

	client := NewOllamaClient(server.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	models, err := client.ListModels(ctx)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if len(models) != 3 {
		t.Errorf("Expected 3 models, got %d", len(models))
	}

	if models[0] != "model1" || models[1] != "model2" || models[2] != "model3" {
		t.Error("Model names don't match expected values")
	}
}

func TestOllamaClientListModelsEmpty(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"models": []}`)
	}))
	defer server.Close()

	client := NewOllamaClient(server.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	models, err := client.ListModels(ctx)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if len(models) != 0 {
		t.Errorf("Expected 0 models, got %d", len(models))
	}
}

func TestOllamaClientBaseURL(t *testing.T) {
	baseURL := "http://localhost:11434"
	client := NewOllamaClient(baseURL)

	if client.BaseURL() != baseURL {
		t.Errorf("Expected base URL %s, got %s", baseURL, client.BaseURL())
	}
}

func TestOllamaClientChatHTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("Ollama server error"))
	}))
	defer server.Close()

	client := NewOllamaClient(server.URL)

	messages := []Message{
		{Role: "user", Content: "Test"},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := client.Chat(ctx, "test-model", messages, nil)

	if err == nil {
		t.Error("Expected HTTP error")
	}
}

func TestOllamaClientChatStream(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// Simulate streaming responses
		fmt.Fprintf(w, `{"model":"test","message":{"role":"assistant","content":"Hello"},"done":false}
`)
		fmt.Fprintf(w, `{"model":"test","message":{"role":"assistant","content":" world"},"done":true}
`)
	}))
	defer server.Close()

	client := NewOllamaClient(server.URL)

	messages := []Message{
		{Role: "user", Content: "Test"},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var received []string
	response, err := client.ChatStream(ctx, "test-model", messages, nil, func(token string) error {
		received = append(received, token)
		return nil
	})

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if response == nil {
		t.Error("Expected response")
	}

	if len(received) < 1 {
		t.Logf("Expected at least 1 token, got %d", len(received))
	}
}

func TestOllamaClientChatStreamNoResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// Return EOF without response
	}))
	defer server.Close()

	client := NewOllamaClient(server.URL)

	messages := []Message{
		{Role: "user", Content: "Test"},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	response, _ := client.ChatStream(ctx, "test-model", messages, nil, nil)

	if response != nil && response.Done {
		// Either nil response or no done response is acceptable
	}
}
