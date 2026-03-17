package tools

import (
	"context"
	"testing"
)

func TestNewGitTool(t *testing.T) {
	tool := NewGitTool("/tmp")

	if tool == nil {
		t.Fatal("Expected non-nil tool")
	}
}

func TestGitToolName(t *testing.T) {
	tool := NewGitTool("/tmp")

	name := tool.Name()

	if name != "git" {
		t.Errorf("Expected name 'git', got %s", name)
	}
}

func TestGitToolDescription(t *testing.T) {
	tool := NewGitTool("/tmp")

	desc := tool.Description()

	if desc == "" {
		t.Error("Expected non-empty description")
	}
}

func TestGitToolSchema(t *testing.T) {
	tool := NewGitTool("/tmp")

	schema := tool.Schema()

	if schema == nil {
		t.Fatal("Expected non-nil schema")
	}

	properties, ok := schema["properties"].(map[string]interface{})
	if !ok {
		t.Fatal("Expected properties in schema")
	}

	if _, ok := properties["action"]; !ok {
		t.Error("Expected 'action' property in schema")
	}
}

func TestGitToolExecuteInvalidAction(t *testing.T) {
	tool := NewGitTool("/tmp")

	ctx, cancel := context.WithTimeout(context.Background(), 5*1000000)
	defer cancel()

	_, err := tool.Execute(ctx, map[string]interface{}{
		"action": "invalid",
	})

	if err == nil {
		t.Error("Expected error for invalid action")
	}
}
