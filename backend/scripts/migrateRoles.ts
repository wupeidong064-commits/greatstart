import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateRoles() {
  console.log('🚀 开始角色迁移...\n');

  try {
    // 1. 查询所有用户
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    console.log(`📊 找到 ${users.length} 个用户\n`);

    // 2. 统计当前角色分布
    const roleStats: Record<string, number> = {};
    users.forEach(user => {
      roleStats[user.role] = (roleStats[user.role] || 0) + 1;
    });

    console.log('📈 当前角色分布:');
    Object.entries(roleStats).forEach(([role, count]) => {
      console.log(`   ${role}: ${count} 个用户`);
    });
    console.log('');

    // 3. 角色映射规则
    const roleMapping: Record<string, string> = {
      'teacher': 'coach',
    };

    // 4. 执行迁移
    let migratedCount = 0;
    const migrations: Array<{ id: string; email: string; oldRole: string; newRole: string }> = [];

    for (const user of users) {
      const newRole = roleMapping[user.role];
      
      if (newRole && newRole !== user.role) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: newRole },
        });

        migrations.push({
          id: user.id,
          email: user.email,
          oldRole: user.role,
          newRole: newRole,
        });

        migratedCount++;
        console.log(`✅ ${user.email}: ${user.role} → ${newRole}`);
      }
    }

    console.log(`\n🎉 迁移完成！共迁移 ${migratedCount} 个用户\n`);

    // 5. 验证迁移结果
    const updatedUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    const newRoleStats: Record<string, number> = {};
    updatedUsers.forEach(user => {
      newRoleStats[user.role] = (newRoleStats[user.role] || 0) + 1;
    });

    console.log('📊 迁移后角色分布:');
    Object.entries(newRoleStats).forEach(([role, count]) => {
      console.log(`   ${role}: ${count} 个用户`);
    });
    console.log('');

    // 6. 输出迁移详情
    if (migrations.length > 0) {
      console.log('📝 迁移详情:');
      migrations.forEach(m => {
        console.log(`   ${m.email}: ${m.oldRole} → ${m.newRole}`);
      });
      console.log('');
    }

    console.log('✅ 角色迁移成功完成！');

  } catch (error) {
    console.error('❌ 迁移失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateRoles()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
