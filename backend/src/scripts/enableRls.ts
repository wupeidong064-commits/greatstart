/**
 * 配置 MemFire RLS（行级安全策略）
 *
 * 使用方法：
 * cd backend && npm run enable-rls
 *
 * 注意：
 * 1. 此脚本会启用 RLS 并创建安全策略
 * 2. 使用 service_role key 可以绕过 RLS
 * 3. 建议先在测试环境验证
 */

import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ 缺少环境变量: DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

async function executeSql(sql: string, description: string): Promise<boolean> {
  try {
    await pool.query(sql);
    console.log(`  ✓ ${description}`);
    return true;
  } catch (error: any) {
    console.error(`  ✗ ${description}: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('  配置 MemFire RLS 策略');
  console.log('========================================\n');

  // 0. 检查 auth.uid() 是否可用
  console.log('🔍 检查 auth.uid() 可用性...');
  try {
    const { rows } = await pool.query(`
      SELECT current_setting('request.jwt.claims', true) as claims;
    `);
    console.log('  ✓ JWT claims 配置可用');
  } catch (error: any) {
    console.log('  ⚠️  无法检查 JWT claims:', error.message);
  }

  // 1. 创建辅助函数
  console.log('\n📦 创建辅助函数...');

  // 获取当前用户信息的函数
  await executeSql(`
    CREATE OR REPLACE FUNCTION get_current_user_id()
    RETURNS UUID AS $$
    BEGIN
      RETURN auth.uid();
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
  `, '创建 get_current_user_id()');

  // 获取当前用户角色的函数
  await executeSql(`
    CREATE OR REPLACE FUNCTION get_current_user_role()
    RETURNS TEXT AS $$
    DECLARE
      v_role TEXT;
    BEGIN
      SELECT role INTO v_role FROM users WHERE id = auth.uid();
      RETURN COALESCE(v_role, 'anonymous');
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
  `, '创建 get_current_user_role()');

  // 获取当前用户校区ID的函数
  await executeSql(`
    CREATE OR REPLACE FUNCTION get_current_user_campus_id()
    RETURNS UUID AS $$
    DECLARE
      v_campus_id UUID;
    BEGIN
      SELECT "campusId" INTO v_campus_id FROM users WHERE id = auth.uid();
      RETURN v_campus_id;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
  `, '创建 get_current_user_campus_id()');

  // 获取当前用户机构ID的函数
  await executeSql(`
    CREATE OR REPLACE FUNCTION get_current_user_org_id()
    RETURNS UUID AS $$
    DECLARE
      v_org_id UUID;
    BEGIN
      SELECT "organizationId" INTO v_org_id FROM users WHERE id = auth.uid();
      RETURN v_org_id;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
  `, '创建 get_current_user_org_id()');

  // 判断是否是管理员角色的函数
  await executeSql(`
    CREATE OR REPLACE FUNCTION is_admin_or_manager()
    RETURNS BOOLEAN AS $$
    DECLARE
      v_role TEXT;
    BEGIN
      v_role := get_current_user_role();
      RETURN v_role IN ('admin', 'manager');
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
  `, '创建 is_admin_or_manager()');

  // 判断是否是 coach 角色的函数
  await executeSql(`
    CREATE OR REPLACE FUNCTION is_coach()
    RETURNS BOOLEAN AS $$
    BEGIN
      RETURN get_current_user_role() = 'coach';
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
  `, '创建 is_coach()');

  // 判断是否是 sales 角色的函数
  await executeSql(`
    CREATE OR REPLACE FUNCTION is_sales()
    RETURNS BOOLEAN AS $$
    BEGIN
      RETURN get_current_user_role() = 'sales';
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
  `, '创建 is_sales()');

  // 2. 配置 users 表 RLS
  console.log('\n📋 配置 users 表 RLS...');

  await executeSql(`ALTER TABLE users ENABLE ROW LEVEL SECURITY;`, '启用 users 表 RLS');

  // 删除已存在的策略
  await executeSql(`DROP POLICY IF EXISTS users_select_policy ON users;`, '清理旧 SELECT 策略');
  await executeSql(`DROP POLICY IF EXISTS users_insert_policy ON users;`, '清理旧 INSERT 策略');
  await executeSql(`DROP POLICY IF EXISTS users_update_policy ON users;`, '清理旧 UPDATE 策略');
  await executeSql(`DROP POLICY IF EXISTS users_delete_policy ON users;`, '清理旧 DELETE 策略');

  // SELECT 策略：admin/manager 可以看所有，其他只能看自己
  await executeSql(`
    CREATE POLICY users_select_policy ON users
    FOR SELECT
    USING (
      is_admin_or_manager()
      OR id = auth.uid()
    );
  `, '创建 users SELECT 策略');

  // INSERT/UPDATE/DELETE：只有 admin/manager 可以操作
  await executeSql(`
    CREATE POLICY users_modify_policy ON users
    FOR ALL
    USING (is_admin_or_manager())
    WITH CHECK (is_admin_or_manager());
  `, '创建 users 修改策略');

  // 3. 配置 classes 表 RLS
  console.log('\n📋 配置 classes 表 RLS...');

  await executeSql(`ALTER TABLE classes ENABLE ROW LEVEL SECURITY;`, '启用 classes 表 RLS');
  await executeSql(`DROP POLICY IF EXISTS classes_select_policy ON classes;`, '清理旧策略');
  await executeSql(`DROP POLICY IF EXISTS classes_modify_policy ON classes;`, '清理旧策略');

  // SELECT 策略：admin/manager 全部，coach/sales 按校区或自己教的班级
  await executeSql(`
    CREATE POLICY classes_select_policy ON classes
    FOR SELECT
    USING (
      is_admin_or_manager()
      OR (is_coach() AND ("campusId" = get_current_user_campus_id() OR "teacherId" = auth.uid()))
      OR (is_sales() AND "campusId" = get_current_user_campus_id())
    );
  `, '创建 classes SELECT 策略');

  // 修改策略：只有 admin/manager 和 coach（自己的班级）可以修改
  await executeSql(`
    CREATE POLICY classes_modify_policy ON classes
    FOR ALL
    USING (
      is_admin_or_manager()
      OR (is_coach() AND "teacherId" = auth.uid())
    )
    WITH CHECK (
      is_admin_or_manager()
      OR (is_coach() AND "teacherId" = auth.uid())
    );
  `, '创建 classes 修改策略');

  // 4. 配置 students 表 RLS
  console.log('\n📋 配置 students 表 RLS...');

  await executeSql(`ALTER TABLE students ENABLE ROW LEVEL SECURITY;`, '启用 students 表 RLS');
  await executeSql(`DROP POLICY IF EXISTS students_select_policy ON students;`, '清理旧策略');
  await executeSql(`DROP POLICY IF EXISTS students_modify_policy ON students;`, '清理旧策略');

  // SELECT 策略
  await executeSql(`
    CREATE POLICY students_select_policy ON students
    FOR SELECT
    USING (
      is_admin_or_manager()
      OR (is_coach() AND (
        EXISTS (SELECT 1 FROM classes c WHERE c."teacherId" = auth.uid() AND c."campusId" = students."campusId")
        OR EXISTS (SELECT 1 FROM enrollments e JOIN classes c ON e."classId" = c.id WHERE c."teacherId" = auth.uid() AND e."studentId" = students.id)
      ))
      OR (is_sales() AND "campusId" = get_current_user_campus_id())
    );
  `, '创建 students SELECT 策略');

  // 修改策略
  await executeSql(`
    CREATE POLICY students_modify_policy ON students
    FOR ALL
    USING (is_admin_or_manager())
    WITH CHECK (is_admin_or_manager());
  `, '创建 students 修改策略');

  // 5. 配置 leads 表 RLS
  console.log('\n📋 配置 leads 表 RLS...');

  await executeSql(`ALTER TABLE leads ENABLE ROW LEVEL SECURITY;`, '启用 leads 表 RLS');
  await executeSql(`DROP POLICY IF EXISTS leads_policy ON leads;`, '清理旧策略');

  // leads 表策略
  await executeSql(`
    CREATE POLICY leads_policy ON leads
    FOR ALL
    USING (
      is_admin_or_manager()
      OR "organizationId" = get_current_user_org_id()
    )
    WITH CHECK (
      is_admin_or_manager()
      OR "organizationId" = get_current_user_org_id()
    );
  `, '创建 leads 策略');

  // 6. 配置 schedules 表 RLS
  console.log('\n📋 配置 schedules 表 RLS...');

  await executeSql(`ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;`, '启用 schedules 表 RLS');
  await executeSql(`DROP POLICY IF EXISTS schedules_select_policy ON schedules;`, '清理旧策略');
  await executeSql(`DROP POLICY IF EXISTS schedules_modify_policy ON schedules;`, '清理旧策略');

  await executeSql(`
    CREATE POLICY schedules_select_policy ON schedules
    FOR SELECT
    USING (
      is_admin_or_manager()
      OR (is_coach() AND "teacherId" = auth.uid())
      OR (is_coach() AND "campusId" = get_current_user_campus_id())
      OR (is_sales() AND "campusId" = get_current_user_campus_id())
    );
  `, '创建 schedules SELECT 策略');

  await executeSql(`
    CREATE POLICY schedules_modify_policy ON schedules
    FOR ALL
    USING (
      is_admin_or_manager()
      OR (is_coach() AND "teacherId" = auth.uid())
    )
    WITH CHECK (
      is_admin_or_manager()
      OR (is_coach() AND "teacherId" = auth.uid())
    );
  `, '创建 schedules 修改策略');

  // 7. 配置 attendances 表 RLS
  console.log('\n📋 配置 attendances 表 RLS...');

  await executeSql(`ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;`, '启用 attendances 表 RLS');
  await executeSql(`DROP POLICY IF EXISTS attendances_select_policy ON attendances;`, '清理旧策略');
  await executeSql(`DROP POLICY IF EXISTS attendances_modify_policy ON attendances;`, '清理旧策略');

  await executeSql(`
    CREATE POLICY attendances_select_policy ON attendances
    FOR SELECT
    USING (
      is_admin_or_manager()
      OR (is_coach() AND "checkedInBy" = auth.uid())
      OR (is_coach() AND EXISTS (
        SELECT 1 FROM schedules s WHERE s.id = attendances."scheduleId" AND s."teacherId" = auth.uid()
      ))
    );
  `, '创建 attendances SELECT 策略');

  await executeSql(`
    CREATE POLICY attendances_modify_policy ON attendances
    FOR ALL
    USING (
      is_admin_or_manager()
      OR (is_coach() AND EXISTS (
        SELECT 1 FROM schedules s WHERE s.id = attendances."scheduleId" AND s."teacherId" = auth.uid()
      ))
    )
    WITH CHECK (
      is_admin_or_manager()
      OR (is_coach())
    );
  `, '创建 attendances 修改策略');

  // 8. 配置 enrollments 表 RLS
  console.log('\n📋 配置 enrollments 表 RLS...');

  await executeSql(`ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;`, '启用 enrollments 表 RLS');
  await executeSql(`DROP POLICY IF EXISTS enrollments_policy ON enrollments;`, '清理旧策略');

  await executeSql(`
    CREATE POLICY enrollments_policy ON enrollments
    FOR ALL
    USING (
      is_admin_or_manager()
      OR (is_coach() AND EXISTS (
        SELECT 1 FROM classes c WHERE c.id = enrollments."classId" AND c."teacherId" = auth.uid()
      ))
      OR (is_sales() AND "organizationId" = get_current_user_org_id())
    )
    WITH CHECK (
      is_admin_or_manager()
      OR (is_sales() AND "organizationId" = get_current_user_org_id())
    );
  `, '创建 enrollments 策略');

  // 9. 配置 organizations 和 campuses 表 RLS
  console.log('\n📋 配置 organizations/campuses 表 RLS...');

  await executeSql(`ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;`, '启用 organizations 表 RLS');
  await executeSql(`DROP POLICY IF EXISTS organizations_policy ON organizations;`, '清理旧策略');
  await executeSql(`
    CREATE POLICY organizations_policy ON organizations
    FOR ALL
    USING (is_admin_or_manager() OR id = get_current_user_org_id())
    WITH CHECK (is_admin_or_manager());
  `, '创建 organizations 策略');

  await executeSql(`ALTER TABLE campuses ENABLE ROW LEVEL SECURITY;`, '启用 campuses 表 RLS');
  await executeSql(`DROP POLICY IF EXISTS campuses_policy ON campuses;`, '清理旧策略');
  await executeSql(`
    CREATE POLICY campuses_policy ON campuses
    FOR ALL
    USING (
      is_admin_or_manager()
      OR id = get_current_user_campus_id()
      OR "organizationId" = get_current_user_org_id()
    )
    WITH CHECK (is_admin_or_manager());
  `, '创建 campuses 策略');

  console.log('\n========================================');
  console.log('  ✅ RLS 配置完成！');
  console.log('========================================\n');

  console.log('📝 已配置的表:');
  console.log('   - users (行级隔离)');
  console.log('   - classes (按角色/校区/教师)');
  console.log('   - students (按角色/校区/教师)');
  console.log('   - leads (按机构)');
  console.log('   - schedules (按角色/校区/教师)');
  console.log('   - attendances (按角色/教师)');
  console.log('   - enrollments (按角色/教师/机构)');
  console.log('   - organizations (按角色/机构)');
  console.log('   - campuses (按角色/校区/机构)\n');

  console.log('⚠️  注意事项:');
  console.log('   1. service_role key 可以绕过 RLS');
  console.log('   2. 后端 API 使用 service_role key，不受 RLS 限制');
  console.log('   3. 前端直接访问数据库时，RLS 会生效');
  console.log('   4. 建议测试不同角色的数据访问\n');

  await pool.end();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ 配置失败:', error);
    pool.end();
    process.exit(1);
  });
