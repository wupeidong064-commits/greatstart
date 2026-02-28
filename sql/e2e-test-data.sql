-- E2E 测试数据准备脚本
-- 用于创建完整的测试场景数据

-- ============================================================
-- 第一部分：创建机构和校区
-- ============================================================

DO $$
DECLARE
    v_org_id TEXT;
    v_campus_id TEXT;
BEGIN
    -- 获取或创建测试机构
    SELECT id INTO v_org_id FROM organizations WHERE code = 'E2E-TEST-ORG' LIMIT 1;

    IF v_org_id IS NULL THEN
        v_org_id := gen_random_uuid()::text;
        INSERT INTO organizations (id, name, code) VALUES (v_org_id, 'E2E测试机构', 'E2E-TEST-ORG');
        RAISE NOTICE '创建测试机构: %', v_org_id;
    ELSE
        RAISE NOTICE '使用现有机构: %', v_org_id;
    END IF;

    -- 获取或创建测试校区
    SELECT id INTO v_campus_id FROM campuses WHERE "organizationId" = v_org_id AND code = 'E2E-CAMPUS' LIMIT 1;

    IF v_campus_id IS NULL THEN
        v_campus_id := gen_random_uuid()::text;
        INSERT INTO campuses (id, "organizationId", name, code) VALUES (v_campus_id, v_org_id, 'E2E测试校区', 'E2E-CAMPUS');
        RAISE NOTICE '创建测试校区: %', v_campus_id;
    END IF;
END $$;

-- ============================================================
-- 第二部分：创建测试用户（7个）
-- ============================================================

DO $$
DECLARE
    v_org_id TEXT;
    v_campus_id TEXT;
BEGIN
    SELECT id INTO v_org_id FROM organizations WHERE code = 'E2E-TEST-ORG' LIMIT 1;
    SELECT id INTO v_campus_id FROM campuses WHERE code = 'E2E-CAMPUS' LIMIT 1;

    DELETE FROM users WHERE email LIKE 'e2e-%@test.com';

    INSERT INTO users (id, email, password, name, role, "organizationId", "campusId") VALUES
    ('e2e-admin-001', 'e2e-admin@test.com', 'test123', 'E2E测试管理员', 'admin', v_org_id, v_campus_id),
    ('e2e-manager-001', 'e2e-manager@test.com', 'test123', 'E2E测试管理者', 'manager', v_org_id, v_campus_id),
    ('e2e-coach-001', 'e2e-coach1@test.com', 'test123', 'E2E张教练', 'coach', v_org_id, v_campus_id),
    ('e2e-coach-002', 'e2e-coach2@test.com', 'test123', 'E2E李教练', 'coach', v_org_id, v_campus_id),
    ('e2e-coach-003', 'e2e-coach3@test.com', 'test123', 'E2E王教练', 'coach', v_org_id, v_campus_id),
    ('e2e-sales-001', 'e2e-sales1@test.com', 'test123', 'E2E赵销售', 'sales', v_org_id, v_campus_id),
    ('e2e-sales-002', 'e2e-sales2@test.com', 'test123', 'E2E钱销售', 'sales', v_org_id, v_campus_id)
    ON CONFLICT (email) DO NOTHING;

    RAISE NOTICE '创建测试用户完成';
END $$;

-- ============================================================
-- 第三部分：创建42个班级
-- ============================================================

DO $$
DECLARE
    v_org_id TEXT;
    v_campus_id TEXT;
    v_day_names TEXT[] := ARRAY['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    v_time_starts TEXT[] := ARRAY['10:00', '14:00', '19:00'];
    v_course_types TEXT[] := ARRAY['精英班', '幼儿班'];
    v_coach_ids TEXT[] := ARRAY['e2e-coach-001', 'e2e-coach-002', 'e2e-coach-003'];
    v_day_index INTEGER;
    v_time_index INTEGER;
    v_type_index INTEGER;
    v_coach_index INTEGER;
    v_class_name TEXT;
    v_class_code TEXT;
    v_class_id TEXT;
    v_coach_id TEXT;
BEGIN
    SELECT id INTO v_org_id FROM organizations WHERE code = 'E2E-TEST-ORG' LIMIT 1;
    SELECT id INTO v_campus_id FROM campuses WHERE code = 'E2E-CAMPUS' LIMIT 1;

    DELETE FROM schedules WHERE "classId" LIKE 'e2e-class-%';
    DELETE FROM enrollments WHERE "classId" LIKE 'e2e-class-%';
    DELETE FROM classes WHERE id LIKE 'e2e-class-%';

    v_coach_index := 0;

    FOR v_day_index IN 1..7 LOOP
        FOR v_time_index IN 1..3 LOOP
            FOR v_type_index IN 1..2 LOOP
                v_coach_id := v_coach_ids[((v_coach_index % 3) + 1)];
                v_coach_index := v_coach_index + 1;

                v_class_name := v_course_types[v_type_index] || '-' || v_day_names[v_day_index] || v_time_starts[v_time_index];
                v_class_code := 'E2E' || v_day_index || v_time_index || v_type_index;
                v_class_id := 'e2e-class-' || v_class_code;

                INSERT INTO classes (id, "organizationId", "campusId", name, code, "courseType", capacity, "teacherId", status) VALUES
                (v_class_id, v_org_id, v_campus_id, v_class_name, v_class_code, v_course_types[v_type_index], 10, v_coach_id, 'active')
                ON CONFLICT DO NOTHING;
            END LOOP;
        END LOOP;
    END LOOP;

    RAISE NOTICE '创建42个班级完成';
END $$;

-- ============================================================
-- 第四部分：创建120个学员
-- ============================================================

DO $$
DECLARE
    v_org_id TEXT;
    v_campus_id TEXT;
    v_student_index INTEGER;
BEGIN
    SELECT id INTO v_org_id FROM organizations WHERE code = 'E2E-TEST-ORG' LIMIT 1;
    SELECT id INTO v_campus_id FROM campuses WHERE code = 'E2E-CAMPUS' LIMIT 1;

    DELETE FROM attendances WHERE "studentId" LIKE 'e2e-student-%';
    DELETE FROM enrollments WHERE "studentId" LIKE 'e2e-student-%';
    DELETE FROM students WHERE id LIKE 'e2e-student-%';

    FOR v_student_index IN 1..105 LOOP
        INSERT INTO students (id, "organizationId", "campusId", name, gender, phone, "parentPhone", status) VALUES
        ('e2e-student-' || LPAD(v_student_index::text, 3, '0'), v_org_id, v_campus_id,
         'E2E学员' || LPAD(v_student_index::text, 3, '0'),
         CASE WHEN v_student_index % 2 = 0 THEN '男' ELSE '女' END,
         '138' || substr(md5(random()::text), 1, 8),
         '138' || substr(md5(random()::text), 1, 8),
         'active')
        ON CONFLICT DO NOTHING;
    END LOOP;

    FOR v_student_index IN 106..120 LOOP
        INSERT INTO students (id, "organizationId", "campusId", name, gender, phone, "parentPhone", status) VALUES
        ('e2e-student-' || LPAD(v_student_index::text, 3, '0'), v_org_id, v_campus_id,
         'E2E流失学员' || (v_student_index - 105)::text,
         CASE WHEN v_student_index % 2 = 0 THEN '男' ELSE '女' END,
         '138' || substr(md5(random()::text), 1, 8),
         '138' || substr(md5(random()::text), 1, 8),
         'inactive')
        ON CONFLICT DO NOTHING;
    END LOOP;

    RAISE NOTICE '创建120个学员完成';
END $$;

-- ============================================================
-- 第五部分：创建报名记录
-- ============================================================

DO $$
DECLARE
    v_org_id TEXT;
    v_class_id TEXT;
    v_student_id TEXT;
    v_count INTEGER;
BEGIN
    SELECT id INTO v_org_id FROM organizations WHERE code = 'E2E-TEST-ORG' LIMIT 1;

    v_count := 0;
    FOR v_class_id IN SELECT id FROM classes WHERE id LIKE 'e2e-class-%' ORDER BY code LOOP
        v_count := v_count + 1;

        FOR v_student_index IN 1..CASE WHEN v_count <= 10 THEN 3 ELSE 2 END LOOP
            SELECT id INTO v_student_id
            FROM students
            WHERE id LIKE 'e2e-student-%' AND status = 'active'
              AND id NOT IN (SELECT "studentId" FROM enrollments WHERE "classId" LIKE 'e2e-class-%')
            LIMIT 1;

            IF v_student_id IS NOT NULL THEN
                INSERT INTO enrollments (id, "organizationId", "studentId", "classId", status, "enrolledAt") VALUES
                (gen_random_uuid()::text, v_org_id, v_student_id, v_class_id, 'active', CURRENT_TIMESTAMP)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE '创建报名记录完成';
END $$;

-- ============================================================
-- 第六部分：创建鱼池资源（50条）
-- ============================================================

DO $$
DECLARE
    v_org_id TEXT;
    v_lead_index INTEGER;
BEGIN
    SELECT id INTO v_org_id FROM organizations WHERE code = 'E2E-TEST-ORG' LIMIT 1;

    DELETE FROM leads WHERE id LIKE 'e2e-lead-%';

    FOR v_lead_index IN 1..50 LOOP
        INSERT INTO leads (id, "organizationId", "customerName", age, contact, notes) VALUES
        ('e2e-lead-' || LPAD(v_lead_index::text, 3, '0'), v_org_id,
         'E2E线索客户' || LPAD(v_lead_index::text, 3, '0'),
         5 + (v_lead_index % 8),
         '139' || substr(md5(random()::text), 1, 8),
         'E2E测试线索数据')
        ON CONFLICT DO NOTHING;
    END LOOP;

    RAISE NOTICE '创建50条鱼池资源完成';
END $$;

-- ============================================================
-- 完成提示
-- ============================================================

DO $$
BEGIN
    RAISE NOTICE '======================================';
    RAISE NOTICE 'E2E 测试数据创建完成！';
    RAISE NOTICE '======================================';
    RAISE NOTICE '测试账号：';
    RAISE NOTICE '  管理员: e2e-admin@test.com';
    RAISE NOTICE '  管理者: e2e-manager@test.com';
    RAISE NOTICE '  教练1: e2e-coach1@test.com';
    RAISE NOTICE '  教练2: e2e-coach2@test.com';
    RAISE NOTICE '  教练3: e2e-coach3@test.com';
    RAISE NOTICE '  销售1: e2e-sales1@test.com';
    RAISE NOTICE '  销售2: e2e-sales2@test.com';
    RAISE NOTICE '======================================';
    RAISE NOTICE '注意：用户密码需要在 MemFire Auth 中设置';
    RAISE NOTICE '======================================';
END $$;
