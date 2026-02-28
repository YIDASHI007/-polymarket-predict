FROM node:20-alpine

WORKDIR /app

# 复制后端文件
COPY backend/package*.json ./
RUN npm install

COPY backend/tsconfig.json ./
COPY backend/src ./src

# 编译
RUN npx tsc

EXPOSE 3001
CMD ["node", "dist/index.js"]
