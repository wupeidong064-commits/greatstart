-- Keep sales attribution and existing balances/history intact. Unknown legacy
-- recall ownership deliberately remains NULL for explicit manager assignment.
ALTER TABLE "students" ADD COLUMN "recallTeacherId" TEXT;
CREATE INDEX "students_recallTeacherId_idx" ON "students"("recallTeacherId");
ALTER TABLE "students" ADD CONSTRAINT "students_recallTeacherId_fkey"
  FOREIGN KEY ("recallTeacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
