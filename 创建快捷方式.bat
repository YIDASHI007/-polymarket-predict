@echo off
chcp 65001 >nul
title 创建套利监控系统快捷方式

set "TARGET=%~dp0start.bat"
set "ICON=%~dp0app\public\favicon.ico"
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT=%DESKTOP%\套利监控系统.lnk"

echo.
echo  [*] 正在创建桌面快捷方式...
echo.

:: 使用 PowerShell 创建快捷方式
powershell -NoProfile -Command "
    $WshShell = New-Object -comObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut('%SHORTCUT%')
    $Shortcut.TargetPath = '%TARGET%'
    $Shortcut.WorkingDirectory = '%~dp0'
    $Shortcut.Description = '启动 Predict.fun × Polymarket 套利监控系统'
    if (Test-Path '%ICON%') {
        $Shortcut.IconLocation = '%ICON%'
    }
    $Shortcut.Save()
    Write-Host ' [√] 快捷方式已创建: %SHORTCUT%' -ForegroundColor Green
"

echo.
echo  快捷方式位置: %SHORTCUT%
echo.
pause
