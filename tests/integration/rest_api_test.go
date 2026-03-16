package integration

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/ton-user/local-agents/tests/testutil"
)

func TestIntegration_RESTEndpointsAndValidation(t *testing.T) {
	t.Parallel()

	ollama := testutil.StartMockOllamaServer(t)
	t.Cleanup(ollama.Close)

	host := "127.0.0.1"
	port := testutil.MustFreePort(t)

	/*
		description d'une fonction : initialise un kernel d'integration REST avec un seul agent interne.
		@params{} - aucun parametre.
		@return{*testutil.KernelProcess} kernel pret pour les appels API REST.
	*/
	startRESTKernel := func() *testutil.KernelProcess {
		return testutil.StartKernelFromScenario(t, testutil.KernelScenarioModel{
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
	}

	kernel := startRESTKernel()
	t.Cleanup(kernel.Stop)

	t.Run("health", func(t *testing.T) {
		t.Parallel()
		resp, err := http.Get(kernel.BaseURL + "/api/health")
		require.NoError(t, err)
		defer resp.Body.Close()
		require.Equal(t, http.StatusOK, resp.StatusCode)
	})

	t.Run("list_agents", func(t *testing.T) {
		t.Parallel()
		resp, err := http.Get(kernel.BaseURL + "/api/agents")
		require.NoError(t, err)
		defer resp.Body.Close()
		require.Equal(t, http.StatusOK, resp.StatusCode)

		var arr []map[string]any
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&arr))
		require.NotEmpty(t, arr)
	})

	t.Run("invalid_payload", func(t *testing.T) {
		t.Parallel()
		resp, err := http.Post(kernel.BaseURL+"/api/chat/coder", "application/json", bytes.NewBufferString("{"))
		require.NoError(t, err)
		defer resp.Body.Close()
		require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})
}

func TestIntegration_RESTTaskLifecycle(t *testing.T) {
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
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			return false
		}
		success, ok := body["success"].(bool)
		return ok && success
	}, 6*time.Second, 120*time.Millisecond)
}
