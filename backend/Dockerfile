FROM node:20-alpine

WORKDIR /app

# 安装 TypeScript 全局
RUN npm install -g typescript

COPY package*.json ./
RUN npm ci

COPY . .
RUN tsc

EXPOSE 3001
CMD ["node", "dist/index.js"]
