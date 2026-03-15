# =============================================================================
# Local Agents — Installation complète Windows (zero to hero)
# Lancer en PowerShell Admin :
# irm https://raw.githubusercontent.com/loic31000/local-agents/main/scripts/install.ps1 | iex
# =============================================================================

#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

# =============================================================================
# COULEURS & HELPERS
# =============================================================================
function Write-Step   { param($msg) Write-Host "`n━━━ $msg ━━━" -ForegroundColor Cyan }
function Write-Ok     { param($msg) Write-Host "[ OK ] $msg" -ForegroundColor Green }
function Write-Info   { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Blue }
function Write-Warn   { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err    { param($msg) Write-Host "[ERRO] $msg" -ForegroundColor Red; exit 1 }

function Test-Command { param($cmd) return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Wait-Service {
    param($url, $name, $retries = 12)
    for ($i = 0; $i -lt $retries; $i++) {
        try {
            Invoke-RestMethod $url -ErrorAction Stop | Out-Null
            Write-Ok "$name est prêt"
            return
        } catch {
            Write-Info "Attente $name... ($($i+1)/$retries)"
            Start-Sleep 5
        }
    }
    Write-Warn "$name n'a pas répondu — vérifie avec : docker compose logs"
}

# =============================================================================
# BANNER
# =============================================================================
Clear-Host
Write-Host @"
  ██╗      ██████╗  ██████╗ █████╗ ██╗      █████╗  ██████╗ ███████╗███╗   ██╗████████╗███████╗
  ██║     ██╔═══██╗██╔════╝██╔══██╗██║     ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██╔════╝
  ██║     ██║   ██║██║     ███████║██║     ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ███████╗
  ██║     ██║   ██║██║     ██╔══██║██║     ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ╚════██║
  ███████╗╚██████╔╝╚██████╗██║  ██║███████╗██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ███████║
  ╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝
"@ -ForegroundColor Cyan
Write-Host "  Framework d'agents IA 100% local — Installation Windows`n"

# =============================================================================
# ÉTAPE 1 — WINGET / CHOCOLATEY
# =============================================================================
Write-Step "ÉTAPE 1/8 — Gestionnaire de paquets"

if (Test-Command "winget") {
    Write-Ok "winget disponible"
    $PKG_MANAGER = "winget"
} elseif (Test-Command "choco") {
    Write-Ok "Chocolatey disponible"
    $PKG_MANAGER = "choco"
} else {
    Write-Info "Installation de Chocolatey..."
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $PKG_MANAGER = "choco"
    Write-Ok "Chocolatey installé"
}

function Install-Tool {
    param($name, $wingetId, $chocoId, $checkCmd)
    if (Test-Command $checkCmd) {
        Write-Ok "$name déjà installé"
        return
    }
    Write-Info "Installation de $name..."
    if ($PKG_MANAGER -eq "winget") {
        winget install --id $wingetId --silent --accept-source-agreements --accept-package-agreements
    } else {
        choco install $chocoId -y --no-progress
    }
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Write-Ok "$name installé"
}

# =============================================================================
# ÉTAPE 2 — GIT
# =============================================================================
Write-Step "ÉTAPE 2/8 — Git"
Install-Tool "Git" "Git.Git" "git" "git"

# =============================================================================
# ÉTAPE 3 — DOCKER DESKTOP
# =============================================================================
Write-Step "ÉTAPE 3/8 — Docker Desktop"

if (Test-Command "docker") {
    Write-Ok "Docker déjà installé : $(docker --version)"
} else {
    Write-Info "Installation de Docker Desktop..."
    if ($PKG_MANAGER -eq "winget") {
        winget install --id Docker.DockerDesktop --silent --accept-source-agreements --accept-package-agreements
    } else {
        choco install docker-desktop -y --no-progress
    }
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Write-Ok "Docker Desktop installé"
    Write-Warn "Docker Desktop installé — démarrage en cours..."
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    Write-Info "Attente de Docker (60s)..."
    Start-Sleep 60
}

# Vérifier que Docker répond
$dockerReady = $false
for ($i = 0; $i -lt 12; $i++) {
    try {
        docker info | Out-Null
        $dockerReady = $true
        Write-Ok "Docker opérationnel"
        break
    } catch {
        Write-Info "Attente Docker... ($($i+1)/12)"
        Start-Sleep 10
    }
}
if (-not $dockerReady) { Write-Err "Docker ne répond pas. Lance Docker Desktop manuellement et relance ce script." }

# =============================================================================
# ÉTAPE 4 — GO
# =============================================================================
Write-Step "ÉTAPE 4/8 — Go"
Install-Tool "Go" "GoLang.Go" "golang" "go"

# =============================================================================
# ÉTAPE 5 — PYTHON
# =============================================================================
Write-Step "ÉTAPE 5/8 — Python"
Install-Tool "Python" "Python.Python.3.11" "python" "python"

# =============================================================================
# ÉTAPE 6 — JUST & OLLAMA
# =============================================================================
Write-Step "ÉTAPE 6/8 — Just & Ollama"
Install-Tool "Just" "Casey.Just" "just" "just"
Install-Tool "Ollama" "Ollama.Ollama" "ollama" "ollama"

# =============================================================================
# ÉTAPE 7 — CLONE & CONFIG
# =============================================================================
Write-Step "ÉTAPE 7/8 — Projet & Configuration"

$InstallDir = "$env:USERPROFILE\local-agents"

if (Test-Path $InstallDir) {
    Write-Warn "Dossier $InstallDir déjà existant — mise à jour..."
    Set-Location $InstallDir
    git pull
} else {
    Write-Info "Clonage du projet..."
    git clone https://github.com/loic31000/local-agents.git $InstallDir
    Set-Location $InstallDir
}

# Fichier .env
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Ok ".env créé depuis .env.example"
}

Write-Host "`n━━━ Configuration des tokens (optionnel — Entrée pour ignorer) ━━━" -ForegroundColor Yellow

$DiscordToken  = Read-Host "  DISCORD_TOKEN (bot Jarvis)"
$WebhookUrl    = Read-Host "  CYBERDEFENCE_DISCORD_WEBHOOK"

$envContent = Get-Content ".env" -Raw

if ($DiscordToken) {
    $envContent = $envContent -replace "(?m)^DISCORD_TOKEN=.*", "DISCORD_TOKEN=$DiscordToken"
    Write-Ok "DISCORD_TOKEN configuré"
}
if ($WebhookUrl) {
    $envContent = $envContent -replace "(?m)^CYBERDEFENCE_DISCORD_WEBHOOK=.*", "CYBERDEFENCE_DISCORD_WEBHOOK=$WebhookUrl"
    Write-Ok "CYBERDEFENCE_DISCORD_WEBHOOK configuré"
}
$envContent | Set-Content ".env" -NoNewline

# Détection GPU
Write-Info "Détection GPU..."
$gpuInfo = (Get-WmiObject Win32_VideoController | Select-Object -ExpandProperty Name) -join " "
if ($gpuInfo -match "NVIDIA") {
    Write-Ok "GPU NVIDIA détecté"
    $envContent = $envContent -replace "(?m)^GPU_ENABLED=.*", "GPU_ENABLED=true"
    $envContent = $envContent -replace "(?m)^GPU_TYPE=.*", "GPU_TYPE=nvidia"
    $envContent | Set-Content ".env" -NoNewline
} elseif ($gpuInfo -match "AMD|Radeon") {
    Write-Ok "GPU AMD détecté"
    $envContent = $envContent -replace "(?m)^GPU_ENABLED=.*", "GPU_ENABLED=true"
    $envContent = $envContent -replace "(?m)^GPU_TYPE=.*", "GPU_TYPE=amd"
    $envContent | Set-Content ".env" -NoNewline
} else {
    Write-Warn "Pas de GPU dédié détecté — mode CPU"
}

# =============================================================================
# ÉTAPE 8 — LANCEMENT
# =============================================================================
Write-Step "ÉTAPE 8/8 — Lancement"

Write-Info "Build et démarrage des containers Docker..."
docker compose up -d --build

Write-Info "Attente démarrage des services (20s)..."
Start-Sleep 20

Write-Info "Téléchargement du modèle par défaut (llama3.2:latest)..."
try {
    docker compose exec ollama ollama pull llama3.2:latest
    Write-Ok "Modèle llama3.2:latest téléchargé"
} catch {
    Write-Warn "Pull échoué — lance manuellement : docker compose exec ollama ollama pull llama3.2:latest"
}

# =============================================================================
# VÉRIFICATION FINALE
# =============================================================================
Write-Host "`n━━━ VÉRIFICATION FINALE ━━━" -ForegroundColor Cyan

function Check-Service {
    param($name, $url)
    try {
        Invoke-RestMethod $url -ErrorAction Stop | Out-Null
        Write-Host "  ✓ $name" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ $name — vérifier avec : docker compose logs" -ForegroundColor Red
    }
}

Check-Service "Orchestrateur" "http://localhost:8081/api/health"
Check-Service "CyberDefence"  "http://localhost:8086/health"
Check-Service "Ollama"        "http://localhost:11434/api/tags"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  ✅ Local Agents installé avec succès !" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "  🌐 Dashboard     : http://localhost:8081" -ForegroundColor Cyan
Write-Host "  🛡️  CyberDefence  : http://localhost:8086/status" -ForegroundColor Cyan
Write-Host "  📁 Projet        : $InstallDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Commandes utiles :" -ForegroundColor White
Write-Host "    cd $InstallDir"
Write-Host "    just status           # état des services"
Write-Host "    just logs             # logs en direct"
Write-Host "    just test-api         # tests API"
Write-Host "    just security-status  # état CyberDefence"
Write-Host ""

# Ouvrir le dashboard automatiquement
Start-Process "http://localhost:8081"
