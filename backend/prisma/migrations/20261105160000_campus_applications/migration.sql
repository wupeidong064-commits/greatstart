CREATE TABLE "campus_applications" (
 "id" TEXT PRIMARY KEY, "organizationName" TEXT NOT NULL, "contactName" TEXT NOT NULL, "email" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','approved','rejected')),
 "reviewedById" TEXT, "organizationId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reviewedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "campus_applications_pending_email" ON "campus_applications" ("email") WHERE "status"='pending';
CREATE INDEX "campus_applications_status_createdAt_idx" ON "campus_applications" ("status","createdAt");
