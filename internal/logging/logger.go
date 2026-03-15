package logging

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Level représente un niveau de log
type Level int

const (
	DEBUG Level = iota
	INFO
	WARN
	ERROR
)

func (l Level) String() string {
	switch l {
	case DEBUG:
		return "DEBUG"
	case INFO:
		return "INFO"
	case WARN:
		return "WARN"
	case ERROR:
		return "ERROR"
	default:
		return "UNKNOWN"
	}
}

// ParseLevel convertit une string en Level
func ParseLevel(s string) Level {
	switch s {
	case "debug", "DEBUG":
		return DEBUG
	case "info", "INFO":
		return INFO
	case "warn", "WARN", "warning", "WARNING":
		return WARN
	case "error", "ERROR":
		return ERROR
	default:
		return INFO
	}
}

// LogEntry représente une entrée de log structurée
type LogEntry struct {
	Timestamp  string                 `json:"timestamp"`
	Level      string                 `json:"level"`
	Logger     string                 `json:"logger"`
	Message    string                 `json:"message"`
	RequestID  string                 `json:"request_id,omitempty"`
	AgentID    string                 `json:"agent_id,omitempty"`
	DurationMs int64                  `json:"duration_ms,omitempty"`
	Status     string                 `json:"status,omitempty"`
	Error      string                 `json:"error,omitempty"`
	Fields     map[string]interface{} `json:"fields,omitempty"`
}

// Logger est un logger structuré JSON
type Logger struct {
	name   string
	level  Level
	output io.Writer
	mu     sync.Mutex

	// Context fields
	contextFields map[string]interface{}
}

// NewLogger crée un nouveau logger
func NewLogger(name string, level Level, output io.Writer) *Logger {
	if output == nil {
		output = os.Stderr
	}
	return &Logger{
		name:          name,
		level:         level,
		output:        output,
		contextFields: make(map[string]interface{}),
	}
}

// NewLoggerFromEnv crée un logger depuis les variables d'environnement
func NewLoggerFromEnv(name string) *Logger {
	levelStr := os.Getenv("LOG_LEVEL")
	if levelStr == "" {
		levelStr = "info"
	}
	return NewLogger(name, ParseLevel(levelStr), os.Stderr)
}

// WithFields retourne un nouveau logger avec des champs supplémentaires
func (l *Logger) WithFields(fields map[string]interface{}) *Logger {
	newLogger := &Logger{
		name:          l.name,
		level:         l.level,
		output:        l.output,
		contextFields: make(map[string]interface{}),
	}
	// Copier les champs existants
	for k, v := range l.contextFields {
		newLogger.contextFields[k] = v
	}
	// Ajouter les nouveaux champs
	for k, v := range fields {
		newLogger.contextFields[k] = v
	}
	return newLogger
}

// WithRequestID retourne un logger avec request_id
func (l *Logger) WithRequestID(requestID string) *Logger {
	return l.WithFields(map[string]interface{}{
		"request_id": requestID,
	})
}

// WithAgent retourne un logger avec agent_id
func (l *Logger) WithAgent(agentID string) *Logger {
	return l.WithFields(map[string]interface{}{
		"agent_id": agentID,
	})
}

// log écrit une entrée de log
func (l *Logger) log(level Level, message string, fields map[string]interface{}) {
	if level < l.level {
		return
	}

	entry := LogEntry{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Level:     level.String(),
		Logger:    l.name,
		Message:   message,
	}

	// Fusionner tous les champs
	allFields := make(map[string]interface{})
	for k, v := range l.contextFields {
		allFields[k] = v
	}
	for k, v := range fields {
		allFields[k] = v
	}

	// Extraire les champs spéciaux
	if v, ok := allFields["request_id"].(string); ok {
		entry.RequestID = v
		delete(allFields, "request_id")
	}
	if v, ok := allFields["agent_id"].(string); ok {
		entry.AgentID = v
		delete(allFields, "agent_id")
	}
	if v, ok := allFields["duration_ms"].(int64); ok {
		entry.DurationMs = v
		delete(allFields, "duration_ms")
	}
	if v, ok := allFields["status"].(string); ok {
		entry.Status = v
		delete(allFields, "status")
	}
	if v, ok := allFields["error"].(string); ok {
		entry.Error = v
		delete(allFields, "error")
	}

	if len(allFields) > 0 {
		entry.Fields = allFields
	}

	// Écrire le JSON
	l.mu.Lock()
	defer l.mu.Unlock()

	data, err := json.Marshal(entry)
	if err != nil {
		return
	}
	l.output.Write(append(data, '\n'))
}

// Debug log un message debug
func (l *Logger) Debug(message string, fields ...map[string]interface{}) {
	f := mergeFields(fields)
	l.log(DEBUG, message, f)
}

// Info log un message info
func (l *Logger) Info(message string, fields ...map[string]interface{}) {
	f := mergeFields(fields)
	l.log(INFO, message, f)
}

// Warn log un message warning
func (l *Logger) Warn(message string, fields ...map[string]interface{}) {
	f := mergeFields(fields)
	l.log(WARN, message, f)
}

// Error log un message erreur
func (l *Logger) Error(message string, fields ...map[string]interface{}) {
	f := mergeFields(fields)
	l.log(ERROR, message, f)
}

func mergeFields(fields []map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{})
	for _, f := range fields {
		for k, v := range f {
			result[k] = v
		}
	}
	return result
}

// RequestContext pour tracer une requête de bout en bout
type RequestContext struct {
	logger    *Logger
	requestID string
	agentID   string
	startTime time.Time
	fields    map[string]interface{}
}

// NewRequestContext crée un nouveau contexte de requête
func NewRequestContext(logger *Logger, agentID string) *RequestContext {
	requestID := uuid.New().String()
	rc := &RequestContext{
		logger:    logger.WithRequestID(requestID).WithAgent(agentID),
		requestID: requestID,
		agentID:   agentID,
		startTime: time.Now(),
		fields:    make(map[string]interface{}),
	}
	rc.logger.Info("Request started")
	return rc
}

// WithFields ajoute des champs au contexte
func (rc *RequestContext) WithFields(fields map[string]interface{}) *RequestContext {
	for k, v := range fields {
		rc.fields[k] = v
	}
	return rc
}

// RequestID retourne l'ID de la requête
func (rc *RequestContext) RequestID() string {
	return rc.requestID
}

// Debug log debug
func (rc *RequestContext) Debug(message string, fields ...map[string]interface{}) {
	f := mergeFields(append([]map[string]interface{}{rc.fields}, fields...))
	rc.logger.Debug(message, f)
}

// Info log info
func (rc *RequestContext) Info(message string, fields ...map[string]interface{}) {
	f := mergeFields(append([]map[string]interface{}{rc.fields}, fields...))
	rc.logger.Info(message, f)
}

// Warn log warning
func (rc *RequestContext) Warn(message string, fields ...map[string]interface{}) {
	f := mergeFields(append([]map[string]interface{}{rc.fields}, fields...))
	rc.logger.Warn(message, f)
}

// Error log erreur
func (rc *RequestContext) Error(message string, fields ...map[string]interface{}) {
	f := mergeFields(append([]map[string]interface{}{rc.fields}, fields...))
	rc.logger.Error(message, f)
}

// ElapsedMs retourne le temps écoulé en millisecondes
func (rc *RequestContext) ElapsedMs() int64 {
	return time.Since(rc.startTime).Milliseconds()
}

// Complete termine le contexte avec succès
func (rc *RequestContext) Complete(fields ...map[string]interface{}) {
	f := mergeFields(append([]map[string]interface{}{rc.fields}, fields...))
	f["duration_ms"] = rc.ElapsedMs()
	f["status"] = "success"
	rc.logger.Info("Request completed", f)
}

// Fail termine le contexte avec erreur
func (rc *RequestContext) Fail(err error, fields ...map[string]interface{}) {
	f := mergeFields(append([]map[string]interface{}{rc.fields}, fields...))
	f["duration_ms"] = rc.ElapsedMs()
	f["status"] = "error"
	f["error"] = err.Error()
	rc.logger.Error("Request failed", f)
}

// Context key pour stocker le RequestContext
type contextKey string

const requestContextKey contextKey = "request_context"

// WithContext ajoute le RequestContext au context.Context
func (rc *RequestContext) WithContext(ctx context.Context) context.Context {
	return context.WithValue(ctx, requestContextKey, rc)
}

// FromContext récupère le RequestContext du context.Context
func FromContext(ctx context.Context) *RequestContext {
	rc, ok := ctx.Value(requestContextKey).(*RequestContext)
	if !ok {
		return nil
	}
	return rc
}

// Global logger
var defaultLogger *Logger

func init() {
	defaultLogger = NewLoggerFromEnv("orchestrator")
}

// Default retourne le logger par défaut
func Default() *Logger {
	return defaultLogger
}

// SetDefault définit le logger par défaut
func SetDefault(l *Logger) {
	defaultLogger = l
}
