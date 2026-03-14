package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// VSCodeTool interagit avec VSCode via :
//  1. L'extension "Local Agents Bridge" (HTTP sur port 3333) — intégration profonde
//  2. La CLI `code` en fallback — intégration basique
type VSCodeTool struct {
	codePath   string
	bridgeURL  string
	httpClient *http.Client
}

// NewVSCodeTool crée un nouvel outil VSCode
func NewVSCodeTool() *VSCodeTool {
	return &VSCodeTool{
		codePath:   findVSCodePath(),
		bridgeURL:  "http://127.0.0.1:3333",
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}
}

func (t *VSCodeTool) Name() string { return "vscode" }

func (t *VSCodeTool) Description() string {
	return `Outil pour interagir avec Visual Studio Code.
Actions disponibles:
- open      : ouvrir un fichier (paramètres: path, line optionnel)
- read      : lire le contenu du fichier actif ou d'un fichier donné
- write     : écrire/créer un fichier et l'ouvrir dans VSCode
- replace   : remplacer du texte dans le fichier actif
- diagnostics : lire les erreurs/warnings du fichier actif
- terminal  : exécuter une commande dans le terminal intégré
- notify    : afficher une notification dans VSCode
- diff      : afficher un diff entre deux fichiers
- goto      : aller à une ligne précise
- status    : état actuel de VSCode (fichier ouvert, ligne, workspace)`
}

func (t *VSCodeTool) Schema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"action": map[string]interface{}{
				"type": "string",
				"enum": []string{
					"open", "read", "write", "replace",
					"diagnostics", "terminal", "notify",
					"diff", "goto", "status",
				},
			},
			"path":     map[string]interface{}{"type": "string", "description": "Chemin du fichier"},
			"path2":    map[string]interface{}{"type": "string", "description": "Second fichier (pour diff)"},
			"content":  map[string]interface{}{"type": "string", "description": "Contenu à écrire"},
			"old_text": map[string]interface{}{"type": "string", "description": "Texte à remplacer"},
			"new_text": map[string]interface{}{"type": "string", "description": "Nouveau texte"},
			"command":  map[string]interface{}{"type": "string", "description": "Commande terminal"},
			"message":  map[string]interface{}{"type": "string", "description": "Message de notification"},
			"type":     map[string]interface{}{"type": "string", "description": "Type notification: info/warning/error"},
			"line":     map[string]interface{}{"type": "integer", "description": "Numéro de ligne"},
			"column":   map[string]interface{}{"type": "integer", "description": "Numéro de colonne"},
		},
		"required": []string{"action"},
	}
}

func (t *VSCodeTool) Execute(ctx context.Context, params map[string]interface{}) (interface{}, error) {
	action, _ := params["action"].(string)

	// Essayer d'abord via le bridge (extension)
	if t.bridgeAvailable() {
		result, err := t.executeViaBridge(ctx, action, params)
		if err == nil {
			return result, nil
		}
		// Fallback sur CLI si le bridge échoue
	}

	// Fallback : CLI `code`
	return t.executeViaCLI(action, params)
}

// ── Bridge (extension HTTP) ──────────────────────────────────────────────────

func (t *VSCodeTool) bridgeAvailable() bool {
	resp, err := t.httpClient.Get(t.bridgeURL + "/status")
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == 200
}

func (t *VSCodeTool) bridgeGET(path string) (map[string]interface{}, error) {
	resp, err := t.httpClient.Get(t.bridgeURL + path)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)
	return result, nil
}

func (t *VSCodeTool) bridgePOST(path string, payload interface{}) (map[string]interface{}, error) {
	data, _ := json.Marshal(payload)
	resp, err := t.httpClient.Post(t.bridgeURL+path, "application/json", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)
	return result, nil
}

func (t *VSCodeTool) executeViaBridge(ctx context.Context, action string, params map[string]interface{}) (interface{}, error) {
	switch action {
	case "status":
		return t.bridgeGET("/status")

	case "read":
		path, _ := params["path"].(string)
		if path == "" {
			return t.bridgeGET("/active")
		}
		return t.bridgeGET("/file?path=" + url.QueryEscape(path))

	case "diagnostics":
		return t.bridgeGET("/diagnostics")

	case "open":
		path, _ := params["path"].(string)
		line, _ := params["line"].(float64)
		payload := map[string]interface{}{"path": path}
		if line > 0 {
			payload["line"] = int(line)
		}
		if col, ok := params["column"].(float64); ok && col > 0 {
			payload["column"] = int(col)
		}
		return t.bridgePOST("/open", payload)

	case "write":
		path, _ := params["path"].(string)
		content, _ := params["content"].(string)
		return t.bridgePOST("/write", map[string]interface{}{
			"path":    path,
			"content": content,
			"open":    true,
		})

	case "replace":
		oldText, _ := params["old_text"].(string)
		newText, _ := params["new_text"].(string)
		return t.bridgePOST("/replace", map[string]interface{}{
			"old_text": oldText,
			"new_text": newText,
		})

	case "terminal":
		command, _ := params["command"].(string)
		return t.bridgePOST("/terminal", map[string]interface{}{"command": command})

	case "notify":
		message, _ := params["message"].(string)
		notifType, _ := params["type"].(string)
		if notifType == "" {
			notifType = "info"
		}
		return t.bridgePOST("/notify", map[string]interface{}{
			"message": message,
			"type":    notifType,
		})
	}

	return nil, fmt.Errorf("action non supportée par le bridge: %s", action)
}

// ── CLI fallback ─────────────────────────────────────────────────────────────

func (t *VSCodeTool) executeViaCLI(action string, params map[string]interface{}) (interface{}, error) {
	switch action {
	case "open", "goto":
		path, _ := params["path"].(string)
		line, _ := params["line"].(float64)
		location := path
		if line > 0 {
			location = fmt.Sprintf("%s:%d", path, int(line))
			if col, ok := params["column"].(float64); ok && col > 0 {
				location = fmt.Sprintf("%s:%d", location, int(col))
			}
			return t.runCode("-g", location)
		}
		return t.runCode(path)

	case "write":
		path, _ := params["path"].(string)
		content, _ := params["content"].(string)
		dir := filepath.Dir(path)
		os.MkdirAll(dir, 0755)
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			return nil, err
		}
		t.runCode(path)
		return map[string]interface{}{"success": true, "path": path}, nil

	case "read":
		path, _ := params["path"].(string)
		if path == "" {
			return nil, fmt.Errorf("Extension VSCode non disponible. Installe 'Local Agents Bridge' pour lire le fichier actif.")
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"path": path, "content": string(content)}, nil

	case "diff":
		path1, _ := params["path"].(string)
		path2, _ := params["path2"].(string)
		return t.runCode("-d", path1, path2)

	case "terminal":
		command, _ := params["command"].(string)
		// Sans bridge, on utilise le terminal système
		var cmd *exec.Cmd
		if runtime.GOOS == "windows" {
			cmd = exec.Command("powershell", "-NoProfile", "-Command", command)
		} else {
			cmd = exec.Command("bash", "-c", command)
		}
		output, err := cmd.CombinedOutput()
		return map[string]interface{}{
			"success": err == nil,
			"output":  string(output),
		}, nil

	case "status":
		return map[string]interface{}{
			"info": "Extension bridge non disponible. Installe 'Local Agents Bridge' dans VSCode.",
		}, nil

	case "diagnostics":
		return map[string]interface{}{
			"info": "Nécessite l'extension 'Local Agents Bridge' dans VSCode.",
		}, nil

	default:
		return nil, fmt.Errorf("action inconnue: %s", action)
	}
}

func (t *VSCodeTool) runCode(args ...string) (interface{}, error) {
	cmd := exec.Command(t.codePath, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("code CLI: %s: %w", string(output), err)
	}
	return map[string]interface{}{"success": true, "output": string(output)}, nil
}

// ── Détection VSCode ─────────────────────────────────────────────────────────

func findVSCodePath() string {
	for _, candidate := range []string{"code", "code-insiders"} {
		if path, err := exec.LookPath(candidate); err == nil {
			return path
		}
	}
	switch runtime.GOOS {
	case "windows":
		for _, p := range []string{
			filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "Microsoft VS Code", "bin", "code.cmd"),
			filepath.Join(os.Getenv("PROGRAMFILES"), "Microsoft VS Code", "bin", "code.cmd"),
		} {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	case "darwin":
		for _, p := range []string{
			"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
			"/usr/local/bin/code",
		} {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	case "linux":
		for _, p := range []string{"/usr/bin/code", "/snap/bin/code"} {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	}
	return "code"
}

// normalizeURL ajoute le scheme si absent
func normalizeURL(raw string) string {
	if !strings.HasPrefix(raw, "http") {
		return "http://" + raw
	}
	return raw
}