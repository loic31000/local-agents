# Local Agents - Command runner
set shell := ["C:/Program Files/Git/bin/bash.exe", "-cu"]

COMPOSE := "docker compose -f config/compose.yaml --env-file .env"
CONFIG  := "config/config.yaml"

default:
    @just --list

start:
    {{COMPOSE}} up -d

stop:
    {{COMPOSE}} down

restart:
    {{COMPOSE}} restart

status:
    {{COMPOSE}} ps

logs service="":
    {{COMPOSE}} logs -f {{service}}

install:
    pip install -r requirements.txt

build:
    go build -o bin/orchestrator ./cmd/orchestrator

models:
    docker compose exec ollama ollama pull llama3.2:latest

reset: clean

orchestrator:
    ./bin/orchestrator

discord:
    python3 -m agents.discord.bot

cyberdefence:
    set -a && . ./.env && set +a && python3 -m agents.cyberdefence.agent

coder:
    python3 -m agents.coder.agent

files:
    python3 -m agents.files.agent

email:
    python3 -m agents.email.agent

backend:
    @cat .backend 2>/dev/null || echo ollama

mock-on:
    @echo mock > .backend

ollama-on:
    @echo ollama > .backend

patch-llm:
    python3 scripts/llm_client_patch.py

models-list:
    docker exec local-agents-ollama ollama list

model-pull model:
    docker exec local-agents-ollama ollama pull {{model}}

model-rm model:
    docker exec local-agents-ollama ollama rm {{model}}

install-gguf:
    bash scripts/install-gguf.sh

training-export-logs namespace="jarvis-training" job="finetune-job-lite" pvc="logs-pvc" out="doc/training" subdir="{{job}}":
    bash scripts/export_training_logs.sh {{namespace}} {{job}} {{pvc}} {{out}} {{subdir}}

gpu:
    nvidia-smi 2>/dev/null || rocm-smi 2>/dev/null || echo "Aucun outil GPU"

test-api:
    PORT=$(grep -E '^\s*port:' {{CONFIG}} | head -1 | grep -oE '[0-9]+' || echo "8081"); echo "=== Health ===" && curl -s http://localhost:${PORT}/api/health; echo "" && echo "=== Agents ===" && curl -s http://localhost:${PORT}/api/agents

test-cyberdefence:
    echo "=== CyberDefence ===" && curl -s http://localhost:8086/health

chat agent message:
    PORT=$(grep -E '^\s*port:' {{CONFIG}} | head -1 | grep -oE '[0-9]+' || echo "8081"); curl -s -X POST "http://localhost:${PORT}/api/chat/{{agent}}" -H "Content-Type: application/json" -d "{\"message\": \"{{message}}\"}"

security-status:
    curl -s http://localhost:8086/status

security-metrics:
    curl -s http://localhost:8086/metrics

security-events severity="INFO":
    curl -s "http://localhost:8086/events?severity={{severity}}&limit=20"

security-export:
    curl -s "http://localhost:8086/events?format=csv&limit=500" -o security-events.csv

block-ip ip:
    curl -s -X POST http://localhost:8086/block-ip -H "Content-Type: application/json" -d "{\"ip\": \"{{ip}}\"}"

unblock-ip ip:
    curl -s -X POST http://localhost:8086/unblock-ip -H "Content-Type: application/json" -d "{\"ip\": \"{{ip}}\"}"

docker-build:
    {{COMPOSE}} build --no-cache

docker-logs service="":
    {{COMPOSE}} logs -f {{service}}

check-port port="8081":
    sudo lsof -i :{{port}} || echo "Port {{port}} libre"

kill-port port="8081":
    sudo kill -9 $(sudo lsof -t -i:{{port}})

clean:
    rm -rf bin/ data/ logs/ .backend && echo "Nettoye"
