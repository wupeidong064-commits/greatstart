/**
 * 创建标准测试账号脚本
 *
 * 使用方法: npx tsx src/scripts/createTestAccounts.ts
 *
 * 创建的测试账号:
 * - test-admin@buzzer.com (admin)
 * - test-manager@buzzer.com (manager)
 * - test-coach@buzzer.com (coach)
 * - test-sales@buzzer.com (sales)
 *
 * 默认密码: Test123456
 */

import 'dotenv/config';
import { memfireAdmin } from '../config/memfire';

const TEST_ACCOUNTS = [
  {
    email: 'test-admin@buzzer.com',
    password: 'Test123456',
    name: '测试管理员',
    role: 'admin',
  },
  {
    email: 'test-manager@buzzer.com',
    password: 'Test123456',
    name: '测试经理',
    role: 'manager',
  },
  {
    email: 'test-coach@buzzer.com',
    password: 'Test123456',
    name: '测试教练',
    role: 'coach',
  },
  {
    email: 'test-sales@buzzer.com',
    password: 'Test123456',
    name: '测试销售',
    role: 'sales',
  },
];

async function getOrganizationId(): Promise<string> {
  // 获取第一个机构
  const { data: orgs, error } = await memfireAdmin
    .from('organizations')
    .select('id, name')
    .limit(1);

  if (error || !orgs || orgs.length === 0) {
    throw new Error('未找到机构，请先创建机构');
  }

  console.log(`使用机构: ${orgs[0].name} (${orgs[0].id})`);
  return orgs[0].id;
}

async function createTestAccount(
  email: string,
  password: string,
  name: string,
  role: string,
  organizationId: string
): Promise<{ success: boolean; message: string; id?: string }> {
  try {
    // 1. 检查用户是否已存在
    const { data: existingUser } = await memfireAdmin
      .from('users')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      return { success: true, message: `账号已存在: ${email}`, id: existingUser.id };
    }

    // 2. 在 MemFire Auth 中创建用户
    const { data: authData, error: authError } = await memfireAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (authError) {
      if (authError.message.includes('already exists')) {
        // Auth 用户已存在，尝试查找并关联
        const { data: userList } = await memfireAdmin.auth.admin.listUsers();
        const existingAuth = userList?.users?.find((u) => u.email === email);

        if (existingAuth) {
          // 更新 users 表
          const { error: updateError } = await memfireAdmin
            .from('users')
            .upsert({
              id: existingAuth.id,
              email,
              name,
              role,
              organizationId,
              isActive: true,
            });

          if (updateError) {
            return { success: false, message: `更新用户失败: ${updateError.message}` };
          }
          return { success: true, message: `账号已更新: ${email}`, id: existingAuth.id };
        }
      }
      return { success: false, message: `创建 Auth 用户失败: ${authError.message}` };
    }

    // 3. 在 users 表中创建记录
    const { error: userError } = await memfireAdmin.from('users').insert({
      id: authData.user.id,
      email,
      name,
      role,
      organizationId,
      isActive: true,
    });

    if (userError) {
      // 回滚 Auth 用户
      await memfireAdmin.auth.admin.deleteUser(authData.user.id);
      return { success: false, message: `创建用户记录失败: ${userError.message}` };
    }

    return { success: true, message: `账号创建成功: ${email}`, id: authData.user.id };
  } catch (err: any) {
    return { success: false, message: `创建失败: ${err.message}` };
  }
}

async function main() {
  console.log('====================================');
  console.log('开始创建标准测试账号');
  console.log('====================================\n');

  const organizationId = await getOrganizationId();
  console.log('');

  const results: { email: string; success: boolean; message: string }[] = [];

  for (const account of TEST_ACCOUNTS) {
    console.log(`创建 ${account.role} 账号: ${account.email}`);
    const result = await createTestAccount(
      account.email,
      account.password,
      account.name,
      account.role,
      organizationId
    );
    results.push({ email: account.email, ...result });
    console.log(`  -> ${result.message}\n`);
  }

  console.log('====================================');
  console.log('创建结果汇总');
  console.log('====================================');

  const successCount = results.filter((r) => r.success).length;
  console.log(`成功: ${successCount}/${results.length}\n`);

  results.forEach((r) => {
    const icon = r.success ? '✅' : '❌';
    console.log(`${icon} ${r.email}: ${r.message}`);
  });

  console.log('\n------------------------------------');
  console.log('测试账号信息（用于 E2E 测试）:');
  console.log('------------------------------------');
  console.log('ADMIN_EMAIL=test-admin@buzzer.com');
  console.log('ADMIN_PASSWORD=Test123456');
  console.log('MANAGER_EMAIL=test-manager@buzzer.com');
  console.log('MANAGER_PASSWORD=Test123456');
  console.log('COACH_EMAIL=test-coach@buzzer.com');
  console.log('COACH_PASSWORD=Test123456');
  console.log('SALES_EMAIL=test-sales@buzzer.com');
  console.log('SALES_PASSWORD=Test123456');
}

main()
  .then(() => {
    console.log('\n脚本执行完成');
    process.exit(0);
  })
  .catch((err) => {
    console.error('脚本执行失败:', err);
    process.exit(1);
  });
