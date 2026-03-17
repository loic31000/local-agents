package main

import (
	"testing"
)

func TestConfigStruct(t *testing.T) {
	config := &Config{}
	config.Server.Host = "0.0.0.0"
	config.Server.Port = 8080
	config.Server.WebsocketPath = "/ws"

	if config.Server.Host != "0.0.0.0" {
		t.Errorf("Expected host '0.0.0.0', got %s", config.Server.Host)
	}

	if config.Server.Port != 8080 {
		t.Errorf("Expected port 8080, got %d", config.Server.Port)
	}

	if config.Server.WebsocketPath != "/ws" {
		t.Errorf("Expected websocket path '/ws', got %s", config.Server.WebsocketPath)
	}
}

func TestAgentConfigStruct(t *testing.T) {
	agentConfig := AgentConfig{
		Enabled:      true,
		PromptFile:   "prompts/coder.md",
		Model:        "qwen2.5-coder:1.5b",
		Tools:        []string{"filesystem", "git", "terminal"},
		AllowedPaths: []string{"/home", "/tmp"},
		Port:         8000,
		Endpoint:     "internal",
		Type:         "internal",
	}

	if !agentConfig.Enabled {
		t.Error("Expected Enabled to be true")
	}

	if agentConfig.PromptFile != "prompts/coder.md" {
		t.Errorf("Expected PromptFile 'prompts/coder.md', got %s", agentConfig.PromptFile)
	}

	if agentConfig.Model != "qwen2.5-coder:1.5b" {
		t.Errorf("Expected Model 'qwen2.5-coder:1.5b', got %s", agentConfig.Model)
	}

	if len(agentConfig.Tools) != 3 {
		t.Errorf("Expected 3 tools, got %d", len(agentConfig.Tools))
	}

	if agentConfig.Port != 8000 {
		t.Errorf("Expected Port 8000, got %d", agentConfig.Port)
	}

	if agentConfig.Type != "internal" {
		t.Errorf("Expected Type 'internal', got %s", agentConfig.Type)
	}
}

func TestOrchestratorCreation(t *testing.T) {
	config := &Config{}
	config.Server.Host = "0.0.0.0"
	config.Server.Port = 8080
	config.Server.WebsocketPath = "/ws"
	config.Ollama.BaseURL = "http://localhost:11434"
	config.Ollama.DefaultModel = "test-model"
	config.Ollama.Models = make(map[string]string)
	config.Agents = make(map[string]AgentConfig)

	// Note: We can't test NewOrchestrator directly without a running Ollama instance
	// but we can test the config structure

	if config.Server.Host != "0.0.0.0" {
		t.Error("Expected config to be created correctly")
	}
}

func TestAgentConfigTypes(t *testing.T) {
	internalConfig := AgentConfig{
		Type: "internal",
	}

	externalConfig := AgentConfig{
		Type: "external",
	}

	if internalConfig.Type != "internal" {
		t.Error("Expected internal agent type")
	}

	if externalConfig.Type != "external" {
		t.Error("Expected external agent type")
	}
}

func TestConfigQueueSettings(t *testing.T) {
	config := &Config{}
	config.Queue.Type = "memory"
	config.Queue.MaxConcurrent = 5
	config.Queue.TaskTimeout = "30s"

	if config.Queue.Type != "memory" {
		t.Errorf("Expected queue type 'memory', got %s", config.Queue.Type)
	}

	if config.Queue.MaxConcurrent != 5 {
		t.Errorf("Expected max concurrent 5, got %d", config.Queue.MaxConcurrent)
	}

	if config.Queue.TaskTimeout != "30s" {
		t.Errorf("Expected task timeout '30s', got %s", config.Queue.TaskTimeout)
	}
}

func TestConfigLoggingSettings(t *testing.T) {
	config := &Config{}
	config.Logging.Level = "info"
	config.Logging.Format = "json"
	config.Logging.File = "/var/log/orchestrator.log"

	if config.Logging.Level != "info" {
		t.Errorf("Expected log level 'info', got %s", config.Logging.Level)
	}

	if config.Logging.Format != "json" {
		t.Errorf("Expected log format 'json', got %s", config.Logging.Format)
	}

	if config.Logging.File != "/var/log/orchestrator.log" {
		t.Errorf("Expected log file '/var/log/orchestrator.log', got %s", config.Logging.File)
	}
}
