FROM node:20-alpine

WORKDIR /app

# 全局安装 TypeScript
RUN npm install -g typescript

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制所有文件（包括 tsconfig.json 和 src）
COPY . .

# 编译
RUN tsc --build .

EXPOSE 3001
CMD ["node", "dist/index.js"]
