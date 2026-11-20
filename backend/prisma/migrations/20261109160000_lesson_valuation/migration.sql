-- Leave pre-migration sequence numbers and snapshots NULL. Their provenance is
-- reconstructed only from verifiable evidence when reading the ledger.
CREATE SEQUENCE lesson_logs_ledger_sequence AS INTEGER;
ALTER TABLE lesson_logs
  ADD COLUMN "ledgerSequence" INTEGER,
  ADD COLUMN "lessonSource" TEXT CHECK ("lessonSource" IN ('paid','gift')),
  ADD COLUMN "purchasedReduction" INTEGER CHECK ("purchasedReduction" >= 0),
  ADD COLUMN "creditAmountCents" DECIMAL(12,0) CHECK ("creditAmountCents" >= 0),
  ADD COLUMN allocations JSONB CHECK (jsonb_typeof(allocations) = 'array'),
  ADD COLUMN "refundId" TEXT;
ALTER SEQUENCE lesson_logs_ledger_sequence OWNED BY lesson_logs."ledgerSequence";
ALTER TABLE lesson_logs ALTER COLUMN "ledgerSequence" SET DEFAULT nextval('lesson_logs_ledger_sequence');
ALTER TABLE activity_deduct_receipts ADD COLUMN "lessonSource" TEXT NOT NULL DEFAULT 'paid'
  CHECK ("lessonSource" IN ('paid','gift'));
