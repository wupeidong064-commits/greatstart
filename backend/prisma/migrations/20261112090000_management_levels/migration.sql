ALTER TABLE "users" ADD COLUMN "managementLevel" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "users" ADD COLUMN "managementGrantedById" TEXT;
ALTER TABLE "users" ADD COLUMN "managementGrantedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD CONSTRAINT "users_management_level_valid" CHECK ("managementLevel" IN ('none','manager','super'));
ALTER TABLE "users" ADD CONSTRAINT "users_parent_no_management" CHECK (role <> 'parent' OR "managementLevel" = 'none');
CREATE TABLE "user_management_events" (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fromLevel" TEXT NOT NULL,
  "toLevel" TEXT NOT NULL,
  "jobRole" TEXT,
  origin TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "user_management_events_organizationId_userId_createdAt_idx" ON "user_management_events" ("organizationId","userId","createdAt");
-- Preserve existing business access. Legacy role alone is not proof of a platform appointment.
UPDATE users SET "managementLevel"='manager' WHERE NOT "isPlatformAdmin" AND role IN ('admin','manager','super_admin');
-- Only approved applications with a verified platform reviewer prove a super-admin appointment.
UPDATE users u SET "managementLevel"='super',"managementGrantedById"=a."reviewedById","managementGrantedAt"=a."reviewedAt"
FROM campus_applications a JOIN users reviewer ON reviewer.id=a."reviewedById" AND reviewer."isPlatformAdmin"
WHERE a.status='approved' AND a."organizationId"=u."organizationId" AND u."managementLevel"='manager'
AND ((a.phone IS NOT NULL AND a.phone=u.phone) OR (a.phone IS NULL AND a.email IS NOT NULL AND lower(a.email)=lower(u.email)));
INSERT INTO user_management_events(id,"organizationId","actorId","userId","fromLevel","toLevel","jobRole",origin)
SELECT 'management-migration:'||id,"organizationId",COALESCE("managementGrantedById",'migration'),id,'legacy',"managementLevel",NULL,
CASE WHEN "managementLevel"='super' THEN 'verified-platform-application' ELSE 'legacy-access-preserved' END
FROM users WHERE "managementLevel"<>'none' AND "organizationId" IS NOT NULL;
