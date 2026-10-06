@echo off
rem Double-click (or use the SACopilot shortcut) to start SA Copilot locally and open it in the browser.
cd /d "%~dp0"
title SACopilot

if not exist .env (
  echo .env not found. Copy .env.example to .env and fill in DATABASE_URL and 9ROUTER_API_KEY.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies...
  call npm install || (pause & exit /b 1)
)

echo Building UI...
call npm run build || (pause & exit /b 1)

rem Open the browser a few seconds later, once the server is listening.
start "" /min cmd /c "timeout /t 3 >nul & start http://localhost:3000"
node --env-file-if-exists=.env server/index.ts
pause
