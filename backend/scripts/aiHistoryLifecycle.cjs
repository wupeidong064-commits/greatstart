// Independent August scenario, with the same lot and reversal representation as normal registration/attendance.
// node backend/scripts/aiHistoryLifecycle.cjs [--copy replay] verifies an already seeded local fixture.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const F = require('./aiHistoryFixture.cjs');
const id = (key) => F.id('august-lifecycle-v1/' + key);
const at = (day, time = '09:00') => new Date('2026-08-' + day + 'T' + time + ':00+08:00');
const stamps = (day, time) => ({ createdAt: at(day, time), updatedAt: at(day, time) });
const scenario = {
  campus: '澄湾八月结课验收校区',
  student: '沈小葵',
  teacher: '顾教练',
  manager: '澄湾验收经理',
  cls: '八月启航班',
};
function localDatabase(access) {
  const url = new URL(access.databaseUrl);
  const match = url.pathname.match(/^\/buzzer_ai_history_v1(?:_([a-z0-9]{1,20}))?$/);
  assert(
    match && url.hostname === '127.0.0.1' && url.port === '5432' && url.protocol === 'postgresql:'
  );
  assert.equal(access.organizationId, F.id('org'));
  return {
    db: match[0].slice(1),
    state: path.join(os.homedir(), '.local/state/greatstart-ai-history-v1', match[1] || ''),
  };
}
function managerAccess(state) {
  // Atomic publication with no overwrite: concurrent and interrupted seeds can reuse the same private login.
  const location = path.join(state, 'lifecycle-access.json');
  if (!fs.existsSync(location)) {
    const temp = location + '.' + crypto.randomUUID();
    fs.writeFileSync(
      temp,
      JSON.stringify({
        email: 'august-manager@history.invalid',
        password: crypto.randomBytes(24).toString('base64url'),
      }) + '\n',
      { mode: 0o600, flag: 'wx' }
    );
    try {
      fs.linkSync(temp, location);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    } finally {
      fs.unlinkSync(temp);
    }
  }
  return JSON.parse(fs.readFileSync(location, 'utf8'));
}
async function seedLifecycle(prisma, access) {
  const { db, state } = localDatabase(access);
  const creds = managerAccess(state);
  const password = await bcrypt.hash(creds.password, 10);
  const teacherPassword = await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 10);
  const organizationId = access.organizationId,
    campusId = id('campus');
  const tenant = { organizationId, campusId },
    studentId = id('student'),
    classId = id('class'),
    teacherId = id('teacher'),
    managerId = id('manager');
  await prisma.$transaction(
    async (t) => {
      const [connected] = await t.$queryRaw`SELECT current_database() AS db`;
      assert.equal(connected.db, db);
      await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('greatstart-history-lifecycle-v1'))`;
      assert.equal(
        (await t.organization.findUniqueOrThrow({ where: { id: organizationId } })).code,
        'AI_HISTORY_V1'
      );
      if (await t.campus.findUnique({ where: { id: campusId } })) {
        const manager = await t.user.findUniqueOrThrow({ where: { id: managerId } });
        assert.equal(manager.campusId, campusId);
        assert.equal(manager.email, creds.email);
        assert(
          await bcrypt.compare(creds.password, manager.password),
          'private login does not match fixture manager'
        );
        return;
      }
      await t.campus.create({
        data: {
          id: campusId,
          organizationId,
          name: scenario.campus,
          code: 'AUG-LIFECYCLE-V1',
          ...stamps('01'),
        },
      });
      await t.aiCreditAccount.create({
        data: { id: id('wallet'), ...tenant, balanceMicros: 1000000 },
      });
      await t.user.create({
        data: {
          id: managerId,
          ...tenant,
          name: scenario.manager,
          email: creds.email,
          password,
          role: 'staff',
          managementLevel: 'manager',
          ...stamps('01'),
        },
      });
      await t.user.create({
        data: {
          id: teacherId,
          ...tenant,
          name: scenario.teacher,
          email: 'august-coach@history.invalid',
          password: teacherPassword,
          role: 'coach',
          managementLevel: 'none',
          ...stamps('01'),
        },
      });
      await t.class.create({
        data: {
          id: classId,
          ...tenant,
          name: scenario.cls,
          code: 'AUG-CLOSED-V1',
          courseType: '综合运动',
          teacherId,
          status: 'completed',
          startDate: at('01'),
          endDate: at('22', '17:00'),
          ...stamps('01'),
          updatedAt: at('22', '17:00'),
        },
      });
      const studentName = scenario.student,
        contact = '00000000000';
      await t.experienceLesson.create({
        data: {
          id: id('trial'),
          organizationId,
          studentName,
          contact,
          classId,
          className: scenario.cls,
          teachingTeacherId: teacherId,
          assigneeId: managerId,
          createdById: managerId,
          scheduleDate: '2026-08-01',
          startTime: '10:00',
          endTime: '11:00',
          status: 'converted',
          convertedAt: '2026-08-02',
          ...stamps('01'),
          updatedAt: at('02'),
        },
      });
      await t.student.create({
        data: {
          id: studentId,
          ...tenant,
          name: studentName,
          phone: contact,
          salesId: managerId,
          status: 'graduated',
          remainingLessons: 0,
          purchasedLessons: 2,
          consumedLessons: 2,
          cardOpenDate: at('02'),
          lastClassDate: at('22'),
          ...stamps('02'),
          updatedAt: at('22', '17:00'),
        },
      });
      await t.conversion.create({
        data: {
          id: id('order'),
          organizationId,
          classId,
          className: scenario.cls,
          studentId,
          studentName,
          contact,
          courseType: '综合运动',
          conversionDate: '2026-08-02',
          price: '120.01',
          totalLessons: 2,
          approvalStatus: 'confirmed',
          paymentStatus: 'paid',
          salesId: managerId,
          salesName: scenario.manager,
          experienceLessonId: id('trial'),
          ...stamps('02'),
        },
      });
      await t.enrollment.create({
        data: {
          id: id('enrollment'),
          organizationId,
          classId,
          studentId,
          enrolledBy: managerId,
          status: 'completed',
          enrolledAt: at('02'),
          endedAt: at('22', '17:00'),
          ...stamps('02'),
          updatedAt: at('22', '17:00'),
        },
      });
      const creditId = id('paid-credit');
      const logBase = { organizationId, studentId, studentName, lessonSource: 'paid' };
      // Current new-signing path records paid source, conversionId and creditAmountCents on the credit itself.
      await t.lessonLog.create({
        data: {
          ...logBase,
          id: creditId,
          operatorId: managerId,
          type: 'add',
          lessons: 2,
          conversionId: id('order'),
          businessDate: '2026-08-02',
          creditAmountCents: 12001,
          notes: '新签入账：' + id('order'),
          ...stamps('02'),
        },
      });
      for (const [day, unit, cents, corrected] of [
        ['08', 0, 6000, false],
        ['15', 1, 6001, true],
        ['22', 1, 6001, false],
      ]) {
        const scheduleId = id('schedule' + day),
          date = '2026-08-' + day;
        await t.schedule.create({
          data: {
            id: scheduleId,
            ...tenant,
            classId,
            teacherId,
            startTime: at(day),
            endTime: at(day, '10:00'),
            status: 'completed',
            ...stamps('02'),
            updatedAt: at(day, '10:01'),
          },
        });
        await t.attendance.create({
          data: {
            id: id('attendance' + day),
            organizationId,
            classId,
            scheduleId,
            studentId,
            status: corrected ? 'leave' : 'present',
            checkedInBy: teacherId,
            checkInTime: at(day, corrected ? '10:10' : '10:01'),
            ...stamps(day, '10:01'),
            updatedAt: at(day, corrected ? '10:10' : '10:01'),
          },
        });
        const common = {
          ...logBase,
          scheduleId,
          businessDate: date,
          operatorId: teacherId,
          lessons: 1,
          allocations: [{ lotId: creditId, start: unit, lessons: 1, amountCents: cents }],
        };
        await t.lessonLog.create({
          data: {
            ...common,
            id: id('deduct' + day),
            type: 'deduct',
            notes: '场次签到扣课',
            ...stamps(day, '10:01'),
          },
        });
        if (corrected)
          await t.lessonLog.create({
            data: {
              ...common,
              id: id('reverse' + day),
              type: 'add',
              reversalOfId: id('deduct' + day),
              notes: '签到更正返还',
              ...stamps(day, '10:10'),
            },
          });
        await t.lessonDeductionRecord.create({
          data: {
            id: id('receipt' + day),
            organizationId,
            classId,
            scheduleId,
            operatorId: teacherId,
            deductionDate: date,
            deductionCount: corrected ? 0 : 1,
            ...stamps(day, '10:01'),
            updatedAt: at(day, corrected ? '10:10' : '10:01'),
          },
        });
      }
    },
    { timeout: 20000 }
  );
}
module.exports = { seedLifecycle };

async function verify() {
  const args = process.argv.slice(2);
  assert(
    !args.length || (args.length === 2 && args[0] === '--copy' && /^[a-z0-9]{1,20}$/.test(args[1]))
  );
  const state = path.join(os.homedir(), '.local/state/greatstart-ai-history-v1', args[1] || '');
  const access = JSON.parse(fs.readFileSync(path.join(state, 'access.json'), 'utf8'));
  const { db } = localDatabase(access);
  assert.equal(db, 'buzzer_ai_history_v1' + (args.length ? '_' + args[1] : ''));
  Object.assign(process.env, {
    DATABASE_URL: access.databaseUrl,
    DATABASE_DIRECT_URL: access.databaseUrl,
    NODE_ENV: 'test',
    DOTENV_CONFIG_PATH: '/dev/null',
    AI_PROVIDER: 'mock',
    ARK_API_KEY: '',
    GLM_API_KEY: '',
  });
  require('tsx/cjs');
  const prisma = require('../src/config/database.ts').default;
  const { runPlannedTools } = require('../src/services/aiTools.ts');
  const { readLessonLedgers } = require('../src/services/lessonLedger.ts');
  const checks = [];
  function eq(name, actual, expected) {
    checks.push({
      name,
      expected,
      actual,
      pass: require('node:util').isDeepStrictEqual(actual, expected),
    });
  }
  try {
    const ctx = {
      organizationId: access.organizationId,
      campusId: id('campus'),
      userId: id('manager'),
      today: '2026-11-16',
    };
    const student = await prisma.student.findUniqueOrThrow({ where: { id: id('student') } });
    const manager = await prisma.user.findUniqueOrThrow({ where: { id: id('manager') } });
    const creds = managerAccess(state);
    eq(
      'isolated campus manager credentials and scope',
      [
        manager.campusId,
        manager.managementLevel,
        await bcrypt.compare(creds.password, manager.password),
      ],
      [ctx.campusId, 'manager', true]
    );
    const trial = await prisma.experienceLesson.findUniqueOrThrow({
      where: { id: id('trial') },
      include: { conversions: true },
    });
    const order = trial.conversions[0];
    eq(
      'trial converted on August 2, linked to one confirmed paid signing',
      [
        trial.status,
        trial.scheduleDate,
        trial.convertedAt,
        trial.conversions.length,
        order.studentId,
        order.approvalStatus,
        order.paymentStatus,
        Number(order.price),
        order.totalLessons,
      ],
      ['converted', '2026-08-01', '2026-08-02', 1, student.id, 'confirmed', 'paid', 120.01, 2]
    );
    const enrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { id: id('enrollment') },
      include: { class: true },
    });
    eq(
      'historical enrollment ended and class completed',
      [enrollment.class.status, enrollment.status, enrollment.enrolledAt, enrollment.endedAt],
      ['completed', 'completed', at('02'), at('22', '17:00')]
    );
    eq(
      'terminal student balance',
      [student.status, student.purchasedLessons, student.consumedLessons, student.remainingLessons],
      ['graduated', 2, 2, 0]
    );
    const logs = await prisma.lessonLog.findMany({
      where: { studentId: student.id },
      orderBy: { ledgerSequence: 'asc' },
    });
    eq(
      'chronological credit/deduct/correction ledger',
      logs.map((l) => [
        l.type,
        l.businessDate,
        l.lessons,
        l.reversalOfId || null,
        l.allocations?.[0]?.amountCents ?? null,
      ]),
      [
        ['add', '2026-08-02', 2, null, null],
        ['deduct', '2026-08-08', 1, null, 6000],
        ['deduct', '2026-08-15', 1, null, 6001],
        ['add', '2026-08-15', 1, id('deduct15'), 6001],
        ['deduct', '2026-08-22', 1, null, 6001],
      ]
    );
    eq(
      'original priced purchase',
      [logs[0].conversionId, logs[0].lessonSource, Number(logs[0].creditAmountCents)],
      [order.id, 'paid', 12001]
    );
    eq('returned lot/unit was reused', logs[2].allocations, logs[4].allocations);
    eq('saved reversal allocations equal the original', logs[3].allocations, logs[2].allocations);
    const book = (await readLessonLedgers(prisma, [student], ctx.organizationId)).get(student.id);
    eq(
      'production ledger replays cleanly',
      [
        book.reconciliationRequired,
        book.creditDetail(id('paid-credit'))?.remaining,
        book.creditDetail(id('paid-credit'))?.cents,
      ],
      [false, 0, 12001]
    );
    const attend = await prisma.attendance.findMany({
      where: { classId: id('class') },
      orderBy: { createdAt: 'asc' },
      include: { schedule: true },
    });
    eq(
      'attendance state after correction',
      attend.map((a) => [a.schedule.status, a.status]),
      [
        ['completed', 'present'],
        ['completed', 'leave'],
        ['completed', 'present'],
      ]
    );
    const receipts = await prisma.lessonDeductionRecord.findMany({
      where: { classId: id('class') },
      orderBy: { deductionDate: 'asc' },
    });
    eq(
      'per-session deduction receipts',
      receipts.map((r) => r.deductionCount),
      [1, 0, 1]
    );
    const run = (ctx, name, start, end) =>
      runPlannedTools(ctx, [{ name, params: { startDate: start, endDate: end } }]).then(([r]) => {
        assert.equal(r.error, null, name);
        return r;
      });
    for (const [window, start, end, amount] of [
      ['all', '2026-08-01', '2026-08-31', 120.01],
      ['session1', '2026-08-08', '2026-08-08', 60],
      ['corrected', '2026-08-15', '2026-08-15', 0],
      ['final', '2026-08-22', '2026-08-22', 60.01],
      ['next', '2026-09-01', '2026-11-16', 0],
    ]) {
      const result = await run(ctx, 'actual_consumption', start, end);
      eq('actual consumption ' + window, result.totals.实际课消金额, amount);
    }
    const aug = ['2026-08-01', '2026-08-31'];
    const cash = await run(ctx, 'cost_and_income', ...aug);
    eq(
      'new signed / refunds / net cash',
      [cash.totals.新签金额, cash.totals.已通过退费金额, cash.totals.净成单额],
      [120.01, 0, 120.01]
    );
    const net = await run(ctx, 'net_deduction', ...aug);
    eq(
      'dated additions / deductions / reversals / net',
      [net.rows[2].lessons, net.rows[0].lessons, net.rows[1].lessons, net.totals.净扣课],
      [2, 3, 1, 2]
    );
    const four = await run(
      { ...ctx, campusId: access.campusId, userId: F.id('manager') },
      'actual_consumption',
      ...aug
    );
    eq('four seasons cannot see isolated August consumption', four.totals.实际课消金额, 0);
    const output = path.resolve(
      __dirname,
      '../../docs/acceptance/2026-11-16-ai-history-campus',
      'lifecycle-' + (args[1] || 'main') + '.json'
    );
    const failures = checks.filter((c) => !c.pass);
    fs.writeFileSync(
      output,
      JSON.stringify(
        {
          version: 1,
          database: db,
          campus: scenario.campus,
          modelCalls: 0,
          passed: checks.length - failures.length,
          failed: failures.length,
          checks,
        },
        null,
        2
      ) + '\n'
    );
    console.log(JSON.stringify({ db, checks: checks.length, failures }));
    if (failures.length) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
if (require.main === module)
  verify().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
