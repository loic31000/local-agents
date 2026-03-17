package tools

import (
	"context"
	"testing"
)

func TestNewVSCodeTool(t *testing.T) {
	tool := NewVSCodeTool()

	if tool == nil {
		t.Fatal("Expected non-nil tool")
	}
}

func TestVSCodeToolName(t *testing.T) {
	tool := NewVSCodeTool()

	name := tool.Name()

	if name != "vscode" {
		t.Errorf("Expected name 'vscode', got %s", name)
	}
}

func TestVSCodeToolDescription(t *testing.T) {
	tool := NewVSCodeTool()

	desc := tool.Description()

	if desc == "" {
		t.Error("Expected non-empty description")
	}
}

func TestVSCodeToolSchema(t *testing.T) {
	tool := NewVSCodeTool()

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

func TestVSCodeToolExecuteInvalidAction(t *testing.T) {
	tool := NewVSCodeTool()

	ctx, cancel := context.WithTimeout(context.Background(), 5*1000000)
	defer cancel()

	_, err := tool.Execute(ctx, map[string]interface{}{
		"action": "invalid",
	})

	if err == nil {
		t.Error("Expected error for invalid action")
	}
}
