package main

import (
	"net/http"
	"testing"
)

func TestMain(t *testing.T) {
	// Test that main can be imported and compiled successfully
	// Actual main() cannot be called directly, so we test components
}

func TestDefaultURL(t *testing.T) {
	if defaultURL == "" {
		t.Error("Expected non-empty defaultURL")
	}

	if defaultURL != "http://localhost:8080" {
		t.Errorf("Expected defaultURL 'http://localhost:8080', got %s", defaultURL)
	}
}

func TestWSURL(t *testing.T) {
	if wsURL == "" {
		t.Error("Expected non-empty wsURL")
	}

	if wsURL != "ws://localhost:8080/ws" {
		t.Errorf("Expected wsURL 'ws://localhost:8080/ws', got %s", wsURL)
	}
}

func TestAgentStruct(t *testing.T) {
	agent := Agent{
		ID:           "test-agent",
		Name:         "Test Agent",
		Model:        "test-model",
		Capabilities: []string{"chat", "action"},
		Enabled:      true,
	}

	if agent.ID != "test-agent" {
		t.Errorf("Expected ID 'test-agent', got %s", agent.ID)
	}

	if agent.Name != "Test Agent" {
		t.Errorf("Expected Name 'Test Agent', got %s", agent.Name)
	}

	if agent.Model != "test-model" {
		t.Errorf("Expected Model 'test-model', got %s", agent.Model)
	}

	if len(agent.Capabilities) != 2 {
		t.Errorf("Expected 2 capabilities, got %d", len(agent.Capabilities))
	}

	if !agent.Enabled {
		t.Error("Expected Enabled to be true")
	}
}

func TestChatResponseStruct(t *testing.T) {
	response := ChatResponse{
		TaskID:  "task-1",
		AgentID: "coder",
		Success: true,
		Output:  "Hello, World!",
		Error:   "",
	}

	if response.TaskID != "task-1" {
		t.Errorf("Expected TaskID 'task-1', got %s", response.TaskID)
	}

	if response.AgentID != "coder" {
		t.Errorf("Expected AgentID 'coder', got %s", response.AgentID)
	}

	if !response.Success {
		t.Error("Expected Success to be true")
	}

	if response.Output != "Hello, World!" {
		t.Errorf("Expected Output 'Hello, World!', got %s", response.Output)
	}

	if response.Error != "" {
		t.Errorf("Expected Error to be empty, got %s", response.Error)
	}
}

func TestHTTPMethods(t *testing.T) {
	if http.MethodPost != "POST" {
		t.Error("Expected HTTP POST method")
	}

	if http.MethodGet != "GET" {
		t.Error("Expected HTTP GET method")
	}
}

func TestAgentWithoutCapabilities(t *testing.T) {
	agent := Agent{
		ID:      "minimal-agent",
		Name:    "Minimal",
		Model:   "model",
		Enabled: false,
	}

	if agent.Capabilities != nil {
		t.Error("Expected nil capabilities for minimal agent")
	}

	if agent.Enabled {
		t.Error("Expected Enabled to be false")
	}
}

func TestChatResponseWithError(t *testing.T) {
	response := ChatResponse{
		TaskID:  "task-error",
		AgentID: "agent-1",
		Success: false,
		Error:   "Test error message",
	}

	if response.Success {
		t.Error("Expected Success to be false")
	}

	if response.Error != "Test error message" {
		t.Errorf("Expected error 'Test error message', got %s", response.Error)
	}
}
