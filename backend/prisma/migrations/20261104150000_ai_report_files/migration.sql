-- AiReportFile：AI 报告文件任务（Excel 周报链路；列名按本库驼峰约定）
CREATE TABLE "ai_report_files" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campusId" TEXT,
    "createdById" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "requestId" TEXT NOT NULL,
    "billId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "error" TEXT,
    "title" TEXT NOT NULL,
    "periodStart" TEXT,
    "periodEnd" TEXT,
    "paramsJson" JSONB,
    "evidenceJson" JSONB,
    "fileName" TEXT,
    "filePath" TEXT,
    "fileHash" TEXT,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_report_files_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_report_files_requestId_key" ON "ai_report_files"("requestId");
CREATE INDEX "ai_report_files_org_campus_created_idx" ON "ai_report_files"("organizationId", "campusId", "createdAt");
