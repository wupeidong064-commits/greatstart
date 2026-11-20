import 'dotenv/config';
import assert from 'node:assert/strict';
import p from '../src/config/database';
import { consumptionController as cc } from '../src/controllers/consumptionController';
import { statisticsController as sc } from '../src/controllers/statisticsController';
import { submitScheduleAttendance as submit } from '../src/services/scheduleAttendanceService';
async function call(fn: any, user: any, query: any = {}) {
  let data: any, error: any;
  await fn(
    { user, body: {}, params: {}, query },
    {
      status() {
        return this;
      },
      json(v: any) {
        data = v;
        return this;
      },
    },
    (e: any) => (error = e)
  );
  if (error) throw error;
  return data?.data;
}
async function main() {
  let org: any;
  const checks: string[] = [];
  try {
    org = await p.organization.create({
      data: { code: 'ISOLATED-CONSUMPTION-' + Date.now(), name: '隔离课消统计' },
    });
    const a = await p.campus.create({ data: { organizationId: org.id, code: 'A', name: 'A' } }),
      b = await p.campus.create({ data: { organizationId: org.id, code: 'B', name: 'B' } });
    const u = await p.user.create({
        data: {
          organizationId: org.id,
          campusId: a.id,
          email: org.code + '@qa.invalid',
          password: 'unused',
          name: 'QA',
          role: 'admin',
        },
      }),
      actor = { id: u.id, organizationId: org.id, campusId: a.id, role: 'admin' };
    const cls = await p.class.create({
        data: {
          organizationId: org.id,
          campusId: a.id,
          code: 'A',
          name: 'A',
          capacity: 10,
          courseType: '篮球',
        },
      }),
      external = await p.class.create({
        data: {
          organizationId: org.id,
          campusId: b.id,
          code: 'B',
          name: '外校区秘密班级',
          courseType: '篮球',
        },
      });
    const students = [];
    for (let i = 0; i < 3; i++) {
      const s = await p.student.create({
        data: {
          organizationId: org.id,
          campusId: a.id,
          name: 'QA' + i,
          phone: '1390000000' + i,
          purchasedLessons: 10,
          remainingLessons: 10,
        },
      });
      students.push(s);
      await p.enrollment.create({
        data: {
          organizationId: org.id,
          classId: cls.id,
          studentId: s.id,
          enrolledAt: new Date(i === 1 ? '2026-11-02T01:00Z' : '2026-10-01T01:00Z'),
          status: i === 2 ? 'cancelled' : 'active',
        },
      });
    }
    const first = await p.schedule.create({
        data: {
          organizationId: org.id,
          campusId: a.id,
          classId: cls.id,
          startTime: new Date('2026-11-01T01:00Z'),
          endTime: new Date('2026-11-01T02:00Z'),
        },
      }),
      second = await p.schedule.create({
        data: {
          organizationId: org.id,
          campusId: a.id,
          classId: cls.id,
          startTime: new Date('2026-11-03T01:00Z'),
          endTime: new Date('2026-11-03T02:00Z'),
        },
      });
    await p.schedule.create({
      data: {
        organizationId: org.id,
        campusId: a.id,
        classId: cls.id,
        startTime: new Date('2026-11-04T01:00Z'),
        endTime: new Date('2026-11-04T02:00Z'),
      },
    });
    await submit(actor, first.id, [{ studentId: students[0].id, status: 'present' }]);
    await submit(actor, second.id, [
      { studentId: students[0].id, status: 'present' },
      { studentId: students[1].id, status: 'late' },
    ]);
    await submit(actor, first.id, [{ studentId: students[0].id, status: 'leave' }]);
    await p.enrollment.updateMany({
      where: { studentId: students[1].id },
      data: { status: 'completed' },
    });
    const query = { startDate: '2026-11-01', endDate: '2026-11-05' };
    const stats = await call(cc.getStatistics, actor, query);
    assert.equal(stats.totalAttendanceCount, 3);
    assert.equal(stats.totalAttendance, 2);
    assert.equal(stats.present, 2);
    assert.equal(stats.attendanceRate, 67);
    assert.equal(stats.completedSchedules, 2);
    assert.equal(stats.baseCount, 1);
    checks.push('逐场次应到含completed报名、排除晚入班/取消与待上课；更正净扣课2');
    assert.equal(stats.totalRevenue, null);
    assert.equal(stats.lessonPrice, null);
    assert.equal(stats.recalled, null);
    assert.equal(stats.deletedRoster, null);
    assert.equal(stats.suspended, null);
    assert.equal(stats.venueUtilizationRate, null);
    checks.push('缺计价依据与历史事件均null不伪0');
    const legacy = await call(sc.getConsumptionStatistics, actor, query);
    assert.equal(legacy.totalAttendance, 2);
    assert.equal(legacy.totalAttendanceCount, 3);
    assert.equal(legacy.attendanceRate, 67);
    checks.push('旧statistics/consumption复用真实公共口径');
    await p.conversion.create({
      data: {
        organizationId: org.id,
        studentId: students[0].id,
        studentName: students[0].name,
        contact: '13900000000',
        conversionDate: '2026-11-01',
        totalLessons: 6,
        price: 600,
        approvalStatus: 'confirmed',
      },
    });
    const priced = await call(cc.getStatistics, actor, query);
    assert.equal(priced.lessonPrice, 100);
    assert.equal(priced.totalRevenue, 200);
    assert.equal(priced.revenueEstimated, true);
    assert.equal(priced.confirmedRevenue, null);
    assert.match(priced.revenueNote, /不是实收/);
    checks.push('确认成单均价仅作为明确估算、核定收入null');
    const changes = await call(cc.getClassStudentChanges, actor, query);
    assert.equal(changes.classes.length, 1);
    assert.equal(changes.classes[0].id, cls.id);
    assert.equal(changes.classes[0].currentStudents, 1);
    assert.equal(changes.classes[0].startStudents, null);
    assert.equal(changes.classes[0].lost, null);
    assert.equal(changes.classes[0].change, null);
    assert.equal(changes.historicalChangesAvailable, false);
    checks.push('班级变化仅当前校区，历史流失净变化不可核定');
    const empty = await call(cc.getStatistics, { ...actor, campusId: b.id }, query);
    assert.equal(empty.attendanceRate, null);
    assert.equal(empty.totalAttendance, 0);
    checks.push('空场次校区真实课消0、无分母出勤率null');
    for (const query of [
      { startDate: '2026-02-30', endDate: '2026-03-01' },
      { startDate: '2026-11-05', endDate: '2026-11-01' },
      { startDate: '2020-01-01', endDate: '2026-11-05' },
    ])
      await assert.rejects(() => call(cc.getStatistics, actor, query));
    await assert.rejects(() =>
      call(cc.getClassStudentChanges, actor, { ...query, campusId: b.id })
    );
    await assert.rejects(() => call(sc.getWeeklySummary, actor, { ...query, useMockData: 'true' }));
    await assert.rejects(() => call(sc.getMonthlySummary, actor, { month: '2026-99' }));
    checks.push('无效/倒序/超长日期、跨校区参数与虚拟周报拒绝');
    const original = p.class.findMany;
    p.class.findMany = (async () => {
      throw new Error('isolated query failure');
    }) as any;
    try {
      await assert.rejects(
        () => call(cc.getClassStudentChanges, actor, query),
        /isolated query failure/
      );
    } finally {
      p.class.findMany = original;
    }
    checks.push('底层查询失败明确抛错不回200空统计');
    console.log(JSON.stringify({ checks, passed: checks.length }, null, 2));
  } finally {
    if (org) {
      await p.lessonDeductionRecord.deleteMany({ where: { organizationId: org.id } });
      await p.user.deleteMany({ where: { organizationId: org.id } });
      await p.organization.delete({ where: { id: org.id } });
    }
    await p.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
