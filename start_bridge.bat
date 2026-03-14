@echo off
chcp 65001 >nul
echo ============================================================
echo   VSCode Bridge - port 3333
echo ============================================================

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js introuvable.
    echo     Installe Node.js depuis https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js detecte
echo [..] Demarrage du bridge VSCode...
echo.
node "%~dp0bridge.js"
pause
