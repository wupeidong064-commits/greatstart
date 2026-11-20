-- Existing student, enrollment and financial history is preserved.
ALTER TABLE "students"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archiveReason" TEXT,
  ADD COLUMN "archiveNote" TEXT,
  ADD COLUMN "archivePreviousStatus" TEXT;
