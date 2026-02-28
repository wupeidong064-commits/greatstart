-- 划课记录表：追踪每次划课操作
-- 用于限制非管理员一天只能划一次课

CREATE TABLE IF NOT EXISTS lesson_deduction_records (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organizationId TEXT NOT NULL,
  classId TEXT NOT NULL,
  operatorId TEXT NOT NULL,
  operatorName TEXT NOT NULL,
  deductionDate DATE NOT NULL,
  deductionCount INTEGER NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT lesson_deduction_records_organizationId_fkey
    FOREIGN KEY (organizationId) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT lesson_deduction_records_classId_fkey
    FOREIGN KEY (classId) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT lesson_deduction_records_operatorId_fkey
    FOREIGN KEY (operatorId) REFERENCES users(id) ON DELETE SET NULL
);

-- 索引：快速查询某天某班级是否已划课
CREATE INDEX IF NOT EXISTS lesson_deduction_records_org_class_date_idx
  ON lesson_deduction_records(organizationId, classId, deductionDate);

-- 索引：查询操作员的划课记录
CREATE INDEX IF NOT EXISTS lesson_deduction_records_operator_date_idx
  ON lesson_deduction_records(operatorId, deductionDate);

-- 唯一约束：同班级、同一天、同一操作员只能有一条记录
CREATE UNIQUE INDEX IF NOT EXISTS lesson_deduction_records_unique_daily
  ON lesson_deduction_records(classId, deductionDate, operatorId);
