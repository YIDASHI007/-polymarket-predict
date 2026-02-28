FROM node:20-alpine

WORKDIR /app

# 安装 TypeScript 全局
RUN npm install -g typescript

# 复制所有文件
COPY . .

# 安装依赖
RUN npm ci

# 编译
RUN tsc

EXPOSE 3001
CMD ["node", "dist/index.js"]
