#!/usr/bin/env pwsh
# 套利监控系统一键启动脚本 (PowerShell)

$Host.UI.RawUI.WindowTitle = "套利监控系统 - Arbitrage Monitor"

# 颜色设置
$colors = @{
    Success = 'Green'
    Info = 'Cyan'
    Warning = 'Yellow'
    Error = 'Red'
}

function Write-ColorLine {
    param([string]$Text, [string]$Color = 'White')
    Write-Host $Text -ForegroundColor $Color
}

# 打印标题
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       Predict.fun × Polymarket 跨市场套利监控系统         ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 检查 Node.js
try {
    $nodeVersion = node -v
    Write-ColorLine "[√] Node.js 版本: $nodeVersion" $colors.Success
} catch {
    Write-ColorLine "[×] 未检测到 Node.js，请先安装 Node.js 20+" $colors.Error
    Read-Host "按回车键退出"
    exit 1
}

Write-Host ""

# 检查并安装依赖
Write-ColorLine "[*] 检查依赖..." $colors.Info

$needInstall = $false

if (-not (Test-Path "backend\node_modules")) {
    Write-ColorLine "[!] 后端依赖未安装，正在安装..." $colors.Warning
    Set-Location backend
    & npm install
    Set-Location ..
    $needInstall = $true
}

if (-not (Test-Path "app\node_modules")) {
    Write-ColorLine "[!] 前端依赖未安装，正在安装..." $colors.Warning
    Set-Location app
    & npm install
    Set-Location ..
    $needInstall = $true
}

if (-not $needInstall) {
    Write-ColorLine "[√] 所有依赖已安装" $colors.Success
}

Write-Host ""

# 检查 concurrently
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-ColorLine "[*] 安装 concurrently..." $colors.Info
    & npm install -g concurrently
}

# 启动服务
Write-ColorLine "[*] 正在启动服务..." $colors.Info
Write-Host "    后端: http://localhost:3001"
Write-Host "    前端: http://localhost:5173"
Write-Host ""
Write-ColorLine "    按 Ctrl+C 停止所有服务" $colors.Warning
Write-Host ""

try {
    & npx concurrently `
        "npm run dev:backend" `
        "npm run dev:frontend" `
        --names "后端,前端" `
        --prefix-colors "blue,green" `
        --kill-others
} catch {
    Write-ColorLine "[×] 启动失败: $_" $colors.Error
}

Write-Host ""
Write-ColorLine "[*] 服务已停止" $colors.Info
Read-Host "按回车键退出"
