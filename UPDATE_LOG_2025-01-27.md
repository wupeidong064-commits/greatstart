# 系统更新日志 - 2025-01-27

## 概述

本次更新主要完成了以下功能：
1. 解决测试账号登录问题（ID 匹配）
2. 实现机构管理完整功能（新增、删除、添加管理者）
3. 优化 sales 角色权限和数据过滤
4. 限制 sales 角色在班级管理的操作权限

---

## 一、测试账号登录问题修复

### 问题描述
用户登录后显示 `Invalid login credential` 或 `role: user`（未匹配角色）

### 根本原因
**MemFire Auth 中的用户 ID 与 users 表中的 ID 不一致**

登录流程：
1. MemFire Auth 认证（验证邮箱密码）
2. 从 users 表获取用户信息（role、organizationId 等）
3. 如果 Auth ID 与 users 表 ID 不匹配，查询失败，默认使用 `role: 'user'`

### 解决方案

在 SQL Editor 中执行以下操作：

```sql
-- 1. 查看登录用户在 Auth 中的 ID（从控制台获取）
-- 控制台运行: JSON.parse(localStorage.getItem('auth-storage'))

-- 2. 查看 users 表中该用户的实际 ID
SELECT id, email, name, role, "organizationId"
FROM users
WHERE email = '目标邮箱';

-- 3. 将 users 表的 ID 更新为 Auth 系统的 ID
UPDATE users
SET id = 'Auth系统中的ID'
WHERE email = '目标邮箱';
```

### 重要提示
- **必须先在 MemFire Auth 中创建账号**
- **然后在 users 表中添加业务信息**（role、organizationId 等）
- 两个表的 ID 必须一致

---

## 二、机构管理功能

### 新增文件/代码

#### 1. `memfireDB.ts` - 新增 `organizationsDB` 模块

**位置**: `/Users/wupeidong/buzzer/greatstart/frontend/src/services/memfireDB.ts`

```typescript
export const organizationsDB = {
  // 获取机构列表（支持分页、搜索）
  async list(params?: { page?: number; pageSize?: number; search?: string; })

  // 获取单个机构
  async getById(id: string)

  // 创建机构
  async create(data: {
    name: string;
    code: string;
    address?: string;
    phone?: string;
    email?: string;
  })

  // 更新机构
  async update(id: string, data: { ... })

  // 删除机构
  async delete(id: string)
}
```

#### 2. `memfireAuth.ts` - 新增 `createManager` 方法

**位置**: `/Users/wupeidong/buzzer/greatstart/frontend/src/services/memfireAuth.ts`

```typescript
async createManager(
  email: string,
  password: string,
  name: string,
  organizationId: string
)
```

功能：
1. 在 MemFire Auth 中创建认证账号
2. 在 users 表中设置 role 为 'admin'
3. 关联到指定机构

#### 3. `Organizations.tsx` - 机构管理页面

**位置**: `/Users/wupeidong/buzzer/greatstart/frontend/src/pages/Organizations.tsx`

**功能列表**:
- ✅ 新增机构（模态框表单）
- ✅ 删除机构（带二次确认）
- ✅ 添加机构管理者（两种方式）
- ✅ 分页显示
- ✅ 搜索过滤

**表单字段**:
- 机构名称（必填）
- 机构代码（必填，字母数字下划线）
- 地址（可选）
- 电话（可选，手机号格式）
- 邮箱（可选，邮箱格式）

---

## 三、sales 角色权限优化

### 修改文件: `dataFilter.ts`

**位置**: `/Users/wupeidong/buzzer/greatstart/frontend/src/utils/dataFilter.ts`

#### 修改前
```typescript
if (normalizedRole === 'sales') {
  return {
    canViewOrganizations: false,
    canViewUsers: false,
    canViewAllClasses: false,  // ❌ 不能查看
    canViewAllStudents: false,  // ❌ 不能查看
    canViewSalesData: true,
    canViewReports: false,
    canViewSettings: false,
  };
}
```

#### 修改后
```typescript
if (normalizedRole === 'sales') {
  return {
    canViewOrganizations: false,
    canViewUsers: false,
    canViewAllClasses: true,   // ✅ 可以查看所有班级
    canViewAllStudents: true,  // ✅ 可以查看所有学员
    canViewSalesData: true,
    canViewReports: true,      // ✅ 可以查看报表
    canViewSettings: false,
  };
}
```

### 权限说明

**sales 角色现在可以：**
- ✅ 查看所有班级（查看权限）
- ✅ 查看所有学员（查看权限）
- ✅ 查看销售数据报表
- ✅ 使用筛选功能

**sales 角色不能：**
- ❌ 编辑班级信息
- ❌ 添加/删除学员
- ❌ 停课/复课操作
- ❌ 删除班级
- ❌ 新增班级
- ❌ 查看机构管理
- ❌ 查看用户管理

---

## 四、现金流中心数据过滤

### 修改文件: `CashflowSummary.tsx`

**位置**: `/Users/wupeidong/buzzer/greatstart/frontend/src/pages/CashflowSummary.tsx`

#### 新增功能

**1. sales 角色自动选择自己**

```typescript
// sales 角色自动选择自己
useEffect(() => {
  if (user && normalizeRole(user.role) === 'sales') {
    setSelectedStaff(user.id);
  }
}, [user]);
```

**2. sales 角色隐藏人员筛选器**

```typescript
const isSales = user && normalizeRole(user.role) === 'sales';

{!isSales && (
  <Select placeholder="按人员筛选">...</Select>
)}
```

### 数据查询逻辑

现金流中心查询的是**负责人字段**，而非创建者：

| 表 | 字段 | 说明 |
|----|------|------|
| 鱼池表 (leads) | `assigneeId` | 负责人 |
| 体验课表 (experience_lessons) | `assigneeId` | 登记人 |
| 成单信息表 (conversions) | `salesId` | 登记人 |

**这意味着**:
- ✅ sales 自己添加的数据
- ✅ 别人添加但分配给 sales 的数据

都能正确显示。

---

## 五、班级管理操作权限限制

### 修改文件: `Classes.tsx`

**位置**: `/Users/wupeidong/buzzer/greatstart/frontend/src/pages/Classes.tsx`

#### 新增角色检查

```typescript
const { user } = useAuthStore();
const userRole = user ? normalizeRole(user.role) : null;
const isSales = userRole === 'sales';
```

#### 操作列按钮限制

```typescript
{!isSales && (
  <>
    <Button>添加学员</Button>
    <Button>编辑</Button>
    <Button>停课/复课</Button>
    <Button danger>删除</Button>
  </>
)}
<Button>学员名单</Button>  {/* 所有角色都可见 */}
```

#### 新增班级按钮限制

```typescript
{!isSales && (
  <Button type="primary" icon={<PlusOutlined />}>
    新增班级
  </Button>
)}
```

### 权限对照表

| 操作 | admin/manager | sales |
|-----|--------------|-------|
| 查看班级列表 | ✅ | ✅ |
| 使用筛选功能 | ✅ | ✅ |
| 查看学员名单 | ✅ | ✅ |
| 新增班级 | ✅ | ❌ |
| 编辑班级 | ✅ | ❌ |
| 添加学员 | ✅ | ❌ |
| 停课/复课 | ✅ | ❌ |
| 删除班级 | ✅ | ❌ |

---

## 六、现有测试账号

### 账号列表

| 邮箱 | 密码 | 姓名 | 角色 | 状态 |
|-----|------|------|------|------|
| buzzerwupeidong@qq.com | admin123 | 系统管理员 | admin | ✅ |
| manager@test.com | 123456 | 邵倩 | admin | ✅ |
| 123@qq.com | 005618wld | 李文清 | sales | ✅ |
| coach1@test.com | password123 | 张教练 | coach | ✅ |
| coach2@test.com | password123 | 李教练 | coach | ✅ |
| coach3@test.com | password123 | 王教练 | coach | ✅ |
| coach4@test.com | password123 | 赵教练 | coach | ✅ |
| coach5@test.com | password123 | 刘教练 | coach | ✅ |

### 注意事项

1. **所有账号都需要先在 MemFire Auth 中创建**
2. **users 表中的 ID 必须与 Auth 系统一致**
3. **organizationId 需要正确设置**（默认: `31c24254-e30c-44cf-868f-3e42e57ee162`）

---

## 七、快速修复脚本

### 修复用户 ID 不匹配问题

```sql
-- 1. 在前端控制台获取当前登录用户的 ID
-- 运行: JSON.parse(localStorage.getItem('auth-storage'))
-- 复制 id 字段

-- 2. 查询该邮箱在 users 表中的记录
SELECT id, email, name, role, "organizationId"
FROM users
WHERE email = '目标邮箱';

-- 3. 更新 ID（替换为实际值）
UPDATE users
SET id = '从控制台获取的Auth ID'
WHERE email = '目标邮箱';

-- 4. 退出登录后重新登录
```

### 批量更新 organizationId

```sql
-- 更新所有缺少 organizationId 的用户
UPDATE users
SET "organizationId" = '31c24254-e30c-44cf-868f-3e42e57ee162'
WHERE "organizationId" IS NULL
  OR "organizationId" = 'default-org';
```

---

## 八、文件变更清单

### 新增功能

1. **memfireDB.ts** - 新增 `organizationsDB` 模块
2. **memfireAuth.ts** - 新增 `createManager` 方法
3. **Organizations.tsx** - 完整重写，实现 CRUD 功能

### 权限修改

1. **dataFilter.ts** - sales 角色权限优化
2. **CashflowSummary.tsx** - sales 角色数据过滤
3. **Classes.tsx** - sales 角色操作限制

---

## 九、测试建议

### 测试账号创建流程

1. 在 MemFire Auth 中创建账号
2. 记录 Auth 系统生成的用户 ID
3. 在 users 表中插入记录（使用 Auth ID）
4. 设置正确的 role 和 organizationId
5. 退出登录后重新登录测试

### 测试场景

**admin 角色：**
- ✅ 创建/删除机构
- ✅ 创建机构管理者
- ✅ 查看所有数据
- ✅ 完整的操作权限

**sales 角色（李文清）：**
- ✅ 查看所有班级和学员（只读）
- ✅ 使用筛选功能
- ✅ 现金流中心显示自己的数据
- ❌ 不能编辑/删除/新增班级
- ❌ 不能添加/删除学员
- ❌ 不能查看机构管理

**coach 角色：**
- ✅ 只能查看自己的班级和学员
- ✅ 可以编辑自己的班级和学员

---

## 十、相关文件路径

```
greatstart/frontend/src/
├── pages/
│   ├── Organizations.tsx          # 机构管理页面
│   ├── Classes.tsx                 # 班级管理页面
│   └── CashflowSummary.tsx         # 现金流中心
├── services/
│   ├── memfireDB.ts                # 数据库操作
│   └── memfireAuth.ts              # 认证操作
└── utils/
    └── dataFilter.ts               # 权限过滤
```

---

**更新时间**: 2025-01-27
**更新人**: Claude Code Assistant
