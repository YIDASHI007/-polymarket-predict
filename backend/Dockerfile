FROM node:20-alpine

WORKDIR /app

# 全局安装 TypeScript
RUN npm install -g typescript

# 复制 package 文件并安装
COPY package*.json ./
RUN npm install

# 明确复制 tsconfig.json 和 src 目录
COPY tsconfig.json ./
COPY src ./src

# 编译
RUN tsc

EXPOSE 3001
CMD ["node", "dist/index.js"]
