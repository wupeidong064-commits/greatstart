# GitHub Actions CI/CD 配置指南

## 概述

本项目使用 GitHub Actions 进行持续集成和持续部署（CI/CD）。

### CI/CD 流程

1. **Backend Build & Lint** - 后端构建和代码检查
2. **Frontend Build & Lint** - 前端构建和代码检查
3. **E2E Tests** - 端到端测试（仅在 push 到 main/master 或手动触发时运行）

## 配置 GitHub Secrets

在 GitHub 仓库中配置以下 Secrets：

### 路径
`Settings` → `Secrets and variables` → `Actions` → `New repository secret`

### 必需的 Secrets

#### 后端配置

| Secret 名称 | 说明 | 示例 |
|------------|------|------|
| `MEMFIRE_URL` | MemFire 数据库 URL | `https://xxx.baseapi.memfiredb.com` |
| `MEMFIRE_SERVICE_ROLE_KEY` | MemFire 服务角色密钥 | `eyJhbGci...` |
| `JWT_SECRET` | JWT 密钥 | `your-secret-key` |

#### 测试账号

| Secret 名称 | 说明 | 示例值 |
|------------|------|--------|
| `ADMIN_EMAIL` | Admin 测试账号邮箱 | `admin@example.com` |
| `ADMIN_PASSWORD` | Admin 测试账号密码 | `password123` |
| `MANAGER_EMAIL` | Manager 测试账号邮箱 | `manager@example.com` |
| `MANAGER_PASSWORD` | Manager 测试账号密码 | `password123` |
| `COACH_EMAIL` | Coach 测试账号邮箱 | `coach@example.com` |
| `COACH_PASSWORD` | Coach 测试账号密码 | `password123` |
| `SALES_EMAIL` | Sales 测试账号邮箱 | `sales@example.com` |
| `SALES_PASSWORD` | Sales 测试账号密码 | `password123` |

## 触发条件

- **Push**: 当代码推送到 `main` 或 `master` 分支时
- **Pull Request**: 当创建或更新 PR 到 `main` 或 `master` 分支时
- **手动触发**: 在 Actions 页面点击 "Run workflow"

## 查看测试报告

1. 进入 Actions 页面
2. 选择对应的 workflow 运行记录
3. 在 Artifacts 部分下载：
   - `playwright-report` - Playwright HTML 测试报告
   - `test-results` - 测试结果文件

## 本地测试

在本地运行 CI 流程：

```bash
# 后端
cd backend
npm ci
npm run build
npm run lint

# 前端
cd frontend
npm ci
npm run build
npm run lint
npx playwright test
```

## 注意事项

1. **E2E 测试** 需要后端服务运行，因此只在 push 或手动触发时执行
2. **Lint 检查** 设置为 `continue-on-error: true`，不会阻止构建
3. **测试报告** 保留 30 天
4. 确保 Secrets 中的测试账号在数据库中存在且密码正确
