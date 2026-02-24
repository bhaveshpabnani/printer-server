@echo off
echo ================================================
echo  Astha Print Server - Windows Installer
echo ================================================
echo.

echo Installing dependencies...
call npm install

if %errorlevel% neq 0 (
    echo ERROR: npm install failed
    pause
    exit /b %errorlevel%
)

echo.
echo ================================================
echo Installation successful!
echo ================================================
echo.
echo Next steps:
echo 1. Edit .env file with your printer settings
echo 2. Run: test-printer.bat
echo 3. Run: start-server.bat
echo.
pause
