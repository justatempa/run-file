# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Personal Web Transfer (PWT) 是一个基于 T3 Stack 构建的现代化文件传输和消息应用，支持文本消息、文件上传（图片、视频、文件）和对话管理。

## 技术栈

- **框架**: Next.js 15 (App Router) + React 19 + TypeScript
- **API 层**: tRPC v11 (类型安全的 API)
- **数据库**: Prisma + SQLite
- **认证**: NextAuth.js v5 (Credentials Provider with bcrypt)
- **文件上传**: 本地文件系统存储 (通过 `/api/upload`)
- **样式**: Tailwind CSS v4
- **状态管理**: TanStack Query (React Query)

## 核心架构

### 1. 数据库架构 (Prisma)

Prisma 客户端生成到 `generated/prisma/` 目录（非标准位置）。

**核心模型**:
- `User`: 用户表，支持密码认证（bcrypt 加密）
- `Conversation`: 对话表，每个用户可有多个对话
- `Message`: 消息表，支持四种类型：`TEXT`, `IMAGE`, `VIDEO`, `FILE`
- `Account`, `Session`, `VerificationToken`: NextAuth.js 所需模型

**重要**: `MessageType` 枚举定义在 Prisma schema 中，必须从 `generated/prisma/index.js` 导入。

### 2. API 架构 (tRPC)

**路由位置**: `src/server/api/routers/`

- `conversation.ts`: 对话 CRUD 操作
  - `list`: 获取用户所有对话（按 updatedAt 降序）
  - `create`: 创建新对话
  - `rename`: 重命名对话
  - `delete`: 删除对话
  - `getById`: 获取对话及其所有消息

- `message.ts`: 消息操作
  - `sendText`: 发送文本消息
  - `sendFile`: 发送文件消息（IMAGE/VIDEO/FILE）
  - `listByConversation`: 获取对话的所有消息
  - `delete`: 软删除消息（设置 isDeleted=true）
  - `batchDelete`: 批量软删除消息

**所有路由都使用 `protectedProcedure`**，需要用户认证。

### 3. 认证系统

- **配置**: `src/server/auth/config.ts`
- **策略**: JWT session strategy
- **登录页面**: `/auth/login`
- **密码加密**: bcryptjs
- **会话管理**: NextAuth.js v5 callbacks 将 user.id 注入到 JWT token 和 session

### 4. 文件上传

- **本地上传**: 通过 `/api/upload` 路由处理
- **工具函数**: `src/utils/localUpload.ts` 中的 `uploadLocalFiles()`
- **存储**: 文件存储在本地文件系统
- **支持方式**: 点击上传、剪贴板粘贴 (Ctrl+V)、拖拽上传

### 5. 环境变量

**必需变量** (见 `src/env.js`):
- `DATABASE_URL`: Prisma 数据库连接 (默认: `file:./db.sqlite`)
- `AUTH_SECRET`: NextAuth.js 密钥（生产环境必需）
- `UPLOADTHING_TOKEN`: UploadThing token（生产环境必需，开发环境可选）

**生成 AUTH_SECRET**:
```bash
npx auth secret
```

## 常用命令

### 开发
```bash
npm run dev              # 启动开发服务器 (默认端口 3000)
npm run typecheck        # TypeScript 类型检查
```

### 数据库
```bash
npm run db:push          # 推送 Prisma schema 到数据库（无迁移）
npm run db:generate      # 生成 Prisma 迁移（开发环境）
npm run db:migrate       # 应用迁移（生产环境）
npm run db:seed          # 填充测试数据（创建 test@example.com 用户）
npm run db:studio        # 打开 Prisma Studio 可视化工具
```

### 构建和部署
```bash
npm run build            # 构建生产版本（Next.js standalone 模式）
npm run start            # 启动生产服务器
npm run preview          # 构建并启动生产服务器
```

### Docker 部署
```bash
# Windows
start.bat                # 自动配置并启动
start.bat --build        # 重新构建镜像

# Linux/macOS
./start.sh               # 自动配置并启动
./start.sh --build       # 重新构建镜像

# 手动方式
docker compose up -d     # 启动容器
docker compose logs -f   # 查看日志
docker compose down      # 停止容器
```

**Docker 端口**: 13701 (映射到容器内的 3000)
**数据持久化**: `./data` 目录映射到容器内的 `/app/prisma`

## 开发注意事项

### Prisma 客户端路径

Prisma 客户端生成到 `generated/prisma/` 而非默认的 `node_modules/.prisma/client`。

**导入方式**:
```typescript
import { db } from "~/server/db";
import { MessageType } from "../../../../generated/prisma/index.js";
```

**重新生成客户端**:
```bash
npx prisma generate
```

### 消息类型处理

`MessageType` 枚举必须从生成的 Prisma 客户端导入，不能手动定义。参见 `src/server/api/routers/message.ts:3`。

### 认证保护

- 所有 tRPC 路由使用 `protectedProcedure`
- 中间件配置在 `src/middleware.ts`
- 未认证用户自动重定向到 `/auth/login`

### 文件上传流程

1. 前端调用 `uploadLocalFiles()` 上传文件到 `/api/upload`
2. 后端返回文件 URL、名称、类型、大小
3. 前端调用 `message.sendFile` tRPC mutation 保存消息记录

### 软删除机制

消息使用软删除（`isDeleted: true`），不会从数据库物理删除。查询时需过滤 `isDeleted: false`。

## 故障排查

### Prisma 生成错误
```bash
rm -rf generated
npx prisma generate
```

### 发送消息失败
1. 检查浏览器 Network 标签中的 tRPC 请求
2. 查看服务器终端日志
3. 确认用户已登录且会话有效
4. 参考 `TROUBLESHOOTING.md`

### 端口被占用
Next.js 会自动使用下一个可用端口。

### Docker 问题
```bash
docker compose logs -f app    # 查看日志
docker compose exec app sh    # 进入容器调试
docker compose up -d --build  # 重新构建
```

## 测试账号

**Email**: test@example.com
**Password**: password123

运行 `npm run db:seed` 创建测试用户。

## 项目结构关键点

- `src/app/`: Next.js App Router 页面和组件
- `src/server/api/routers/`: tRPC 路由定义
- `src/server/auth/`: NextAuth.js 配置
- `src/server/db.ts`: Prisma 客户端单例
- `prisma/schema.prisma`: 数据库模型定义
- `generated/prisma/`: Prisma 生成的客户端（非标准位置）
- `src/env.js`: 环境变量验证（使用 @t3-oss/env-nextjs）

## 相关文档

- `README.md`: 项目介绍和快速开始
- `DOCKER.md`: Docker 部署详细指南
- `TROUBLESHOOTING.md`: 常见问题解决方案
- `PHASE1_COMPLETE.md`, `PHASE2_COMPLETE.md`: 开发阶段总结
