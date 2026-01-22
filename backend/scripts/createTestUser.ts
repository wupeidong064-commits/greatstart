/**
 * 快速创建测试用户脚本
 * 使用方法: tsx scripts/createTestUser.ts
 * 
 * 注意：需要先配置数据库并运行迁移
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    console.log('开始创建测试用户...');

    // 创建测试机构
    let org = await prisma.organization.findFirst({
      where: { code: 'TEST001' },
    });

    if (!org) {
      org = await prisma.organization.create({
        data: {
          name: '测试机构',
          code: 'TEST001',
          address: '测试地址',
          phone: '13800138000',
        },
      });
      console.log('✅ 创建测试机构:', org.name);
    }

    // 创建管理员用户
    const adminEmail = 'admin@buzzersteam.com';
    let admin = await prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (!admin) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      admin = await prisma.user.create({
        data: {
          email: adminEmail,
          password: hashedPassword,
          name: '系统管理员',
          role: 'admin',
          isActive: true,
        },
      });
      console.log('✅ 创建管理员账户');
    } else {
      console.log('ℹ️  管理员账户已存在');
    }

    // 创建机构管理员
    const managerEmail = 'manager@test.com';
    let manager = await prisma.user.findUnique({
      where: { email: managerEmail },
    });

    if (!manager) {
      const hashedPassword = await bcrypt.hash('manager123', 10);
      manager = await prisma.user.create({
        data: {
          email: managerEmail,
          password: hashedPassword,
          name: '机构管理员',
          role: 'manager',
          organizationId: org.id,
          isActive: true,
        },
      });
      console.log('✅ 创建机构管理员账户');
    }

    console.log('\n📋 测试账户信息:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👤 管理员账户:');
    console.log('   邮箱: admin@buzzersteam.com');
    console.log('   密码: admin123');
    console.log('   角色: admin (系统管理员)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👤 机构管理员账户:');
    console.log('   邮箱: manager@test.com');
    console.log('   密码: manager123');
    console.log('   角色: manager (机构管理员)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n⚠️  请登录后立即修改密码！');

  } catch (error: any) {
    console.error('❌ 创建测试用户失败:', error.message);
    if (error.message.includes('connect') || error.message.includes('DATABASE_URL')) {
      console.error('\n💡 提示:');
      console.error('1. 请确保PostgreSQL数据库已启动');
      console.error('2. 请检查 backend/.env 文件中的 DATABASE_URL 配置');
      console.error('3. 请先运行: npm run prisma:migrate -- --name init');
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();

