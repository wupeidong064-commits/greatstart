import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { writeFileSync, chmodSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const credentials: Array<{ account: string; password: string }> = [];

/** 生产模式直接拒绝执行测试造数。正式开通请走 npm run init:admin。 */
function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '拒绝执行：NODE_ENV=production 下测试造数被禁止。正式开通请使用 npm run init:admin。'
    );
    process.exit(1);
  }
}

/** 每次运行生成独立随机口令（base64url，20 字符）。 */
function randomPassword(): string {
  return randomBytes(15).toString('base64url');
}

async function main() {
  assertNotProduction();
  console.log('开始初始化测试造数（仅限开发/隔离测试库）...');

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
  const adminPasswordPlain = randomPassword();
  const adminPassword = await bcrypt.hash(adminPasswordPlain, 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: { password: adminPassword },
    create: {
      email: 'admin@example.com',
      password: adminPassword,
      name: '系统管理员',
      role: 'admin',
    },
  });

  console.log('✓ 管理员账户创建成功:', admin.email);
  credentials.push({ account: admin.email, password: adminPasswordPlain });

  // 创建机构管理员账户
  const managerPasswordPlain = randomPassword();
  const managerPassword = await bcrypt.hash(managerPasswordPlain, 10);
  const manager = await prisma.user.upsert({
    where: { email: 'manager@example.com' },
    update: { password: managerPassword },
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
  credentials.push({ account: manager.email, password: managerPasswordPlain });

  // 创建教练账户
  const teacherPasswordPlain = randomPassword();
  const teacherPassword = await bcrypt.hash(teacherPasswordPlain, 10);
  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@example.com' },
    update: { password: teacherPassword },
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
  credentials.push({ account: teacher.email, password: teacherPasswordPlain });

  // 创建前台账户
  const staffPasswordPlain = randomPassword();
  const staffPassword = await bcrypt.hash(staffPasswordPlain, 10);
  const staff = await prisma.user.upsert({
    where: { email: 'staff@example.com' },
    update: { password: staffPassword },
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
  credentials.push({ account: staff.email, password: staffPasswordPlain });

  console.log('\n数据库初始化完成！');
  console.log('测试账户口令未写入日志。');
  const credPath = join(process.cwd(), 'prisma/.seed-credentials.json');
  writeFileSync(credPath, JSON.stringify({ generatedAt: new Date().toISOString(), credentials }, null, 2));
  chmodSync(credPath, 0o600);
  console.log(`凭证文件: ${credPath}（0600，勿提交）`);
}

main()
  .catch((e) => {
    console.error('初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

