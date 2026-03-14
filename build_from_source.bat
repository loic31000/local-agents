@echo off
setlocal enabledelayedexpansion

:: ============================================================
::  build_from_source.bat
::  Compile llama-server depuis llama.cpp\ (deja present)
::  Requiert : CMake, Visual Studio Build Tools, CUDA Toolkit 12.4
:: ============================================================

set PROJECT_DIR=%~dp0
set LLAMA_SRC=%PROJECT_DIR%llama.cpp
set BUILD_DIR=%LLAMA_SRC%\build
set OUTPUT=%PROJECT_DIR%llama-server.exe

echo.
echo  ============================================================
echo   Compilation de llama-server depuis les sources
echo   Source : %LLAMA_SRC%
echo  ============================================================

:: ── Vérifier les prérequis ───────────────────────────────────────

cmake --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [!] CMake introuvable. Installe depuis https://cmake.org/download/
    echo  Active "Add CMake to PATH" pendant l'installation.
    pause & exit /b 1
)
echo  [OK] CMake disponible

nvcc --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [!] CUDA Toolkit introuvable (nvcc).
    echo  Installe CUDA Toolkit 12.4 depuis https://developer.nvidia.com/cuda-downloads
    pause & exit /b 1
)
echo  [OK] CUDA Toolkit disponible

:: ── Configurer CMake ─────────────────────────────────────────────
echo.
echo  Configuration CMake (CUDA)...

if not exist "%BUILD_DIR%" mkdir "%BUILD_DIR%"

cmake -S "%LLAMA_SRC%" -B "%BUILD_DIR%" ^
    -DGGML_CUDA=ON ^
    -DCMAKE_BUILD_TYPE=Release ^
    -DLLAMA_BUILD_SERVER=ON ^
    -DLLAMA_BUILD_TESTS=OFF ^
    -DLLAMA_BUILD_EXAMPLES=OFF

if errorlevel 1 (
    echo  [!] CMake configure a echoue.
    echo  Verifie que Visual Studio Build Tools est installe.
    echo  Telecharge : https://visualstudio.microsoft.com/fr/downloads/
    echo  Installe "Build Tools C++"
    pause & exit /b 1
)

:: ── Compiler ─────────────────────────────────────────────────────
echo.
echo  Compilation (ca peut prendre 10-15 min la premiere fois)...

cmake --build "%BUILD_DIR%" --config Release --target llama-server -j4

if errorlevel 1 (
    echo.
    echo  [!] Compilation echouee.
    pause & exit /b 1
)

:: ── Copier le binaire ─────────────────────────────────────────────
echo.
for %%P in (
    "%BUILD_DIR%\bin\Release\llama-server.exe"
    "%BUILD_DIR%\bin\llama-server.exe"
    "%BUILD_DIR%\Release\llama-server.exe"
) do (
    if exist %%P (
        copy /y %%P "%OUTPUT%" >nul
        echo  [OK] llama-server.exe copie dans : %PROJECT_DIR%
        goto :done
    )
)
echo  [!] llama-server.exe introuvable apres compilation - cherche dans %BUILD_DIR%

:done
echo.
echo  ============================================================
echo   Compilation terminee !
echo   Lance maintenant : start_llama.bat
echo  ============================================================
echo.
pause
