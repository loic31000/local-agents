package testutil

import (
	"fmt"
	"strconv"
	"strings"
	"testing"
	"time"
)

// AgentConfigDTO represente un DTO de configuration d'agent utilise pour generer un bloc YAML.
type AgentConfigDTO struct {
	ID         string
	Enabled    bool
	PromptFile string
	Model      string
	Tools      []string
	Type       string
	Port       int
}

// KernelScenarioModel represente un modele de scenario de test pour les tests de processus orchestrateur.
type KernelScenarioModel struct {
	Host      string
	Port      int
	WSPath    string
	OllamaURL string
	Agents    []AgentConfigDTO
	Env       map[string]string
	Timeout   time.Duration
}

/*
description d'une fonction : construit un bloc YAML agents a partir de DTO de configuration.
@params{[]AgentConfigDTO} agents - liste des agents a convertir en YAML.
@return{string} bloc YAML compatible avec MinimalConfigYAML.
*/
func BuildAgentsBlockDTO(agents []AgentConfigDTO) string {
	var b strings.Builder

	for _, a := range agents {
		typeValue := a.Type
		if typeValue == "" {
			typeValue = "internal"
		}

		prompt := a.PromptFile
		if prompt == "" {
			prompt = "missing-prompt.md"
		}

		model := a.Model
		if model == "" {
			model = "coding"
		}

		enabled := "true"
		if !a.Enabled {
			enabled = "false"
		}

		fmt.Fprintf(&b, "  %s:\n", a.ID)
		fmt.Fprintf(&b, "    enabled: %s\n", enabled)
		fmt.Fprintf(&b, "    prompt_file: \"%s\"\n", prompt)
		fmt.Fprintf(&b, "    model: \"%s\"\n", model)

		if len(a.Tools) == 0 {
			fmt.Fprintln(&b, "    tools: []")
		} else {
			fmt.Fprintln(&b, "    tools:")
			for _, tool := range a.Tools {
				fmt.Fprintf(&b, "      - \"%s\"\n", tool)
			}
		}

		fmt.Fprintf(&b, "    type: \"%s\"\n", typeValue)
		if a.Port > 0 {
			fmt.Fprintf(&b, "    port: %d\n", a.Port)
		}
	}

	return strings.TrimRight(b.String(), "\n")
}

/*
description d'une fonction : demarre un noyau orchestrateur a partir d'un model de scenario de test.
@params{*testing.T} t - contexte de test Go.
@params{KernelScenarioModel} s - model contenant config, env et timeout.
@return{*KernelProcess} processus kernel pret pour les assertions de test.
*/
func StartKernelFromScenario(t *testing.T, s KernelScenarioModel) *KernelProcess {
	t.Helper()

	agentsBlock := BuildAgentsBlockDTO(s.Agents)
	cfg := MinimalConfigYAML(s.Host, s.Port, s.WSPath, s.OllamaURL, agentsBlock)
	env := make(map[string]string, len(s.Env)+3)
	for k, v := range s.Env {
		env[k] = v
	}
	env["TEST_HOST"] = s.Host
	env["TEST_PORT"] = strconv.Itoa(s.Port)
	env["TEST_WS_PATH"] = s.WSPath

	timeout := s.Timeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}

	return StartKernelProcess(t, cfg, env, timeout)
}
