@echo off
cd /d "%~dp0"

rem Check if dev server is already running on 5173
netstat -ano | findstr :5173 | findstr LISTENING >nul
if %errorlevel%==0 (
  echo Dev server is already running, opening browser...
  start "" http://localhost:5173
  ping -n 3 127.0.0.1 >nul
  exit /b 0
)

echo Starting Mock API server (port 8088)...
start "nav-mock-api" /min cmd /c "node mock-server.js"

echo Starting Vite dev server (port 5173)...
start "nav-vite" /min cmd /c "npx vite"

echo Waiting for server to be ready...
ping -n 6 127.0.0.1 >nul

start "" http://localhost:5173
echo Started! Two minimized windows are running:
echo   - nav-mock-api  (close it to stop the API server)
echo   - nav-vite      (close it to stop the dev server)
ping -n 5 127.0.0.1 >nul
