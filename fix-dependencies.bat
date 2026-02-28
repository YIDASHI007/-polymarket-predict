@echo off
chcp 65001 >nul
title 修复依赖问题
color 0E

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║              修复依赖安装问题                             ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

echo [*] 正在停止可能占用文件的进程...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM npm.exe 2>nul
timeout /t 2 /nobreak >nul

echo [*] 清理前端依赖...
cd app
if exist node_modules (
    rmdir /s /q node_modules 2>nul
    if exist node_modules (
        echo [!] 普通删除失败，尝试强制删除...
        powershell -Command "Get-ChildItem -Path 'node_modules' -Recurse -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue"
        rmdir /s /q node_modules 2>nul
    )
)
if exist package-lock.json del /f /q package-lock.json 2>nul

echo [*] 清理 npm 缓存...
npm cache clean --force 2>nul

echo [*] 设置 npm 国内镜像源...
npm config set registry https://registry.npmmirror.com

echo.
echo [*] 重新安装前端依赖 (可能需要几分钟)...
echo.
npm install --legacy-peer-deps

if %errorlevel% neq 0 (
    echo.
    echo [×] 安装失败，正在重试...
    npm install --legacy-peer-deps
)

cd ..
echo.
if %errorlevel% equ 0 (
    echo [√] 依赖修复完成！
    echo.
    echo 现在可以运行 start.bat 启动系统了
) else (
    echo [×] 安装失败，请检查网络连接或手动运行: cd app ^&^& npm install
)
echo.
pause
