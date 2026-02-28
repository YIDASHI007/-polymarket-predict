FROM node:20-alpine

WORKDIR /app

# 先全局安装 TypeScript
RUN npm install -g typescript

COPY package*.json ./
RUN npm install

COPY . .
RUN tsc

EXPOSE 3001
CMD ["node", "dist/index.js"]
