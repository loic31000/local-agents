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
	"gopkg.in/yaml.v3"
)

// Config représente la configuration de l'application
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

// AgentConfig représente la config d'un agent
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

// Orchestrator gère tous les agents
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
}

// NewOrchestrator crée un nouvel orchestrateur
func NewOrchestrator(config *Config) (*Orchestrator, error) {
	ollamaClient := llm.NewOllamaClient(config.Ollama.BaseURL)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := ollamaClient.Ping(ctx); err != nil {
		return nil, fmt.Errorf("impossible de se connecter à Ollama: %w", err)
	}
	log.Info().Str("url", config.Ollama.BaseURL).Msg("Connecté à Ollama")

	orch := &Orchestrator{
		config:       config,
		ollamaClient: ollamaClient,
		agents:       make(map[string]agent.Agent),
		taskQueue:    make(chan *agent.Task, 100),
		results:      make(map[string]*agent.Result),
		wsClients:    make(map[*websocket.Conn]bool),
		startedAt:    time.Now(),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}

	if err := orch.initAgents(); err != nil {
		return nil, err
	}

	return orch, nil
}

func (o *Orchestrator) initAgents() error {
	for agentID, agentCfg := range o.config.Agents {
		if !agentCfg.Enabled {
			log.Debug().Str("agent", agentID).Msg("Agent désactivé")
			continue
		}

		// Les agents externes (Python) ne sont pas instanciés ici
		if agentCfg.Type == "external" {
			log.Info().Str("agent", agentID).Str("endpoint", agentCfg.Endpoint).Msg("Agent externe enregistré")
			continue
		}

		promptPath := agentCfg.PromptFile
		promptContent, err := os.ReadFile(promptPath)
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
			ID:           agentID,
			Name:         agentID,
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

// jsonResponse écrit une réponse JSON avec le bon Content-Type
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

	// ── API REST ──────────────────────────────────────────────────────────
	router.HandleFunc("/api/health", o.handleHealth).Methods("GET")
	router.HandleFunc("/api/config", o.handleConfig).Methods("GET")
	router.HandleFunc("/api/agents", o.handleListAgents).Methods("GET")
	router.HandleFunc("/api/agents/{id}", o.handleGetAgent).Methods("GET")
	router.HandleFunc("/api/agents/{id}/health", o.handleAgentHealth).Methods("GET") // ← NOUVEAU
	router.HandleFunc("/api/tasks", o.handleCreateTask).Methods("POST")
	router.HandleFunc("/api/tasks/{id}", o.handleGetTask).Methods("GET")
	router.HandleFunc("/api/chat/{agent}", o.handleChat).Methods("POST")

	// ── Proxy Ollama ──────────────────────────────────────────────────────
	router.HandleFunc("/api/ollama/models", o.handleOllamaModels).Methods("GET")
	router.HandleFunc("/api/ollama/pull", o.handleOllamaPull).Methods("POST")
	router.HandleFunc("/api/ollama/delete", o.handleOllamaDelete).Methods("DELETE")

	// ── WebSocket ─────────────────────────────────────────────────────────
	router.HandleFunc(o.config.Server.WebsocketPath, o.handleWebSocket)

	// ── UI Web ────────────────────────────────────────────────────────────
	router.PathPrefix("/").Handler(http.FileServer(http.Dir("web/static")))

	addr := fmt.Sprintf("%s:%d", o.config.Server.Host, o.config.Server.Port)
	server := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 5 * time.Minute,
	}

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

// ── Handlers ──────────────────────────────────────────────────────────────────

func (o *Orchestrator) handleHealth(w http.ResponseWriter, r *http.Request) {
	uptime := int(time.Since(o.startedAt).Seconds())

	// Statut Ollama
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
		"status":         status,
		"agent_id":       "orchestrator",
		"version":        "1.0.0",
		"uptime_seconds": uptime,
		"agents_count":   len(o.agents),
		"ollama_ok":      ollamaOK,
	})
}

// handleAgentHealth — ping l'agent Python sur son port et proxifie la réponse
func (o *Orchestrator) handleAgentHealth(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	// Chercher le port dans la config
	agentCfg, ok := o.config.Agents[id]
	if !ok {
		jsonResponse(w, http.StatusNotFound, map[string]string{
			"error": fmt.Sprintf("agent '%s' non trouvé dans la config", id),
		})
		return
	}

	// Construire l'URL du health check de l'agent
	var healthURL string
	if agentCfg.Port > 0 {
		healthURL = fmt.Sprintf("http://localhost:%d/health", agentCfg.Port)
	} else if agentCfg.Endpoint != "" && agentCfg.Type == "external" {
		healthURL = agentCfg.Endpoint + "/health"
	} else {
		// Agent Go interne — vérifier dans la map
		if a, exists := o.agents[id]; exists {
			info := a.Info()
			jsonResponse(w, http.StatusOK, map[string]interface{}{
				"status":   "healthy",
				"agent_id": id,
				"version":  "1.0.0",
				"enabled":  info.Enabled,
			})
		} else {
			jsonResponse(w, http.StatusNotFound, map[string]string{
				"error": fmt.Sprintf("agent '%s' non démarré", id),
			})
		}
		return
	}

	// Ping l'agent externe
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(healthURL)
	if err != nil {
		jsonResponse(w, http.StatusServiceUnavailable, map[string]interface{}{
			"status":   "unreachable",
			"agent_id": id,
			"error":    err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	// Proxifier la réponse
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func (o *Orchestrator) handleConfig(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"server":  o.config.Server,
		"ollama":  o.config.Ollama,
		"agents":  o.config.Agents,
		"storage": o.config.Storage,
		"logging": o.config.Logging,
		"queue":   o.config.Queue,
	})
}

func (o *Orchestrator) handleListAgents(w http.ResponseWriter, r *http.Request) {
	agents := make([]agent.AgentInfo, 0, len(o.agents))
	for _, a := range o.agents {
		agents = append(agents, a.Info())
	}
	jsonResponse(w, http.StatusOK, agents)
}

func (o *Orchestrator) handleGetAgent(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	if a, ok := o.agents[id]; ok {
		jsonResponse(w, http.StatusOK, a.Info())
	} else {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "agent non trouvé"})
	}
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
	jsonResponse(w, http.StatusAccepted, map[string]string{
		"task_id": task.ID,
		"status":  "queued",
	})
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

	// Proxy vers agent externe si configuré
	agentCfg, cfgOK := o.config.Agents[agentID]
	if cfgOK && agentCfg.Type == "external" && agentCfg.Port > 0 {
		chatURL := fmt.Sprintf("http://localhost:%d/chat", agentCfg.Port)
		body, _ := json.Marshal(req)
		resp, err := http.Post(chatURL, "application/json", bytes.NewReader(body))
		if err != nil {
			jsonResponse(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		io.Copy(w, resp.Body)
		return
	}

	agentInstance, ok := o.agents[agentID]
	if !ok {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "agent non trouvé"})
		return
	}

	task := &agent.Task{
		ID:        fmt.Sprintf("chat-%d", time.Now().UnixNano()),
		AgentID:   agentID,
		Type:      agent.TaskTypeChat,
		Input:     req.Message,
		CreatedAt: time.Now(),
		Context:   map[string]interface{}{"model": req.Model},
	}

	result, err := agentInstance.Execute(r.Context(), task)
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
					ID:        fmt.Sprintf("ws-%d", time.Now().UnixNano()),
					AgentID:   chat.Agent,
					Type:      agent.TaskTypeChat,
					Input:     chat.Message,
					CreatedAt: time.Now(),
				}
				if agentInstance, ok := o.agents[chat.Agent]; ok {
					result, _ := agentInstance.Execute(context.Background(), task)
					response, _ := json.Marshal(map[string]interface{}{
						"type":   "response",
						"result": result,
					})
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
	log.Info().Str("task", task.ID).Str("agent", task.AgentID).Msg("Traitement de la tâche")
	agentInstance, ok := o.agents[task.AgentID]
	if !ok {
		o.saveResult(&agent.Result{
			TaskID:      task.ID,
			AgentID:     task.AgentID,
			Success:     false,
			Error:       fmt.Sprintf("agent %s non trouvé", task.AgentID),
			CompletedAt: time.Now(),
		})
		return
	}
	result, err := agentInstance.Execute(ctx, task)
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
