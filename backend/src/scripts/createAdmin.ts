/**
 * 创建系统管理员账户
 *
 * 使用方法：
 * npm run create-admin <email> <password> [name]
 *
 * 示例：
 * npm run create-admin buzzerwupeidong@qq.com 123456
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// 加载环境变量
dotenv.config();

const memfireUrl = process.env.MEMFIRE_URL;
const memfireServiceKey = process.env.MEMFIRE_SERVICE_ROLE_KEY;

if (!memfireUrl || !memfireServiceKey) {
  console.error('❌ 缺少环境变量: MEMFIRE_URL 和 MEMFIRE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// 创建 Admin 客户端
const memfire = createClient(memfireUrl, memfireServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createAdmin(email: string, password: string, name: string) {
  console.log('========================================');
  console.log('  创建系统管理员账户');
  console.log('========================================\n');

  console.log('📧 邮箱:', email);
  console.log('👤 姓名:', name);
  console.log('');

  try {
    // 1. 创建 MemFire Auth 用户
    console.log('🔐 创建 Auth 用户...');
    const { data: authData, error: authError } = await memfire.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (authError) {
      if (authError.message.includes('already exists')) {
        console.error('❌ 邮箱已被注册');
      } else {
        console.error('❌ 创建 Auth 用户失败:', authError.message);
      }
      process.exit(1);
    }

    console.log('✓ Auth 用户创建成功，ID:', authData.user.id);

    // 2. 在 users 表中创建记录
    console.log('📊 创建 users 表记录...');
    const { error: userError } = await memfire
      .from('users')
      .insert({
        id: authData.user.id,
        email: authData.user.email,
        name,
        password: 'memfire_auth',
        role: 'admin',
        organizationId: null,
        campusId: null,
        isActive: true,
      });

    if (userError) {
      console.error('❌ 创建 users 记录失败:', userError.message);
      await memfire.auth.admin.deleteUser(authData.user.id);
      process.exit(1);
    }

    console.log('✓ users 表记录创建成功\n');

    console.log('========================================');
    console.log('  ✅ 管理员账户创建成功！');
    console.log('========================================\n');
    console.log('📋 登录信息：');
    console.log('   邮箱:', email);
    console.log('   密码:', password);
    console.log('   姓名:', name);
    console.log('   角色: admin (系统管理员)\n');

  } catch (error: any) {
    console.error('❌ 创建失败:', error.message);
    process.exit(1);
  }
}

const email = process.argv[2];
const password = process.argv[3] || '123456';
const name = process.argv[4] || '系统管理员';

if (!email) {
  console.error('❌ 请提供邮箱地址');
  console.log('\n使用方法: npm run create-admin <email> [password] [name]');
  process.exit(1);
}

createAdmin(email, password, name);
