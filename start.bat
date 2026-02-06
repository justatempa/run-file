@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo === PWT App Docker 启动脚本 ===
echo.

REM 检查 Docker 是否运行
docker info >nul 2>&1
if errorlevel 1 (
    echo [错误] Docker 未运行，请先启动 Docker
    pause
    exit /b 1
)

REM 检查 .env 文件
if not exist .env (
    echo [提示] 未找到 .env 文件，正在生成...

    if exist .env.docker (
        copy .env.docker .env >nul
        echo [成功] 已从 .env.docker 创建 .env 文件
    ) else if exist .env.example (
        copy .env.example .env >nul
        echo [成功] 已从 .env.example 创建 .env 文件
    ) else (
        echo [错误] 未找到 .env.docker 或 .env.example
        pause
        exit /b 1
    )

    REM 生成随机的 AUTH_SECRET（使用 PowerShell）
    for /f "delims=" %%i in ('powershell -Command "[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))"') do set AUTH_SECRET=%%i

    REM 替换 AUTH_SECRET
    powershell -Command "(Get-Content .env) -replace 'AUTH_SECRET=.*', 'AUTH_SECRET=!AUTH_SECRET!' | Set-Content .env"
    echo [成功] 已生成随机 AUTH_SECRET

    echo.
    echo [提示] 请编辑 .env 文件，填写以下配置：
    echo   - AUTH_DISCORD_ID
    echo   - AUTH_DISCORD_SECRET
    echo   - UPLOADTHING_TOKEN
    echo.
    pause
) else (
    echo [成功] 找到 .env 文件
)

REM 创建数据目录
if not exist data (
    mkdir data
    echo [成功] 创建数据目录 ./data
)

REM 检查是否需要重新构建
set BUILD_FLAG=
if "%1"=="--build" set BUILD_FLAG=--build
if "%1"=="-b" set BUILD_FLAG=--build

if not "%BUILD_FLAG%"=="" (
    echo [提示] 将重新构建镜像...
)

REM 启动容器
echo.
echo [提示] 正在启动容器...
docker compose up -d %BUILD_FLAG%

if errorlevel 1 (
    echo.
    echo [错误] 启动失败，请查看错误信息
    pause
    exit /b 1
)

echo.
echo === 启动成功！ ===
echo 应用地址: http://localhost:13701
echo.
echo 常用命令:
echo   查看日志: docker compose logs -f
echo   停止应用: docker compose down
echo   重启应用: docker compose restart
echo   重新构建: start.bat --build
echo.
pause
