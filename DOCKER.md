# Docker 部署指南

## 快速开始

### 方式一：使用启动脚本（推荐）

启动脚本会自动完成以下操作：
- 检查并生成 .env 配置文件
- 自动生成随机的 AUTH_SECRET
- 创建数据持久化目录
- 启动 Docker 容器

**Windows:**
```bash
start.bat
```

**Linux/macOS:**
```bash
chmod +x start.sh
./start.sh
```

**重新构建镜像:**
```bash
# Windows
start.bat --build

# Linux/macOS
./start.sh --build
```

### 方式二：手动配置

#### 1. 准备环境变量

```bash
# 复制环境变量模板
cp .env.docker .env

# 编辑 .env 文件，填写实际的配置值
```

#### 2. 使用 Docker Compose 启动

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

### 3. 使用 Docker 命令启动

```bash
# 构建镜像
docker build -t pwt-app .

# 运行容器
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/prisma \
  --env-file .env \
  --name pwt-app \
  pwt-app

# 查看日志
docker logs -f pwt-app

# 停止容器
docker stop pwt-app
docker rm pwt-app
```

## 数据持久化

数据库文件会映射到宿主机的 `./data` 目录，确保数据不会因容器重启而丢失。

## 镜像优化说明

- 使用 `node:20-alpine` 基础镜像（约 40MB）
- 多阶段构建，最终镜像只包含运行时必需文件
- Next.js standalone 模式，减少约 80% 的文件体积
- 非 root 用户运行，提高安全性

## 访问应用

应用启动后访问：http://localhost:3000

## 故障排查

### 查看容器日志
```bash
docker-compose logs -f app
```

### 进入容器调试
```bash
docker-compose exec app sh
```

### 重新构建
```bash
docker-compose up -d --build
```
