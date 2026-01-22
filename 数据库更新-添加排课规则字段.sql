-- ============================================
-- 数据库更新：添加排课规则字段和清空旧数据
-- 执行时间：请在MemFire Cloud控制台的SQL编辑器中执行
-- ============================================

-- 步骤1：添加 scheduleRule 字段到 classes 表
ALTER TABLE classes ADD COLUMN IF NOT EXISTS "scheduleRule" JSONB;

-- 步骤2：添加字段注释
COMMENT ON COLUMN classes."scheduleRule" IS '排课规则：{recurrenceType, startDate, endDate, weekDays, startTime, endTime, location}';

-- 步骤3：清空所有现有排课数据（如果有的话）
DELETE FROM schedules;

-- 步骤4：清空班级的排课规则
UPDATE classes SET "scheduleRule" = NULL WHERE "scheduleRule" IS NOT NULL;

-- 完成！现在可以使用新的排课功能了

