package unit

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/ton-user/local-agents/internal/agent"
	"github.com/ton-user/local-agents/internal/llm"
)

type mockTool struct {
	name string
}

func (m *mockTool) Name() string { return m.name }
func (m *mockTool) Description() string {
	return "test tool"
}
func (m *mockTool) Schema() map[string]interface{} {
	return map[string]interface{}{"type": "object"}
}
func (m *mockTool) Execute(_ context.Context, params map[string]interface{}) (interface{}, error) {
	return map[string]interface{}{"ok": true, "echo": params["value"]}, nil
}

func TestBaseAgent_InitializationAndCanHandle(t *testing.T) {
	t.Parallel()

	info := agent.AgentInfo{ID: "coder", Name: "coder", Model: "mock/coder", Enabled: true}
	a := agent.NewBaseAgent(info, "system", llm.NewOllamaClient("http://localhost:11434"))

	require.Equal(t, "coder", a.Info().ID)
	require.True(t, a.CanHandle(&agent.Task{AgentID: "coder"}))
	require.True(t, a.CanHandle(&agent.Task{AgentID: ""}))
	require.False(t, a.CanHandle(&agent.Task{AgentID: "files"}))
}

func TestBaseAgent_ExecuteAndConversationHistory(t *testing.T) {
	t.Setenv("BACKEND", "mock")

	info := agent.AgentInfo{ID: "coder", Name: "coder", Model: "mock/coder", Enabled: true}
	a := agent.NewBaseAgent(info, "system", llm.NewOllamaClient("http://localhost:11434"))

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	for i := 0; i < 2; i++ {
		result, err := a.Execute(ctx, &agent.Task{
			ID:        fmt.Sprintf("task-%d", i),
			AgentID:   "coder",
			Type:      agent.TaskTypeChat,
			Input:     "donne une reponse",
			CreatedAt: time.Now(),
		})
		require.NoError(t, err)
		require.True(t, result.Success)
		require.NotEmpty(t, result.Output)
	}

	conv := a.GetConversation()
	require.Len(t, conv.Messages, 4)
	require.Equal(t, "user", conv.Messages[0].Role)
	require.Equal(t, "assistant", conv.Messages[1].Role)
}

func TestBaseAgent_ExecuteToolBlock(t *testing.T) {
	info := agent.AgentInfo{ID: "coder", Name: "coder", Model: "test-model", Enabled: true}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			w.WriteHeader(http.StatusOK)
			return
		}
		if r.URL.Path != "/api/chat" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		resp := map[string]any{
			"model": "test-model",
			"message": map[string]string{
				"role":    "assistant",
				"content": "avant\n```tool\n{\"tool\":\"echo\",\"params\":{\"value\":\"42\"}}\n```\napres",
			},
			"done":       true,
			"created_at": time.Now().Format(time.RFC3339),
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	a := agent.NewBaseAgent(info, "system", llm.NewOllamaClient(server.URL))
	a.AddTool(&mockTool{name: "echo"})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	result, err := a.Execute(ctx, &agent.Task{
		ID:        "task-tool",
		AgentID:   "coder",
		Type:      agent.TaskTypeChat,
		Input:     "utilise l outil",
		CreatedAt: time.Now(),
	})
	require.NoError(t, err)
	require.True(t, result.Success)
	require.Len(t, result.Actions, 1)
	require.True(t, result.Actions[0].Success)
	require.Contains(t, result.Output, "Outil echo exécuté")
}
