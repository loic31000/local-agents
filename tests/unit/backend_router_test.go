package unit

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/ton-user/local-agents/internal/llm"
)

func TestBackendRouter_ActiveBackendPreference(t *testing.T) {
	t.Run("env_overrides_file", func(t *testing.T) {
		t.Setenv("BACKEND", "mock")
		r := llm.NewBackendRouter("http://localhost:11434")
		require.Equal(t, llm.BackendMock, r.ActiveBackend())
	})

	t.Run("file_used_when_env_empty", func(t *testing.T) {
		cwd, err := os.Getwd()
		require.NoError(t, err)
		t.Cleanup(func() { _ = os.Chdir(cwd) })

		t.Setenv("BACKEND", "")
		tmp := t.TempDir()
		require.NoError(t, os.WriteFile(filepath.Join(tmp, ".backend"), []byte("mock\n"), 0o644))
		require.NoError(t, os.Chdir(tmp))

		r := llm.NewBackendRouter("http://localhost:11434")
		require.Equal(t, llm.BackendMock, r.ActiveBackend())
	})
}

func TestBackendRouter_MockRoutingAndPing(t *testing.T) {
	t.Setenv("BACKEND", "mock")
	r := llm.NewBackendRouter("http://invalid:11434")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	chat, err := r.Chat(ctx, "coder", []llm.Message{{Role: "user", Content: "hello"}}, &llm.Options{Temperature: 0.1})
	require.NoError(t, err)
	require.NotNil(t, chat)
	require.Contains(t, chat.Model, "mock/")

	require.NoError(t, r.Ping(ctx))

	models, err := r.ListModels(ctx)
	require.NoError(t, err)
	require.NotEmpty(t, models)
}
