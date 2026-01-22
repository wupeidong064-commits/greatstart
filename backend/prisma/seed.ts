import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('开始初始化数据库...');

  // 创建测试机构
  const organization = await prisma.organization.upsert({
    where: { code: 'TEST001' },
    update: {},
    create: {
      name: '测试体育培训机构',
      code: 'TEST001',
      address: '测试地址',
      phone: '13800138000',
      email: 'test@example.com',
    },
  });

  console.log('✓ 机构创建成功:', organization.name);

  // 创建测试校区
  const campus = await prisma.campus.upsert({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: 'CAMPUS001',
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: '主校区',
      code: 'CAMPUS001',
      address: '主校区地址',
      phone: '13800138001',
    },
  });

  console.log('✓ 校区创建成功:', campus.name);

  // 创建管理员账户
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: adminPassword,
      name: '系统管理员',
      role: 'admin',
    },
  });

  console.log('✓ 管理员账户创建成功:', admin.email);

  // 创建机构管理员账户
  const managerPassword = await bcrypt.hash('manager123', 10);
  const manager = await prisma.user.upsert({
    where: { email: 'manager@example.com' },
    update: {},
    create: {
      email: 'manager@example.com',
      password: managerPassword,
      name: '机构管理员',
      role: 'manager',
      organizationId: organization.id,
      campusId: campus.id,
    },
  });

  console.log('✓ 机构管理员账户创建成功:', manager.email);

  // 创建教练账户
  const teacherPassword = await bcrypt.hash('teacher123', 10);
  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@example.com' },
    update: {},
    create: {
      email: 'teacher@example.com',
      password: teacherPassword,
      name: '张教练',
      role: 'teacher',
      organizationId: organization.id,
      campusId: campus.id,
    },
  });

  console.log('✓ 教练账户创建成功:', teacher.email);

  // 创建前台账户
  const staffPassword = await bcrypt.hash('staff123', 10);
  const staff = await prisma.user.upsert({
    where: { email: 'staff@example.com' },
    update: {},
    create: {
      email: 'staff@example.com',
      password: staffPassword,
      name: '前台工作人员',
      role: 'staff',
      organizationId: organization.id,
      campusId: campus.id,
    },
  });

  console.log('✓ 前台账户创建成功:', staff.email);

  console.log('\n数据库初始化完成！');
  console.log('\n测试账户信息：');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('系统管理员:');
  console.log('  邮箱: admin@example.com');
  console.log('  密码: admin123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('机构管理员:');
  console.log('  邮箱: manager@example.com');
  console.log('  密码: manager123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('教练:');
  console.log('  邮箱: teacher@example.com');
  console.log('  密码: teacher123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('前台:');
  console.log('  邮箱: staff@example.com');
  console.log('  密码: staff123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

