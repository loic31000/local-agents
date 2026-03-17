package logging

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"testing"
)

func TestParseLevel(t *testing.T) {
	tests := []struct {
		input    string
		expected Level
	}{
		{"debug", DEBUG},
		{"DEBUG", DEBUG},
		{"info", INFO},
		{"INFO", INFO},
		{"warn", WARN},
		{"WARNING", WARN},
		{"warning", WARN},
		{"error", ERROR},
		{"ERROR", ERROR},
		{"unknown", INFO}, // Default
	}

	for _, test := range tests {
		result := ParseLevel(test.input)
		if result != test.expected {
			t.Errorf("ParseLevel(%s): expected %v, got %v", test.input, test.expected, result)
		}
	}
}

func TestLevelString(t *testing.T) {
	tests := []struct {
		level    Level
		expected string
	}{
		{DEBUG, "DEBUG"},
		{INFO, "INFO"},
		{WARN, "WARN"},
		{ERROR, "ERROR"},
		{Level(999), "UNKNOWN"},
	}

	for _, test := range tests {
		result := test.level.String()
		if result != test.expected {
			t.Errorf("Level(%v).String(): expected %s, got %s", test.level, test.expected, result)
		}
	}
}

func TestNewLogger(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", INFO, buffer)

	if logger == nil {
		t.Fatal("Expected non-nil logger")
	}

	if logger.name != "test" {
		t.Errorf("Expected name 'test', got %s", logger.name)
	}

	if logger.level != INFO {
		t.Errorf("Expected level INFO, got %v", logger.level)
	}

	if logger.output != buffer {
		t.Error("Expected output to be the buffer")
	}

	if logger.contextFields == nil {
		t.Error("Expected non-nil contextFields")
	}
}

func TestNewLoggerNilOutput(t *testing.T) {
	logger := NewLogger("test", INFO, nil)

	if logger == nil {
		t.Fatal("Expected non-nil logger")
	}

	if logger.output == nil {
		t.Error("Expected default output (os.Stderr)")
	}
}

func TestNewLoggerFromEnv(t *testing.T) {
	// Set environment variable
	os.Setenv("LOG_LEVEL", "debug")
	defer os.Unsetenv("LOG_LEVEL")

	logger := NewLoggerFromEnv("test")

	if logger == nil {
		t.Fatal("Expected non-nil logger")
	}

	if logger.level != DEBUG {
		t.Errorf("Expected level DEBUG from env, got %v", logger.level)
	}
}

func TestWithFields(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", INFO, buffer)

	newLogger := logger.WithFields(map[string]interface{}{
		"key1": "value1",
		"key2": 42,
	})

	if newLogger == nil {
		t.Fatal("Expected non-nil logger")
	}

	if newLogger.name != logger.name {
		t.Error("Expected name to be preserved")
	}

	if len(newLogger.contextFields) != 2 {
		t.Errorf("Expected 2 fields, got %d", len(newLogger.contextFields))
	}

	if newLogger.contextFields["key1"] != "value1" {
		t.Error("Expected field key1 to be 'value1'")
	}

	if newLogger.contextFields["key2"] != 42 {
		t.Error("Expected field key2 to be 42")
	}
}

func TestWithRequestID(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", INFO, buffer)

	newLogger := logger.WithRequestID("req-123")

	if newLogger == nil {
		t.Fatal("Expected non-nil logger")
	}

	if newLogger.contextFields["request_id"] != "req-123" {
		t.Error("Expected field request_id to be 'req-123'")
	}
}

func TestWithAgent(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", INFO, buffer)

	newLogger := logger.WithAgent("coder")

	if newLogger == nil {
		t.Fatal("Expected non-nil logger")
	}

	if newLogger.contextFields["agent_id"] != "coder" {
		t.Error("Expected field agent_id to be 'coder'")
	}
}

func TestDebug(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", DEBUG, buffer)

	logger.Debug("debug message")

	if buffer.Len() == 0 {
		t.Error("Expected log output")
	}

	// Parse JSON
	var entry LogEntry
	err := json.Unmarshal(buffer.Bytes(), &entry)
	if err != nil {
		t.Fatalf("Failed to parse log entry: %v", err)
	}

	if entry.Message != "debug message" {
		t.Errorf("Expected message 'debug message', got %s", entry.Message)
	}

	if entry.Level != "DEBUG" {
		t.Errorf("Expected level DEBUG, got %s", entry.Level)
	}
}

func TestInfo(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", INFO, buffer)

	logger.Info("info message")

	if buffer.Len() == 0 {
		t.Error("Expected log output")
	}
}

func TestWarn(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", WARN, buffer)

	logger.Warn("warn message")

	if buffer.Len() == 0 {
		t.Error("Expected log output")
	}
}

func TestError(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", ERROR, buffer)

	logger.Error("error message")

	if buffer.Len() == 0 {
		t.Error("Expected log output")
	}
}

func TestLogLevelFiltering(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", WARN, buffer)

	// Debug message should not be logged
	logger.Debug("debug message")
	if buffer.Len() != 0 {
		t.Error("Expected no output for debug message with WARN level")
	}

	// Warn message should be logged
	logger.Warn("warn message")
	if buffer.Len() == 0 {
		t.Error("Expected output for warn message")
	}
}

func TestLogEntry(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", INFO, buffer)
	logger = logger.WithRequestID("req-123").WithAgent("coder")

	logger.Info("test message", map[string]interface{}{
		"custom": "field",
	})

	if buffer.Len() == 0 {
		t.Fatal("Expected log output")
	}

	var entry LogEntry
	err := json.Unmarshal(buffer.Bytes(), &entry)
	if err != nil {
		t.Fatalf("Failed to parse log entry: %v", err)
	}

	if entry.Message != "test message" {
		t.Errorf("Expected message 'test message', got %s", entry.Message)
	}

	if entry.RequestID != "req-123" {
		t.Errorf("Expected request_id 'req-123', got %s", entry.RequestID)
	}

	if entry.AgentID != "coder" {
		t.Errorf("Expected agent_id 'coder', got %s", entry.AgentID)
	}
}

func TestLoggerChaining(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", DEBUG, buffer)

	// Test chaining WithFields and WithRequestID
	chainedLogger := logger.WithFields(map[string]interface{}{
		"key": "value",
	}).WithRequestID("req-456")

	if chainedLogger == nil {
		t.Error("Expected non-nil logger from chaining")
	}
}

func TestLoggerWithMultipleFields(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", INFO, buffer)

	fields := map[string]interface{}{
		"field1": "value1",
		"field2": 42,
		"field3": true,
		"field4": 3.14,
	}

	logger = logger.WithFields(fields)

	if len(logger.contextFields) != 4 {
		t.Errorf("Expected 4 fields, got %d", len(logger.contextFields))
	}
}

func TestLoggerLevelOrdering(t *testing.T) {
	if DEBUG >= INFO {
		t.Error("Expected DEBUG < INFO")
	}

	if INFO >= WARN {
		t.Error("Expected INFO < WARN")
	}

	if WARN >= ERROR {
		t.Error("Expected WARN < ERROR")
	}
}

func TestParseLevelEdgeCases(t *testing.T) {
	tests := []struct {
		input    string
		expected Level
	}{
		{"", INFO},
		{"unknown", INFO},
		{"UNKNOWN", INFO},
		{"debug", DEBUG},
		{"DEBUG", DEBUG},
	}

	for _, test := range tests {
		result := ParseLevel(test.input)
		if result != test.expected {
			t.Errorf("ParseLevel(%q): expected %v, got %v", test.input, test.expected, result)
		}
	}
}

func TestNewLoggerFromEnvDefault(t *testing.T) {
	os.Unsetenv("LOG_LEVEL")
	logger := NewLoggerFromEnv("test")

	if logger.level != INFO {
		t.Errorf("Expected default level INFO, got %v", logger.level)
	}
}

func TestLogEntrySerialization(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", ERROR, buffer)

	logger.Error("error occurred", map[string]interface{}{
		"error":  "test error",
		"status": "CRITICAL",
	})

	var entry LogEntry
	err := json.Unmarshal(buffer.Bytes(), &entry)
	if err != nil {
		t.Fatalf("Failed to parse log entry: %v", err)
	}

	if entry.Level != "ERROR" {
		t.Errorf("Expected level ERROR, got %s", entry.Level)
	}

	if entry.Error != "test error" {
		t.Errorf("Expected error field, got %s", entry.Error)
	}

	if entry.Status != "CRITICAL" {
		t.Errorf("Expected status CRITICAL, got %s", entry.Status)
	}
}

func TestNewRequestContext(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", INFO, buffer)

	rc := NewRequestContext(logger, "agent-1")

	if rc == nil {
		t.Fatal("Expected non-nil RequestContext")
	}

	if rc.requestID == "" {
		t.Error("Expected non-empty request ID")
	}

	if rc.agentID != "agent-1" {
		t.Errorf("Expected agentID 'agent-1', got %s", rc.agentID)
	}

	if rc.logger == nil {
		t.Error("Expected non-nil logger")
	}

	// Check that "Request started" was logged
	if buffer.Len() == 0 {
		t.Error("Expected startup log message")
	}
}

func TestRequestContextWithFields(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", INFO, buffer)
	rc := NewRequestContext(logger, "agent-1")
	buffer.Reset()

	rc = rc.WithFields(map[string]interface{}{
		"key1": "value1",
		"key2": 42,
	})

	rc.Info("test message")

	if buffer.Len() == 0 {
		t.Error("Expected log output")
	}

	var entry LogEntry
	err := json.Unmarshal(buffer.Bytes(), &entry)
	if err != nil {
		t.Fatalf("Failed to parse log entry: %v", err)
	}

	if entry.Fields["key1"] != "value1" {
		t.Error("Expected field key1 in log entry")
	}
}

func TestRequestContextRequestID(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", INFO, buffer)
	rc := NewRequestContext(logger, "agent-1")

	requestID := rc.RequestID()

	if requestID == "" {
		t.Error("Expected non-empty request ID")
	}

	if requestID != rc.requestID {
		t.Error("Expected RequestID to match internal request ID")
	}
}

func TestRequestContextDebugLogLevel(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", DEBUG, buffer)
	rc := NewRequestContext(logger, "agent-1")
	buffer.Reset()

	rc.Debug("debug message")

	if buffer.Len() == 0 {
		t.Error("Expected log output for debug message")
	}

	var entry LogEntry
	err := json.Unmarshal(buffer.Bytes(), &entry)
	if err != nil {
		t.Fatalf("Failed to parse log entry: %v", err)
	}

	if entry.Level != "DEBUG" {
		t.Errorf("Expected level DEBUG, got %s", entry.Level)
	}
}

func TestRequestContextWarnLogLevel(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", WARN, buffer)
	rc := NewRequestContext(logger, "agent-1")
	buffer.Reset()

	rc.Warn("warn message")

	if buffer.Len() == 0 {
		t.Error("Expected log output for warn message")
	}

	var entry LogEntry
	err := json.Unmarshal(buffer.Bytes(), &entry)
	if err != nil {
		t.Fatalf("Failed to parse log entry: %v", err)
	}

	if entry.Level != "WARN" {
		t.Errorf("Expected level WARN, got %s", entry.Level)
	}
}

func TestRequestContextErrorLogLevel(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", ERROR, buffer)
	rc := NewRequestContext(logger, "agent-1")
	buffer.Reset()

	rc.Error("error message")

	if buffer.Len() == 0 {
		t.Error("Expected log output for error message")
	}

	var entry LogEntry
	err := json.Unmarshal(buffer.Bytes(), &entry)
	if err != nil {
		t.Fatalf("Failed to parse log entry: %v", err)
	}

	if entry.Level != "ERROR" {
		t.Errorf("Expected level ERROR, got %s", entry.Level)
	}
}

func TestRequestContextElapsedMs(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", INFO, buffer)
	rc := NewRequestContext(logger, "agent-1")

	elapsed := rc.ElapsedMs()

	if elapsed < 0 {
		t.Error("Expected non-negative elapsed time")
	}
}

func TestRequestContextComplete(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", INFO, buffer)
	rc := NewRequestContext(logger, "agent-1")
	buffer.Reset()

	rc.Complete()

	if buffer.Len() == 0 {
		t.Error("Expected completion log")
	}

	var entry LogEntry
	err := json.Unmarshal(buffer.Bytes(), &entry)
	if err != nil {
		t.Fatalf("Failed to parse log entry: %v", err)
	}

	if entry.Status != "success" {
		t.Errorf("Expected status 'success', got %s", entry.Status)
	}

	if entry.DurationMs < 0 {
		t.Error("Expected non-negative duration")
	}
}

func TestRequestContextFail(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", INFO, buffer)
	rc := NewRequestContext(logger, "agent-1")
	testError := &testErrorType{msg: "Something went wrong"}
	buffer.Reset()

	rc.Fail(testError)

	if buffer.Len() == 0 {
		t.Error("Expected failure log")
	}

	var entry LogEntry
	err := json.Unmarshal(buffer.Bytes(), &entry)
	if err != nil {
		t.Fatalf("Failed to parse log entry: %v", err)
	}

	if entry.Status != "error" {
		t.Errorf("Expected status 'error', got %s", entry.Status)
	}

	if entry.Error != "Something went wrong" {
		t.Errorf("Expected error message in log, got %s", entry.Error)
	}
}

func TestRequestContextWithContext(t *testing.T) {
	buffer := &bytes.Buffer{}
	logger := NewLogger("test", INFO, buffer)
	rc := NewRequestContext(logger, "agent-1")

	ctx := rc.WithContext(context.Background())

	if ctx == nil {
		t.Error("Expected non-nil context")
	}

	recovered := FromContext(ctx)
	if recovered == nil {
		t.Error("Expected to recover RequestContext from context")
	}

	if recovered.requestID != rc.requestID {
		t.Error("Expected recovered RequestContext to match original")
	}
}

func TestFromContextNotFound(t *testing.T) {
	ctx := context.Background()
	rc := FromContext(ctx)

	if rc != nil {
		t.Error("Expected nil when RequestContext not in context")
	}
}

func TestDefaultLogger(t *testing.T) {
	logger := Default()

	if logger == nil {
		t.Error("Expected non-nil default logger")
	}
}

func TestSetDefault(t *testing.T) {
	buffer := &bytes.Buffer{}
	newLogger := NewLogger("custom", INFO, buffer)

	oldDefault := Default()
	SetDefault(newLogger)

	if Default() != newLogger {
		t.Error("Expected default logger to be updated")
	}

	// Restore original
	SetDefault(oldDefault)
}

// Test helper
type testErrorType struct {
	msg string
}

func (e *testErrorType) Error() string {
	return e.msg
}
