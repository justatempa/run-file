# Bug Fix: MessageType Import Error

## 问题描述
发送消息时出现错误：
```
❌ tRPC failed on message.sendText: Cannot read properties of undefined (reading 'TEXT')
```

## 根本原因
`MessageType` enum 从错误的路径导入：
```typescript
// ❌ 错误
import { MessageType } from "@prisma/client";

// ✅ 正确
import { MessageType } from "~/generated/prisma";
```

由于 Prisma 客户端配置为生成到 `./generated/prisma` 目录，必须从该路径导入。

## 修复步骤

1. **更新导入路径**
   - 文件: `src/server/api/routers/message.ts`
   - 修改: `import { MessageType } from "~/generated/prisma";`

2. **删除旧的生成文件**
   ```bash
   rm -rf generated
   ```

3. **重新生成 Prisma 客户端**
   ```bash
   npx prisma generate
   ```

4. **重启开发服务器**
   ```bash
   npm run dev
   ```

## 当前状态

✅ **已修复并运行**

- 服务器地址: **http://localhost:3001**
- Prisma 客户端: 已重新生成
- 导入路径: 已修复
- 状态: 正常运行

## 测试步骤

1. 访问 http://localhost:3001
2. 登录 (test@example.com / password123)
3. 点击 "New Chat" 创建对话
4. 输入消息并点击 "Send"
5. 消息应该成功发送并显示

## 注意事项

- 端口从 3000 改为 3001（因为 3000 被占用）
- 如果遇到类似问题，检查 Prisma 生成路径配置
- 所有从 Prisma 导入的类型都应该使用 `~/generated/prisma` 路径

## 相关文件

- `src/server/api/routers/message.ts` - 已修复
- `prisma/schema.prisma` - Prisma 配置
- `generated/prisma/` - 生成的 Prisma 客户端

## 预防措施

在 `prisma/schema.prisma` 中，generator 配置为：
```prisma
generator client {
    provider = "prisma-client-js"
    output   = "../generated/prisma"
}
```

所有导入都应该使用这个路径。
