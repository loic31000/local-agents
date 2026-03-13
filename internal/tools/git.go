package tools

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// GitTool permet d'interagir avec Git
type GitTool struct {
	repoPath string
}

// NewGitTool crée un nouvel outil Git
func NewGitTool(repoPath string) *GitTool {
	return &GitTool{repoPath: repoPath}
}

func (t *GitTool) Name() string {
	return "git"
}

func (t *GitTool) Description() string {
	return `Outil pour interagir avec Git.
Actions disponibles:
- status: voir l'état du repo
- log: voir l'historique des commits
- diff: voir les changements
- add: ajouter des fichiers au staging
- commit: créer un commit
- branch: gérer les branches
- checkout: changer de branche
- pull: récupérer les changements distants
- push: pousser les commits
- stash: mettre de côté les changements`
}

func (t *GitTool) Schema() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"action": map[string]interface{}{
				"type":        "string",
				"enum":        []string{"status", "log", "diff", "add", "commit", "branch", "checkout", "pull", "push", "stash", "clone"},
				"description": "Action Git à effectuer",
			},
			"path": map[string]interface{}{
				"type":        "string",
				"description": "Chemin du fichier ou dossier (pour add, diff)",
			},
			"message": map[string]interface{}{
				"type":        "string",
				"description": "Message de commit",
			},
			"branch": map[string]interface{}{
				"type":        "string",
				"description": "Nom de la branche",
			},
			"remote": map[string]interface{}{
				"type":        "string",
				"description": "Nom du remote (défaut: origin)",
			},
			"url": map[string]interface{}{
				"type":        "string",
				"description": "URL du repo (pour clone)",
			},
			"count": map[string]interface{}{
				"type":        "integer",
				"description": "Nombre de commits (pour log, défaut: 10)",
			},
		},
		"required": []string{"action"},
	}
}

func (t *GitTool) Execute(ctx context.Context, params map[string]interface{}) (interface{}, error) {
	action, _ := params["action"].(string)

	switch action {
	case "status":
		return t.status()
	case "log":
		count := 10
		if c, ok := params["count"].(float64); ok {
			count = int(c)
		}
		return t.log(count)
	case "diff":
		path, _ := params["path"].(string)
		return t.diff(path)
	case "add":
		path, _ := params["path"].(string)
		return t.add(path)
	case "commit":
		message, _ := params["message"].(string)
		return t.commit(message)
	case "branch":
		branch, _ := params["branch"].(string)
		return t.branch(branch)
	case "checkout":
		branch, _ := params["branch"].(string)
		return t.checkout(branch)
	case "pull":
		remote, _ := params["remote"].(string)
		branch, _ := params["branch"].(string)
		return t.pull(remote, branch)
	case "push":
		remote, _ := params["remote"].(string)
		branch, _ := params["branch"].(string)
		return t.push(remote, branch)
	case "stash":
		return t.stash(params)
	case "clone":
		url, _ := params["url"].(string)
		path, _ := params["path"].(string)
		return t.clone(url, path)
	default:
		return nil, fmt.Errorf("action inconnue: %s", action)
	}
}

func (t *GitTool) runGit(args ...string) (string, string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = t.repoPath

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	return stdout.String(), stderr.String(), err
}

func (t *GitTool) status() (interface{}, error) {
	stdout, _, err := t.runGit("status", "--porcelain", "-b")
	if err != nil {
		return nil, err
	}

	lines := strings.Split(strings.TrimSpace(stdout), "\n")
	
	result := map[string]interface{}{
		"branch": "",
		"staged": []string{},
		"modified": []string{},
		"untracked": []string{},
	}

	staged := []string{}
	modified := []string{}
	untracked := []string{}

	for _, line := range lines {
		if len(line) < 3 {
			continue
		}

		if strings.HasPrefix(line, "## ") {
			// Ligne de branche
			parts := strings.Split(line[3:], "...")
			result["branch"] = parts[0]
			continue
		}

		status := line[:2]
		file := strings.TrimSpace(line[3:])

		switch {
		case status[0] != ' ' && status[0] != '?':
			staged = append(staged, file)
		case status[1] == 'M':
			modified = append(modified, file)
		case status == "??":
			untracked = append(untracked, file)
		}
	}

	result["staged"] = staged
	result["modified"] = modified
	result["untracked"] = untracked

	return result, nil
}

func (t *GitTool) log(count int) (interface{}, error) {
	stdout, _, err := t.runGit("log", fmt.Sprintf("-n%d", count), "--pretty=format:%H|%an|%ae|%s|%ci")
	if err != nil {
		return nil, err
	}

	lines := strings.Split(strings.TrimSpace(stdout), "\n")
	commits := make([]map[string]string, 0, len(lines))

	for _, line := range lines {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "|", 5)
		if len(parts) >= 5 {
			commits = append(commits, map[string]string{
				"hash":    parts[0],
				"author":  parts[1],
				"email":   parts[2],
				"message": parts[3],
				"date":    parts[4],
			})
		}
	}

	return map[string]interface{}{
		"commits": commits,
		"count":   len(commits),
	}, nil
}

func (t *GitTool) diff(path string) (interface{}, error) {
	args := []string{"diff", "--stat"}
	if path != "" {
		args = append(args, path)
	}

	stdout, _, err := t.runGit(args...)
	if err != nil {
		return nil, err
	}

	// Obtenir aussi le diff détaillé
	args[1] = ""
	args = []string{"diff"}
	if path != "" {
		args = append(args, path)
	}
	fullDiff, _, _ := t.runGit(args...)

	return map[string]interface{}{
		"summary": stdout,
		"diff":    fullDiff,
	}, nil
}

func (t *GitTool) add(path string) (interface{}, error) {
	if path == "" {
		path = "."
	}

	_, stderr, err := t.runGit("add", path)
	if err != nil {
		return nil, fmt.Errorf("%s: %v", stderr, err)
	}

	return map[string]interface{}{
		"success": true,
		"path":    path,
	}, nil
}

func (t *GitTool) commit(message string) (interface{}, error) {
	if message == "" {
		return nil, fmt.Errorf("message de commit requis")
	}

	stdout, stderr, err := t.runGit("commit", "-m", message)
	if err != nil {
		return nil, fmt.Errorf("%s: %v", stderr, err)
	}

	return map[string]interface{}{
		"success": true,
		"output":  stdout,
	}, nil
}

func (t *GitTool) branch(name string) (interface{}, error) {
	if name == "" {
		// Lister les branches
		stdout, _, err := t.runGit("branch", "-a")
		if err != nil {
			return nil, err
		}

		branches := strings.Split(strings.TrimSpace(stdout), "\n")
		return map[string]interface{}{
			"branches": branches,
		}, nil
	}

	// Créer une nouvelle branche
	_, stderr, err := t.runGit("branch", name)
	if err != nil {
		return nil, fmt.Errorf("%s: %v", stderr, err)
	}

	return map[string]interface{}{
		"success": true,
		"branch":  name,
	}, nil
}

func (t *GitTool) checkout(branch string) (interface{}, error) {
	if branch == "" {
		return nil, fmt.Errorf("nom de branche requis")
	}

	_, stderr, err := t.runGit("checkout", branch)
	if err != nil {
		return nil, fmt.Errorf("%s: %v", stderr, err)
	}

	return map[string]interface{}{
		"success": true,
		"branch":  branch,
	}, nil
}

func (t *GitTool) pull(remote, branch string) (interface{}, error) {
	if remote == "" {
		remote = "origin"
	}

	args := []string{"pull", remote}
	if branch != "" {
		args = append(args, branch)
	}

	stdout, stderr, err := t.runGit(args...)
	if err != nil {
		return nil, fmt.Errorf("%s: %v", stderr, err)
	}

	return map[string]interface{}{
		"success": true,
		"output":  stdout,
	}, nil
}

func (t *GitTool) push(remote, branch string) (interface{}, error) {
	if remote == "" {
		remote = "origin"
	}

	args := []string{"push", remote}
	if branch != "" {
		args = append(args, branch)
	}

	stdout, stderr, err := t.runGit(args...)
	if err != nil {
		return nil, fmt.Errorf("%s: %v", stderr, err)
	}

	return map[string]interface{}{
		"success": true,
		"output":  stdout + stderr,
	}, nil
}

func (t *GitTool) stash(params map[string]interface{}) (interface{}, error) {
	message, _ := params["message"].(string)

	args := []string{"stash"}
	if message != "" {
		args = append(args, "push", "-m", message)
	}

	stdout, stderr, err := t.runGit(args...)
	if err != nil {
		return nil, fmt.Errorf("%s: %v", stderr, err)
	}

	return map[string]interface{}{
		"success": true,
		"output":  stdout,
	}, nil
}

func (t *GitTool) clone(url, path string) (interface{}, error) {
	if url == "" {
		return nil, fmt.Errorf("URL du repo requise")
	}

	args := []string{"clone", url}
	if path != "" {
		args = append(args, path)
	}

	cmd := exec.Command("git", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("%s: %v", string(output), err)
	}

	return map[string]interface{}{
		"success": true,
		"url":     url,
		"path":    path,
	}, nil
}

// SetRepoPath change le chemin du repo
func (t *GitTool) SetRepoPath(path string) {
	t.repoPath = path
}
