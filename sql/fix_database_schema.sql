-- ==================================================
-- 数据库表结构修复脚本
-- 在 MemFire SQL 编辑器中执行
-- ==================================================

-- 1. leads 表添加 status 列
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'new';

-- 2. 确保 leads 表其他必要列存在
ALTER TABLE leads ADD COLUMN IF NOT EXISTS "assigneeId" UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS "assigneeName" VARCHAR(100);

-- 3. 为 leads 表 status 列创建索引
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

-- 4. 确保 enrollments 表必要列存在
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- 5. 为 enrollments 表 status 列创建索引
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments("studentId");
CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments("classId");

-- ==================================================
-- 完成提示
-- ==================================================
-- 执行完成后，可以测试以下操作：
-- 1. 在"销售数据"页面创建新线索
-- 2. 在"班级管理"页面添加学员到班级
-- 3. 在"设置"页面保存配置
-- 4. 在"蜜月期学员"页面查看数据
