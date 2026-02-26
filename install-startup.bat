@echo off
setlocal enabledelayedexpansion

echo ================================================
echo  Astha Auto-Print Server - Install Auto-Startup
echo ================================================
echo.

:: ── Check for Administrator privileges ────────────────────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This script must be run as Administrator.
    echo.
    echo Right-click install-startup.bat and select
    echo "Run as administrator", then try again.
    echo.
    pause
    exit /b 1
)

:: ── Resolve the folder this .bat lives in (the project root) ──────────────────
set "PROJECT_DIR=%~dp0"
:: Remove trailing backslash
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

:: ── Locate node.exe ───────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] node.exe not found on PATH.
    echo Please install Node.js from https://nodejs.org and try again.
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%i in ('where node') do set "NODE_EXE=%%i"

:: ── Verify index.js exists ────────────────────────────────────────────────────
if not exist "%PROJECT_DIR%\index.js" (
    echo [ERROR] index.js not found in: %PROJECT_DIR%
    echo Make sure you are running this script from the project folder.
    echo.
    pause
    exit /b 1
)

:: ── Task details ──────────────────────────────────────────────────────────────
set "TASK_NAME=AsthaAutoPrintServer"
set "TASK_DESC=Astha HJB Canteen - Thermal Printer Auto-Print Server"
set "LOG_FILE=%PROJECT_DIR%\server.log"

echo Project folder : %PROJECT_DIR%
echo Node executable: %NODE_EXE%
echo Task name      : %TASK_NAME%
echo Log file       : %LOG_FILE%
echo.

:: ── Delete existing task (if reinstalling) ────────────────────────────────────
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Removing existing task...
    schtasks /delete /tn "%TASK_NAME%" /f >nul
)

:: ── Create a wrapper .bat that node runs inside (captures logs) ───────────────
set "RUNNER_BAT=%PROJECT_DIR%\run-server-hidden.bat"

(
echo @echo off
echo cd /d "%PROJECT_DIR%"
echo "%NODE_EXE%" "%PROJECT_DIR%\index.js" >> "%LOG_FILE%" 2^>^&1
) > "%RUNNER_BAT%"

:: ── Build the schtasks XML for full control ───────────────────────────────────
:: Using XML gives us restart-on-failure + run-whether-logged-on-or-not
set "XML_FILE=%PROJECT_DIR%\task-definition.xml"

(
echo ^<?xml version="1.0" encoding="UTF-16"?^>
echo ^<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"^>
echo   ^<RegistrationInfo^>
echo     ^<Description^>%TASK_DESC%^</Description^>
echo   ^</RegistrationInfo^>
echo   ^<Triggers^>
echo     ^<BootTrigger^>
echo       ^<Enabled^>true^</Enabled^>
echo       ^<Delay^>PT20S^</Delay^>
echo     ^</BootTrigger^>
echo   ^</Triggers^>
echo   ^<Principals^>
echo     ^<Principal id="Author"^>
echo       ^<LogonType^>InteractiveToken^</LogonType^>
echo       ^<RunLevel^>HighestAvailable^</RunLevel^>
echo     ^</Principal^>
echo   ^</Principals^>
echo   ^<Settings^>
echo     ^<MultipleInstancesPolicy^>IgnoreNew^</MultipleInstancesPolicy^>
echo     ^<DisallowStartIfOnBatteries^>false^</DisallowStartIfOnBatteries^>
echo     ^<StopIfGoingOnBatteries^>false^</StopIfGoingOnBatteries^>
echo     ^<AllowHardTerminate^>true^</AllowHardTerminate^>
echo     ^<StartWhenAvailable^>true^</StartWhenAvailable^>
echo     ^<RunOnlyIfNetworkAvailable^>false^</RunOnlyIfNetworkAvailable^>
echo     ^<RestartOnFailure^>
echo       ^<Interval^>PT1M^</Interval^>
echo       ^<Count^>10^</Count^>
echo     ^</RestartOnFailure^>
echo     ^<Enabled^>true^</Enabled^>
echo     ^<RunOnlyIfIdle^>false^</RunOnlyIfIdle^>
echo     ^<WakeToRun^>false^</WakeToRun^>
echo     ^<ExecutionTimeLimit^>PT0S^</ExecutionTimeLimit^>
echo   ^</Settings^>
echo   ^<Actions Context="Author"^>
echo     ^<Exec^>
echo       ^<Command^>wscript.exe^</Command^>
echo       ^<Arguments^>"%PROJECT_DIR%\silent-launch.vbs"^</Arguments^>
echo       ^<WorkingDirectory^>%PROJECT_DIR%^</WorkingDirectory^>
echo     ^</Exec^>
echo   ^</Actions^>
echo ^</Task^>
) > "%XML_FILE%"

:: ── Create VBS launcher (runs the bat silently, no console window flash) ──────
set "VBS_FILE=%PROJECT_DIR%\silent-launch.vbs"

(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.Run Chr^(34^) ^& "%RUNNER_BAT%" ^& Chr^(34^), 0, False
) > "%VBS_FILE%"

:: ── Register the task ─────────────────────────────────────────────────────────
schtasks /create /tn "%TASK_NAME%" /xml "%XML_FILE%" /f >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Failed to register scheduled task.
    echo Try running as Administrator.
    echo.
    pause
    exit /b 1
)

:: ── Clean up XML (no longer needed after import) ─────────────────────────────
del "%XML_FILE%" >nul 2>&1

echo.
echo ================================================
echo  SUCCESS - Auto-startup installed!
echo ================================================
echo.
echo The server will now start automatically:
echo   - On every Windows boot (20 second delay)
echo   - Restarts itself up to 10 times if it crashes
echo   - Runs silently in the background
echo.
echo Log file: %LOG_FILE%
echo.
echo Other commands:
echo   view-log.bat       - View live server output
echo   uninstall-startup.bat - Remove auto-startup
echo.

:: ── Ask if they want to start the server right now ───────────────────────────
set /p "START_NOW=Start the server now? (Y/N): "
if /i "%START_NOW%"=="Y" (
    echo.
    echo Starting server...
    schtasks /run /tn "%TASK_NAME%" >nul 2>&1
    echo Server started! Check server.log for output.
)

echo.
pause
