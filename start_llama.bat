@echo off
chcp 65001 >nul
echo ============================================================
echo   llama-server - RTX 3070 + i5-13600KF + DDR5
echo ============================================================

echo  Modeles disponibles :
echo   [1] Llama-3.2-3B-Instruct Q4_K_M  (rapide, ~2 GB VRAM)
echo   [2] Mistral-7B-Instruct v0.3 Q4_K_M  (meilleur francais, ~5 GB VRAM)
echo   [3] Qwen2.5-32B-Instruct Q4_K_S  (GPT-4o niveau, ~17 GB GPU+RAM)
echo.
set /p CHOIX="Choix (1, 2 ou 3, defaut=2) : "
if "%CHOIX%"=="" set CHOIX=2

:: Detecter le GPU
for /f "tokens=1,2,3 delims=," %%a in ('nvidia-smi --query-gpu^=name^,memory.total^,memory.free --format^=csv^,noheader 2^>nul') do (
    echo  %%a - %%b total, %%c libre
)

if "%CHOIX%"=="1" (
    set MODEL_NAME=Llama-3.2-3B
    set MODEL_FILE=C:\Users\romano\AppData\Local\Ollama\models\Llama-3.2-3B-Instruct-Q4_K_M.gguf
    set GPU_LAYERS=28
    set CTX_SIZE=16384
    set THREADS=14
)

if "%CHOIX%"=="2" (
    set MODEL_NAME=Mistral-7B
    set MODEL_FILE=C:\Users\romano\AppData\Local\Ollama\models\Mistral-7B-Instruct-v0.3.Q4_K_M.gguf
    set GPU_LAYERS=33
    set CTX_SIZE=16384
    set THREADS=14
)

if "%CHOIX%"=="3" (
    set MODEL_NAME=Qwen2.5-32B
    set MODEL_FILE=C:\Users\romano\AppData\Local\Ollama\models\Qwen2.5-32B-Instruct-Q4_K_S.gguf
    set GPU_LAYERS=25
    set CTX_SIZE=8192
    set THREADS=14
)

if not exist "%MODEL_FILE%" (
    echo.
    echo [!] Fichier introuvable : %MODEL_FILE%
    echo     Verifie le nom du fichier dans C:\Users\romano\AppData\Local\Ollama\models\
    pause
    exit /b 1
)

echo.
echo  ============================================================
echo   Demarrage : %MODEL_NAME%
echo   Fichier   : %MODEL_FILE%
echo   GPU layers: %GPU_LAYERS%
echo   Contexte  : %CTX_SIZE% tokens
echo   Threads   : %THREADS% (i5-13600KF P-cores)
echo   Port      : 8081
echo  ============================================================
echo  Attends "llama server listening" puis lance run_agent.bat
echo  Ctrl+C pour arreter
echo.

llama-server.exe --model "%MODEL_FILE%" --port 8081 --host 127.0.0.1 --n-gpu-layers %GPU_LAYERS% --ctx-size %CTX_SIZE% --parallel 1 --threads %THREADS% --metrics

echo.
echo [!] llama-server s'est arrete.
pause