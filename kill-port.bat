@echo off
chcp 65001 >nul
title 释放端口工具
color 0E

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║              释放被占用的端口                             ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

echo [*] 正在查找占用端口 3001 的进程...
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do (
    echo [√] 找到进程 PID: %%a
    echo [*] 正在结束进程...
    taskkill /F /PID %%a 2>nul
    if errorlevel 1 (
        echo [×] 无法结束进程，可能需要管理员权限
    ) else (
        echo [√] 进程已结束
    )
)

echo.
echo [*] 正在查找占用端口 5173 的进程...
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do (
    echo [√] 找到进程 PID: %%a
    echo [*] 正在结束进程...
    taskkill /F /PID %%a 2>nul
    if errorlevel 1 (
        echo [×] 无法结束进程，可能需要管理员权限
    ) else (
        echo [√] 进程已结束
    )
)

echo.
echo [√] 端口清理完成！
echo.
pause
