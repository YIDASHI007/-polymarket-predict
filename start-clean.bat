@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
title Predict-Monitor - Clean Start
color 0A

echo.
echo ================================================
echo Predict.fun x Polymarket Arbitrage Monitor
echo ================================================
echo.

node -v >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js 20+.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR (
  echo [ERROR] Failed to detect Node.js version.
  pause
  exit /b 1
)
if %NODE_MAJOR% LSS 20 (
  echo [ERROR] Node.js version is too old: v%NODE_MAJOR%. Please install Node.js 20+.
  pause
  exit /b 1
)

call npm -v >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found. Please reinstall Node.js ^(with npm^).
  pause
  exit /b 1
)

echo [OK] Node.js version:
node -v
echo.

echo [*] Checking environment files...
if not exist "backend\.env" (
  if exist "backend\.env.example" (
    copy /Y "backend\.env.example" "backend\.env" >nul
    echo [OK] Created backend\.env from template.
  ) else (
    echo [WARN] backend\.env missing and no backend\.env.example found.
  )
)

if not exist "app\.env.local" (
  if exist "app\.env.example" (
    copy /Y "app\.env.example" "app\.env.local" >nul
    echo [OK] Created app\.env.local from template.
  ) else (
    echo [WARN] app\.env.local missing and no app\.env.example found.
  )
)
echo.

echo [*] Cleaning occupied ports (safe mode)...
call :KillListeningPort 3001
call :KillListeningPort 5173
timeout /t 1 /nobreak >nul
echo [OK] Port cleanup done.
echo.

echo [*] Checking dependencies...
call :EnsureDeps "backend" ""
if errorlevel 1 (
  pause
  exit /b 1
)

call :EnsureDeps "app" "--legacy-peer-deps"
if errorlevel 1 (
  pause
  exit /b 1
)

echo [OK] Dependencies ready.
echo.

echo [*] Starting services...
echo     Backend:  http://localhost:3001
echo     Frontend: http://localhost:5173
echo.

pushd backend
start "Predict Monitor Backend" cmd /c "npm run dev"
popd

pushd app
start "Predict Monitor Frontend" cmd /c "npm run dev"
popd

echo [*] Waiting for frontend to be ready...
set RETRY=0
:CHECK_FRONTEND
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -Uri 'http://localhost:5173' -Method Head -TimeoutSec 2 -UseBasicParsing; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  set /a RETRY+=1
  if !RETRY! LSS 15 (
    echo   waiting... (!RETRY!/15)
    timeout /t 1 /nobreak >nul
    goto CHECK_FRONTEND
  ) else (
    echo [WARN] Frontend readiness check timed out. Open manually: http://localhost:5173
  )
) else (
  echo [OK] Frontend is ready.
)

start http://localhost:5173

echo.
echo ================================================
echo [OK] System started successfully.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:3001
echo ================================================
echo.
pause
exit /b 0

:KillListeningPort
set "TARGET_PORT=%~1"
set "SEEN_PIDS=;"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%TARGET_PORT% .*LISTENING"') do (
  set "CANDIDATE=%%P"
  echo !SEEN_PIDS! | findstr /C:";!CANDIDATE!;" >nul
  if errorlevel 1 (
    set "SEEN_PIDS=!SEEN_PIDS!!CANDIDATE!;"
    echo   killing PID !CANDIDATE! on port %TARGET_PORT%
    taskkill /F /PID !CANDIDATE! >nul 2>&1
  )
)
goto :eof

:EnsureDeps
set "TARGET_DIR=%~1"
set "EXTRA_FLAGS=%~2"

if exist "%TARGET_DIR%\node_modules" (
  echo [OK] %TARGET_DIR% dependencies already installed.
  exit /b 0
)

echo [!] Installing %TARGET_DIR% dependencies...
pushd "%TARGET_DIR%"
call npm ci %EXTRA_FLAGS% --no-fund --no-audit
if errorlevel 1 (
  echo [WARN] npm ci failed in %TARGET_DIR%, falling back to npm install...
  call npm install %EXTRA_FLAGS%
  if errorlevel 1 (
    echo [ERROR] Dependency install failed in %TARGET_DIR%.
    popd
    exit /b 1
  )
)
popd
exit /b 0
