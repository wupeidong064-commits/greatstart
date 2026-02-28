# E2E 测试指南

本文档说明如何准备测试数据和场景，以及如何让 AI 生成高质量的 E2E 测试用例。

## 目录

- [测试环境准备](#测试环境准备)
- [测试数据准备](#测试数据准备)
- [测试场景模板](#测试场景模板)
- [如何让 AI 生成测试](#如何让-ai-生成测试)
- [常见测试场景示例](#常见测试场景示例)
- [测试执行与报告](#测试执行与报告)

---

## 测试环境准备

### 1. 环境变量配置

在项目根目录创建 `.env.test` 文件：

```bash
# 测试账号配置（E2E 测试专用）
TEST_EMAIL=e2e-admin@test.com
TEST_PASSWORD=test123

MANAGER_EMAIL=e2e-manager@test.com
MANAGER_PASSWORD=test123

COACH_EMAIL=e2e-coach1@test.com
COACH_PASSWORD=test123

SALES_EMAIL=e2e-sales1@test.com
SALES_PASSWORD=test123

# 数据库配置
MEMFIRE_URL=https://xxx.baseapi.memfiredb.com
MEMFIRE_SERVICE_ROLE_KEY=your-service-role-key
```

### 2. 启动测试环境

```bash
# 终端1：启动后端
cd backend
npm run dev

# 终端2：启动前端
cd frontend
npm run test:e2e:ui  # 使用 Playwright UI 模式
```

---

## 测试数据准备

### 必须准备的测试数据

#### 用户数据（4种角色）

| 角色 | 邮箱 | 密码 | 用途 |
|------|------|------|------|
| admin | e2e-admin@test.com | test123 | 全权限测试 |
| manager | e2e-manager@test.com | test123 | 管理者功能测试 |
| coach | e2e-coach1@test.com | test123 | 教练专属功能测试 |
| sales | e2e-sales1@test.com | test123 | 销售专属功能测试 |

#### 班级数据（>=2个）

```sql
-- 示例数据
INSERT INTO classes (id, name, code, teacherId, organizationId, status) VALUES
('class-sunday-10', '周日10:00班', 'SUN10', 'coach-user-id', 'org-001', 'active'),
('class-sunday-11', '周日11:00班', 'SUN11', 'coach-user-id', 'org-001', 'active');
```

#### 学员数据（>=4人）

| 学员 | 班级归属 | 剩余课时 | 状态 | 用途 |
|------|---------|---------|------|------|
| 张三 | 周日10:00班 | 10 | active | 正常划课测试 |
| 李四 | 无 | 5 | active | 无班级学员测试 |
| 王五 | 周日11:00班 | 0 | active | 0课时测试 |
| 赵六 | 周日10:00班 | 3 | active | 少课时测试 |

```sql
INSERT INTO students (id, name, remainingLessons, organizationId, campusId, status) VALUES
('student-001', '张三', 10, 'org-001', 'campus-001', 'active'),
('student-002', '李四', 5, 'org-001', 'campus-001', 'active'),
('student-003', '王五', 0, 'org-001', 'campus-001', 'active'),
('student-004', '赵六', 3, 'org-001', 'campus-001', 'active');

INSERT INTO enrollments (studentId, classId, status, organizationId) VALUES
('student-001', 'class-sunday-10', 'active', 'org-001'),
('student-004', 'class-sunday-10', 'active', 'org-001'),
('student-003', 'class-sunday-11', 'active', 'org-001');
```

#### 成单数据（>=2条）

```sql
INSERT INTO conversions (studentId, studentName, courseType, totalLessons, price, salesId, organizationId) VALUES
('student-001', '张三', 'new', 10, 1000, 'sales-user-id', 'org-001'),
('student-002', '李四', 'renewal', 20, 2000, 'sales-user-id', 'org-001');
```

### 可选测试数据

#### 边界条件数据

| 场景 | 数据示例 |
|------|---------|
| 待续费学员 | remainingLessons <= 4 |
| 流失学员 | status = 'inactive' |
| 多班级学员 | 同时在2个班级 |
| 无电话学员 | phone = NULL |

#### 体验课数据

```sql
INSERT INTO experience_lessons (studentName, phone, assigneeId, status, scheduleDate, organizationId) VALUES
('体验学员A', '13800138000', 'sales-user-id', 'completed', '2024-01-15', 'org-001'),
('体验学员B', '13800138001', 'sales-user-id', 'pending', '2024-01-20', 'org-001');
```

---

## 测试场景模板

### 场景描述模板

```
【测试场景】<功能名称>测试

【前置条件】
- 用户已登录（角色：xxx）
- 数据准备：xxx

【测试步骤】
1. 操作1
2. 操作2
3. 操作3

【预期结果】
- 页面显示xxx
- 数据库中xxx字段正确更新
- API返回xxx

【边界条件】（可选）
- 数据为空时的表现
- 超长文本的处理
- 网络异常的处理
```

### 示例：完整的测试场景

```
【测试场景】教练划课功能

【前置条件】
- Coach 用户已登录
- 学员"张三"在"周日10:00班"，剩余10节课

【测试步骤】
1. 导航到学员管理页面
2. 找到学员"张三"的行
3. 点击"划课"按钮

【预期结果】
- 划课弹窗正确打开
- 弹窗标题显示"划课"
- 班级选择框默认选中"周日10:00班"
- 剩余课时显示"10节"
- 本次划课输入框默认值为"1"
- 最大可划课节数为"10"

【验证点】
- 弹窗中的班级选择框包含当前教练负责的所有班级
- 选择不同班级后，班级信息正确更新
- 输入划课节数后，预计剩余课时正确计算
```

---

## 如何让 AI 生成测试

### 方式1：描述场景

你可以这样对 AI 说：

```
请帮我写一个 E2E 测试：

场景：教练为学员划课
- 用 Coach 账号登录
- 学员"张三"有10节课，在"周日10:00班"
- 点击划课，划掉1节课
- 验证剩余课时变成9节
```

AI 会生成：
```typescript
test('教练为学员划课应正确扣减课时', async ({ page }) => {
  // 登录
  await login(page, { email: 'e2e-coach1@test.com', password: 'test123' });

  // 导航到学员管理
  await page.goto('/students');

  // 找到学员并点击划课
  // ... 测试代码
});
```

### 方式2：提供 API 响应

```
请写一个测试，验证这个 API 返回的数据结构正确：

API: GET /api/students/:id
期望响应：
{
  success: true,
  data: {
    id: "xxx",
    name: "张三",
    enrollments: [
      {
        status: "active",
        class: {
          id: "class-123",
          name: "周日10:00班"
        }
      }
    ]
  }
}
```

### 方式3：指定测试类型

```
请帮我写以下类型的测试：
1. 数据完整性测试 - 验证 API 返回 enrollments 数据
2. 边界条件测试 - 测试0课时学员划课
3. 异常场景测试 - 测试无班级学员划课
```

---

## 常见测试场景示例

### 1. 学员管理测试场景

#### 场景1.1：学员列表显示班级归属

```
【测试场景】学员列表应显示班级归属

【前置条件】
- Admin 已登录
- 有学员"张三"在"周日10:00班"

【预期结果】
- "张三"行的"所属班级"列显示"周日10:00班"
- 不是 "-" 或 "无"

【验证点】
- GET /api/students 返回的数据包含 enrollments 字段
- enrollments 数组中包含 class 对象
- class 对象包含 name 字段
```

#### 场景1.2：编辑学员不修改课时

```
【测试场景】编辑学员只修改姓名，课时应保持不变

【前置条件】
- 学员"李四"有 10 节课

【测试步骤】
1. 点击"李四"的编辑按钮
2. 只修改姓名为"李四-新"
3. 不修改剩余课时字段（留空或不填）
4. 点击确定

【预期结果】
- 姓名更新成功
- 剩余课时仍然是 10 节（不会被清零）

【验证点】
- PUT /api/students/:id 请求中 remainingLessons 字段为空时，不更新该字段
```

### 2. 划课功能测试场景

#### 场景2.1：有班级学员划课

```
【测试场景】有班级学员可以正常划课

【前置条件】
- Coach 已登录
- 学员"张三"在"周日10:00班"，剩余10节

【测试步骤】
1. 点击"张三"的"划课"按钮
2. 选择"周日10:00班"
3. 输入本次划课 2 节
4. 选择出勤状态为"出勤"
5. 点击确定

【预期结果】
- 弹窗能打开
- 班级选择框有"周日10:00班"选项
- 剩余课时显示"10节"
- 提交后剩余课时变为 8 节
- 显示成功提示

【验证点】
- GET /api/students/:id 返回 enrollments 数据
- enrollments 中包含 class 信息
```

#### 场景2.2：无班级学员划课

```
【测试场景】无班级学员划课应提示错误

【前置条件】
- 学员"王五"没有班级归属

【测试步骤】
1. 点击"王五"的"划课"按钮

【预期结果】
- 显示提示："该学员未报名任何班级，无法划课"
- 不打开划课弹窗

【验证点】
- 前端正确处理 enrollments 为空的情况
- 错误提示友好且明确
```

### 3. 成单信息测试场景

#### 场景3.1：创建新签成单

```
【测试场景】创建新签成单应自动创建学员和报名记录

【前置条件】
- Sales 已登录
- 有班级"周日10:00班"

【测试步骤】
1. 点击"新增成单"
2. 填写学员姓名："测试学员"
3. 选择课程类型："新签"
4. 填写课时：20
5. 填写金额：2000
6. 选择班级："周日10:00班"
7. 点击确定

【预期结果】
- 成单记录创建成功
- 自动创建学员记录
- 自动创建报名记录（enrollment）

【验证点】
- POST /api/conversions 成功
- 学员表的 campusId 字段有值（使用用户的 campusId）
- enrollments 表有对应记录
```

### 4. 角色权限测试场景

#### 场景4.1：Coach 数据隔离

```
【测试场景】Coach 只能看到自己班级的学员

【前置条件】
- Coach 负责"周日10:00班"
- "张三"在"周日10:00班"
- "李四"在"周日11:00班"（其他教练）

【测试步骤】
1. Coach 登录
2. 访问学员管理页面

【预期结果】
- 能看到"张三"
- 看不到"李四"

【验证点】
- GET /api/students 返回的学员都关联到 Coach 的班级
- 不包含其他班级的学员
```

### 5. 边界条件测试场景

#### 场景5.1：0课时学员划课

```
【测试场景】0课时学员划课应提示课时不足

【前置条件】
- 学员"王五"剩余 0 节课

【测试步骤】
1. 点击"王五"的"划课"按钮

【预期结果】
- 显示提示："该学员剩余课时不足，无法划课"

【验证点】
- 前端正确验证 remainingLessons > 0
```

#### 场景5.2：超大数量划课

```
【测试场景】划课节数超过剩余课时应被限制

【前置条件】
- 学员"张三"剩余 10 节课

【测试步骤】
1. 点击"张三"的"划课"按钮
2. 尝试输入划课节数：100

【预期结果】
- 划课节数输入框的最大值限制为 10
- 或显示验证错误

【验证点】
- 输入框有 max 属性或验证
```

---

## 测试执行与报告

### 运行测试

```bash
# 运行所有测试
npm run test:e2e

# 运行特定测试文件
npx playwright test data-integrity.spec.ts

# 使用 UI 模式运行（推荐）
npm run test:e2e:ui

# 调试模式
npm run test:e2e:debug

# 查看测试报告
npm run test:report
```

### 查看测试结果

```bash
# 测试报告会生成在
open frontend/test-results/index.html

# 失败截图保存在
ls frontend/test-results/
```

---

## 让 AI 帮你写测试的技巧

### 技巧1：提供具体的数据值

❌ 不要说：
```
"写一个测试学员列表的测试"
```

✅ 应该说：
```
"写一个测试学员列表的测试：
- 学员'张三'在'周日10:00班'，剩余10节课
- 期望表格中'所属班级'列显示'周日10:00班'"
```

### 技巧2：说明要验证什么

❌ 不要说：
```
"测试编辑学员功能"
```

✅ 应该说：
```
"测试编辑学员功能：
- 只修改姓名，不修改课时
- 验证课时保持原值，不被清零
- 验证 PUT /api/students/:id 的请求体"
```

### 技巧3：提供 API 响应示例

```
"请验证这个 API 返回的数据正确：

GET /api/students/:id

期望返回：
{
  success: true,
  data: {
    id: 'xxx',
    name: '张三',
    enrollments: [
      {
        class: { name: '周日10:00班', teacherId: 'yyy' }
      }
    ]
  }
}

请重点验证：
1. enrollments 字段存在
2. enrollments 是数组
3. class 对象包含 name 字段"
```

### 技巧4：指定测试发现的问题类型

```
"请帮我写测试，专门发现以下问题：
1. API 返回数据缺少关联字段（如 enrollments）
2. 前端显示不正确（如班级显示为空）
3. 数据更新时意外的字段被清零"
```

---

## 快速开始

### 第一步：准备测试账号

确保有以下测试账号可用：
- Admin: e2e-admin@test.com / test123
- Manager: e2e-manager@test.com / test123
- Coach: e2e-coach1@test.com / test123
- Sales: e2e-sales1@test.com / test123

> 使用 `sql/e2e-test-data.sql` 创建测试数据

### 第二步：准备测试数据

运行数据准备脚本（如果有的话）或手动创建：
- 至少2个班级
- 至少4个学员（有/无班级）
- 至少2条成单记录

### 第三步：让 AI 写测试

告诉 AI 你的需求，例如：

```
"请帮我写一个测试：验证学员列表显示班级信息
- 前置：学员张三在周日10:00班
- 操作：访问学员管理页面
- 预期：班级列显示'周日10:00班'而不是'-'"
```

### 第四步：运行测试

```bash
cd frontend
npm run test:e2e:ui
```

---

## 常见问题

### Q: 测试失败怎么办？

A:
1. 查看测试报告中的截图
2. 查看 browser console 错误
3. 检查网络请求（Network tab）
4. 验证测试数据是否存在

### Q: 测试太慢了怎么办？

A:
1. 使用 `.serial()` 只在必要时串行执行
2. 减少不必要的等待时间
3. 使用 `test.skip()` 跳过不稳定的测试
4. 只运行相关的测试文件

### Q: 如何调试测试？

A:
```bash
# 使用调试模式
npm run test:e2e:debug

# 或在代码中添加
await page.pause();
```

---

## 更新日志

| 日期 | 版本 | 更新内容 |
|------|------|---------|
| 2024-02-24 | 1.0 | 初始版本 |
| 2025-02-28 | 1.1 | 更新测试账号信息 |