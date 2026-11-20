-- 试点轮专用（仅本隔离副本）：运营报告上下文与报告任务
CREATE TABLE "org_report_contexts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campus_id" TEXT,
    "kind" TEXT NOT NULL,
    "period_label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed_fact',
    "payload" JSONB NOT NULL,
    "source_label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "org_report_contexts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "org_report_contexts_org_kind_idx" ON "org_report_contexts"("organization_id", "kind");
CREATE TABLE "org_pilot_report_tasks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "campus_id" TEXT,
    "kind" TEXT NOT NULL,
    "period_start" TEXT NOT NULL,
    "period_end" TEXT NOT NULL,
    "compare_start" TEXT,
    "compare_end" TEXT,
    "snapshot_date" TEXT,
    "request_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "progress_label" TEXT,
    "error" TEXT,
    "content" JSONB,
    "versions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "org_pilot_report_tasks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "org_pilot_report_tasks_request_id_key" ON "org_pilot_report_tasks"("request_id");
CREATE INDEX "org_pilot_report_tasks_org_idx" ON "org_pilot_report_tasks"("organization_id");
