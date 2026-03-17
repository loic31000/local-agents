package tools

import (
	"context"
	"testing"
)

func TestNewEmailTool(t *testing.T) {
	tool := NewEmailTool("smtp.example.com", 587, "imap.example.com", 993)

	if tool == nil {
		t.Fatal("Expected non-nil tool")
	}

	if tool.smtpHost != "smtp.example.com" {
		t.Errorf("Expected smtpHost 'smtp.example.com', got %s", tool.smtpHost)
	}

	if tool.smtpPort != 587 {
		t.Errorf("Expected smtpPort 587, got %d", tool.smtpPort)
	}

	if tool.imapHost != "imap.example.com" {
		t.Errorf("Expected imapHost 'imap.example.com', got %s", tool.imapHost)
	}

	if tool.imapPort != 993 {
		t.Errorf("Expected imapPort 993, got %d", tool.imapPort)
	}
}

func TestEmailToolName(t *testing.T) {
	tool := NewEmailTool("smtp.example.com", 587, "imap.example.com", 993)

	name := tool.Name()

	if name != "email" {
		t.Errorf("Expected name 'email', got %s", name)
	}
}

func TestEmailToolDescription(t *testing.T) {
	tool := NewEmailTool("smtp.example.com", 587, "imap.example.com", 993)

	desc := tool.Description()

	if desc == "" {
		t.Error("Expected non-empty description")
	}

	if !contains(desc, "send") {
		t.Error("Expected 'send' in description")
	}
}

func TestEmailToolSchema(t *testing.T) {
	tool := NewEmailTool("smtp.example.com", 587, "imap.example.com", 993)

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

func TestEmailToolExecuteInvalidAction(t *testing.T) {
	tool := NewEmailTool("smtp.example.com", 587, "imap.example.com", 993)

	ctx, cancel := context.WithTimeout(context.Background(), 5*1000000)
	defer cancel()

	_, err := tool.Execute(ctx, map[string]interface{}{
		"action": "invalid",
	})

	if err == nil {
		t.Error("Expected error for invalid action")
	}
}
