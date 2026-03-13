package tools

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// FileSystemTool permet de manipuler les fichiers et dossiers
type FileSystemTool struct {
	allowedPaths []string
}

// NewFileSystemTool crée un nouvel outil filesystem
func NewFileSystemTool(allowedPaths []string) *FileSystemTool {
	// Étendre les variables d'environnement
	expanded := make([]string, len(allowedPaths))
	for i, p := range allowedPaths {
		expanded[i] = os.ExpandEnv(p)
	}
	return &FileSystemTool{allowedPaths: expanded}
}

func (t *FileSystemTool) Name() string {
	return "filesystem"
}

func (t *FileSystemTool) Description() string {
	return `Outil pour manipuler les fichiers et dossiers sur le système.
Actions disponibles:
- list: lister le contenu d'un dossier
- read: lire le contenu d'un fichier
- write: écrire du contenu dans un fichier
- copy: copier un fichier ou dossier
- move: déplacer un fichier ou dossier
- delete: supprimer un fichier ou dossier
- mkdir: créer un dossier
- exists: vérifier si un chemin existe
- info: obtenir les informations d'un fichier`
}

func (t *FileSystemTool) Schema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"action": map[string]interface{}{
				"type":        "string",
				"enum":        []string{"list", "read", "write", "copy", "move", "delete", "mkdir", "exists", "info"},
				"description": "Action à effectuer",
			},
			"path": map[string]interface{}{
				"type":        "string",
				"description": "Chemin du fichier ou dossier",
			},
			"destination": map[string]interface{}{
				"type":        "string",
				"description": "Chemin de destination (pour copy/move)",
			},
			"content": map[string]interface{}{
				"type":        "string",
				"description": "Contenu à écrire (pour write)",
			},
		},
		"required": []string{"action", "path"},
	}
}

func (t *FileSystemTool) Execute(ctx context.Context, params map[string]interface{}) (interface{}, error) {
	action, _ := params["action"].(string)
	path, _ := params["path"].(string)

	// Vérifier que le chemin est autorisé
	if !t.isPathAllowed(path) {
		return nil, fmt.Errorf("accès refusé: %s n'est pas dans les chemins autorisés", path)
	}

	switch action {
	case "list":
		return t.list(path)
	case "read":
		return t.read(path)
	case "write":
		content, _ := params["content"].(string)
		return t.write(path, content)
	case "copy":
		dest, _ := params["destination"].(string)
		if !t.isPathAllowed(dest) {
			return nil, fmt.Errorf("accès refusé: destination %s non autorisée", dest)
		}
		return t.copy(path, dest)
	case "move":
		dest, _ := params["destination"].(string)
		if !t.isPathAllowed(dest) {
			return nil, fmt.Errorf("accès refusé: destination %s non autorisée", dest)
		}
		return t.move(path, dest)
	case "delete":
		return t.delete(path)
	case "mkdir":
		return t.mkdir(path)
	case "exists":
		return t.exists(path)
	case "info":
		return t.info(path)
	default:
		return nil, fmt.Errorf("action inconnue: %s", action)
	}
}

func (t *FileSystemTool) isPathAllowed(path string) bool {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return false
	}

	for _, allowed := range t.allowedPaths {
		allowedAbs, err := filepath.Abs(allowed)
		if err != nil {
			continue
		}
		if strings.HasPrefix(absPath, allowedAbs) {
			return true
		}
	}
	return false
}

func (t *FileSystemTool) list(path string) (interface{}, error) {
	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, err
	}

	result := make([]map[string]interface{}, 0, len(entries))
	for _, entry := range entries {
		info, _ := entry.Info()
		item := map[string]interface{}{
			"name":  entry.Name(),
			"isDir": entry.IsDir(),
		}
		if info != nil {
			item["size"] = info.Size()
			item["modified"] = info.ModTime().Format("2006-01-02 15:04:05")
		}
		result = append(result, item)
	}
	return result, nil
}

func (t *FileSystemTool) read(path string) (interface{}, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return string(content), nil
}

func (t *FileSystemTool) write(path, content string) (interface{}, error) {
	// Créer le dossier parent si nécessaire
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"success": true,
		"path":    path,
		"bytes":   len(content),
	}, nil
}

func (t *FileSystemTool) copy(src, dest string) (interface{}, error) {
	srcInfo, err := os.Stat(src)
	if err != nil {
		return nil, err
	}

	if srcInfo.IsDir() {
		return t.copyDir(src, dest)
	}
	return t.copyFile(src, dest)
}

func (t *FileSystemTool) copyFile(src, dest string) (interface{}, error) {
	srcFile, err := os.Open(src)
	if err != nil {
		return nil, err
	}
	defer srcFile.Close()

	// Créer le dossier destination si nécessaire
	if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
		return nil, err
	}

	destFile, err := os.Create(dest)
	if err != nil {
		return nil, err
	}
	defer destFile.Close()

	written, err := io.Copy(destFile, srcFile)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"success": true,
		"source":  src,
		"dest":    dest,
		"bytes":   written,
	}, nil
}

func (t *FileSystemTool) copyDir(src, dest string) (interface{}, error) {
	entries, err := os.ReadDir(src)
	if err != nil {
		return nil, err
	}

	if err := os.MkdirAll(dest, 0755); err != nil {
		return nil, err
	}

	copied := 0
	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		destPath := filepath.Join(dest, entry.Name())

		if entry.IsDir() {
			_, err = t.copyDir(srcPath, destPath)
		} else {
			_, err = t.copyFile(srcPath, destPath)
		}
		if err != nil {
			return nil, err
		}
		copied++
	}

	return map[string]interface{}{
		"success": true,
		"source":  src,
		"dest":    dest,
		"items":   copied,
	}, nil
}

func (t *FileSystemTool) move(src, dest string) (interface{}, error) {
	if err := os.Rename(src, dest); err != nil {
		// Si le rename échoue (cross-device), on fait copy + delete
		if _, err := t.copy(src, dest); err != nil {
			return nil, err
		}
		if _, err := t.delete(src); err != nil {
			return nil, err
		}
	}

	return map[string]interface{}{
		"success": true,
		"source":  src,
		"dest":    dest,
	}, nil
}

func (t *FileSystemTool) delete(path string) (interface{}, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	if info.IsDir() {
		err = os.RemoveAll(path)
	} else {
		err = os.Remove(path)
	}

	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"success": true,
		"path":    path,
	}, nil
}

func (t *FileSystemTool) mkdir(path string) (interface{}, error) {
	if err := os.MkdirAll(path, 0755); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"success": true,
		"path":    path,
	}, nil
}

func (t *FileSystemTool) exists(path string) (interface{}, error) {
	_, err := os.Stat(path)
	return map[string]interface{}{
		"exists": err == nil,
		"path":   path,
	}, nil
}

func (t *FileSystemTool) info(path string) (interface{}, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"path":     path,
		"name":     info.Name(),
		"size":     info.Size(),
		"isDir":    info.IsDir(),
		"modified": info.ModTime().Format("2006-01-02 15:04:05"),
		"mode":     info.Mode().String(),
	}, nil
}

// GetOS retourne le système d'exploitation actuel
func GetOS() string {
	return runtime.GOOS
}
