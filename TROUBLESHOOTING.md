# Phase 2 已知问题和解决方案

## 问题 1: 发送消息时出现 tRPC 错误

### 症状
浏览器控制台显示：
```
[[ << mutation #5 ]message.sendText {}
```

### 可能的原因

1. **会话过期**: NextAuth.js 会话可能已过期
2. **Prisma 客户端问题**: 生成的 Prisma 客户端路径不正确
3. **数据库连接问题**: SQLite 数据库文件权限或路径问题

### 解决方案

#### 方案 1: 刷新页面重新登录
1. 刷新浏览器页面 (F5)
2. 如果被登出，重新登录
3. 创建新对话
4. 尝试发送消息

#### 方案 2: 重新生成 Prisma 客户端
```bash
cd pwt-app
npx prisma generate
npm run dev
```

#### 方案 3: 检查数据库
```bash
cd pwt-app
npx prisma studio
```
打开 Prisma Studio 查看数据库中是否有：
- User 表中的测试用户
- Conversation 表中的对话

#### 方案 4: 查看完整错误
在浏览器控制台中：
1. 打开 Network 标签
2. 筛选 "trpc"
3. 查找失败的请求
4. 查看 Response 标签中的错误详情

### 调试步骤

1. **检查认证状态**
   - 打开浏览器开发者工具
   - 在 Console 中输入: `document.cookie`
   - 查看是否有 session token

2. **检查 API 响应**
   - Network 标签中查看 `/api/trpc/message.sendText` 请求
   - 状态码应该是 200
   - 如果是 401，说明认证失败
   - 如果是 500，说明服务器错误

3. **查看服务器日志**
   - 查看运行 `npm run dev` 的终端
   - 查找任何错误消息或堆栈跟踪

## 临时解决方案

如果问题持续，可以尝试：

1. **停止开发服务器** (Ctrl+C)
2. **清理并重启**:
```bash
cd pwt-app
rm -rf .next
rm -rf node_modules/.cache
npm run dev
```

3. **重新创建数据库**:
```bash
cd pwt-app
rm prisma/db.sqlite
npm run db:push
npm run db:seed
```

## 需要提供的调试信息

如果问题仍然存在，请提供：

1. 浏览器控制台的完整错误信息（包括堆栈跟踪）
2. Network 标签中失败请求的 Response
3. 服务器终端的错误日志
4. 是否成功登录（能看到对话列表吗？）
5. 是否成功创建对话（侧边栏有对话吗？）
