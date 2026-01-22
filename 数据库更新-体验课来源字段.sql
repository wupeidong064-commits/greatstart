-- 为 experience_lessons 表添加 source 字段
-- 在 MemFire Cloud 控制台的 SQL Editor 中执行

ALTER TABLE experience_lessons 
ADD COLUMN IF NOT EXISTS source VARCHAR(50);

-- 添加注释
COMMENT ON COLUMN experience_lessons.source IS '来源：telemarketing(电销), groundPromotion(地推), referral(转介绍), walkIn(上门)';

-- 验证字段是否添加成功
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'experience_lessons'
AND column_name = 'source';
