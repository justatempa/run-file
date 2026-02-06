@echo off
setlocal

echo === PWT App Local Dev Start ===
echo.

call :check_node
if errorlevel 1 exit /b 1

call :ensure_env
if errorlevel 1 exit /b 1

call :ensure_deps
if errorlevel 1 exit /b 1

call :init_db
if errorlevel 1 exit /b 1

call :seed_db
if errorlevel 1 exit /b 1

if "%PORT%"=="" set "PORT=3001"

echo.
echo === Start Dev Server (PORT=%PORT%) ===
echo Sample account:
echo   Email: test@example.com
echo   Password: password123
echo.
npm run dev
exit /b 0

:check_node
node -v >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js LTS.
  exit /b 1
)
npm -v >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found. Please install npm.
  exit /b 1
)
exit /b 0

:ensure_env
echo [INFO] Ensuring .env...
powershell -NoProfile -ExecutionPolicy Bypass -File ensure-env.ps1
if errorlevel 1 (
  echo [ERROR] ensure-env.ps1 failed.
  exit /b 1
)
exit /b 0

:ensure_deps
if not exist node_modules (
  echo [INFO] Installing dependencies...
  npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    exit /b 1
  )
)
exit /b 0

:init_db
echo [INFO] Initializing database...
npm run db:push
if errorlevel 1 (
  echo [ERROR] Database init failed.
  exit /b 1
)
exit /b 0

:seed_db
echo [INFO] Seeding sample account...
npm run db:seed
if errorlevel 1 (
  echo [ERROR] Database seed failed.
  exit /b 1
)
exit /b 0
