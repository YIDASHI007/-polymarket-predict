#!/usr/bin/env pwsh
# 修复依赖问题脚本

$Host.UI.RawUI.WindowTitle = "修复依赖问题"

function Write-ColorLine {
    param([string]$Text, [string]$Color = 'White')
    Write-Host $Text -ForegroundColor $Color
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║              修复依赖安装问题                             ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""

Set-Location $PSScriptRoot

# 停止进程
Write-ColorLine "[*] 正在停止可能占用文件的进程..." Cyan
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process npm -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# 清理前端依赖
Write-ColorLine "[*] 清理前端依赖..." Cyan
Set-Location app
if (Test-Path node_modules) {
    Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
}
if (Test-Path package-lock.json) {
    Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
}

# 清理缓存
Write-ColorLine "[*] 清理 npm 缓存..." Cyan
& npm cache clean --force 2>$null

# 设置镜像源
Write-ColorLine "[*] 设置 npm 国内镜像源..." Cyan
& npm config set registry https://registry.npmmirror.com

# 重新安装
Write-Host ""
Write-ColorLine "[*] 重新安装前端依赖 (可能需要几分钟)..." Yellow
Write-Host ""
& npm install --legacy-peer-deps

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-ColorLine "[×] 安装失败，正在重试..." Red
    & npm install --legacy-peer-deps
}

Set-Location ..
Write-Host ""
if ($LASTEXITCODE -eq 0) {
    Write-ColorLine "[√] 依赖修复完成！" Green
    Write-Host ""
    Write-Host "现在可以运行 start.bat 启动系统了"
} else {
    Write-ColorLine "[×] 安装失败，请检查网络连接" Red
}
Write-Host ""
Read-Host "按回车键退出"
