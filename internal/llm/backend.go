package llm

import (
"context"
"fmt"
"math/rand"
"os"
"strings"
"time"
)

type Backend string

const (
BackendOllama Backend = "ollama"
BackendMock   Backend = "mock"
)

type BackendRouter struct {
ollama      *OllamaClient
mock        *MockClient
backendFile string
}

func NewBackendRouter(ollamaURL string) *BackendRouter {
return &BackendRouter{
ollama:      NewOllamaClient(ollamaURL),
mock:        NewMockClient(),
backendFile: ".backend",
}
}

func (r *BackendRouter) ActiveBackend() Backend {
if env := os.Getenv("BACKEND"); env != "" {
return Backend(strings.TrimSpace(env))
}
if data, err := os.ReadFile(r.backendFile); err == nil {
b := Backend(strings.TrimSpace(string(data)))
if b != "" {
return b
}
}
return BackendOllama
}

func (r *BackendRouter) Chat(ctx context.Context, model string, messages []Message, opts *Options) (*ChatResponse, error) {
switch r.ActiveBackend() {
case BackendMock:
return r.mock.Chat(ctx, model, messages, opts)
default:
return r.ollama.Chat(ctx, model, messages, opts)
}
}

func (r *BackendRouter) Ping(ctx context.Context) error {
switch r.ActiveBackend() {
case BackendMock:
return nil
default:
return r.ollama.Ping(ctx)
}
}

func (r *BackendRouter) ListModels(ctx context.Context) ([]string, error) {
switch r.ActiveBackend() {
case BackendMock:
return r.mock.ListModels(ctx)
default:
return r.ollama.ListModels(ctx)
}
}

func (r *BackendRouter) OllamaClient() *OllamaClient {
return r.ollama
}

var mockResponses = map[string][]string{
"coder": {
"Voici une implémentation Python propre :\n\n```python\ndef sort_list(items):\n    \"\"\"Trie une liste de manière stable.\"\"\"\n    return sorted(items)\n\n# Exemple\nresult = sort_list([1][2][3][2][4][5])\nprint(result)  # [2][2][1][3][4][5]\n```\n\nUtilise `sorted()` pour ne pas modifier la liste originale.",
"Analyse du code :\n\n**Problèmes détectés :**\n- Gestion d'exceptions manquante\n- Variable non initialisée\n\n**Correction :**\n```python\ntry:\n    result = process(data)\nexcept Exception as e:\n    logger.error(f'Erreur: {e}')\n    result = None\n```",
"Voici le code demandé :\n\n```python\nasync def fetch_data(url: str) -> dict:\n    async with aiohttp.ClientSession() as session:\n        async with session.get(url) as resp:\n            return await resp.json()\n```\n\nGestion async avec aiohttp, timeout recommandé en production.",
},
"files": {
"Fichiers trouvés :\n\n```\n./src/main.py     (2.3 KB)\n./src/utils.py    (1.1 KB)\n./README.md       (4.2 KB)\n```\n\n3 fichiers correspondant à votre recherche.",
"Fichier lu avec succès (145 lignes). Contenu YAML valide, aucune erreur de syntaxe détectée.",
"Fichier créé : `output/result.md` (2.4 KB, 87 lignes, UTF-8).",
},
"email": {
"Email rédigé :\n\n**Objet :** Suivi de notre échange\n\nBonjour,\n\nSuite à notre conversation, voici le récapitulatif...\n\nCordialement",
"Email envoyé avec succès. ID message : msg_7f3a92bc. Confirmation de livraison en attente.",
},
"social": {
"Post rédigé (178/280 caractères) :\n\n> 🚀 Nouveau projet open source disponible ! #OpenSource #AI",
"Post LinkedIn rédigé. Portée estimée : 200-800 impressions.",
},
"discord": {
"Bien sûr ! Je m'en occupe.",
"Commande exécutée avec succès. ✅",
"Serveur surveillé en permanence. Tout semble normal. 🟢",
},
"_default": {
"Traitement effectué avec succès.",
"Voici ce que j'ai trouvé concernant votre requête.",
"Opération terminée.",
},
}

type MockClient struct {
callCount int
}

func NewMockClient() *MockClient {
return &MockClient{}
}

func (m *MockClient) Chat(ctx context.Context, model string, messages []Message, opts *Options) (*ChatResponse, error) {
agentID := "_default"
for id := range mockResponses {
if id != "_default" && strings.Contains(strings.ToLower(model), id) {
agentID = id
break
}
}

delays := map[string]time.Duration{
"coder":    450 * time.Millisecond,
"files":    150 * time.Millisecond,
"email":    250 * time.Millisecond,
"social":   250 * time.Millisecond,
"discord":  100 * time.Millisecond,
"_default": 300 * time.Millisecond,
}
delay := delays["_default"]
if d, ok := delays[agentID]; ok {
delay = d
}
jitter := time.Duration(float64(delay) * (0.8 + rand.Float64()*0.4))

select {
case <-ctx.Done():
return nil, ctx.Err()
case <-time.After(jitter):
}

responses := mockResponses["_default"]
if r, ok := mockResponses[agentID]; ok {
responses = r
}
m.callCount++
text := responses[m.callCount%len(responses)]

return &ChatResponse{
Model: fmt.Sprintf("mock/%s", agentID),
Message: Message{
Role:    "assistant",
Content: text,
},
Done:      true,
CreatedAt: time.Now().Format(time.RFC3339),
}, nil
}

func (m *MockClient) ListModels(ctx context.Context) ([]string, error) {
models := make([]string, 0, len(mockResponses))
for id := range mockResponses {
if id != "_default" {
models = append(models, "mock/"+id)
}
}
return models, nil
}
