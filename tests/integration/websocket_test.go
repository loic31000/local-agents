package integration

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"
	"github.com/ton-user/local-agents/tests/testutil"
)

func TestIntegration_WebSocketHandshakeAndResponse(t *testing.T) {
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

	conn, _, err := websocket.DefaultDialer.Dial(kernel.WSURL, nil)
	require.NoError(t, err)
	defer conn.Close()

	msg := map[string]any{
		"type": "chat",
		"payload": map[string]string{
			"agent":   "coder",
			"message": "hello websocket",
		},
	}
	require.NoError(t, conn.WriteJSON(msg))

	require.NoError(t, conn.SetReadDeadline(time.Now().Add(6*time.Second)))
	_, data, err := conn.ReadMessage()
	require.NoError(t, err)

	var envelope map[string]any
	require.NoError(t, json.Unmarshal(data, &envelope))
	require.Equal(t, "response", envelope["type"])

	result, ok := envelope["result"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, true, result["success"])
}
