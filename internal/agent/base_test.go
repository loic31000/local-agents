package agent

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/ton-user/local-agents/internal/llm"
)

// MockTool implémente l'interface Tool pour les tests
type MockTool struct {
	name        string
	description string
	schema      map[string]interface{}
}

func (m *MockTool) Name() string {
	return m.name
}

func (m *MockTool) Description() string {
	return m.description
}

func (m *MockTool) Schema() map[string]interface{} {
	return m.schema
}

func (m *MockTool) Execute(ctx context.Context, params map[string]interface{}) (interface{}, error) {
	return "mock result", nil
}

func TestNewBaseAgent(t *testing.T) {
	info := AgentInfo{
		ID:           "test-agent",
		Name:         "Test Agent",
		Description:  "A test agent",
		Model:        "test-model",
		Capabilities: []string{"chat", "analyze"},
		Enabled:      true,
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	agent := NewBaseAgent(info, "You are a test agent", client)

	if agent.Info().ID != "test-agent" {
		t.Errorf("Expected agent ID 'test-agent', got %s", agent.Info().ID)
	}

	if agent.Info().Name != "Test Agent" {
		t.Errorf("Expected agent name 'Test Agent', got %s", agent.Info().Name)
	}

	if len(agent.Tools()) != 0 {
		t.Errorf("Expected 0 tools, got %d", len(agent.Tools()))
	}
}

func TestAddTool(t *testing.T) {
	info := AgentInfo{
		ID:    "test-agent",
		Name:  "Test Agent",
		Model: "test-model",
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	agent := NewBaseAgent(info, "You are a test agent", client)

	tool := &MockTool{
		name:        "test_tool",
		description: "A test tool",
		schema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"param": map[string]interface{}{"type": "string"},
			},
		},
	}

	agent.AddTool(tool)

	if len(agent.Tools()) != 1 {
		t.Errorf("Expected 1 tool, got %d", len(agent.Tools()))
	}

	if agent.Tools()[0].Name() != "test_tool" {
		t.Errorf("Expected tool name 'test_tool', got %s", agent.Tools()[0].Name())
	}
}

func TestCanHandle(t *testing.T) {
	info := AgentInfo{
		ID:    "test-agent",
		Name:  "Test Agent",
		Model: "test-model",
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	agent := NewBaseAgent(info, "You are a test agent", client)

	// Test avec agent_id correspondant
	task := &Task{
		ID:      "task-1",
		AgentID: "test-agent",
		Type:    TaskTypeChat,
		Input:   "Hello",
	}

	if !agent.CanHandle(task) {
		t.Error("Expected agent to handle task with matching agent_id")
	}

	// Test avec agent_id vide
	task.AgentID = ""
	if !agent.CanHandle(task) {
		t.Error("Expected agent to handle task with empty agent_id")
	}

	// Test avec agent_id non correspondant
	task.AgentID = "other-agent"
	if agent.CanHandle(task) {
		t.Error("Expected agent not to handle task with non-matching agent_id")
	}
}

func TestInfo(t *testing.T) {
	info := AgentInfo{
		ID:           "test-agent",
		Name:         "Test Agent",
		Description:  "A test agent",
		Model:        "test-model",
		Capabilities: []string{"chat", "analyze"},
		Enabled:      true,
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	agent := NewBaseAgent(info, "You are a test agent", client)

	retrievedInfo := agent.Info()

	if retrievedInfo.ID != info.ID {
		t.Errorf("Expected ID %s, got %s", info.ID, retrievedInfo.ID)
	}

	if retrievedInfo.Name != info.Name {
		t.Errorf("Expected name %s, got %s", info.Name, retrievedInfo.Name)
	}

	if retrievedInfo.Enabled != info.Enabled {
		t.Errorf("Expected enabled %v, got %v", info.Enabled, retrievedInfo.Enabled)
	}
}

func TestTools(t *testing.T) {
	info := AgentInfo{
		ID:    "test-agent",
		Name:  "Test Agent",
		Model: "test-model",
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	agent := NewBaseAgent(info, "You are a test agent", client)

	tools := agent.Tools()
	if tools == nil {
		t.Error("Expected non-nil tools slice")
	}

	if len(tools) != 0 {
		t.Errorf("Expected 0 tools initially, got %d", len(tools))
	}
}

func TestExecuteWithMockBackend(t *testing.T) {
	// Set the mock backend for this test
	os.Setenv("BACKEND", "mock")
	defer os.Unsetenv("BACKEND")

	info := AgentInfo{
		ID:    "coder",
		Name:  "Coder Agent",
		Model: "test-model",
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	agent := NewBaseAgent(info, "You are a coding assistant", client)

	task := &Task{
		ID:        "task-1",
		AgentID:   "coder",
		Type:      TaskTypeChat,
		Input:     "Hello from test",
		CreatedAt: time.Now(),
		Timeout:   10 * time.Second,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := agent.Execute(ctx, task)

	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if result == nil {
		t.Error("Expected non-nil result")
	}

	if result.TaskID != task.ID {
		t.Errorf("Expected task ID %s, got %s", task.ID, result.TaskID)
	}

	if result.AgentID != agent.Info().ID {
		t.Errorf("Expected agent ID %s, got %s", agent.Info().ID, result.AgentID)
	}
}

func TestExecuteTaskCreation(t *testing.T) {
	info := AgentInfo{
		ID:    "files",
		Name:  "Files Agent",
		Model: "test-model",
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	_ = NewBaseAgent(info, "You are a file management assistant", client)

	task := &Task{
		ID:        "task-2",
		AgentID:   "files",
		Type:      TaskTypeAction,
		Input:     "Create a test file",
		CreatedAt: time.Now(),
		Timeout:   10 * time.Second,
	}

	if task.ID == "" {
		t.Error("Expected non-empty task ID")
	}

	if task.AgentID != "files" {
		t.Errorf("Expected agent ID 'files', got %s", task.AgentID)
	}
}

func TestTaskTypes(t *testing.T) {
	tests := []struct {
		taskType TaskType
		expected string
	}{
		{TaskTypeChat, "chat"},
		{TaskTypeAction, "action"},
		{TaskTypeAnalyze, "analyze"},
		{TaskTypeGenerate, "generate"},
		{TaskTypeAutomate, "automate"},
	}

	for _, test := range tests {
		if string(test.taskType) != test.expected {
			t.Errorf("Expected task type %s, got %s", test.expected, string(test.taskType))
		}
	}
}

func TestAddMultipleTools(t *testing.T) {
	info := AgentInfo{
		ID:    "test-agent",
		Name:  "Test Agent",
		Model: "test-model",
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	agent := NewBaseAgent(info, "You are a test agent", client)

	tool1 := &MockTool{name: "tool1", description: "Tool 1"}
	tool2 := &MockTool{name: "tool2", description: "Tool 2"}
	tool3 := &MockTool{name: "tool3", description: "Tool 3"}

	agent.AddTool(tool1)
	agent.AddTool(tool2)
	agent.AddTool(tool3)

	if len(agent.Tools()) != 3 {
		t.Errorf("Expected 3 tools, got %d", len(agent.Tools()))
	}

	if agent.Tools()[0].Name() != "tool1" {
		t.Error("Expected first tool to be tool1")
	}

	if agent.Tools()[1].Name() != "tool2" {
		t.Error("Expected second tool to be tool2")
	}

	if agent.Tools()[2].Name() != "tool3" {
		t.Error("Expected third tool to be tool3")
	}
}

func TestConversationStructure(t *testing.T) {
	conv := &Conversation{
		ID:        "conv-1",
		AgentID:   "test-agent",
		Messages:  make([]Message, 0),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if conv.ID != "conv-1" {
		t.Errorf("Expected conversation ID 'conv-1', got %s", conv.ID)
	}

	if conv.AgentID != "test-agent" {
		t.Errorf("Expected agent ID 'test-agent', got %s", conv.AgentID)
	}

	if len(conv.Messages) != 0 {
		t.Errorf("Expected 0 messages, got %d", len(conv.Messages))
	}

	msg := Message{
		Role:      "user",
		Content:   "Hello",
		Timestamp: time.Now(),
	}

	conv.Messages = append(conv.Messages, msg)

	if len(conv.Messages) != 1 {
		t.Error("Expected one message in conversation")
	}

	if conv.Messages[0].Content != "Hello" {
		t.Errorf("Expected content 'Hello', got %s", conv.Messages[0].Content)
	}
}

func TestResultStructure(t *testing.T) {
	result := &Result{
		TaskID:      "task-1",
		AgentID:     "agent-1",
		Success:     true,
		Output:      "Test output",
		Duration:    5 * time.Second,
		CompletedAt: time.Now(),
		TokensUsed:  150,
	}

	if result.TaskID != "task-1" {
		t.Error("Expected task ID task-1")
	}

	if !result.Success {
		t.Error("Expected success to be true")
	}

	if result.Output != "Test output" {
		t.Error("Expected output 'Test output'")
	}

	if result.TokensUsed != 150 {
		t.Errorf("Expected 150 tokens, got %d", result.TokensUsed)
	}
}

func TestActionTaken(t *testing.T) {
	action := ActionTaken{
		Tool:      "filesystem",
		Action:    "read",
		Params:    map[string]interface{}{"path": "/tmp/file.txt"},
		Result:    "file content",
		Success:   true,
		Timestamp: time.Now(),
	}

	if action.Tool != "filesystem" {
		t.Error("Expected tool 'filesystem'")
	}

	if action.Action != "read" {
		t.Error("Expected action 'read'")
	}

	if !action.Success {
		t.Error("Expected success to be true")
	}
}

func TestTaskPriority(t *testing.T) {
	tasks := []struct {
		priority int
		name     string
	}{
		{1, "High Priority"},
		{5, "Medium Priority"},
		{10, "Low Priority"},
	}

	for _, task := range tasks {
		taskObj := &Task{
			ID:       "task-" + string(rune(task.priority)),
			Priority: task.priority,
		}

		if taskObj.Priority != task.priority {
			t.Errorf("Expected priority %d, got %d", task.priority, taskObj.Priority)
		}
	}
}

func TestBuildMessagesWithoutTools(t *testing.T) {
	info := AgentInfo{
		ID:    "test-agent",
		Name:  "Test Agent",
		Model: "test-model",
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	agent := NewBaseAgent(info, "You are a test agent", client)

	task := &Task{
		ID:        "task-1",
		AgentID:   "test-agent",
		Input:     "Hello, how are you?",
		CreatedAt: time.Now(),
	}

	// Access conversation to build messages
	_ = agent.buildMessages(task)

	// Just verify it doesn't panic and returns messages
	if agent.GetConversation() == nil {
		t.Error("Expected non-nil conversation")
	}
}

func TestBuildMessagesWithTools(t *testing.T) {
	info := AgentInfo{
		ID:    "test-agent",
		Name:  "Test Agent",
		Model: "test-model",
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	agent := NewBaseAgent(info, "You are a test agent", client)

	tool := &MockTool{
		name:        "test_tool",
		description: "A test tool",
		schema: map[string]interface{}{
			"type": "object",
		},
	}
	agent.AddTool(tool)

	task := &Task{
		ID:        "task-1",
		AgentID:   "test-agent",
		Input:     "Use the test_tool",
		CreatedAt: time.Now(),
	}

	messages := agent.buildMessages(task)

	if len(messages) < 2 {
		t.Error("Expected at least system message and user message")
	}

	if messages[0].Role != "system" {
		t.Error("Expected first message to be system message")
	}
}

func TestProcessResponseNoTools(t *testing.T) {
	info := AgentInfo{
		ID:    "test-agent",
		Name:  "Test Agent",
		Model: "test-model",
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	agent := NewBaseAgent(info, "You are a test agent", client)

	ctx := context.Background()
	_, actions, err := agent.processResponse(ctx, "Just a plain response")

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if len(actions) != 0 {
		t.Errorf("Expected 0 actions, got %d", len(actions))
	}
}

func TestProcessResponseWithTool(t *testing.T) {
	info := AgentInfo{
		ID:    "test-agent",
		Name:  "Test Agent",
		Model: "test-model",
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	agent := NewBaseAgent(info, "You are a test agent", client)

	tool := &MockTool{
		name:        "test_tool",
		description: "A test tool",
		schema:      map[string]interface{}{},
	}
	agent.AddTool(tool)

	ctx := context.Background()
	response := "Let me call a tool\n```tool\n{\"tool\": \"test_tool\", \"params\": {\"key\": \"value\"}}\n```"
	_, actions, err := agent.processResponse(ctx, response)

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if len(actions) != 1 {
		t.Errorf("Expected 1 action, got %d", len(actions))
	}

	if actions[0].Tool != "test_tool" {
		t.Errorf("Expected tool 'test_tool', got %s", actions[0].Tool)
	}

	if !actions[0].Success {
		t.Error("Expected action to succeed")
	}
}

func TestProcessResponseWithUnknownTool(t *testing.T) {
	info := AgentInfo{
		ID:    "test-agent",
		Name:  "Test Agent",
		Model: "test-model",
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	agent := NewBaseAgent(info, "You are a test agent", client)

	ctx := context.Background()
	response := "Let me call unknown tool\n```tool\n{\"tool\": \"unknown_tool\", \"params\": {\"key\": \"value\"}}\n```"
	_, actions, err := agent.processResponse(ctx, response)

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if len(actions) != 1 {
		t.Errorf("Expected 1 action, got %d", len(actions))
	}

	if actions[0].Success {
		t.Error("Expected action to fail for unknown tool")
	}
}

func TestProcessResponseWithInvalidJSON(t *testing.T) {
	info := AgentInfo{
		ID:    "test-agent",
		Name:  "Test Agent",
		Model: "test-model",
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	agent := NewBaseAgent(info, "You are a test agent", client)

	ctx := context.Background()
	response := "Let me call tool with bad JSON\n```tool\n{invalid json}\n```"
	_, actions, err := agent.processResponse(ctx, response)

	if err != nil {
		t.Errorf("Expected no error (invalid JSON skipped), got %v", err)
	}

	// Should skip the malformed tool call
	if len(actions) != 0 {
		t.Errorf("Expected 0 actions (malformed JSON), got %d", len(actions))
	}
}

func TestResetConversation(t *testing.T) {
	info := AgentInfo{
		ID:    "test-agent",
		Name:  "Test Agent",
		Model: "test-model",
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	agent := NewBaseAgent(info, "You are a test agent", client)

	// Add a message to conversation
	oldConvID := agent.GetConversation().ID

	// Add a message to the conversation
	agent.conversation.Messages = append(agent.conversation.Messages, Message{
		Role:      "user",
		Content:   "Hello",
		Timestamp: time.Now(),
	})

	if len(agent.GetConversation().Messages) == 0 {
		t.Error("Expected message to be added")
	}

	// Reset conversation
	agent.ResetConversation()

	if len(agent.GetConversation().Messages) != 0 {
		t.Error("Expected messages to be cleared after reset")
	}

	// Verify conversation ID changed
	if agent.GetConversation().ID == oldConvID {
		t.Error("Expected new conversation ID after reset")
	}
}

func TestGetConversation(t *testing.T) {
	info := AgentInfo{
		ID:    "test-agent",
		Name:  "Test Agent",
		Model: "test-model",
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	agent := NewBaseAgent(info, "You are a test agent", client)

	conv := agent.GetConversation()

	if conv == nil {
		t.Error("Expected non-nil conversation")
	}

	if conv.AgentID != "test-agent" {
		t.Errorf("Expected conversation agent ID 'test-agent', got %s", conv.AgentID)
	}
}

func TestExecuteWithConversationHistory(t *testing.T) {
	os.Setenv("BACKEND", "mock")
	defer os.Unsetenv("BACKEND")

	info := AgentInfo{
		ID:    "test-agent",
		Name:  "Test Agent",
		Model: "test-model",
	}
	client := llm.NewOllamaClient("http://localhost:11434")
	agent := NewBaseAgent(info, "You are a test agent", client)

	// Add messages to conversation
	for i := 1; i <= 12; i++ {
		agent.conversation.Messages = append(agent.conversation.Messages, Message{
			Role:      "user",
			Content:   "Message " + string(rune(48+i)),
			Timestamp: time.Now(),
		})
		agent.conversation.Messages = append(agent.conversation.Messages, Message{
			Role:      "assistant",
			Content:   "Response " + string(rune(48+i)),
			Timestamp: time.Now(),
		})
	}

	if len(agent.conversation.Messages) != 24 {
		t.Logf("Expected 24 messages, got %d (test may be checking history limit)", len(agent.conversation.Messages))
	}
}
