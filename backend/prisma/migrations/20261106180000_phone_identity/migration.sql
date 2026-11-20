BEGIN;
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "campus_applications" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "campus_applications" ADD COLUMN "phone" TEXT;

-- Fail rather than choose an owner when legacy numbers normalize to one identity.
DO $$
DECLARE conflicts TEXT;
BEGIN
 SELECT string_agg(ids, '; ') INTO conflicts FROM (
   SELECT string_agg("id", ', ' ORDER BY "id") AS ids
   FROM "users"
   WHERE NULLIF(regexp_replace("phone", '\s', '', 'g'), '') IS NOT NULL
   GROUP BY regexp_replace(regexp_replace("phone", '\s', '', 'g'), '^\+86', '')
   HAVING count(*) > 1
 ) duplicate_phones;
 IF conflicts IS NOT NULL THEN
   RAISE EXCEPTION 'Duplicate normalized phone identities; choose retained user explicitly before migration. Conflicting user IDs: %', conflicts;
 END IF;
END $$;
UPDATE "users" SET "phone" = NULLIF(regexp_replace(regexp_replace("phone", '\s', '', 'g'), '^\+86', ''), '');
UPDATE "users" SET "email" = NULL WHERE btrim("email") = '';
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
ALTER TABLE "users" ADD CONSTRAINT "users_login_identity_required" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);
ALTER TABLE "users" ADD CONSTRAINT "users_phone_format" CHECK ("phone" IS NULL OR "phone" ~ '^1[3-9][0-9]{9}$');
ALTER TABLE "campus_applications" ADD CONSTRAINT "campus_applications_identity_required" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);
ALTER TABLE "campus_applications" ADD CONSTRAINT "campus_applications_phone_format" CHECK ("phone" IS NULL OR "phone" ~ '^1[3-9][0-9]{9}$');
CREATE UNIQUE INDEX "campus_applications_pending_phone" ON "campus_applications"("phone") WHERE "status" = 'pending';
COMMIT;
