-- 班级时间（常规每周上课规则）。仅新增表：不改动 classes 等既有表，
-- 不迁移或清洗任何历史数据；classes."level" 列保留（含历史值），仅界面摘除。
CREATE TABLE "class_weekly_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "classroom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_weekly_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "class_weekly_rules_classId_idx" ON "class_weekly_rules"("classId");
CREATE INDEX "class_weekly_rules_organizationId_idx" ON "class_weekly_rules"("organizationId");

-- 与既有 classes 表同库外键；班级删除时规则级联清理。
ALTER TABLE "class_weekly_rules" ADD CONSTRAINT "class_weekly_rules_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
