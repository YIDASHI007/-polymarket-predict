FROM node:20-alpine

WORKDIR /app

# 复制后端 package 文件
COPY package*.json ./

# 安装所有依赖（包括 TypeScript 等开发依赖）
RUN npm ci

# 复制后端源代码
COPY . .

# 编译 TypeScript
RUN npx tsc

# 暴露端口
EXPOSE 3001

# 启动应用
CMD ["node", "dist/index.js"]
