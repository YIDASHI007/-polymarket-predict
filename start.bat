@echo off
chcp 65001 >nul
title 套利监控系统 - Arbitrage Monitor
color 0A

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║       Predict.fun × Polymarket 跨市场套利监控系统         ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

:: 检查 Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 20+
    pause
    exit /b 1
)

echo [√] Node.js 版本: 
node -v
echo.

:: 检查依赖
echo [*] 检查依赖...
set NEED_INSTALL=0

if not exist "backend\node_modules" (
    echo [!] 后端依赖未安装
    set NEED_INSTALL=1
)

if not exist "app\node_modules" (
    echo [!] 前端依赖未安装
    set NEED_INSTALL=1
)

if %NEED_INSTALL%==1 (
    echo.
    echo [*] 正在安装依赖，请稍候...
    
    :: 安装后端
    if not exist "backend\node_modules" (
        echo [*] 安装后端依赖...
        cd backend
        call npm install
        if errorlevel 1 (
            echo [×] 后端依赖安装失败
            cd ..
            pause
            exit /b 1
        )
        cd ..
    )
    
    :: 安装前端
    if not exist "app\node_modules" (
        echo [*] 安装前端依赖...
        cd app
        call npm install --legacy-peer-deps
        if errorlevel 1 (
            echo.
            echo [×] 前端依赖安装失败！
            echo.
            echo 解决方法:
            echo 1. 检查网络连接
            echo 2. 双击运行 fix-dependencies.bat 使用修复脚本
            cd ..
            pause
            exit /b 1
        )
        cd ..
    )
)

echo [√] 依赖检查完成
echo.

:: 启动服务
echo [*] 正在启动服务...
echo     后端: http://localhost:3001
echo     前端: http://localhost:5173
echo.
echo     按 Ctrl+C 停止所有服务
echo.

:: 直接启动两个服务
cd backend
start "后端服务" cmd /c "npm run dev"
cd ..\app
start "前端服务" cmd /c "npm run dev"
cd ..

echo.
echo [*] 服务已在新窗口中启动
echo     后端窗口: "后端服务"
echo     前端窗口: "前端服务"
echo.
pause
