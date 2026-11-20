-- G1: AI 会话记忆迁移（additive；回退=DROP ai_messages/ai_conversations + ALTER ai_task_bills DROP COLUMN conversationId）
-- 由 prisma migrate diff 生成并剪除两条既有索引改名（非本轮范围）。

-- AlterTable
ALTER TABLE "ai_task_bills" ADD COLUMN     "conversationId" TEXT;

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campusId" TEXT,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "contextSummary" TEXT,
    "summaryCoveredThroughMessageId" TEXT,
    "summaryVersion" INTEGER NOT NULL DEFAULT 0,
    "summaryFailedAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'complete',
    "requestId" TEXT,
    "billId" TEXT,
    "usageJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversations_ownerUserId_organizationId_campusId_update_idx" ON "ai_conversations"("ownerUserId", "organizationId", "campusId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_messages_requestId_key" ON "ai_messages"("requestId");

-- CreateIndex
CREATE INDEX "ai_messages_conversationId_sequence_idx" ON "ai_messages"("conversationId", "sequence");

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
