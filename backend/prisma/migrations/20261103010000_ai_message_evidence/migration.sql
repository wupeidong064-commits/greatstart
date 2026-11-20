-- G2：ai_messages 证据卡列（additive；回退=ALTER TABLE ai_messages DROP COLUMN evidenceJson）
ALTER TABLE "ai_messages" ADD COLUMN IF NOT EXISTS "evidenceJson" JSONB;
