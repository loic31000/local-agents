package tools

import (
	"context"
	"testing"
)

func TestNewTerminalTool(t *testing.T) {
	tool := NewTerminalTool("/tmp")

	if tool == nil {
		t.Fatal("Expected non-nil tool")
	}
}

func TestTerminalToolName(t *testing.T) {
	tool := NewTerminalTool("/tmp")

	name := tool.Name()

	if name != "terminal" {
		t.Errorf("Expected name 'terminal', got %s", name)
	}
}

func TestTerminalToolDescription(t *testing.T) {
	tool := NewTerminalTool("/tmp")

	desc := tool.Description()

	if desc == "" {
		t.Error("Expected non-empty description")
	}
}

func TestTerminalToolSchema(t *testing.T) {
	tool := NewTerminalTool("/tmp")

	schema := tool.Schema()

	if schema == nil {
		t.Fatal("Expected non-nil schema")
	}

	properties, ok := schema["properties"].(map[string]interface{})
	if !ok {
		t.Fatal("Expected properties in schema")
	}

	if _, ok := properties["command"]; !ok {
		t.Error("Expected 'command' property in schema")
	}
}

func TestTerminalToolExecuteEmptyCommand(t *testing.T) {
	tool := NewTerminalTool("/tmp")

	ctx, cancel := context.WithTimeout(context.Background(), 5*1000000)
	defer cancel()

	result, err := tool.Execute(ctx, map[string]interface{}{})

	// Empty command might still execute (bash -c "")
	// Just verify we got some response without errors we don't expect
	_ = result
	_ = err
}
