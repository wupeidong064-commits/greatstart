-- Age can be known without a birthday; preserve both as independent facts.
ALTER TABLE "students"
  ADD COLUMN "recordedAge" INTEGER,
  ADD COLUMN "recordedAgeAt" TIMESTAMP(3);
