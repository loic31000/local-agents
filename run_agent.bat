@echo off
setlocal

echo.
echo  ============================================================
echo   Local Agents - Orchestrateur Go
echo  ============================================================

go version >nul 2>&1
if errorlevel 1 (
    echo  [!] Go introuvable. Installe Go 1.22+ depuis https://go.dev/dl/
    pause
    exit /b 1
)

if not exist "data" mkdir data
if not exist "logs" mkdir logs
if not exist "web\static" mkdir web\static
if not exist "prompts" mkdir prompts

if not exist "prompts\coder.md" (
    if exist "coder.md" copy /y "coder.md" "prompts\coder.md" >nul
)
if not exist "prompts\files.md" (
    if exist "files.md" copy /y "files.md" "prompts\files.md" >nul
)
if not exist "prompts\email.md" (
    if exist "email.md" copy /y "email.md" "prompts\email.md" >nul
)

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
    echo  Tentative avec main.go direct...
    go build -o orchestrator.exe .
    if errorlevel 1 (
        echo  [!] Compilation echouee
        pause
        exit /b 1
    )
)

echo  OK - Interface web : http://localhost:8080
echo  Ctrl+C pour arreter
echo.

orchestrator.exe

pause