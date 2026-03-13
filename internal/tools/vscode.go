package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// VSCodeTool permet d'interagir avec Visual Studio Code
type VSCodeTool struct {
	codePath string
}

// NewVSCodeTool crée un nouvel outil VSCode
func NewVSCodeTool() *VSCodeTool {
	// Trouver le chemin de code/code-insiders
	codePath := findVSCodePath()
	return &VSCodeTool{codePath: codePath}
}

func findVSCodePath() string {
	candidates := []string{"code", "code-insiders"}
	
	for _, candidate := range candidates {
		path, err := exec.LookPath(candidate)
		if err == nil {
			return path
		}
	}

	// Chemins communs selon l'OS
	switch runtime.GOOS {
	case "windows":
		paths := []string{
			filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "Microsoft VS Code", "bin", "code.cmd"),
			filepath.Join(os.Getenv("PROGRAMFILES"), "Microsoft VS Code", "bin", "code.cmd"),
		}
		for _, p := range paths {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	case "darwin":
		paths := []string{
			"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
			"/usr/local/bin/code",
		}
		for _, p := range paths {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	case "linux":
		paths := []string{
			"/usr/bin/code",
			"/usr/share/code/bin/code",
			"/snap/bin/code",
		}
		for _, p := range paths {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	}

	return "code" // Fallback
}

func (t *VSCodeTool) Name() string {
	return "vscode"
}

func (t *VSCodeTool) Description() string {
	return `Outil pour interagir avec Visual Studio Code.
Actions disponibles:
- open: ouvrir un fichier ou dossier dans VSCode
- diff: afficher un diff entre deux fichiers
- goto: aller à une ligne spécifique d'un fichier
- extensions: lister ou installer des extensions
- settings: lire ou modifier les paramètres`
}

func (t *VSCodeTool) Schema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"action": map[string]interface{}{
				"type":        "string",
				"enum":        []string{"open", "diff", "goto", "extensions", "settings"},
				"description": "Action à effectuer",
			},
			"path": map[string]interface{}{
				"type":        "string",
				"description": "Chemin du fichier ou dossier",
			},
			"path2": map[string]interface{}{
				"type":        "string",
				"description": "Second chemin (pour diff)",
			},
			"line": map[string]interface{}{
				"type":        "integer",
				"description": "Numéro de ligne (pour goto)",
			},
			"column": map[string]interface{}{
				"type":        "integer",
				"description": "Numéro de colonne (pour goto)",
			},
			"extension": map[string]interface{}{
				"type":        "string",
				"description": "ID de l'extension (pour extensions)",
			},
			"newWindow": map[string]interface{}{
				"type":        "boolean",
				"description": "Ouvrir dans une nouvelle fenêtre",
			},
		},
		"required": []string{"action"},
	}
}

func (t *VSCodeTool) Execute(ctx context.Context, params map[string]interface{}) (interface{}, error) {
	action, _ := params["action"].(string)

	switch action {
	case "open":
		return t.open(params)
	case "diff":
		return t.diff(params)
	case "goto":
		return t.gotoLine(params)
	case "extensions":
		return t.extensions(params)
	case "settings":
		return t.settings(params)
	default:
		return nil, fmt.Errorf("action inconnue: %s", action)
	}
}

func (t *VSCodeTool) runCode(args ...string) (string, error) {
	cmd := exec.Command(t.codePath, args...)
	output, err := cmd.CombinedOutput()
	return string(output), err
}

func (t *VSCodeTool) open(params map[string]interface{}) (interface{}, error) {
	path, _ := params["path"].(string)
	newWindow, _ := params["newWindow"].(bool)

	if path == "" {
		return nil, fmt.Errorf("path requis")
	}

	args := []string{}
	if newWindow {
		args = append(args, "-n")
	}
	args = append(args, path)

	_, err := t.runCode(args...)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"success": true,
		"path":    path,
	}, nil
}

func (t *VSCodeTool) diff(params map[string]interface{}) (interface{}, error) {
	path1, _ := params["path"].(string)
	path2, _ := params["path2"].(string)

	if path1 == "" || path2 == "" {
		return nil, fmt.Errorf("path et path2 requis")
	}

	_, err := t.runCode("-d", path1, path2)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"success": true,
		"file1":   path1,
		"file2":   path2,
	}, nil
}

func (t *VSCodeTool) gotoLine(params map[string]interface{}) (interface{}, error) {
	path, _ := params["path"].(string)
	line, _ := params["line"].(float64)
	column, _ := params["column"].(float64)

	if path == "" {
		return nil, fmt.Errorf("path requis")
	}

	// Format: file:line:column
	location := path
	if line > 0 {
		location = fmt.Sprintf("%s:%d", path, int(line))
		if column > 0 {
			location = fmt.Sprintf("%s:%d", location, int(column))
		}
	}

	_, err := t.runCode("-g", location)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"success":  true,
		"location": location,
	}, nil
}

func (t *VSCodeTool) extensions(params map[string]interface{}) (interface{}, error) {
	extID, _ := params["extension"].(string)

	if extID == "" {
		// Lister les extensions installées
		output, err := t.runCode("--list-extensions", "--show-versions")
		if err != nil {
			return nil, err
		}

		extensions := strings.Split(strings.TrimSpace(output), "\n")
		return map[string]interface{}{
			"extensions": extensions,
			"count":      len(extensions),
		}, nil
	}

	// Installer une extension
	_, err := t.runCode("--install-extension", extID)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"success":   true,
		"extension": extID,
		"action":    "installed",
	}, nil
}

func (t *VSCodeTool) settings(params map[string]interface{}) (interface{}, error) {
	// Trouver le fichier settings.json
	var settingsPath string
	
	switch runtime.GOOS {
	case "windows":
		settingsPath = filepath.Join(os.Getenv("APPDATA"), "Code", "User", "settings.json")
	case "darwin":
		settingsPath = filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "Code", "User", "settings.json")
	case "linux":
		settingsPath = filepath.Join(os.Getenv("HOME"), ".config", "Code", "User", "settings.json")
	}

	content, err := os.ReadFile(settingsPath)
	if err != nil {
		return nil, fmt.Errorf("impossible de lire settings.json: %w", err)
	}

	var settings map[string]interface{}
	if err := json.Unmarshal(content, &settings); err != nil {
		return nil, fmt.Errorf("json invalide: %w", err)
	}

	return map[string]interface{}{
		"path":     settingsPath,
		"settings": settings,
	}, nil
}
