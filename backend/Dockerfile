FROM node:20-alpine

WORKDIR /app

# 安装 TypeScript 全局
RUN npm install -g typescript

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN tsc --project .

EXPOSE 3001
CMD ["node", "dist/index.js"]
