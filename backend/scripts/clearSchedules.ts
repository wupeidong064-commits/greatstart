import prisma from '../src/config/database';
import { Prisma } from '@prisma/client';

async function clearSchedules() {
  try {
    console.log('开始清空排课数据...');
    
    // 1. 删除所有排课记录
    const deletedSchedules = await prisma.schedule.deleteMany({});
    console.log(`✅ 已删除 ${deletedSchedules.count} 条排课记录`);
    
    // 2. 清空所有班级的排课规则
    const updatedClasses = await prisma.class.updateMany({
      data: {
        scheduleRule: Prisma.DbNull,
      },
    });
    console.log(`✅ 已清空 ${updatedClasses.count} 个班级的排课规则`);
    
    console.log('✅ 数据清空完成！');
  } catch (error) {
    console.error('❌ 清空数据失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearSchedules();

