# MemFire 连接修复 - TLS 错误

## 错误信息
```
P1011: Error opening a TLS connection: server does not support TLS
```

## 解决方案

MemFire 数据库不支持 TLS/SSL，需要在连接字符串中**禁用 SSL**。

## 修改 backend/.env

打开文件：
```bash
notepad E:\buzzersteam\backend\.env
```

### 将 DATABASE_URL 改为（禁用 SSL）：

```env
DATABASE_URL="postgresql://memfire:005618wld%EF%BC%81@d4r9c60g91htqli3v480.baseapi.memfiredb.com:10000/postgres?schema=public&sslmode=disable"
```

**关键变化**：添加了 `&sslmode=disable`

### 完整的 .env 文件内容：

```env
DATABASE_URL="postgresql://memfire:005618wld%EF%BC%81@d4r9c60g91htqli3v480.baseapi.memfiredb.com:10000/postgres?schema=public&sslmode=disable"
JWT_SECRET=8k7nP2mQ9rT5vW3xY6zA1bC4dE7fG0hJ
JWT_EXPIRES_IN=7d
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

## 保存后重新测试

保存文件后，执行：
```bash
cd E:\buzzersteam\backend
npm run prisma:migrate
```

这次应该能连接成功了！


