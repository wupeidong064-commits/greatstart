# Prisma directUrl 配置说明

## 修改 backend/.env 文件

打开文件：
```bash
notepad E:\buzzersteam\backend\.env
```

## 添加两个数据库连接配置：

```env
# 连接池 URL（用于应用运行时）
DATABASE_URL="postgresql://memfire:005618wld%EF%BC%81@d4r9c60g91htqli3v480.baseapi.memfiredb.com:10000/postgres?schema=public&sslmode=disable"

# 直接连接 URL（用于迁移，禁用 SSL）
DATABASE_DIRECT_URL="postgresql://memfire:005618wld%EF%BC%81@d4r9c60g91htqli3v480.baseapi.memfiredb.com:10000/postgres?schema=public&sslmode=disable"

JWT_SECRET=8k7nP2mQ9rT5vW3xY6zA1bC4dE7fG0hJ
JWT_EXPIRES_IN=7d
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

## 关键点：

1. **两个 URL 都包含 `&sslmode=disable`** - 禁用 SSL
2. **密码使用 URL 编码** - `%EF%BC%81` 是中文感叹号
3. **端口是 10000**

## 保存后测试

保存文件后，执行：
```bash
cd E:\buzzersteam\backend
npm run prisma:generate
npm run prisma:migrate
```

这次应该能连接成功了！


