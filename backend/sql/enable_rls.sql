-- ========================================
-- MemFire RLS 配置脚本（修复版）
-- ========================================
-- 使用方法：
-- 1. 登录 MemFire 控制台
-- 2. 打开 SQL 编辑器
-- 3. 复制并执行此脚本
-- ========================================

-- 1. 创建辅助函数
-- ========================================

-- 获取当前用户角色
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM users WHERE id::text = auth.uid()::text;
  RETURN COALESCE(v_role, 'anonymous');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 获取当前用户校区ID（返回 TEXT 类型）
CREATE OR REPLACE FUNCTION get_current_user_campus_id()
RETURNS TEXT AS $$
DECLARE
  v_campus_id TEXT;
BEGIN
  SELECT "campusId"::text INTO v_campus_id FROM users WHERE id::text = auth.uid()::text;
  RETURN v_campus_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 获取当前用户机构ID（返回 TEXT 类型）
CREATE OR REPLACE FUNCTION get_current_user_org_id()
RETURNS TEXT AS $$
DECLARE
  v_org_id TEXT;
BEGIN
  SELECT "organizationId"::text INTO v_org_id FROM users WHERE id::text = auth.uid()::text;
  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 获取当前用户 ID（返回 TEXT 类型）
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS TEXT AS $$
BEGIN
  RETURN auth.uid()::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 判断是否是管理员
CREATE OR REPLACE FUNCTION is_admin_or_manager()
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := get_current_user_role();
  RETURN v_role IN ('admin', 'manager');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 判断是否是教练
CREATE OR REPLACE FUNCTION is_coach()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_current_user_role() = 'coach';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 判断是否是销售
CREATE OR REPLACE FUNCTION is_sales()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_current_user_role() = 'sales';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. 配置 users 表 RLS
-- ========================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_policy ON users;
DROP POLICY IF EXISTS users_modify_policy ON users;

-- SELECT: admin/manager 可以看所有，其他只能看自己
CREATE POLICY users_select_policy ON users
FOR SELECT
USING (
  is_admin_or_manager()
  OR id::text = auth.uid()::text
);

-- 修改：只有 admin/manager 可以操作
CREATE POLICY users_modify_policy ON users
FOR ALL
USING (is_admin_or_manager())
WITH CHECK (is_admin_or_manager());

-- 3. 配置 classes 表 RLS
-- ========================================

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS classes_select_policy ON classes;
DROP POLICY IF EXISTS classes_modify_policy ON classes;

-- SELECT: admin/manager 全部，coach/sales 按校区或自己教的班级
CREATE POLICY classes_select_policy ON classes
FOR SELECT
USING (
  is_admin_or_manager()
  OR (is_coach() AND ("campusId"::text = get_current_user_campus_id() OR "teacherId"::text = auth.uid()::text))
  OR (is_sales() AND "campusId"::text = get_current_user_campus_id())
);

-- 修改: 只有 admin/manager 和 coach（自己的班级）可以修改
CREATE POLICY classes_modify_policy ON classes
FOR ALL
USING (
  is_admin_or_manager()
  OR (is_coach() AND "teacherId"::text = auth.uid()::text)
)
WITH CHECK (
  is_admin_or_manager()
  OR (is_coach() AND "teacherId"::text = auth.uid()::text)
);

-- 4. 配置 students 表 RLS
-- ========================================

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS students_select_policy ON students;
DROP POLICY IF EXISTS students_modify_policy ON students;

-- SELECT: 按角色过滤
CREATE POLICY students_select_policy ON students
FOR SELECT
USING (
  is_admin_or_manager()
  OR (is_coach() AND (
    EXISTS (SELECT 1 FROM classes c WHERE c."teacherId"::text = auth.uid()::text AND c."campusId"::text = students."campusId"::text)
    OR EXISTS (SELECT 1 FROM enrollments e JOIN classes c ON e."classId"::text = c.id::text WHERE c."teacherId"::text = auth.uid()::text AND e."studentId"::text = students.id::text)
  ))
  OR (is_sales() AND "campusId"::text = get_current_user_campus_id())
);

-- 修改: 只有 admin/manager
CREATE POLICY students_modify_policy ON students
FOR ALL
USING (is_admin_or_manager())
WITH CHECK (is_admin_or_manager());

-- 5. 配置 leads 表 RLS
-- ========================================

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_policy ON leads;

CREATE POLICY leads_policy ON leads
FOR ALL
USING (
  is_admin_or_manager()
  OR "organizationId"::text = get_current_user_org_id()
)
WITH CHECK (
  is_admin_or_manager()
  OR "organizationId"::text = get_current_user_org_id()
);

-- 6. 配置 schedules 表 RLS
-- ========================================

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schedules_select_policy ON schedules;
DROP POLICY IF EXISTS schedules_modify_policy ON schedules;

CREATE POLICY schedules_select_policy ON schedules
FOR SELECT
USING (
  is_admin_or_manager()
  OR (is_coach() AND "teacherId"::text = auth.uid()::text)
  OR (is_coach() AND "campusId"::text = get_current_user_campus_id())
  OR (is_sales() AND "campusId"::text = get_current_user_campus_id())
);

CREATE POLICY schedules_modify_policy ON schedules
FOR ALL
USING (
  is_admin_or_manager()
  OR (is_coach() AND "teacherId"::text = auth.uid()::text)
)
WITH CHECK (
  is_admin_or_manager()
  OR (is_coach() AND "teacherId"::text = auth.uid()::text)
);

-- 7. 配置 attendances 表 RLS
-- ========================================

ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendances_select_policy ON attendances;
DROP POLICY IF EXISTS attendances_modify_policy ON attendances;

CREATE POLICY attendances_select_policy ON attendances
FOR SELECT
USING (
  is_admin_or_manager()
  OR (is_coach() AND "checkedInBy"::text = auth.uid()::text)
  OR (is_coach() AND EXISTS (
    SELECT 1 FROM schedules s WHERE s.id::text = attendances."scheduleId"::text AND s."teacherId"::text = auth.uid()::text
  ))
);

CREATE POLICY attendances_modify_policy ON attendances
FOR ALL
USING (
  is_admin_or_manager()
  OR (is_coach() AND EXISTS (
    SELECT 1 FROM schedules s WHERE s.id::text = attendances."scheduleId"::text AND s."teacherId"::text = auth.uid()::text
  ))
)
WITH CHECK (
  is_admin_or_manager()
  OR is_coach()
);

-- 8. 配置 enrollments 表 RLS
-- ========================================

ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS enrollments_policy ON enrollments;

CREATE POLICY enrollments_policy ON enrollments
FOR ALL
USING (
  is_admin_or_manager()
  OR (is_coach() AND EXISTS (
    SELECT 1 FROM classes c WHERE c.id::text = enrollments."classId"::text AND c."teacherId"::text = auth.uid()::text
  ))
  OR (is_sales() AND "organizationId"::text = get_current_user_org_id())
)
WITH CHECK (
  is_admin_or_manager()
  OR (is_sales() AND "organizationId"::text = get_current_user_org_id())
);

-- 9. 配置 organizations 表 RLS
-- ========================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_policy ON organizations;

CREATE POLICY organizations_policy ON organizations
FOR ALL
USING (is_admin_or_manager() OR id::text = get_current_user_org_id())
WITH CHECK (is_admin_or_manager());

-- 10. 配置 campuses 表 RLS
-- ========================================

ALTER TABLE campuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campuses_policy ON campuses;

CREATE POLICY campuses_policy ON campuses
FOR ALL
USING (
  is_admin_or_manager()
  OR id::text = get_current_user_campus_id()
  OR "organizationId"::text = get_current_user_org_id()
)
WITH CHECK (is_admin_or_manager());

-- ========================================
-- 完成！RLS 已启用
-- ========================================
-- 注意：
-- 1. service_role key 可以绕过 RLS
-- 2. 后端 API 使用 service_role key，不受 RLS 限制
-- 3. 前端直接访问数据库时，RLS 会生效
-- ========================================
