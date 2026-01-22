import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function initAdmin() {
  try {
    console.log('开始创建初始管理员账户...');

    // 检查是否已存在管理员
    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'admin' },
    });

    if (existingAdmin) {
      console.log('管理员账户已存在:', existingAdmin.email);
      return;
    }

    // 创建默认管理员
    const hashedPassword = await bcrypt.hash('admin123', 10);

    const admin = await prisma.user.create({
      data: {
        email: 'admin@buzzersteam.com',
        password: hashedPassword,
        name: '系统管理员',
        role: 'admin',
        isActive: true,
      },
    });

    console.log('✅ 初始管理员账户创建成功！');
    console.log('📧 邮箱: admin@buzzersteam.com');
    console.log('🔑 密码: admin123');
    console.log('⚠️  请登录后立即修改密码！');
  } catch (error: any) {
    console.error('❌ 创建管理员失败:', error.message);
    if (error.message.includes('connect')) {
      console.error('💡 提示: 请确保PostgreSQL数据库已启动并配置正确');
      console.error('💡 请检查 backend/.env 文件中的 DATABASE_URL 配置');
    }
  } finally {
    await prisma.$disconnect();
  }
}

initAdmin();

