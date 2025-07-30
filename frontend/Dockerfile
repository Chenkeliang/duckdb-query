# build stage
FROM docker.io/node:18-alpine as build
WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装依赖（包括开发依赖，因为需要vite构建）
RUN npm ci

# 复制源代码
COPY . .

# 设置构建时环境变量（Docker内部使用相对路径）
ENV VITE_API_URL=""

# 构建应用
RUN npm run build

# production stage
FROM docker.io/nginx:stable-alpine as production

# 复制构建产物
COPY --from=build /app/dist /usr/share/nginx/html

# 复制nginx配置文件
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 启动nginx
CMD ["nginx", "-g", "daemon off;"]
