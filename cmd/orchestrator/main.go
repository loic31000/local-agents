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

// ─────────────────────────────────────────────
//  Config
// ─────────────────────────────────────────────

// Config représente la configuration de l'application
type Config struct {
	Server struct {
		Host          string `yaml:"host"`
		Port          int    `yaml:"port"`
		WebsocketPath string `yaml:"websocket_path"`
	} `yaml:"server"`

	// Backend LLM : "llamacpp" (défaut) ou "ollama"
	LLMBackend string `yaml:"llm_backend"`

	// llama-server config (utilisé si llm_backend = "llamacpp")
	LlamaCpp struct {
		ServerURL    string `yaml:"server_url"`    // ex: "http://localhost:8081"
		DefaultModel string `yaml:"default_model"` // nom affiché
	} `yaml:"llamacpp"`

	// Ollama config (utilisé si llm_backend = "ollama")
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
}

// ─────────────────────────────────────────────
//  Orchestrator
// ─────────────────────────────────────────────

// Orchestrator gère tous les agents
type Orchestrator struct {
	config      *Config
	llmClient   llm.LLMClient // ← interface, pas de type concret
	agents      map[string]agent.Agent
	taskQueue   chan *agent.Task
	results     map[string]*agent.Result
	resultsMu   sync.RWMutex
	wsClients   map[*websocket.Conn]bool
	wsClientsMu sync.RWMutex
	upgrader    websocket.Upgrader
}

// NewOrchestrator crée un nouvel orchestrateur
func NewOrchestrator(config *Config) (*Orchestrator, error) {
	// ── Choisir le backend LLM ──────────────────────────────────────────────
	var llmClient llm.LLMClient

	backend := config.LLMBackend
	if backend == "" {
		backend = "llamacpp" // défaut : llama-server
	}

	switch backend {
	case "llamacpp":
		serverURL := config.LlamaCpp.ServerURL
		if serverURL == "" {
			serverURL = "http://localhost:8081"
		}
		modelName := config.LlamaCpp.DefaultModel
		if modelName == "" {
			modelName = "local-model"
		}
		llmClient = llm.NewLlamaCppClient(serverURL, modelName)
		log.Info().Str("backend", "llama.cpp").Str("url", serverURL).Msg("Backend LLM sélectionné")

	case "ollama":
		llmClient = llm.NewOllamaClient(config.Ollama.BaseURL)
		log.Info().Str("backend", "ollama").Str("url", config.Ollama.BaseURL).Msg("Backend LLM sélectionné")

	default:
		return nil, fmt.Errorf("llm_backend inconnu: %q (valeurs: llamacpp, ollama)", backend)
	}

	// ── Vérifier la connexion ───────────────────────────────────────────────
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := llmClient.Ping(ctx); err != nil {
		return nil, fmt.Errorf("impossible de joindre le backend LLM: %w", err)
	}
	log.Info().Msg("Backend LLM connecté ✓")

	orch := &Orchestrator{
		config:    config,
		llmClient: llmClient,
		agents:    make(map[string]agent.Agent),
		taskQueue: make(chan *agent.Task, 100),
		results:   make(map[string]*agent.Result),
		wsClients: make(map[*websocket.Conn]bool),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}

	if err := orch.initAgents(); err != nil {
		return nil, err
	}

	return orch, nil
}

// initAgents initialise tous les agents configurés
func (o *Orchestrator) initAgents() error {
	for agentID, agentCfg := range o.config.Agents {
		if !agentCfg.Enabled {
			log.Debug().Str("agent", agentID).Msg("Agent désactivé")
			continue
		}

		// Charger le prompt système
		promptContent, err := os.ReadFile(agentCfg.PromptFile)
		if err != nil {
			log.Warn().Str("agent", agentID).Err(err).Msg("Prompt introuvable, utilisation du défaut")
			promptContent = []byte(fmt.Sprintf("Tu es un agent spécialisé: %s", agentID))
		}

		// Résoudre le nom de modèle
		// Pour llama.cpp, le modèle chargé est fixe (1 seul à la fois dans llama-server)
		// On garde le nom pour l'affichage / les logs
		model := o.config.LlamaCpp.DefaultModel
		if o.config.LLMBackend == "ollama" {
			model = o.config.Ollama.DefaultModel
			if agentCfg.Model != "" {
				if m, ok := o.config.Ollama.Models[agentCfg.Model]; ok {
					model = m
				}
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

		baseAgent := agent.NewBaseAgent(info, string(promptContent), o.llmClient)

		// Ajouter les outils
		for _, toolName := range agentCfg.Tools {
			var tool agent.Tool
			switch toolName {
			case "filesystem":
				allowedPaths := agentCfg.AllowedPaths
				if len(allowedPaths) == 0 {
					allowedPaths = []string{os.Getenv("USERPROFILE"), os.Getenv("HOME")}
				}
				tool = tools.NewFileSystemTool(allowedPaths)
			case "terminal":
				homeDir := os.Getenv("USERPROFILE")
				if homeDir == "" {
					homeDir = os.Getenv("HOME")
				}
				tool = tools.NewTerminalTool(homeDir)
			case "vscode":
				tool = tools.NewVSCodeTool()
			case "git":
				tool = tools.NewGitTool(".")
			}
			if tool != nil {
				baseAgent.AddTool(tool)
				log.Debug().Str("agent", agentID).Str("tool", toolName).Msg("Outil ajouté")
			}
		}

		o.agents[agentID] = baseAgent
		log.Info().Str("agent", agentID).Str("model", model).Int("tools", len(agentCfg.Tools)).Msg("Agent initialisé")
	}
	return nil
}

// ─────────────────────────────────────────────
//  Start / workers
// ─────────────────────────────────────────────

func (o *Orchestrator) Start(ctx context.Context) error {
	for i := 0; i < o.config.Queue.MaxConcurrent; i++ {
		go o.worker(ctx, i)
	}

	router := mux.NewRouter()

	// API REST
	router.HandleFunc("/api/health", o.handleHealth).Methods("GET")
	router.HandleFunc("/api/agents", o.handleListAgents).Methods("GET")
	router.HandleFunc("/api/agents/{id}", o.handleGetAgent).Methods("GET")
	router.HandleFunc("/api/tasks", o.handleCreateTask).Methods("POST")
	router.HandleFunc("/api/tasks/{id}", o.handleGetTask).Methods("GET")
	router.HandleFunc("/api/chat/{agent}", o.handleChat).Methods("POST")

	// Proxy Ollama-like (pour la UI web - redirige vers le bon backend)
	router.HandleFunc("/api/ollama/models", o.handleModels).Methods("GET")
	router.HandleFunc("/api/ollama/pull", o.handleOllamaPull).Methods("POST")
	router.HandleFunc("/api/ollama/delete", o.handleOllamaDelete).Methods("DELETE")

	// WebSocket
	router.HandleFunc(o.config.Server.WebsocketPath, o.handleWebSocket)

	// UI statique
	router.PathPrefix("/").Handler(http.FileServer(http.Dir("web/static")))

	addr := fmt.Sprintf("%s:%d", o.config.Server.Host, o.config.Server.Port)
	server := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 5 * time.Minute,
	}

	go func() {
		log.Info().Str("addr", addr).Msg("Serveur démarré → http://localhost:8080")
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

func (o *Orchestrator) worker(ctx context.Context, id int) {
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
		result := &agent.Result{
			TaskID:      task.ID,
			AgentID:     task.AgentID,
			Success:     false,
			Error:       fmt.Sprintf("agent %s non trouvé", task.AgentID),
			CompletedAt: time.Now(),
		}
		o.saveResult(result)
		return
	}

	result, err := agentInstance.Execute(ctx, task)
	if err != nil {
		log.Error().Err(err).Str("task", task.ID).Msg("Erreur exécution")
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

// ─────────────────────────────────────────────
//  HTTP Handlers
// ─────────────────────────────────────────────

func (o *Orchestrator) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":     "ok",
		"agents":     len(o.agents),
		"version":    "0.2.0",
		"llm_backend": o.config.LLMBackend,
	})
}

func (o *Orchestrator) handleListAgents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	agentList := make([]agent.AgentInfo, 0, len(o.agents))
	for _, a := range o.agents {
		agentList = append(agentList, a.Info())
	}
	json.NewEncoder(w).Encode(agentList)
}

func (o *Orchestrator) handleGetAgent(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := mux.Vars(r)["id"]
	if a, ok := o.agents[id]; ok {
		json.NewEncoder(w).Encode(a.Info())
	} else {
		http.Error(w, "Agent non trouvé", http.StatusNotFound)
	}
}

func (o *Orchestrator) handleCreateTask(w http.ResponseWriter, r *http.Request) {
	var task agent.Task
	if err := json.NewDecoder(r.Body).Decode(&task); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	task.ID = fmt.Sprintf("task-%d", time.Now().UnixNano())
	task.CreatedAt = time.Now()
	o.taskQueue <- &task
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"task_id": task.ID, "status": "queued"})
}

func (o *Orchestrator) handleGetTask(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := mux.Vars(r)["id"]
	o.resultsMu.RLock()
	result, ok := o.results[id]
	o.resultsMu.RUnlock()
	if ok {
		json.NewEncoder(w).Encode(result)
	} else {
		json.NewEncoder(w).Encode(map[string]string{"task_id": id, "status": "pending"})
	}
}

func (o *Orchestrator) handleChat(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	agentID := mux.Vars(r)["agent"]

	var req struct {
		Message string `json:"message"`
		Model   string `json:"model,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	task := &agent.Task{
		ID:        fmt.Sprintf("chat-%d", time.Now().UnixNano()),
		AgentID:   agentID,
		Type:      agent.TaskTypeChat,
		Input:     req.Message,
		CreatedAt: time.Now(),
	}

	agentInstance, ok := o.agents[agentID]
	if !ok {
		http.Error(w, "Agent non trouvé", http.StatusNotFound)
		return
	}

	result, err := agentInstance.Execute(r.Context(), task)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(result)
}

// handleModels unifie la liste des modèles (quel que soit le backend)
func (o *Orchestrator) handleModels(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	models, err := o.llmClient.ListModels(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	// Format compatible avec la UI web existante
	modelList := make([]map[string]string, len(models))
	for i, m := range models {
		modelList[i] = map[string]string{"name": m}
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"models": modelList})
}

// handleOllamaPull – non pertinent avec llama.cpp, renvoie une explication
func (o *Orchestrator) handleOllamaPull(w http.ResponseWriter, r *http.Request) {
	if o.config.LLMBackend == "ollama" {
		resp, err := http.Post(o.config.Ollama.BaseURL+"/api/pull", "application/json", r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		io.Copy(w, resp.Body)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"info": "Avec llama.cpp, copie ton fichier .gguf dans le dossier models/ et redémarre llama-server",
	})
}

func (o *Orchestrator) handleOllamaDelete(w http.ResponseWriter, r *http.Request) {
	if o.config.LLMBackend == "ollama" {
		body, _ := io.ReadAll(r.Body)
		req, _ := http.NewRequest("DELETE", o.config.Ollama.BaseURL+"/api/delete", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"info": "Supprime manuellement le fichier .gguf pour libérer de l'espace",
	})
}

func (o *Orchestrator) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := o.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().Err(err).Msg("WebSocket upgrade error")
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

// ─────────────────────────────────────────────
//  main
// ─────────────────────────────────────────────

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	configFile, err := os.ReadFile("config.yaml")
	if err != nil {
		log.Fatal().Err(err).Msg("Impossible de lire config.yaml")
	}

	var config Config
	if err := yaml.Unmarshal(configFile, &config); err != nil {
		log.Fatal().Err(err).Msg("Erreur parsing config.yaml")
	}

	orch, err := NewOrchestrator(&config)
	if err != nil {
		log.Fatal().Err(err).Msg("Erreur initialisation — llama-server tourne-t-il ? Lance start_llama.bat d'abord")
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
		log.Fatal().Err(err).Msg("Erreur démarrage")
	}
}
