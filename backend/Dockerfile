FROM node:20-alpine

WORKDIR /app

# 复制后端 package 文件
COPY package*.json ./

# 安装依赖（包括开发依赖，因为需要 typescript 编译）
RUN npm ci

# 复制后端源代码
COPY . .

# 编译 TypeScript
RUN npm run build

# 暴露端口
EXPOSE 3001

# 启动应用
CMD ["npm", "start"]
