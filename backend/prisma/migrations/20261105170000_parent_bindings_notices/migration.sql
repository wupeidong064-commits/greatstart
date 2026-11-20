CREATE TABLE parent_student_links ("parentId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "studentId" TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE ON UPDATE CASCADE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("parentId","studentId"));
-- Convert previous phone-based access once, within the previous scope, only for an unambiguous account per child.
INSERT INTO parent_student_links ("parentId","studentId")
SELECT min(u.id),s.id FROM students s JOIN users u ON u."organizationId"=s."organizationId" AND (u."campusId" IS NULL OR u."campusId"=s."campusId")
 AND u.role='parent' AND u."isActive" AND u.phone=s."parentPhone" AND length(trim(u.phone))>0 GROUP BY s.id HAVING count(*)=1;
CREATE TABLE parent_notices (id TEXT PRIMARY KEY, "studentId" TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE ON UPDATE CASCADE,
 title TEXT NOT NULL,body TEXT NOT NULL,"occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "parent_notices_studentId_occurredAt_idx" ON parent_notices ("studentId","occurredAt");
CREATE FUNCTION notify_lesson_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."scheduleId" IS NOT NULL AND NEW.type IN ('deduct','return','add','refund') THEN
   INSERT INTO parent_notices(id,"studentId",title,body) VALUES ('lesson:'||NEW.id,NEW."studentId",
    CASE WHEN NEW.type='deduct' THEN '已划课' ELSE '课时已返还' END,
    coalesce(NEW."businessDate",'')||' · '||NEW.lessons||' 课时') ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER parent_lesson_notice AFTER INSERT ON lesson_logs FOR EACH ROW EXECUTE FUNCTION notify_lesson_balance();
CREATE FUNCTION notify_class_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE label text;
BEGIN
 IF TG_OP='INSERT' AND NEW.status!='scheduled' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (NEW.status='completed' OR (NEW.status,NEW."startTime",NEW."endTime",NEW.classroom,NEW."teacherId") IS NOT DISTINCT FROM
 (OLD.status,OLD."startTime",OLD."endTime",OLD.classroom,OLD."teacherId")) THEN RETURN NEW; END IF;
 label:=CASE WHEN NEW.status='cancelled' THEN '课程已取消' WHEN NEW.status='rescheduled' THEN '原场次已调课' WHEN TG_OP='INSERT' AND NEW."originalScheduleId" IS NULL THEN '课程已安排' ELSE '课程安排有变更' END;
 INSERT INTO parent_notices(id,"studentId",title,body)
 SELECT gen_random_uuid()::text,eligible.id,label,cl.name||' · '||to_char(NEW."startTime"+interval '8 hours','YYYY-MM-DD HH24:MI')||coalesce(' · '||NEW.classroom,'')
 FROM (SELECT DISTINCT s.id FROM enrollments e JOIN students s ON s.id=e."studentId" WHERE e."classId"=NEW."classId" AND e.status='active'
 AND e."enrolledAt"<=NEW."endTime" AND e."organizationId"=NEW."organizationId" AND s."organizationId"=NEW."organizationId" AND s."campusId"=NEW."campusId") eligible
 JOIN classes cl ON cl.id=NEW."classId";
 RETURN NEW;
END $$;
CREATE TRIGGER parent_schedule_notice AFTER INSERT OR UPDATE OF status,"startTime","endTime",classroom,"teacherId" ON schedules FOR EACH ROW EXECUTE FUNCTION notify_class_schedule();
