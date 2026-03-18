package e2e

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"
	"github.com/ton-user/local-agents/internal/agent"
	"github.com/ton-user/local-agents/internal/llm"
	"github.com/ton-user/local-agents/tests/testutil"
)

func TestE2E_Workflows(t *testing.T) {
	ollama := testutil.StartMockOllamaServer(t)
	t.Cleanup(ollama.Close)

	host := "127.0.0.1"

	/*
		description d'une fonction : demarre un kernel E2E avec des agents et un backend mock pour stabiliser les tests.
		@params{int} port - port d'ecoute de l'orchestrateur de test.
		@params{[]testutil.AgentConfigDTO} agents - DTO de configuration des agents a charger.
		@return{*testutil.KernelProcess} kernel pret a recevoir des requetes HTTP/WS.
	*/
	startE2EKernel := func(port int, agents []testutil.AgentConfigDTO) *testutil.KernelProcess {
		return testutil.StartKernelFromScenario(t, testutil.KernelScenarioModel{
			Host:      host,
			Port:      port,
			WSPath:    "/ws",
			OllamaURL: ollama.URL,
			Agents:    agents,
			Env:       map[string]string{"BACKEND": "mock"},
			Timeout:   20 * time.Second,
		})
	}

	t.Run("E2E1_client_ws_orchestrator_agent_backend", func(t *testing.T) {
		port := testutil.MustFreePort(t)
		kernel := startE2EKernel(port, []testutil.AgentConfigDTO{{
			ID:         "coder",
			Enabled:    true,
			PromptFile: "missing-coder.md",
			Model:      "coding",
			Tools:      []string{},
			Type:       "internal",
		}})
		defer kernel.Stop()

		conn, _, err := websocket.DefaultDialer.Dial(kernel.WSURL, nil)
		require.NoError(t, err)
		defer conn.Close()

		require.NoError(t, conn.WriteJSON(map[string]any{
			"type": "chat",
			"payload": map[string]string{
				"agent":   "coder",
				"message": "hello e2e",
			},
		}))

		require.NoError(t, conn.SetReadDeadline(time.Now().Add(6*time.Second)))
		_, payload, err := conn.ReadMessage()
		require.NoError(t, err)

		var body map[string]any
		require.NoError(t, json.Unmarshal(payload, &body))
		require.Equal(t, "response", body["type"])
	})

	t.Run("E2E2_multi_agent_routing", func(t *testing.T) {
		port := testutil.MustFreePort(t)
		kernel := startE2EKernel(port, []testutil.AgentConfigDTO{
			{ID: "coder", Enabled: true, PromptFile: "missing-coder.md", Model: "coding", Tools: []string{}, Type: "internal"},
			{ID: "files", Enabled: true, PromptFile: "missing-files.md", Model: "coding", Tools: []string{}, Type: "internal"},
		})
		defer kernel.Stop()

		testCases := []string{"coder", "files"}
		for _, tc := range testCases {
			tc := tc
			t.Run(tc, func(t *testing.T) {
				resp, err := http.Post(kernel.BaseURL+"/api/chat/"+tc, "application/json", bytes.NewBufferString(`{"message":"route me"}`))
				require.NoError(t, err)
				defer resp.Body.Close()
				require.Equal(t, http.StatusOK, resp.StatusCode)

				var body map[string]any
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
				require.Equal(t, tc, body["agent_id"])
				require.Equal(t, true, body["success"])
			})
		}
	})

	t.Run("E2E3_external_discord_alert", func(t *testing.T) {
		discord := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/health":
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"status":"healthy","agent_id":"discord"}`))
			case "/chat":
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"status":"alert_sent","channel":"security"}`))
			default:
				http.NotFound(w, r)
			}
		}))
		defer discord.Close()

		discordURL, err := url.Parse(discord.URL)
		require.NoError(t, err)
		discordPort, err := strconv.Atoi(discordURL.Port())
		require.NoError(t, err)

		port := testutil.MustFreePort(t)
		kernel := startE2EKernel(port, []testutil.AgentConfigDTO{{
			ID:         "discord",
			Enabled:    true,
			PromptFile: "missing-discord.md",
			Model:      "coding",
			Tools:      []string{},
			Type:       "external",
			Port:       discordPort,
		}})
		defer kernel.Stop()

		resp, err := http.Post(kernel.BaseURL+"/api/chat/discord", "application/json", bytes.NewBufferString(`{"message":"critical alert"}`))
		require.NoError(t, err)
		defer resp.Body.Close()
		require.Equal(t, http.StatusOK, resp.StatusCode)

		var body map[string]any
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
		require.Equal(t, "alert_sent", body["status"])
	})

	t.Run("E2E4_ollama_unavailable_fallback_mock", func(t *testing.T) {
		t.Setenv("BACKEND", "mock")

		a := agent.NewBaseAgent(
			agent.AgentInfo{ID: "coder", Name: "coder", Model: "qwen", Enabled: true},
			"system",
			llm.NewOllamaClient("http://127.0.0.1:1"),
		)

		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		result, err := a.Execute(ctx, &agent.Task{
			ID:        "e2e-fallback",
			AgentID:   "coder",
			Type:      agent.TaskTypeChat,
			Input:     "use fallback",
			CreatedAt: time.Now(),
		})
		require.NoError(t, err)
		require.True(t, result.Success)
		require.NotEmpty(t, result.Output)
	})
}
