/**
 * E2E 测试用户设置脚本
 *
 * 使用 MemFire Admin API 创建测试用户，绕过邮箱验证
 */

import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 获取环境变量
const MEMFIRE_URL = process.env.MEMFIRE_URL!;
const MEMFIRE_SERVICE_ROLE_KEY = process.env.MEMFIRE_SERVICE_ROLE_KEY!;

if (!MEMFIRE_URL || !MEMFIRE_SERVICE_ROLE_KEY) {
  console.error('❌ 缺少环境变量: MEMFIRE_URL 或 MEMFIRE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// 创建 MemFire Admin 客户端（使用 service_role key）
const memfireAdmin = createClient(MEMFIRE_URL, MEMFIRE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// 测试用户数据
const TEST_USERS = [
  { id: 'e2e-admin-001', email: 'e2e-admin@test.com', password: 'test123', name: 'E2E测试管理员', role: 'admin' },
  { id: 'e2e-manager-001', email: 'e2e-manager@test.com', password: 'test123', name: 'E2E测试管理者', role: 'manager' },
  { id: 'e2e-coach-001', email: 'e2e-coach1@test.com', password: 'test123', name: 'E2E张教练', role: 'coach' },
  { id: 'e2e-coach-002', email: 'e2e-coach2@test.com', password: 'test123', name: 'E2E李教练', role: 'coach' },
  { id: 'e2e-coach-003', email: 'e2e-coach3@test.com', password: 'test123', name: 'E2E王教练', role: 'coach' },
  { id: 'e2e-sales-001', email: 'e2e-sales1@test.com', password: 'test123', name: 'E2E赵销售', role: 'sales' },
  { id: 'e2e-sales-002', email: 'e2e-sales2@test.com', password: 'test123', name: 'E2E钱销售', role: 'sales' },
];

async function setupE2EUsers() {
  try {
    console.log('🚀 开始设置 E2E 测试用户...\n');

    // 1. 获取或创建测试机构
    let org = await prisma.organization.findFirst({
      where: { code: 'E2E-TEST-ORG' },
    });

    if (!org) {
      org = await prisma.organization.create({
        data: {
          id: 'e2e-org-001',
          name: 'E2E测试机构',
          code: 'E2E-TEST-ORG',
        },
      });
      console.log('✅ 创建测试机构:', org.name);
    } else {
      console.log('ℹ️  测试机构已存在:', org.name);
    }

    // 2. 获取或创建测试校区
    let campus = await prisma.campus.findFirst({
      where: { code: 'E2E-CAMPUS' },
    });

    if (!campus) {
      campus = await prisma.campus.create({
        data: {
          id: 'e2e-campus-001',
          organizationId: org.id,
          name: 'E2E测试校区',
          code: 'E2E-CAMPUS',
        },
      });
      console.log('✅ 创建测试校区:', campus.name);
    } else {
      console.log('ℹ️  测试校区已存在:', campus.name);
    }

    console.log('\n📧 创建 MemFire Auth 用户...\n');

    // 3. 为每个测试用户创建 MemFire Auth 用户和数据库记录
    for (const user of TEST_USERS) {
      try {
        // 3.1 在 MemFire Auth 中创建用户（使用 admin API，绕过邮箱验证）
        const { data: authData, error: authError } = await memfireAdmin.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true, // 自动确认邮箱
          user_metadata: {
            name: user.name,
            role: user.role,
          },
        });

        if (authError) {
          if (authError.message.includes('already been registered')) {
            console.log(`⚠️  Auth 用户已存在: ${user.email}`);
          } else {
            console.error(`❌ 创建 Auth 用户失败 ${user.email}:`, authError.message);
            continue;
          }
        } else {
          console.log(`✅ 创建 Auth 用户: ${user.email} (ID: ${authData.user.id})`);
        }

        // 3.2 在数据库 users 表中创建/更新记录（确保 ID 与 Auth 用户一致）
        const authUserId = authData?.user?.id || user.id;

        const existingUser = await prisma.user.findUnique({
          where: { id: authUserId },
        });

        if (existingUser) {
          // 更新现有用户
          await prisma.user.update({
            where: { id: authUserId },
            data: {
              email: user.email,
              name: user.name,
              role: user.role as any,
              organizationId: org.id,
              campusId: campus.id,
            },
          });
          console.log(`✅ 更新数据库用户: ${user.name}`);
        } else {
          // 创建新用户
          await prisma.user.create({
            data: {
              id: authUserId,
              email: user.email,
              name: user.name,
              role: user.role as any,
              organizationId: org.id,
              campusId: campus.id,
            },
          });
          console.log(`✅ 创建数据库用户: ${user.name}`);
        }

      } catch (dbError: any) {
        console.error(`❌ 处理用户 ${user.email} 时出错:`, dbError.message);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 E2E 测试账号信息:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    for (const user of TEST_USERS) {
      console.log(`👤 ${user.name}`);
      console.log(`   邮箱: ${user.email}`);
      console.log(`   密码: ${user.password}`);
      console.log(`   角色: ${user.role}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
    console.log('\n✅ E2E 测试用户设置完成！\n');

  } catch (error: any) {
    console.error('❌ 设置失败:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

setupE2EUsers();
