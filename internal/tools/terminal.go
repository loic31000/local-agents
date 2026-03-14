package tools

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// TerminalTool permet d'exécuter des commandes shell
type TerminalTool struct {
	workDir        string
	allowedCommands []string // Liste blanche de commandes, vide = tout autorisé
	blockedCommands []string // Liste noire de commandes dangereuses
	timeout        time.Duration
}

// NewTerminalTool crée un nouvel outil terminal
func NewTerminalTool(workDir string) *TerminalTool {
	return &TerminalTool{
		workDir: workDir,
		blockedCommands: []string{
			"rm -rf /",
			"mkfs",
			"dd if=/dev/zero",
			":(){:|:&};:", // Fork bomb
			"chmod -R 777 /",
		},
		timeout: 30 * time.Second,
	}
}

func (t *TerminalTool) Name() string {
	return "terminal"
}

func (t *TerminalTool) Description() string {
	return `Outil pour exécuter des commandes shell sur le système.
Permet d'exécuter des commandes bash (Linux/macOS) ou PowerShell/cmd (Windows).
Utilisé pour: compilation, installation de packages, manipulation de git, etc.`
}

func (t *TerminalTool) Schema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"command": map[string]interface{}{
				"type":        "string",
				"description": "Commande à exécuter",
			},
			"workdir": map[string]interface{}{
				"type":        "string",
				"description": "Répertoire de travail (optionnel)",
			},
			"timeout": map[string]interface{}{
				"type":        "integer",
				"description": "Timeout en secondes (défaut: 30)",
			},
		},
		"required": []string{"command"},
	}
}

func (t *TerminalTool) Execute(ctx context.Context, params map[string]interface{}) (interface{}, error) {
	command, _ := params["command"].(string)
	workdir, _ := params["workdir"].(string)
	
	if workdir == "" {
		workdir = t.workDir
	}

	// Vérifier les commandes bloquées
	if t.isBlocked(command) {
		return nil, fmt.Errorf("commande bloquée pour des raisons de sécurité")
	}

	// Timeout personnalisé
	timeout := t.timeout
	if timeoutSec, ok := params["timeout"].(float64); ok {
		timeout = time.Duration(timeoutSec) * time.Second
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Créer la commande selon l'OS
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", command)
	} else {
		cmd = exec.CommandContext(ctx, "bash", "-c", command)
	}

	cmd.Dir = workdir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	startTime := time.Now()
	err := cmd.Run()
	duration := time.Since(startTime)

	result := map[string]interface{}{
		"command":  command,
		"workdir":  workdir,
		"stdout":   stdout.String(),
		"stderr":   stderr.String(),
		"duration": duration.String(),
		"success":  err == nil,
	}

	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			result["error"] = "timeout dépassé"
		} else {
			result["error"] = err.Error()
		}
		// On retourne quand même le résultat partiel
		return result, nil
	}

	if exitErr, ok := err.(*exec.ExitError); ok {
		result["exitCode"] = exitErr.ExitCode()
	} else {
		result["exitCode"] = 0
	}

	return result, nil
}

func (t *TerminalTool) isBlocked(command string) bool {
	cmdLower := strings.ToLower(command)
	for _, blocked := range t.blockedCommands {
		if strings.Contains(cmdLower, strings.ToLower(blocked)) {
			return true
		}
	}
	return false
}

// SetWorkDir définit le répertoire de travail
func (t *TerminalTool) SetWorkDir(dir string) {
	t.workDir = dir
}

// SetTimeout définit le timeout par défaut
func (t *TerminalTool) SetTimeout(d time.Duration) {
	t.timeout = d
}
