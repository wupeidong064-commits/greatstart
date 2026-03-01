-- 添加学员表新字段：课时管理、销售、缴费相关
-- 执行日期: 2026-03-01

-- 1. 添加开卡时间字段
ALTER TABLE students ADD COLUMN IF NOT EXISTS "cardOpenDate" TIMESTAMP;

-- 2. 添加已购课时段
ALTER TABLE students ADD COLUMN IF NOT EXISTS "purchasedLessons" INTEGER NOT NULL DEFAULT 0;

-- 3. 添加消耗课时段
ALTER TABLE students ADD COLUMN IF NOT EXISTS "consumedLessons" INTEGER NOT NULL DEFAULT 0;

-- 4. 添加剩余课时段（如果不存在）
ALTER TABLE students ADD COLUMN IF NOT EXISTS "remainingLessons" INTEGER NOT NULL DEFAULT 0;

-- 5. 添加缴费金额字段
ALTER TABLE students ADD COLUMN IF NOT EXISTS "totalPayment" DECIMAL(10,2) DEFAULT 0;

-- 6. 添加销售ID字段（关联用户）
ALTER TABLE students ADD COLUMN IF NOT EXISTS "salesId" TEXT;

-- 7. 添加最后上课日期字段
ALTER TABLE students ADD COLUMN IF NOT EXISTS "lastClassDate" TIMESTAMP;

-- 8. 添加外键约束（销售关联用户）
-- 注意：如果已存在约束，可能会报错，可以忽略
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'students_salesId_fkey'
    AND table_name = 'students'
  ) THEN
    ALTER TABLE students
    ADD CONSTRAINT "students_salesId_fkey"
    FOREIGN KEY ("salesId")
    REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;

-- 9. 添加索引
CREATE INDEX IF NOT EXISTS "students_salesId_idx" ON students("salesId");

-- 10. 添加注释
COMMENT ON COLUMN students."cardOpenDate" IS '开卡时间';
COMMENT ON COLUMN students."purchasedLessons" IS '已购课时';
COMMENT ON COLUMN students."consumedLessons" IS '消耗课时';
COMMENT ON COLUMN students."remainingLessons" IS '剩余课时';
COMMENT ON COLUMN students."totalPayment" IS '累计缴费金额';
COMMENT ON COLUMN students."salesId" IS '销售ID，关联用户表';
COMMENT ON COLUMN students."lastClassDate" IS '最后上课日期';
