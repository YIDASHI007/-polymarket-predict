#!/bin/bash
# 套利监控系统一键启动脚本 (Linux/Mac)

# 颜色设置
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 打印标题
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       Predict.fun × Polymarket 跨市场套利监控系统         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[×] 未检测到 Node.js，请先安装 Node.js 20+${NC}"
    read -p "按回车键退出"
    exit 1
fi

echo -e "${GREEN}[√] Node.js 版本: $(node -v)${NC}"
echo ""

# 检查并安装依赖
echo -e "${BLUE}[*] 检查依赖...${NC}"

NEED_INSTALL=false

if [ ! -d "backend/node_modules" ]; then
    echo -e "${YELLOW}[!] 后端依赖未安装，正在安装...${NC}"
    cd backend && npm install && cd ..
    NEED_INSTALL=true
fi

if [ ! -d "app/node_modules" ]; then
    echo -e "${YELLOW}[!] 前端依赖未安装，正在安装...${NC}"
    cd app && npm install && cd ..
    NEED_INSTALL=true
fi

if [ "$NEED_INSTALL" = false ]; then
    echo -e "${GREEN}[√] 所有依赖已安装${NC}"
fi

echo ""

# 启动服务
echo -e "${BLUE}[*] 正在启动服务...${NC}"
echo "    后端: http://localhost:3001"
echo "    前端: http://localhost:5173"
echo ""
echo -e "${YELLOW}    按 Ctrl+C 停止所有服务${NC}"
echo ""

# 使用 concurrently 启动
npx concurrently \
    "npm run dev:backend" \
    "npm run dev:frontend" \
    --names "后端,前端" \
    --prefix-colors "blue,green" \
    --kill-others

echo ""
echo -e "${BLUE}[*] 服务已停止${NC}"
read -p "按回车键退出"
