/**
 * QA 演示数据补充第二批：窗口期内入班的两名学员（新招数在两期可见变化）。只增不删，可重复执行。
 * 启蒙学员7：-12 天前（上期窗口内）入班；精英学员6：-5 天前（本期窗口内）入班。
 */
import 'dotenv/config';
import p from '../src/config/database';
import { submitScheduleAttendance } from '../src/services/scheduleAttendanceService';

const ORG = 'c3011f06-a1bb-4b64-8de3-78ce26d42be0';
const CAMPUS = 'ea971897-58ea-443f-ac00-4a9dbe510190';

const at = (base: Date, addDays: number, hour: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + addDays, hour);

async function main() {
  const dup = await p.student.findFirst({ where: { organizationId: ORG, name: '启蒙学员7' } });
  if (dup) { console.log('第二批已存在，跳过'); return; }

  const today = new Date();
  const classA = await p.class.findFirstOrThrow({ where: { organizationId: ORG, code: 'QA-A' } });
  const classB = await p.class.findFirstOrThrow({ where: { organizationId: ORG, code: 'QA-B' } });
  const chen = await p.user.findFirstOrThrow({ where: { organizationId: ORG, name: '陈教练' } });
  const li = await p.user.findFirstOrThrow({ where: { organizationId: ORG, name: '李教练' } });

  const dA7 = at(today, -12, 10); // 上期窗口内入班
  const dB6 = at(today, -5, 10);  // 本期窗口内入班
  const sA7 = await p.student.create({ data: { organizationId: ORG, campusId: CAMPUS, name: '启蒙学员7', phone: '13902001007', purchasedLessons: 40, remainingLessons: 40, createdAt: dA7, updatedAt: dA7 } });
  const sB6 = await p.student.create({ data: { organizationId: ORG, campusId: CAMPUS, name: '精英学员6', phone: '13902002006', purchasedLessons: 40, remainingLessons: 40, createdAt: dB6, updatedAt: dB6 } });
  await p.enrollment.create({ data: { organizationId: ORG, studentId: sA7.id, classId: classA.id, enrolledAt: dA7, createdAt: dA7, updatedAt: dA7 } });
  await p.enrollment.create({ data: { organizationId: ORG, studentId: sB6.id, classId: classB.id, enrolledAt: dB6, createdAt: dB6, updatedAt: dB6 } });
  // 各带一单成单（金额随窗口变化）
  const dd = (n: number) => new Date(+at(today, n, 9)).toISOString().slice(0, 10);
  await p.conversion.create({ data: { organizationId: ORG, studentId: sA7.id, studentName: '启蒙学员7', contact: '13900000000', courseType: '新单', price: 2400, totalLessons: 24, salesId: chen.id, salesName: '陈教练', conversionDate: dd(-12), paymentStatus: 'paid' } });
  await p.conversion.create({ data: { organizationId: ORG, studentId: sB6.id, studentName: '精英学员6', contact: '13900000000', courseType: '新单', price: 3000, totalLessons: 30, salesId: li.id, salesName: '李教练', conversionDate: dd(-5), paymentStatus: 'paid' } });

  // 签到（入班之后的场次才签）
  const actor = { id: (await p.user.findFirstOrThrow({ where: { organizationId: ORG, role: 'admin' } })).id, role: 'admin', organizationId: ORG, campusId: CAMPUS };
  const schedsA = await p.schedule.findMany({ where: { classId: classA.id }, orderBy: { startTime: 'asc' } });
  const schedsB = await p.schedule.findMany({ where: { classId: classB.id }, orderBy: { startTime: 'asc' } });
  const sign = (sid: string, sid7: string, status: string) => submitScheduleAttendance(actor, sid, [{ studentId: sid7, status }]);
  // A7：入班日 -12 → 可签 -11,-9（上期）与 -6,-4,-2,0（本期）
  await sign(schedsA[1].id, sA7.id, 'present');
  await sign(schedsA[2].id, sA7.id, 'late');
  await sign(schedsA[3].id, sA7.id, 'present');
  await sign(schedsA[4].id, sA7.id, 'present');
  await sign(schedsA[5].id, sA7.id, 'present');
  await sign(schedsA[6].id, sA7.id, 'present');
  // B6：入班日 -5 → 可签 -3 与 0
  await sign(schedsB[4].id, sB6.id, 'present');
  await sign(schedsB[5].id, sB6.id, 'present');

  console.log(JSON.stringify({ added: ['启蒙学员7(-12d)', '精英学员6(-5d)'], conversions: 2, attendances: 8 }));
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => p.$disconnect());
