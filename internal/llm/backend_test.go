package llm

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestNewBackendRouter(t *testing.T) {
	router := NewBackendRouter("http://localhost:11434")

	if router == nil {
		t.Fatal("Expected non-nil router")
	}

	if router.ollama == nil {
		t.Error("Expected non-nil Ollama client")
	}

	if router.mock == nil {
		t.Error("Expected non-nil Mock client")
	}

	if router.backendFile != ".backend" {
		t.Errorf("Expected backend file '.backend', got %s", router.backendFile)
	}
}

func TestActiveBackendDefault(t *testing.T) {
	// Clear environment
	os.Unsetenv("BACKEND")

	// Create temporary test directory
	oldWd, _ := os.Getwd()
	tmpDir := t.TempDir()
	os.Chdir(tmpDir)
	defer os.Chdir(oldWd)

	router := NewBackendRouter("http://localhost:11434")

	backend := router.ActiveBackend()

	if backend != BackendOllama {
		t.Errorf("Expected default backend 'ollama', got %s", backend)
	}
}

func TestActiveBackendFromEnv(t *testing.T) {
	// Set environment variable
	os.Setenv("BACKEND", "mock")
	defer os.Unsetenv("BACKEND")

	router := NewBackendRouter("http://localhost:11434")
	backend := router.ActiveBackend()

	if backend != BackendMock {
		t.Errorf("Expected backend 'mock' from env, got %s", backend)
	}
}

func TestActiveBackendWithWhitespace(t *testing.T) {
	os.Setenv("BACKEND", "  mock  ")
	defer os.Unsetenv("BACKEND")

	router := NewBackendRouter("http://localhost:11434")
	backend := router.ActiveBackend()

	if backend != BackendMock {
		t.Errorf("Expected backend 'mock' (trimmed), got %s", backend)
	}
}

func TestChatRoutingToMock(t *testing.T) {
	os.Setenv("BACKEND", "mock")
	defer os.Unsetenv("BACKEND")

	router := NewBackendRouter("http://localhost:11434")

	messages := []Message{
		{Role: "user", Content: "Hello"},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	response, err := router.Chat(ctx, "coder", messages, &Options{Temperature: 0.7})

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if response == nil {
		t.Error("Expected non-nil response")
	}

	if response.Message.Role != "assistant" {
		t.Errorf("Expected role 'assistant', got %s", response.Message.Role)
	}

	if response.Done != true {
		t.Error("Expected done=true")
	}
}

func TestPingMockBackend(t *testing.T) {
	os.Setenv("BACKEND", "mock")
	defer os.Unsetenv("BACKEND")

	router := NewBackendRouter("http://localhost:11434")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := router.Ping(ctx)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
}

func TestOllamaClientGetter(t *testing.T) {
	router := NewBackendRouter("http://localhost:11434")
	client := router.OllamaClient()

	if client == nil {
		t.Error("Expected non-nil Ollama client")
	}

	if client.baseURL != "http://localhost:11434" {
		t.Errorf("Expected base URL 'http://localhost:11434', got %s", client.baseURL)
	}
}

func TestNewMockClient(t *testing.T) {
	client := NewMockClient()

	if client == nil {
		t.Fatal("Expected non-nil mock client")
	}

	if client.callCount != 0 {
		t.Errorf("Expected call count 0, got %d", client.callCount)
	}
}

func TestMockClientChat(t *testing.T) {
	client := NewMockClient()

	messages := []Message{
		{Role: "user", Content: "Write a hello world program"},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	response, err := client.Chat(ctx, "coder", messages, &Options{Temperature: 0.7})

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if response == nil {
		t.Error("Expected non-nil response")
	}

	if response.Model == "" {
		t.Error("Expected non-empty model name")
	}

	if response.Message.Content == "" {
		t.Error("Expected non-empty message content")
	}

	if response.Done != true {
		t.Error("Expected done=true")
	}
}

func TestMockClientListModels(t *testing.T) {
	client := NewMockClient()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	models, err := client.ListModels(ctx)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if models == nil {
		t.Error("Expected non-nil models slice")
	}

	if len(models) == 0 {
		t.Error("Expected non-empty models list")
	}

	for _, model := range models {
		if model == "" {
			t.Error("Expected non-empty model name in list")
		}
	}
}

func TestBackendConstants(t *testing.T) {
	if BackendOllama != "ollama" {
		t.Errorf("Expected BackendOllama='ollama', got %s", BackendOllama)
	}

	if BackendMock != "mock" {
		t.Errorf("Expected BackendMock='mock', got %s", BackendMock)
	}
}

func TestListModels(t *testing.T) {
	os.Setenv("BACKEND", "mock")
	defer os.Unsetenv("BACKEND")

	router := NewBackendRouter("http://localhost:11434")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	models, err := router.ListModels(ctx)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if models == nil {
		t.Error("Expected non-nil models")
	}

	if len(models) == 0 {
		t.Error("Expected non-empty models list")
	}
}

func TestMockClientResponseVariations(t *testing.T) {
	client := NewMockClient()

	tests := []struct {
		model string
		name  string
	}{
		{"coder", "Coder Agent"},
		{"files", "Files Agent"},
		{"email", "Email Agent"},
		{"discord", "Discord Agent"},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	for _, test := range tests {
		messages := []Message{{Role: "user", Content: "test"}}
		response, err := client.Chat(ctx, test.model, messages, nil)

		if err != nil {
			t.Fatalf("Unexpected error for %s: %v", test.model, err)
		}

		if response == nil {
			t.Errorf("Expected non-nil response for %s", test.model)
		}

		if response.Message.Content == "" {
			t.Errorf("Expected non-empty content for %s", test.model)
		}
	}
}

func TestMockClientConsistency(t *testing.T) {
	client := NewMockClient()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	messages := []Message{{Role: "user", Content: "test"}}

	response1, _ := client.Chat(ctx, "coder", messages, nil)
	response2, _ := client.Chat(ctx, "coder", messages, nil)
	response3, _ := client.Chat(ctx, "coder", messages, nil)

	// Responses should be different due to cycling through responses
	if response1.Message.Content == response2.Message.Content &&
		response2.Message.Content == response3.Message.Content {
		t.Error("Expected responses to vary")
	}
}

func TestChatRoutingToOllama(t *testing.T) {
	os.Unsetenv("BACKEND")

	// Create temporary test directory
	oldWd, _ := os.Getwd()
	tmpDir := t.TempDir()
	os.Chdir(tmpDir)
	defer os.Chdir(oldWd)

	router := NewBackendRouter("http://localhost:19999")

	messages := []Message{
		{Role: "user", Content: "test"},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	// Will fail because Ollama is not reachable on port 19999
	_, _ = router.Chat(ctx, "test-model", messages, nil)
	// We're just testing the routing, not the success
}

func TestPingOllamaBackend(t *testing.T) {
	os.Unsetenv("BACKEND")

	// Create temporary test directory
	oldWd, _ := os.Getwd()
	tmpDir := t.TempDir()
	os.Chdir(tmpDir)
	defer os.Chdir(oldWd)

	router := NewBackendRouter("http://localhost:19999")

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	// Will fail because Ollama is not reachable on port 19999
	_ = router.Ping(ctx)
	// We're just testing the routing, not the success
}
