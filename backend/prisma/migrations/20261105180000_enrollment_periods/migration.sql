-- Existing rows lack a reliable exit event time. Do not infer it from the last edit.
ALTER TABLE enrollments ADD COLUMN "endedAt" TIMESTAMP(3);
CREATE FUNCTION close_enrollment_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='active' AND NEW.status IN ('completed','transferred','cancelled') THEN
   NEW."endedAt":=coalesce(NEW."endedAt",CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enrollment_end_event BEFORE UPDATE OF status ON enrollments FOR EACH ROW EXECUTE FUNCTION close_enrollment_period();
