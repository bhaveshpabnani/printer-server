@echo off
setlocal

echo ================================================
echo  Astha Auto-Print Server
echo ================================================
echo.
echo  [1] Start server (foreground - visible window)
echo  [2] Start server via Task Scheduler (background)
echo  [3] Stop background server
echo  [4] View live log
echo  [5] Exit
echo.
set /p "CHOICE=Choose an option (1-5): "

set "TASK_NAME=AsthaAutoPrintServer"
set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

if "%CHOICE%"=="1" (
    echo.
    echo Starting server in foreground ^(Ctrl+C to stop^)...
    echo.
    cd /d "%PROJECT_DIR%"
    call npm start
    goto end
)

if "%CHOICE%"=="2" (
    schtasks /query /tn "%TASK_NAME%" >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Auto-startup task not installed.
        echo Run install-startup.bat first.
    ) else (
        schtasks /run /tn "%TASK_NAME%" >nul 2>&1
        echo.
        echo [OK] Server started in background.
        echo      Check server.log for output.
    )
    goto end
)

if "%CHOICE%"=="3" (
    schtasks /end /tn "%TASK_NAME%" >nul 2>&1
    echo.
    echo [OK] Background server stopped.
    goto end
)

if "%CHOICE%"=="4" (
    call "%PROJECT_DIR%\view-log.bat"
    goto end
)

:end
echo.
pause
