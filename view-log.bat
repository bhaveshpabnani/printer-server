@echo off
set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
set "LOG_FILE=%PROJECT_DIR%\server.log"

echo ================================================
echo  Astha Auto-Print Server - Live Log Viewer
echo ================================================
echo.

if not exist "%LOG_FILE%" (
    echo Log file not found: %LOG_FILE%
    echo The server may not have started yet.
    echo Run install-startup.bat first.
    echo.
    pause
    exit /b
)

echo Log file: %LOG_FILE%
echo Press Ctrl+C to stop watching.
echo.
echo ------------------------------------------------

:: Stream the log file live (like tail -f on Linux)
powershell -command "Get-Content '%LOG_FILE%' -Wait -Tail 50"
