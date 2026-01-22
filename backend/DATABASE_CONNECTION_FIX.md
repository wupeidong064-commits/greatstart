# 数据库连接问题修复

## 问题
无法连接到 MemFire 数据库，可能是密码中的 `!` 符号需要 URL 编码。

## 解决方案

请修改 `backend/.env` 文件中的 `DATABASE_URL`：

### 原来的（有问题）：
```env
DATABASE_URL="postgresql://memfire:005618wld!@d4r9c60g91htqli3v480.baseapi.memfiredb.com:10000/postgres?schema=public"
```

### 修改为（将 ! 改为 %21）：
```env
DATABASE_URL="postgresql://memfire:005618wld%21@d4r9c60g91htqli3v480.baseapi.memfiredb.com:10000/postgres?schema=public"
```

## 修改步骤

1. 打开文件：
```bash
notepad E:\buzzersteam\backend\.env
```

2. 找到 `DATABASE_URL` 那一行

3. 将密码部分的 `005618wld!` 改为 `005618wld%21`

4. 保存文件（Ctrl + S）

5. 重新运行迁移：
```bash
cd E:\buzzersteam\backend
npm run prisma:migrate
```

## 其他可能的原因

如果上面的方法不行，请检查：

1. **MemFire 数据库是否启动**
   - 登录 https://memfiredb.com
   - 查看项目状态

2. **IP 白名单**
   - 在 MemFire 控制台查看是否有 IP 限制
   - 如果有，添加您的 IP 地址

3. **网络连接**
   - 确认可以访问 memfiredb.com



