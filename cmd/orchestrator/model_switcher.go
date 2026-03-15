package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

// ModelConfig définit un modèle disponible
type ModelConfig struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	File      string `json:"file"`
	GPULayers int    `json:"gpu_layers"`
	CtxSize   int    `json:"ctx_size"`
	Threads   int    `json:"threads"`
}

var availableModels = []ModelConfig{
	{
		ID:        "llama3b",
		Name:      "Llama-3.2-3B-Instruct-Q4_K_M",
		File:      `C:\Users\romano\AppData\Local\Ollama\models\Llama-3.2-3B-Instruct-Q4_K_M.gguf`,
		GPULayers: 28,
		CtxSize:   16384,
		Threads:   14,
	},
	{
		ID:        "mistral7b",
		Name:      "Mistral-7B-Instruct-v0.3-Q4_K_M",
		File:      `C:\Users\romano\AppData\Local\Ollama\models\Mistral-7B-Instruct-v0.3.Q4_K_M.gguf`,
		GPULayers: 33,
		CtxSize:   16384,
		Threads:   14,
	},
	{
		ID:        "qwen32b",
		Name:      "Qwen2.5-32B-Instruct-Q4_K_S",
		File:      `C:\Users\romano\AppData\Local\Ollama\models\Qwen2.5-32B-Instruct-Q4_K_S.gguf`,
		GPULayers: 25,
		CtxSize:   8192,
		Threads:   14,
	},
}

var llamaProcess *os.Process

// jsonErr écrit une réponse JSON d'erreur propre — une seule fois
func jsonErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// handleListAvailableModels GET /api/model/list
func (o *Orchestrator) handleListAvailableModels(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(availableModels)
}

// handleSwitchModel POST /api/model/switch
func (o *Orchestrator) handleSwitchModel(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req struct {
		ModelID string `json:"model_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, 400, "Bad request: "+err.Error())
		return
	}

	// Trouver le modèle demandé
	var model *ModelConfig
	for i := range availableModels {
		if availableModels[i].ID == req.ModelID {
			model = &availableModels[i]
			break
		}
	}
	if model == nil {
		jsonErr(w, 404, "Modèle introuvable: "+req.ModelID)
		return
	}

	// Vérifier que le fichier .gguf existe
	if _, err := os.Stat(model.File); os.IsNotExist(err) {
		jsonErr(w, 400, "Fichier introuvable: "+model.File)
		return
	}

	// Arrêter l'ancien processus llama-server
	if llamaProcess != nil {
		llamaProcess.Kill()
		llamaProcess.Wait()
		llamaProcess = nil
		time.Sleep(2 * time.Second)
	}
	if runtime.GOOS == "windows" {
		exec.Command("taskkill", "/F", "/IM", "llama-server.exe").Run()
		time.Sleep(2 * time.Second)
	}

	// Localiser llama-server.exe
	llamaExe := findLlamaServer()
	if llamaExe == "" {
		jsonErr(w, 500, "llama-server.exe introuvable dans le dossier du projet")
		return
	}

	// Créer le dossier logs si besoin
	os.MkdirAll("logs", 0755)

	// Lancer le nouveau llama-server
	cmd := exec.Command(llamaExe,
		"--model", model.File,
		"--port", "8081",
		"--host", "127.0.0.1",
		"--n-gpu-layers", fmt.Sprintf("%d", model.GPULayers),
		"--ctx-size", fmt.Sprintf("%d", model.CtxSize),
		"--parallel", "1",
		"--threads", fmt.Sprintf("%d", model.Threads),
	)

	if logFile, err := os.Create("logs/llama-server.log"); err == nil {
		cmd.Stdout = logFile
		cmd.Stderr = logFile
	}

	if err := cmd.Start(); err != nil {
		jsonErr(w, 500, "Impossible de lancer llama-server: "+err.Error())
		return
	}
	llamaProcess = cmd.Process

	// Attendre que llama-server soit prêt (max 120s)
	if !waitForLlama(120 * time.Second) {
		jsonErr(w, 500, "llama-server n'a pas démarré dans les 120 secondes")
		return
	}

	// ── Succès : une seule écriture JSON ──────────────────────────────────
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"model":   model.Name,
		"message": "Modèle chargé avec succès",
	})
}

// findLlamaServer cherche llama-server.exe dans le dossier courant
func findLlamaServer() string {
	candidates := []string{
		"llama-server.exe",
		"llama-server",
		filepath.Join(".", "llama-server.exe"),
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			abs, _ := filepath.Abs(c)
			return abs
		}
	}
	return ""
}

// waitForLlama poll /health jusqu'à ce que llama-server réponde
func waitForLlama(timeout time.Duration) bool {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	client := &http.Client{Timeout: 3 * time.Second}
	for {
		select {
		case <-ctx.Done():
			return false
		case <-ticker.C:
			resp, err := client.Get("http://127.0.0.1:8081/health")
			if err == nil && resp.StatusCode == 200 {
				resp.Body.Close()
				return true
			}
		}
	}
}