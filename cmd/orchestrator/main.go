package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/ton-user/local-agents/internal/agent"
	"github.com/ton-user/local-agents/internal/llm"
	"github.com/ton-user/local-agents/internal/tools"
	"github.com/ton-user/local-agents/internal/training"
	"gopkg.in/yaml.v3"
)

type Config struct {
	Server struct {
		Host          string `yaml:"host"`
		Port          int    `yaml:"port"`
		WebsocketPath string `yaml:"websocket_path"`
	} `yaml:"server"`
	Ollama struct {
		BaseURL      string            `yaml:"base_url"`
		DefaultModel string            `yaml:"default_model"`
		Models       map[string]string `yaml:"models"`
	} `yaml:"ollama"`
	Agents  map[string]AgentConfig `yaml:"agents"`
	Storage struct {
		Type string `yaml:"type"`
		Path string `yaml:"path"`
	} `yaml:"storage"`
	Logging struct {
		Level  string `yaml:"level"`
		Format string `yaml:"format"`
		File   string `yaml:"file"`
	} `yaml:"logging"`
	Queue struct {
		Type          string `yaml:"type"`
		MaxConcurrent int    `yaml:"max_concurrent"`
		TaskTimeout   string `yaml:"task_timeout"`
	} `yaml:"queue"`
}

type AgentConfig struct {
	Enabled      bool     `yaml:"enabled"`
	PromptFile   string   `yaml:"prompt_file"`
	Model        string   `yaml:"model"`
	Tools        []string `yaml:"tools"`
	AllowedPaths []string `yaml:"allowed_paths,omitempty"`
	Port         int      `yaml:"port"`
	Endpoint     string   `yaml:"endpoint"`
	Type         string   `yaml:"type"`
}

// AgentStats comptabilise les requêtes par agent
type AgentStats struct {
	Requests  int64 `json:"requests"`
	Successes int64 `json:"successes"`
	Errors    int64 `json:"errors"`
	TotalMs   int64 `json:"total_ms"`
	AvgMs     int64 `json:"avg_ms"`
}

type Orchestrator struct {
	config       *Config
	ollamaClient *llm.OllamaClient
	agents       map[string]agent.Agent
	taskQueue    chan *agent.Task
	results      map[string]*agent.Result
	resultsMu    sync.RWMutex
	wsClients    map[*websocket.Conn]bool
	wsClientsMu  sync.RWMutex
	upgrader     websocket.Upgrader
	startedAt    time.Time
	// Stats par agent
	stats   map[string]*AgentStats
	statsMu sync.RWMutex
}

func NewOrchestrator(config *Config) (*Orchestrator, error) {
	ollamaClient := llm.NewOllamaClient(config.Ollama.BaseURL)

	if os.Getenv("OLLAMA_SKIP_PING") != "true" {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := ollamaClient.Ping(ctx); err != nil {
			return nil, fmt.Errorf("impossible de se connecter à Ollama: %w", err)
		}
		log.Info().Str("url", config.Ollama.BaseURL).Msg("Connecté à Ollama")
	} else {
		log.Warn().Str("url", config.Ollama.BaseURL).Msg("OLLAMA_SKIP_PING=true")
	}

	orch := &Orchestrator{
		config:       config,
		ollamaClient: ollamaClient,
		agents:       make(map[string]agent.Agent),
		taskQueue:    make(chan *agent.Task, 100),
		results:      make(map[string]*agent.Result),
		wsClients:    make(map[*websocket.Conn]bool),
		startedAt:    time.Now(),
		stats:        make(map[string]*AgentStats),
		upgrader:     websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }},
	}

	if err := orch.initAgents(); err != nil {
		return nil, err
	}
	return orch, nil
}

// recordStat incrémente les stats d'un agent
func (o *Orchestrator) recordStat(agentID string, durationMs int64, success bool) {
	o.statsMu.Lock()
	defer o.statsMu.Unlock()
	s, ok := o.stats[agentID]
	if !ok {
		s = &AgentStats{}
		o.stats[agentID] = s
	}
	s.Requests++
	s.TotalMs += durationMs
	if s.Requests > 0 {
		s.AvgMs = s.TotalMs / s.Requests
	}
	if success {
		s.Successes++
	} else {
		s.Errors++
	}
}

func (o *Orchestrator) initAgents() error {
	for agentID, agentCfg := range o.config.Agents {
		if !agentCfg.Enabled {
			log.Debug().Str("agent", agentID).Msg("Agent désactivé")
			continue
		}
		if agentCfg.Type == "external" {
			log.Info().Str("agent", agentID).Str("endpoint", agentCfg.Endpoint).Msg("Agent externe enregistré")
			continue
		}
		promptContent, err := os.ReadFile(agentCfg.PromptFile)
		if err != nil {
			log.Warn().Str("agent", agentID).Err(err).Msg("Prompt introuvable, utilisation du défaut")
			promptContent = []byte(fmt.Sprintf("Tu es un agent spécialisé: %s", agentID))
		}
		model := o.config.Ollama.DefaultModel
		if agentCfg.Model != "" {
			if m, ok := o.config.Ollama.Models[agentCfg.Model]; ok {
				model = m
			}
		}
		info := agent.AgentInfo{
			ID: agentID, Name: agentID,
			Description:  fmt.Sprintf("Agent %s", agentID),
			Model:        model,
			Capabilities: agentCfg.Tools,
			Enabled:      true,
		}
		baseAgent := agent.NewBaseAgent(info, string(promptContent), o.ollamaClient)
		for _, toolName := range agentCfg.Tools {
			var tool agent.Tool
			switch toolName {
			case "filesystem":
				allowedPaths := agentCfg.AllowedPaths
				if len(allowedPaths) == 0 {
					allowedPaths = []string{os.Getenv("HOME")}
				}
				tool = tools.NewFileSystemTool(allowedPaths)
			case "terminal":
				tool = tools.NewTerminalTool(os.Getenv("HOME"))
			case "vscode":
				tool = tools.NewVSCodeTool()
			case "git":
				tool = tools.NewGitTool(".")
			}
			if tool != nil {
				baseAgent.AddTool(tool)
			}
		}
		o.agents[agentID] = baseAgent
		log.Info().Str("agent", agentID).Str("model", model).Msg("Agent initialisé")
	}
	return nil
}

func jsonResponse(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func (o *Orchestrator) Start(ctx context.Context) error {
	for i := 0; i < o.config.Queue.MaxConcurrent; i++ {
		go o.worker(ctx, i)
	}
	router := mux.NewRouter()
	// Training API — activée si DATABASE_URL est défini
	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		trainingAPI, err := training.NewAPI(dbURL, "/root/training_data")
		if err != nil {
			log.Warn().Err(err).Msg("Training API indisponible — PostgreSQL inaccessible")
		} else {
			trainingAPI.RegisterRoutes(router)
			log.Info().Msg("Training API activée")
		}
	}

	router.HandleFunc("/api/health", o.handleHealth).Methods("GET")
	router.HandleFunc("/api/stats", o.handleStats).Methods("GET")
	router.HandleFunc("/api/metrics/system", o.handleSystemMetrics).Methods("GET") // implémenté dans metrics_handler.go
	router.HandleFunc("/api/config", o.handleConfig).Methods("GET")

	router.HandleFunc("/api/backend", o.handleBackend).Methods("GET")
	router.HandleFunc("/api/backend/switch", o.handleBackendSwitch).Methods("POST")

	router.HandleFunc("/api/agents", o.handleListAgents).Methods("GET")
	router.HandleFunc("/api/agents/{id}", o.handleGetAgent).Methods("GET", "PUT")
	router.HandleFunc("/api/agents/{id}/health", o.handleAgentHealth).Methods("GET")
	router.HandleFunc("/api/agents/{id}/start", o.handleAgentStart).Methods("POST")
	router.HandleFunc("/api/agents/{id}/stop", o.handleAgentStop).Methods("POST")

	router.HandleFunc("/api/tasks", o.handleCreateTask).Methods("POST")
	router.HandleFunc("/api/tasks/{id}", o.handleGetTask).Methods("GET")

	router.HandleFunc("/api/chat/{agent}", o.handleChat).Methods("POST")

	router.HandleFunc("/api/ollama/models", o.handleOllamaModels).Methods("GET")
	router.HandleFunc("/api/ollama/pull", o.handleOllamaPull).Methods("POST")
	router.HandleFunc("/api/ollama/delete", o.handleOllamaDelete).Methods("DELETE")

	router.HandleFunc(o.config.Server.WebsocketPath, o.handleWebSocket)

	router.PathPrefix("/").Handler(http.FileServer(http.Dir("web/static")))

	addr := fmt.Sprintf("%s:%d", o.config.Server.Host, o.config.Server.Port)
	server := &http.Server{Addr: addr, Handler: router, ReadTimeout: 15 * time.Second, WriteTimeout: 5 * time.Minute}
	go func() {
		log.Info().Str("addr", addr).Msg("Serveur démarré")
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("Erreur serveur")
		}
	}()
	<-ctx.Done()
	log.Info().Msg("Arrêt en cours...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}

func (o *Orchestrator) handleHealth(w http.ResponseWriter, r *http.Request) {
	uptime := int(time.Since(o.startedAt).Seconds())
	ollamaOK := true
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := o.ollamaClient.Ping(ctx); err != nil {
		ollamaOK = false
	}
	status := "healthy"
	if !ollamaOK {
		status = "degraded"
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"status": status, "agent_id": "orchestrator", "version": "1.0.0",
		"uptime_seconds": uptime, "agents_count": len(o.agents), "ollama_ok": ollamaOK,
	})
}

// handleStats — statistiques de requêtes par agent
func (o *Orchestrator) handleStats(w http.ResponseWriter, r *http.Request) {
	o.statsMu.RLock()
	defer o.statsMu.RUnlock()

	result := make(map[string]interface{})
	totalRequests := int64(0)

	// Agents Go internes
	for agentID := range o.agents {
		if s, ok := o.stats[agentID]; ok {
			result[agentID] = s
			totalRequests += s.Requests
		} else {
			result[agentID] = &AgentStats{}
		}
	}
	// Agents externes (Python)
	for agentID, cfg := range o.config.Agents {
		if cfg.Type == "external" {
			if _, exists := result[agentID]; !exists {
				if s, ok := o.stats[agentID]; ok {
					result[agentID] = s
					totalRequests += s.Requests
				} else {
					result[agentID] = &AgentStats{}
				}
			}
		}
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"agents":         result,
		"total_requests": totalRequests,
		"uptime_seconds": int(time.Since(o.startedAt).Seconds()),
	})
}

func (o *Orchestrator) handleAgentHealth(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	agentCfg, ok := o.config.Agents[id]
	if !ok {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": fmt.Sprintf("agent '%s' non trouvé", id)})
		return
	}
	var healthURL string
	if agentCfg.Port > 0 {
		healthURL = fmt.Sprintf("http://localhost:%d/health", agentCfg.Port)
	} else if agentCfg.Endpoint != "" && agentCfg.Type == "external" {
		healthURL = agentCfg.Endpoint + "/health"
	} else {
		if a, exists := o.agents[id]; exists {
			info := a.Info()
			jsonResponse(w, http.StatusOK, map[string]interface{}{"status": "healthy", "agent_id": id, "version": "1.0.0", "enabled": info.Enabled})
		} else {
			jsonResponse(w, http.StatusNotFound, map[string]string{"error": fmt.Sprintf("agent '%s' non démarré", id)})
		}
		return
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(healthURL)
	if err != nil {
		jsonResponse(w, http.StatusServiceUnavailable, map[string]interface{}{"status": "unreachable", "agent_id": id, "error": err.Error()})
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func (o *Orchestrator) handleConfig(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"server": o.config.Server, "ollama": o.config.Ollama,
		"storage": o.config.Storage, "logging": o.config.Logging, "queue": o.config.Queue,
	})
}

func (o *Orchestrator) handleListAgents(w http.ResponseWriter, r *http.Request) {
	list := make([]agent.AgentInfo, 0, len(o.agents))
	for _, a := range o.agents {
		list = append(list, a.Info())
	}
	jsonResponse(w, http.StatusOK, list)
}

func (o *Orchestrator) handleGetAgent(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPut {
		o.handleUpdateAgent(w, r)
		return
	}
	vars := mux.Vars(r)
	id := vars["id"]
	if a, ok := o.agents[id]; ok {
		jsonResponse(w, http.StatusOK, a.Info())
	} else {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "agent non trouvé"})
	}
}

func (o *Orchestrator) handleUpdateAgent(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	if _, ok := o.config.Agents[id]; !ok {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "agent non trouvé"})
		return
	}
	var payload struct {
		Model        string   `json:"model"`
		Capabilities []string `json:"capabilities"`
		Enabled      bool     `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	existing := o.config.Agents[id]
	existing.Model = payload.Model
	existing.Enabled = payload.Enabled
	existing.Tools = payload.Capabilities
	o.config.Agents[id] = existing
	configBytes, err := yaml.Marshal(o.config)
	if err != nil {
		log.Warn().Err(err).Str("agent", id).Msg("Erreur marshal config")
	} else {
		if err := os.WriteFile("config.yaml", configBytes, 0644); err != nil {
			log.Warn().Err(err).Str("agent", id).Msg("Erreur écriture config.yaml")
		} else {
			log.Info().Str("agent", id).Str("model", payload.Model).Msg("✅ Config persistée")
		}
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"agent_id": id, "status": "persisted", "model": payload.Model, "enabled": payload.Enabled})
}

func (o *Orchestrator) handleCreateTask(w http.ResponseWriter, r *http.Request) {
	var task agent.Task
	if err := json.NewDecoder(r.Body).Decode(&task); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	task.ID = fmt.Sprintf("task-%d", time.Now().UnixNano())
	task.CreatedAt = time.Now()
	o.taskQueue <- &task
	jsonResponse(w, http.StatusAccepted, map[string]string{"task_id": task.ID, "status": "queued"})
}

func (o *Orchestrator) handleGetTask(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	o.resultsMu.RLock()
	result, ok := o.results[id]
	o.resultsMu.RUnlock()
	if ok {
		jsonResponse(w, http.StatusOK, result)
	} else {
		jsonResponse(w, http.StatusOK, map[string]string{"task_id": id, "status": "pending"})
	}
}

func (o *Orchestrator) handleChat(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	agentID := vars["agent"]
	var req struct {
		Message string `json:"message"`
		Model   string `json:"model,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	agentCfg, cfgOK := o.config.Agents[agentID]
	if cfgOK && agentCfg.Type == "external" && agentCfg.Port > 0 {
		start := time.Now()
		chatURL := fmt.Sprintf("http://localhost:%d/chat", agentCfg.Port)
		body, _ := json.Marshal(req)
		resp, err := http.Post(chatURL, "application/json", bytes.NewReader(body))
		durationMs := time.Since(start).Milliseconds()
		if err != nil {
			o.recordStat(agentID, durationMs, false)
			jsonResponse(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}
		defer resp.Body.Close()
		o.recordStat(agentID, durationMs, resp.StatusCode < 400)
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		io.Copy(w, resp.Body)
		return
	}
	agentInstance, ok := o.agents[agentID]
	if !ok {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "agent non trouvé"})
		return
	}
	// Résoudre le modèle : priorité au modèle envoyé par le frontend,
	// sinon lire depuis o.config.Agents (mis à jour par PUT /api/agents/{id})
	resolvedModel := req.Model
	if resolvedModel == "" {
		if cfg, ok := o.config.Agents[agentID]; ok {
			alias := cfg.Model
			if m, ok := o.config.Ollama.Models[alias]; ok {
				resolvedModel = m // résoudre l'alias (ex: coding → mistral:7b-instruct-q4_0)
			} else if alias != "" {
				resolvedModel = alias // modèle direct sans alias
			}
		}
	}
	log.Info().Str("agent", agentID).Str("model", resolvedModel).Msg("Chat request")
	task := &agent.Task{
		ID: fmt.Sprintf("chat-%d", time.Now().UnixNano()), AgentID: agentID,
		Type: agent.TaskTypeChat, Input: req.Message, CreatedAt: time.Now(),
		Context: map[string]interface{}{"model": resolvedModel},
	}
	start := time.Now()
	result, err := agentInstance.Execute(r.Context(), task)
	o.recordStat(agentID, time.Since(start).Milliseconds(), err == nil && result.Success)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	jsonResponse(w, http.StatusOK, result)
}

func (o *Orchestrator) handleOllamaModels(w http.ResponseWriter, r *http.Request) {
	resp, err := http.Get(o.config.Ollama.BaseURL + "/api/tags")
	if err != nil {
		jsonResponse(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", "application/json")
	io.Copy(w, resp.Body)
}

func (o *Orchestrator) handleOllamaPull(w http.ResponseWriter, r *http.Request) {
	resp, err := http.Post(o.config.Ollama.BaseURL+"/api/pull", "application/json", r.Body)
	if err != nil {
		jsonResponse(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", "application/json")
	io.Copy(w, resp.Body)
}

func (o *Orchestrator) handleOllamaDelete(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	req, err := http.NewRequest("DELETE", o.config.Ollama.BaseURL+"/api/delete", bytes.NewReader(body))
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		jsonResponse(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func (o *Orchestrator) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := o.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().Err(err).Msg("Erreur WebSocket upgrade")
		return
	}
	o.wsClientsMu.Lock()
	o.wsClients[conn] = true
	o.wsClientsMu.Unlock()
	log.Info().Str("remote", conn.RemoteAddr().String()).Msg("Client WebSocket connecté")
	defer func() {
		o.wsClientsMu.Lock()
		delete(o.wsClients, conn)
		o.wsClientsMu.Unlock()
		conn.Close()
	}()
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var request struct {
			Type    string          `json:"type"`
			Payload json.RawMessage `json:"payload"`
		}
		if err := json.Unmarshal(msg, &request); err != nil {
			continue
		}
		if request.Type == "chat" {
			var chat struct {
				Agent   string `json:"agent"`
				Message string `json:"message"`
			}
			if err := json.Unmarshal(request.Payload, &chat); err != nil {
				continue
			}
			go func() {
				task := &agent.Task{
					ID: fmt.Sprintf("ws-%d", time.Now().UnixNano()), AgentID: chat.Agent,
					Type: agent.TaskTypeChat, Input: chat.Message, CreatedAt: time.Now(),
				}
				if agentInstance, ok := o.agents[chat.Agent]; ok {
					start := time.Now()
					result, err := agentInstance.Execute(context.Background(), task)
					o.recordStat(chat.Agent, time.Since(start).Milliseconds(), err == nil)
					response, _ := json.Marshal(map[string]interface{}{"type": "response", "result": result})
					conn.WriteMessage(websocket.TextMessage, response)
				}
			}()
		}
	}
}

func (o *Orchestrator) worker(ctx context.Context, id int) {
	log.Debug().Int("worker", id).Msg("Worker démarré")
	for {
		select {
		case <-ctx.Done():
			return
		case task := <-o.taskQueue:
			o.processTask(ctx, task)
		}
	}
}

func (o *Orchestrator) processTask(ctx context.Context, task *agent.Task) {
	log.Info().Str("task", task.ID).Str("agent", task.AgentID).Msg("Traitement")
	agentInstance, ok := o.agents[task.AgentID]
	if !ok {
		o.saveResult(&agent.Result{
			TaskID: task.ID, AgentID: task.AgentID, Success: false,
			Error: fmt.Sprintf("agent %s non trouvé", task.AgentID), CompletedAt: time.Now(),
		})
		return
	}
	start := time.Now()
	result, err := agentInstance.Execute(ctx, task)
	o.recordStat(task.AgentID, time.Since(start).Milliseconds(), err == nil && result.Success)
	if err != nil {
		log.Error().Err(err).Str("task", task.ID).Msg("Erreur d'exécution")
	}
	o.saveResult(result)
	o.broadcastResult(result)
}

func (o *Orchestrator) saveResult(result *agent.Result) {
	o.resultsMu.Lock()
	o.results[result.TaskID] = result
	o.resultsMu.Unlock()
}

func (o *Orchestrator) broadcastResult(result *agent.Result) {
	o.wsClientsMu.RLock()
	defer o.wsClientsMu.RUnlock()
	msg, _ := json.Marshal(map[string]interface{}{"type": "result", "result": result})
	for client := range o.wsClients {
		client.WriteMessage(websocket.TextMessage, msg)
	}
}

// handleBackend retourne le backend actif
func (o *Orchestrator) handleBackend(w http.ResponseWriter, r *http.Request) {
	backend := "ollama" // default
	// 1. Vérifier la variable d'environnement BACKEND
	if env := os.Getenv("BACKEND"); env != "" {
		backend = strings.TrimSpace(env)
	} else if data, err := os.ReadFile(".backend"); err == nil {
		// 2. Sinon lire le fichier .backend
		b := strings.TrimSpace(string(data))
		if b != "" {
			backend = b
		}
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"backend":   backend,
		"available": []string{"ollama", "mock", "gguf"},
	})
}

// handleBackendSwitch change le backend actif
func (o *Orchestrator) handleBackendSwitch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Backend string `json:"backend"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// Vérifier que le backend est valide
	valid := map[string]bool{"ollama": true, "mock": true, "gguf": true}
	if !valid[req.Backend] {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "backend invalide"})
		return
	}

	// Écrire dans le fichier .backend (à l'intérieur du container)
	if err := os.WriteFile(".backend", []byte(req.Backend), 0644); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok", "backend": req.Backend})
}

func (o *Orchestrator) handleAgentStart(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	if a, ok := o.agents[id]; ok {
		a.Enable()
		jsonResponse(w, http.StatusOK, map[string]interface{}{"agent_id": id, "enabled": true, "status": "started"})
	} else {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "agent non trouvé"})
	}
}

func (o *Orchestrator) handleAgentStop(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	if a, ok := o.agents[id]; ok {
		a.Disable()
		jsonResponse(w, http.StatusOK, map[string]interface{}{"agent_id": id, "enabled": false, "status": "stopped"})
	} else {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "agent non trouvé"})
	}
}

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	configFile, err := os.ReadFile("config.yaml")
	if err != nil {
		log.Fatal().Err(err).Msg("Impossible de lire config.yaml")
	}

	var config Config
	if err := yaml.Unmarshal(configFile, &config); err != nil {
		log.Fatal().Err(err).Msg("Erreur de parsing config.yaml")
	}

	if envURL := os.Getenv("OLLAMA_URL"); envURL != "" {
		config.Ollama.BaseURL = envURL
	}

	orch, err := NewOrchestrator(&config)
	if err != nil {
		log.Fatal().Err(err).Msg("Erreur d'initialisation")
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		log.Info().Msg("Signal reçu, arrêt...")
		cancel()
	}()

	if err := orch.Start(ctx); err != nil {
		log.Fatal().Err(err).Msg("Erreur de démarrage")
	}
}