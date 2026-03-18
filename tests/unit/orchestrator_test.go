package unit

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/ton-user/local-agents/tests/testutil"
)

func TestOrchestrator_CreationAndAgentActivation(t *testing.T) {
	t.Parallel()

	ollama := testutil.StartMockOllamaServer(t)
	t.Cleanup(ollama.Close)

	host := "127.0.0.1"
	port := testutil.MustFreePort(t)
	kernel := testutil.StartKernelFromScenario(t, testutil.KernelScenarioModel{
		Host:      host,
		Port:      port,
		WSPath:    "/ws",
		OllamaURL: ollama.URL,
		Agents: []testutil.AgentConfigDTO{
			{ID: "coder", Enabled: true, PromptFile: "missing-coder.md", Model: "coding", Tools: []string{"filesystem"}, Type: "internal"},
			{ID: "files", Enabled: false, PromptFile: "missing-files.md", Model: "coding", Tools: []string{"filesystem"}, Type: "internal"},
		},
		Env:     map[string]string{"BACKEND": "mock"},
		Timeout: 10 * time.Second,
	})
	t.Cleanup(kernel.Stop)

	resp, err := http.Get(kernel.BaseURL + "/api/agents")
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var agents []map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&agents))
	require.Len(t, agents, 1)
	require.Equal(t, "coder", agents[0]["id"])
}

func TestOrchestrator_TaskDispatchAndQueue(t *testing.T) {
	t.Parallel()

	ollama := testutil.StartMockOllamaServer(t)
	t.Cleanup(ollama.Close)

	host := "127.0.0.1"
	port := testutil.MustFreePort(t)
	kernel := testutil.StartKernelFromScenario(t, testutil.KernelScenarioModel{
		Host:      host,
		Port:      port,
		WSPath:    "/ws",
		OllamaURL: ollama.URL,
		Agents: []testutil.AgentConfigDTO{{
			ID:         "coder",
			Enabled:    true,
			PromptFile: "missing-coder.md",
			Model:      "coding",
			Tools:      []string{},
			Type:       "internal",
		}},
		Env:     map[string]string{"BACKEND": "mock"},
		Timeout: 10 * time.Second,
	})
	t.Cleanup(kernel.Stop)

	payload := []byte(`{"agent_id":"coder","type":"chat","input":"bonjour"}`)
	resp, err := http.Post(kernel.BaseURL+"/api/tasks", "application/json", bytes.NewReader(payload))
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusAccepted, resp.StatusCode)

	var queued map[string]string
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&queued))
	taskID := queued["task_id"]
	require.NotEmpty(t, taskID)

	require.Eventually(t, func() bool {
		r, err := http.Get(kernel.BaseURL + "/api/tasks/" + taskID)
		if err != nil {
			return false
		}
		defer r.Body.Close()
		if r.StatusCode != http.StatusOK {
			return false
		}
		var data map[string]any
		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			return false
		}
		v, ok := data["success"].(bool)
		return ok && v
	}, 6*time.Second, 150*time.Millisecond)
}

func TestOrchestrator_CreateTaskValidation(t *testing.T) {
	t.Parallel()

	ollama := testutil.StartMockOllamaServer(t)
	t.Cleanup(ollama.Close)

	host := "127.0.0.1"
	port := testutil.MustFreePort(t)
	kernel := testutil.StartKernelFromScenario(t, testutil.KernelScenarioModel{
		Host:      host,
		Port:      port,
		WSPath:    "/ws",
		OllamaURL: ollama.URL,
		Agents: []testutil.AgentConfigDTO{{
			ID:         "coder",
			Enabled:    true,
			PromptFile: "missing-coder.md",
			Model:      "coding",
			Tools:      []string{},
			Type:       "internal",
		}},
		Env:     map[string]string{"BACKEND": "mock"},
		Timeout: 10 * time.Second,
	})
	t.Cleanup(kernel.Stop)

	resp, err := http.Post(kernel.BaseURL+"/api/tasks", "application/json", bytes.NewBufferString("not-json"))
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}
