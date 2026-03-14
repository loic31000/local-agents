package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/gorilla/websocket"
)

const (
	defaultURL = "http://localhost:8080"
	wsURL      = "ws://localhost:8080/ws"
)

type Agent struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Model        string   `json:"model"`
	Capabilities []string `json:"capabilities"`
	Enabled      bool     `json:"enabled"`
}

type ChatResponse struct {
	TaskID  string `json:"task_id"`
	AgentID string `json:"agent_id"`
	Success bool   `json:"success"`
	Output  string `json:"output"`
	Error   string `json:"error,omitempty"`
}

func main() {
	if len(os.Args) < 2 {
		showHelp()
		return
	}

	command := os.Args[1]

	switch command {
	case "agents", "list":
		listAgents()
	case "chat":
		if len(os.Args) < 3 {
			fmt.Println("Usage: cli chat <agent_id>")
			return
		}
		interactiveChat(os.Args[2])
	case "ask":
		if len(os.Args) < 4 {
			fmt.Println("Usage: cli ask <agent_id> <message>")
			return
		}
		askAgent(os.Args[2], strings.Join(os.Args[3:], " "))
	case "status":
		showStatus()
	case "stream":
		if len(os.Args) < 3 {
			fmt.Println("Usage: cli stream <agent_id>")
			return
		}
		streamChat(os.Args[2])
	case "help":
		showHelp()
	default:
		fmt.Printf("Commande inconnue: %s\n", command)
		showHelp()
	}
}

func showHelp() {
	fmt.Println(`
╔══════════════════════════════════════════════════════════════╗
║                    Local Agents CLI                          ║
╚══════════════════════════════════════════════════════════════╝

Usage: cli <command> [arguments]

Commands:
  agents, list     Lister tous les agents disponibles
  chat <agent>     Mode conversation interactive avec un agent
  ask <agent> <msg> Poser une question unique à un agent
  stream <agent>   Chat en streaming via WebSocket
  status           Afficher le statut du système
  help             Afficher cette aide

Exemples:
  cli agents                        # Voir les agents
  cli ask coder "Écris un hello world en Go"
  cli chat coder                    # Mode interactif
  cli stream coder                  # Mode streaming

`)
}

func listAgents() {
	resp, err := http.Get(defaultURL + "/api/agents")
	if err != nil {
		fmt.Printf("❌ Erreur de connexion: %v\n", err)
		return
	}
	defer resp.Body.Close()

	var agents []Agent
	if err := json.NewDecoder(resp.Body).Decode(&agents); err != nil {
		fmt.Printf("❌ Erreur de parsing: %v\n", err)
		return
	}

	fmt.Println("\n🤖 Agents disponibles:\n")
	for _, agent := range agents {
		status := "🔴"
		if agent.Enabled {
			status = "🟢"
		}
		capabilities := strings.Join(agent.Capabilities, ", ")
		fmt.Printf("  %s %s\n", status, agent.ID)
		fmt.Printf("     Modèle: %s\n", agent.Model)
		fmt.Printf("     Outils: %s\n\n", capabilities)
	}
}

func askAgent(agentID, message string) {
	payload := map[string]string{"message": message}
	body, _ := json.Marshal(payload)

	resp, err := http.Post(
		fmt.Sprintf("%s/api/chat/%s", defaultURL, agentID),
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		fmt.Printf("❌ Erreur: %v\n", err)
		return
	}
	defer resp.Body.Close()

	var result ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		fmt.Printf("❌ Erreur de parsing: %v\n", err)
		return
	}

	if result.Success {
		fmt.Printf("\n🤖 %s:\n\n%s\n\n", agentID, result.Output)
	} else {
		fmt.Printf("❌ Erreur: %s\n", result.Error)
	}
}

func interactiveChat(agentID string) {
	fmt.Printf("\n💬 Chat avec l'agent %s (tape 'quit' pour quitter)\n\n", agentID)

	reader := bufio.NewReader(os.Stdin)

	for {
		fmt.Print("Toi: ")
		input, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				break
			}
			fmt.Printf("Erreur: %v\n", err)
			continue
		}

		input = strings.TrimSpace(input)
		if input == "" {
			continue
		}
		if input == "quit" || input == "exit" || input == "q" {
			fmt.Println("\n👋 À bientôt!")
			break
		}

		// Envoyer la requête
		payload := map[string]string{"message": input}
		body, _ := json.Marshal(payload)

		resp, err := http.Post(
			fmt.Sprintf("%s/api/chat/%s", defaultURL, agentID),
			"application/json",
			bytes.NewReader(body),
		)
		if err != nil {
			fmt.Printf("❌ Erreur: %v\n", err)
			continue
		}

		var result ChatResponse
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			resp.Body.Close()
			fmt.Printf("❌ Erreur: %v\n", err)
			continue
		}
		resp.Body.Close()

		if result.Success {
			fmt.Printf("\n🤖 Agent: %s\n\n", result.Output)
		} else {
			fmt.Printf("❌ Erreur: %s\n", result.Error)
		}
	}
}

func streamChat(agentID string) {
	fmt.Printf("\n⚡ Chat streaming avec l'agent %s (tape 'quit' pour quitter)\n\n", agentID)

	// Connexion WebSocket
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		fmt.Printf("❌ Erreur WebSocket: %v\n", err)
		return
	}
	defer conn.Close()

	fmt.Println("🔌 Connecté via WebSocket")

	// Goroutine pour recevoir les messages
	go func() {
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				return
			}

			var data struct {
				Type   string `json:"type"`
				Result struct {
					Output string `json:"output"`
				} `json:"result"`
			}
			if err := json.Unmarshal(message, &data); err == nil {
				if data.Type == "response" {
					fmt.Printf("\n🤖 Agent: %s\n\n", data.Result.Output)
					fmt.Print("Toi: ")
				}
			}
		}
	}()

	reader := bufio.NewReader(os.Stdin)

	for {
		fmt.Print("Toi: ")
		input, err := reader.ReadString('\n')
		if err != nil {
			break
		}

		input = strings.TrimSpace(input)
		if input == "" {
			continue
		}
		if input == "quit" || input == "exit" {
			break
		}

		// Envoyer via WebSocket
		msg := map[string]interface{}{
			"type": "chat",
			"payload": map[string]string{
				"agent":   agentID,
				"message": input,
			},
		}
		if err := conn.WriteJSON(msg); err != nil {
			fmt.Printf("❌ Erreur d'envoi: %v\n", err)
			continue
		}
	}

	fmt.Println("\n👋 À bientôt!")
}

func showStatus() {
	resp, err := http.Get(defaultURL + "/api/health")
	if err != nil {
		fmt.Println("❌ Orchestrateur hors ligne")
		return
	}
	defer resp.Body.Close()

	var status struct {
		Status  string `json:"status"`
		Agents  int    `json:"agents"`
		Version string `json:"version"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		fmt.Printf("❌ Erreur: %v\n", err)
		return
	}

	fmt.Println("\n📊 Statut du système:\n")
	fmt.Printf("  Orchestrateur: 🟢 En ligne (v%s)\n", status.Version)
	fmt.Printf("  Agents actifs: %d\n", status.Agents)
	fmt.Println()
}
