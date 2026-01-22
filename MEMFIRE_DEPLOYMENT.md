# MemFire Cloud 部署指南

MemFire Cloud 是 Supabase 的国产版，部署方式略有不同。

## 🎯 部署策略

MemFire Cloud **目前不支持 Edge Functions**，所以我们需要采用混合部署方案：

### 方案一：前后端分离部署（推荐）

```
前端 → Vercel/Netlify
  ↓
后端 API → Render/Railway/自托管 Node.js
  ↓
数据库 → MemFire Cloud PostgreSQL
```

### 方案二：全部自托管

```
前端 + 后端 → 阿里云/腾讯云服务器
  ↓
数据库 → MemFire Cloud PostgreSQL
```

## 📋 推荐方案：使用现有 Node.js 后端

由于 MemFire Cloud 不支持 Edge Functions，我们使用项目中已有的 Express 后端，只需将数据库连接到 MemFire Cloud。

## 🚀 部署步骤

### 步骤 1: 获取 MemFire Cloud 数据库连接信息

1. 登录 MemFire Cloud 控制台: https://memfiredb.com
2. 进入您的项目
3. 找到 **数据库连接信息**：
   - 数据库地址（Host）
   - 端口（Port）
   - 数据库名（Database）
   - 用户名（User）
   - 密码（Password）

连接字符串格式：
```
postgresql://用户名:密码@地址:端口/数据库名?schema=public
```

### 步骤 2: 配置后端环境变量

在 `backend` 目录创建 `.env` 文件：

```bash
cd backend

# Windows CMD
echo. > .env
```

编辑 `.env` 文件，填入：

```env
# MemFire Cloud 数据库连接
DATABASE_URL="postgresql://用户名:密码@你的地址.memfiredb.com:5432/postgres?schema=public"

# JWT 配置
JWT_SECRET=your-super-strong-secret-key-here-32-chars-min
JWT_EXPIRES_IN=7d

# 服务端口
PORT=3000

# 运行环境
NODE_ENV=production

# CORS 配置（前端地址）
CORS_ORIGIN=https://your-frontend-domain.com
```

**重要**: `JWT_SECRET` 必须是强密码，至少 32 位随机字符串。

### 步骤 3: 初始化数据库

```bash
cd backend

# 安装依赖
npm install

# 生成 Prisma Client
npm run prisma:generate

# 运行数据库迁移（创建所有表）
npm run prisma:migrate

# 创建初始管理员
npm run init:admin
```

这会在 MemFire Cloud 数据库中创建所有表和初始管理员账号。

### 步骤 4: 测试后端

```bash
# 本地测试
npm run dev
```

访问 http://localhost:3000/health 应该返回 `{"status":"ok"}`

### 步骤 5: 部署后端到云端

#### 选项 A: Render（推荐，免费）

1. 访问 https://render.com
2. 注册并创建 New > Web Service
3. 连接 GitHub 仓库（或手动上传）
4. 配置：
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run prisma:generate`
   - **Start Command**: `npm run start`
   - **Environment Variables**: 添加上面 `.env` 中的所有变量

5. 点击 Create Web Service

部署后会得到一个 URL，如：`https://your-app.onrender.com`

#### 选项 B: Railway

1. 访问 https://railway.app
2. New Project > Deploy from GitHub
3. 选择您的仓库
4. 配置环境变量（同上）
5. 部署

#### 选项 C: 自有服务器（阿里云/腾讯云）

```bash
# SSH 连接到服务器
ssh user@your-server-ip

# 安装 Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 克隆项目
git clone your-repo-url
cd your-repo/backend

# 安装 PM2
npm install -g pm2

# 安装依赖
npm install
npm run prisma:generate
npm run prisma:migrate

# 用 PM2 启动
pm2 start npm --name "buzzersteam-api" -- start
pm2 save
pm2 startup
```

### 步骤 6: 配置前端

编辑 `frontend/.env.production`：

```env
# 后端 API 地址（替换为您部署的后端地址）
VITE_API_BASE=https://your-backend.onrender.com/api
```

### 步骤 7: 部署前端

#### Vercel 部署

```bash
cd frontend

# 安装 Vercel CLI
npm install -g vercel

# 部署
vercel --prod
```

在部署时会提示设置环境变量，添加：
- `VITE_API_BASE`: `https://your-backend.onrender.com/api`

#### Netlify 部署

```bash
cd frontend

# 安装 Netlify CLI
npm install -g netlify-cli

# 构建
npm run build

# 部署
netlify deploy --prod --dir=dist
```

### 步骤 8: 配置 CORS

在后端 `.env` 或部署平台的环境变量中，更新 `CORS_ORIGIN` 为实际的前端域名：

```env
CORS_ORIGIN=https://your-app.vercel.app
```

然后重新部署后端。

## ✅ 验证部署

### 1. 测试后端 API

```bash
# 健康检查
curl https://your-backend.onrender.com/health

# 登录测试
curl -X POST https://your-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@buzzersteam.com","password":"admin123"}'
```

### 2. 测试前端

访问您的前端 URL，尝试登录：
- 邮箱: `admin@buzzersteam.com`
- 密码: `admin123`

### 3. 检查数据库

在 MemFire Cloud 控制台：
- 进入 Table Editor
- 应该能看到所有表（users, organizations, students 等）

## 🔧 MemFire Cloud 特殊配置

### 1. 数据库连接池

如果遇到连接问题，编辑 `backend/prisma/schema.prisma`：

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // 添加连接池配置
  relationMode = "prisma"
}
```

### 2. SSL 连接

某些情况下需要 SSL，修改 `DATABASE_URL`：

```env
DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public&sslmode=require"
```

### 3. 性能优化

在 `backend/src/config/database.ts` 中配置连接池：

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
});

export default prisma;
```

## 📊 架构图

```
                         Internet
                            |
        +-------------------+-------------------+
        |                                       |
    前端 (Vercel)                          后端 (Render)
    React + Vite                          Node.js + Express
        |                                       |
        +---------------------------------------+
                            |
                     MemFire Cloud
                     PostgreSQL 数据库
```

## 💰 成本估算

### 免费方案
- MemFire Cloud: 免费版（500MB 数据库）
- Render: 免费版（后端）
- Vercel: 免费版（前端）
- **总计**: 完全免费！

### 付费升级（可选）
- MemFire Cloud Pro: ¥99/月起
- Render Standard: $7/月
- Vercel Pro: $20/月

## 🔍 故障排查

### 问题 1: 数据库连接失败

**检查**:
1. DATABASE_URL 是否正确
2. MemFire Cloud 数据库是否启动
3. 防火墙/白名单设置

**解决**:
```bash
# 测试数据库连接
cd backend
npm run prisma:studio
```

### 问题 2: Prisma 迁移失败

**解决**:
```bash
# 重置数据库
npm run prisma:migrate -- reset

# 或手动执行 SQL
# 在 MemFire Cloud SQL Editor 中运行 backend/prisma/migrations 中的 SQL
```

### 问题 3: CORS 错误

**解决**: 确保后端 `CORS_ORIGIN` 环境变量包含前端域名。

### 问题 4: API 返回 500

**检查日志**:
- Render: Dashboard > Logs
- Railway: Project > Deployments > Logs

## 📝 环境变量清单

### 后端必需环境变量

```env
DATABASE_URL=postgresql://...
JWT_SECRET=strong-random-string-32-chars
JWT_EXPIRES_IN=7d
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://your-frontend-domain.com
```

### 前端必需环境变量

```env
VITE_API_BASE=https://your-backend-domain.com/api
```

## 🎯 部署完成检查清单

- [ ] MemFire Cloud 数据库创建完成
- [ ] 后端 `.env` 配置完成
- [ ] 数据库迁移执行成功（表已创建）
- [ ] 初始管理员创建成功
- [ ] 后端部署到 Render/Railway
- [ ] 前端配置了后端 API 地址
- [ ] 前端部署到 Vercel/Netlify
- [ ] CORS 配置正确
- [ ] 能成功登录系统

## 🔗 相关资源

- MemFire Cloud 文档: https://docs.memfiredb.com
- Render 文档: https://render.com/docs
- Vercel 文档: https://vercel.com/docs
- Prisma 文档: https://www.prisma.io/docs

## 💡 提示

1. **数据备份**: 定期在 MemFire Cloud 控制台备份数据
2. **监控**: 使用 Render/Railway 的监控功能查看 API 状态
3. **日志**: 出问题时第一时间查看日志
4. **性能**: 如果访问慢，考虑使用国内 CDN

需要帮助？随时告诉我具体遇到的问题！


