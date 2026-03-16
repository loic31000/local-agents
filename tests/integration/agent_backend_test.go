package integration

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/ton-user/local-agents/internal/agent"
	"github.com/ton-user/local-agents/internal/llm"
)

func TestIntegration_AgentCallsBackendAndProcessesResponse(t *testing.T) {
	t.Parallel()

	ollama := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.WriteHeader(http.StatusOK)
		case "/api/chat":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"model":   "qwen",
				"message": map[string]string{"role": "assistant", "content": "integration-response"},
				"done":    true,
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer ollama.Close()

	a := agent.NewBaseAgent(agent.AgentInfo{ID: "coder", Name: "coder", Model: "qwen", Enabled: true}, "system", llm.NewOllamaClient(ollama.URL))

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	result, err := a.Execute(ctx, &agent.Task{
		ID:        "it-1",
		AgentID:   "coder",
		Type:      agent.TaskTypeChat,
		Input:     "hello",
		CreatedAt: time.Now(),
	})
	require.NoError(t, err)
	require.True(t, result.Success)
	require.Equal(t, "integration-response", result.Output)
}

func TestIntegration_MultiAgentRoutingWithMockBackend(t *testing.T) {
	t.Setenv("BACKEND", "mock")

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	agents := []*agent.BaseAgent{
		agent.NewBaseAgent(agent.AgentInfo{ID: "coder", Name: "coder", Model: "x", Enabled: true}, "system", llm.NewOllamaClient("http://invalid")),
		agent.NewBaseAgent(agent.AgentInfo{ID: "files", Name: "files", Model: "x", Enabled: true}, "system", llm.NewOllamaClient("http://invalid")),
	}

	for _, a := range agents {
		res, err := a.Execute(ctx, &agent.Task{ID: "it", AgentID: a.Info().ID, Type: agent.TaskTypeChat, Input: "route", CreatedAt: time.Now()})
		require.NoError(t, err)
		require.True(t, res.Success)
		require.Equal(t, a.Info().ID, res.AgentID)
		require.NotEmpty(t, res.Output)
	}
}
