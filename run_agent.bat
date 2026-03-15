@echo off
setlocal

echo.
echo  ============================================================
echo   Local Agents - Demarrage complet
echo  ============================================================

go version >nul 2>&1
if errorlevel 1 (
    echo  [!] Go introuvable. Installe Go 1.22+ depuis https://go.dev/dl/
    pause
    exit /b 1
)

if not exist "data"        mkdir data
if not exist "logs"        mkdir logs
if not exist "web\static"  mkdir web\static
if not exist "prompts"     mkdir prompts

if not exist "prompts\coder.md" (
    if exist "coder.md" copy /y "coder.md" "prompts\coder.md" >nul
)
if not exist "prompts\files.md" (
    if exist "files.md" copy /y "files.md" "prompts\files.md" >nul
)
if not exist "prompts\email.md" (
    if exist "email.md" copy /y "email.md" "prompts\email.md" >nul
)

echo  Verification llama-server...
curl -s --max-time 2 http://127.0.0.1:8081/health >nul 2>&1
if not errorlevel 1 (
    echo  [OK] llama-server deja actif sur :8081
    goto :build
)

echo  llama-server inactif - lancement en arriere-plan...
echo.

if not exist "llama-server.exe" (
    echo  [!] llama-server.exe introuvable dans %CD%
    echo      Telecharge depuis https://github.com/ggerganov/llama.cpp/releases/latest
    pause
    exit /b 1
)

set MODEL_FILE=C:\Users\romano\AppData\Local\Ollama\models\Mistral-7B-Instruct-v0.3.Q4_K_M.gguf
set MODEL_NAME=Mistral-7B
set GPU_LAYERS=33
set CTX_SIZE=16384
set THREADS=14

if not exist "%MODEL_FILE%" (
    echo  [!] Fichier modele introuvable : %MODEL_FILE%
    pause
    exit /b 1
)

echo  Modele  : %MODEL_NAME%
echo  Fichier : %MODEL_FILE%
echo  GPU     : %GPU_LAYERS% couches
echo  Logs    : logs\llama-server.log
echo.

if not exist "logs" mkdir logs

start /b "" llama-server.exe --model "%MODEL_FILE%" --port 8081 --host 127.0.0.1 --n-gpu-layers %GPU_LAYERS% --ctx-size %CTX_SIZE% --parallel 1 --threads %THREADS% --metrics > logs\llama-server.log 2>&1

echo  Attente du demarrage de llama-server (max 120s)...
set WAIT=0

:waitloop
timeout /t 3 /nobreak >nul
set /a WAIT+=3
curl -s --max-time 2 http://127.0.0.1:8081/health >nul 2>&1
if not errorlevel 1 (
    echo  [OK] llama-server pret apres %WAIT%s
    goto :build
)
if %WAIT% GEQ 120 (
    echo  [!] llama-server n a pas repondu apres 120s
    echo      Consulte les logs : logs\llama-server.log
    pause
    exit /b 1
)
echo      ... %WAIT%s / 120s
goto :waitloop

:build
echo.
echo  Telechargement des dependances Go...
go mod tidy
if errorlevel 1 (
    echo  [!] go mod tidy a echoue
    pause
    exit /b 1
)

echo  Compilation...
go build -o orchestrator.exe .\cmd\orchestrator\
if errorlevel 1 (
    echo  Tentative build direct...
    go build -o orchestrator.exe .
    if errorlevel 1 (
        echo  [!] Compilation echouee
        pause
        exit /b 1
    )
)

echo.
echo  ============================================================
echo   Interface web : http://localhost:8080
echo   llama-server  : http://localhost:8081 (logs\llama-server.log)
echo   Ctrl+C pour arreter
echo  ============================================================
echo.

orchestrator.exe

pause