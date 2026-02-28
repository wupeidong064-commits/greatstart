-- MemFire RLS 回滚脚本
-- 使用方法：在 MemFire 控制台 SQL 编辑器中执行

-- 1. 删除所有表的 RLS 策略

DROP POLICY IF EXISTS users_select_policy ON users;
DROP POLICY IF EXISTS users_modify_policy ON users;
DROP POLICY IF EXISTS classes_select_policy ON classes;
DROP POLICY IF EXISTS classes_modify_policy ON classes;
DROP POLICY IF EXISTS students_select_policy ON students;
DROP POLICY IF EXISTS students_modify_policy ON students;
DROP POLICY IF EXISTS leads_policy ON leads;
DROP POLICY IF EXISTS schedules_select_policy ON schedules;
DROP POLICY IF EXISTS schedules_modify_policy ON schedules;
DROP POLICY IF EXISTS attendances_select_policy ON attendances;
DROP POLICY IF EXISTS attendances_modify_policy ON attendances;
DROP POLICY IF EXISTS enrollments_policy ON enrollments;
DROP POLICY IF EXISTS organizations_policy ON organizations;
DROP POLICY IF EXISTS campuses_policy ON campuses;

-- 2. 禁用所有表的 RLS

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE classes DISABLE ROW LEVEL SECURITY;
ALTER TABLE students DISABLE ROW LEVEL SECURITY;
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendances DISABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments DISABLE ROW LEVEL SECURITY;
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE campuses DISABLE ROW LEVEL SECURITY;

-- 3. 删除辅助函数

DROP FUNCTION IF EXISTS get_current_user_id() CASCADE;
DROP FUNCTION IF EXISTS get_current_user_role() CASCADE;
DROP FUNCTION IF EXISTS get_current_user_campus_id() CASCADE;
DROP FUNCTION IF EXISTS get_current_user_org_id() CASCADE;
DROP FUNCTION IF EXISTS is_admin_or_manager() CASCADE;
DROP FUNCTION IF EXISTS is_coach() CASCADE;
DROP FUNCTION IF EXISTS is_sales() CASCADE;
