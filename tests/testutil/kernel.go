package testutil

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"
)

var (
	buildOnce sync.Once
	buildPath string
	buildErr  error
)

// KernelProcess encapsule un processus orchestrateur demarre pour les tests.
type KernelProcess struct {
	BaseURL string
	WSURL   string
	stopFn  func()
}

func (k *KernelProcess) Stop() {
	if k.stopFn != nil {
		k.stopFn()
	}
}

func RepoRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("unable to resolve caller")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}

func MustFreePort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen on random port: %v", err)
	}
	defer ln.Close()
	return ln.Addr().(*net.TCPAddr).Port
}

func StartMockOllamaServer(t *testing.T) *httptest.Server {
	t.Helper()

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/api/tags", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"models":[{"name":"mock/coder"},{"name":"mock/files"}]}`))
	})
	mux.HandleFunc("/api/chat", func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		body, _ := io.ReadAll(r.Body)

		var req struct {
			Model string `json:"model"`
		}
		_ = json.Unmarshal(body, &req)

		resp := map[string]any{
			"model": req.Model,
			"message": map[string]string{
				"role":    "assistant",
				"content": "mock ollama response",
			},
			"done":       true,
			"created_at": time.Now().Format(time.RFC3339),
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})

	return httptest.NewServer(mux)
}

func StartJSONServer(t *testing.T, routes map[string]http.HandlerFunc) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	for p, h := range routes {
		mux.HandleFunc(p, h)
	}
	return httptest.NewServer(mux)
}

func BuildOrchestratorBinary(t *testing.T) string {
	t.Helper()
	buildOnce.Do(func() {
		root := RepoRoot(t)
		buildDir, err := os.MkdirTemp("", "local-agents-testbin-*")
		if err != nil {
			buildErr = fmt.Errorf("create temp build dir: %w", err)
			return
		}
		out := filepath.Join(buildDir, "orchestrator.testbin")
		cmd := exec.Command("go", "build", "-o", out, "./cmd/orchestrator")
		cmd.Dir = root
		buf := &bytes.Buffer{}
		cmd.Stdout = buf
		cmd.Stderr = buf
		if err := cmd.Run(); err != nil {
			buildErr = fmt.Errorf("build orchestrator: %w (output: %s)", err, buf.String())
			return
		}
		buildPath = out
	})
	if buildErr != nil {
		t.Fatal(buildErr)
	}
	return buildPath
}

func WriteConfigYAML(t *testing.T, dir string, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, "config.yaml"), []byte(content), 0o644); err != nil {
		t.Fatalf("write config.yaml: %v", err)
	}
}

func StartKernelProcess(t *testing.T, cfgYAML string, env map[string]string, timeout time.Duration) *KernelProcess {
	t.Helper()
	bin := BuildOrchestratorBinary(t)
	workdir := t.TempDir()
	WriteConfigYAML(t, workdir, cfgYAML)

	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, bin)
	cmd.Dir = workdir
	logs := &bytes.Buffer{}
	cmd.Stdout = logs
	cmd.Stderr = logs
	cmd.Env = os.Environ()
	for k, v := range env {
		cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", k, v))
	}

	if err := cmd.Start(); err != nil {
		cancel()
		t.Fatalf("start orchestrator process: %v", err)
	}

	baseURL := fmt.Sprintf("http://%s:%s", env["TEST_HOST"], env["TEST_PORT"])
	wsURL := fmt.Sprintf("ws://%s:%s%s", env["TEST_HOST"], env["TEST_PORT"], env["TEST_WS_PATH"])

	deadline := time.Now().Add(timeout)
	for {
		if time.Now().After(deadline) {
			cancel()
			_ = cmd.Wait()
			t.Fatalf("orchestrator did not become healthy before timeout; logs: %s", logs.String())
		}
		resp, err := http.Get(baseURL + "/api/health")
		if err == nil && resp.StatusCode == http.StatusOK {
			resp.Body.Close()
			break
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(100 * time.Millisecond)
	}

	return &KernelProcess{
		BaseURL: baseURL,
		WSURL:   wsURL,
		stopFn: func() {
			cancel()
			_ = cmd.Wait()
		},
	}
}

func MinimalConfigYAML(host string, port int, wsPath string, ollamaURL string, agentBlock string) string {
	return fmt.Sprintf(`server:
  host: "%s"
  port: %d
  websocket_path: "%s"
ollama:
  base_url: "%s"
  default_model: "mock-model"
  models:
    coding: "mock-model"
agents:
%s
storage:
  type: "memory"
  path: "./data"
logging:
  level: "info"
  format: "json"
  file: ""
queue:
  type: "memory"
  max_concurrent: 2
  task_timeout: "5s"
`, host, port, wsPath, ollamaURL, agentBlock)
}
