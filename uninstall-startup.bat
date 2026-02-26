@echo off
setlocal

echo ================================================
echo  Astha Auto-Print Server - Remove Auto-Startup
echo ================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This script must be run as Administrator.
    echo.
    pause
    exit /b 1
)

set "TASK_NAME=AsthaAutoPrintServer"
set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

:: ── Stop the running task first ───────────────────────────────────────────────
echo Stopping server (if running)...
schtasks /end /tn "%TASK_NAME%" >nul 2>&1

:: ── Delete the task ───────────────────────────────────────────────────────────
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] Scheduled task removed.
    ) else (
        echo [ERROR] Could not remove task.
    )
) else (
    echo [INFO] Task was not installed, nothing to remove.
)

:: ── Remove helper files ───────────────────────────────────────────────────────
if exist "%PROJECT_DIR%\silent-launch.vbs"     del "%PROJECT_DIR%\silent-launch.vbs"
if exist "%PROJECT_DIR%\run-server-hidden.bat" del "%PROJECT_DIR%\run-server-hidden.bat"

echo.
echo ================================================
echo  Auto-startup removed successfully.
echo ================================================
echo.
echo The server will no longer start on boot.
echo Your .env and project files are untouched.
echo.
pause
