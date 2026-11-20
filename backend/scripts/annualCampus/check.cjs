const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { register, id, last } = require('./register.cjs');
const dir = path.resolve(__dirname, '../../../docs/acceptance/2026-11-16-annual-campus');
const load = (k) =>
  JSON.parse(
    fs.readFileSync(path.join(os.homedir(), '.local/state/greatstart-annual-v1', k, 'access.json'))
  );
const save = (file, v) => fs.writeFileSync(path.join(dir, file), JSON.stringify(v, null, 2) + '\n');
async function request(origin, route, token, body) {
  const r = await fetch(origin + '/api/' + route, {
    method: body ? 'POST' : 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw Error(route + ' ' + r.status + ' ' + JSON.stringify(j.error || j.message));
  return j.data;
}
const login = (origin, a) => request(origin, 'auth/login', null, a);
function independent() {
  const r = register(),
    main = id('campus-main'),
    students = new Set(r.student.filter((s) => s.campusId === main).map((s) => s.id));
  const monthly = {};
  for (let i = 0; i < 13; i++) {
    let ym = new Date(Date.UTC(2025, 10 + i, 1)).toISOString().slice(0, 7);
    monthly[ym] = {
      newCount: 0,
      newAmount: 0,
      renewCount: 0,
      renewAmount: 0,
      refund: 0,
      due: 0,
      present: 0,
      sessions: 0,
      consumed: 0,
    };
  }
  for (const x of r.conversion.filter(
    (o) => students.has(o.studentId) && o.approvalStatus === 'confirmed'
  )) {
    const m = monthly[x.conversionDate.slice(0, 7)],
      k = x.courseType === '新签' ? 'new' : 'renew';
    m[k + 'Count']++;
    m[k + 'Amount'] += Number(x.price);
  }
  for (const x of r.refund)
    monthly[x.reviewedAt.toISOString().slice(0, 7)].refund += x.amountToRefund;
  for (const x of r.schedule.filter((s) => s.status === 'completed')) {
    const m = monthly[x.startTime.toISOString().slice(0, 7)];
    m.sessions++;
    const roll = r.enrollment
      .filter(
        (e) =>
          e.classId === x.classId &&
          e.enrolledAt <= x.endTime &&
          (!e.endedAt || e.endedAt > x.endTime)
      )
      .map((e) => e.studentId);
    const marks = r.attendance.filter((a) => a.scheduleId === x.id);
    m.due += new Set([...roll, ...marks.filter((a) => a.isTemporary).map((a) => a.studentId)]).size;
    m.present += marks.filter((a) => ['present', 'late'].includes(a.status)).length;
  }
  for (const l of r.lessonLog.filter((l) => l.type === 'deduct'))
    monthly[l.businessDate.slice(0, 7)].consumed +=
      l.allocations.reduce((n, a) => n + a.amountCents, 0) / 100;
  return monthly;
}
async function verify(copy, origin) {
  const a = load(copy),
    p = new PrismaClient({ datasources: { db: { url: a.databaseUrl } } }),
    audit = { copy, months: {}, isolation: {}, hashes: {}, samples: {} };
  try {
    const oracle = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json')));
    const auth = {};
    for (const [k, account] of Object.entries(a.accounts))
      auth[k] = (await login(origin, account)).token;
    for (const [month, m] of Object.entries(oracle)) {
      const end =
        month === last.slice(0, 7)
          ? last
          : new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0)).toISOString().slice(0, 10);
      const qs = '?startDate=' + month + '-01&endDate=' + end;
      const cash = await request(origin, 'cashflow-summary' + qs, auth.main);
      const att = await request(origin, 'attendances/class-attendance-stats' + qs, auth.main);
      const arr = [
        cash.newSignup.conversions,
        cash.newSignup.amount,
        cash.renewal.count,
        cash.renewal.amount,
        cash.refund.amount,
        cash.totals.netAmount,
        att.reduce((n, r) => n + r.expectedAttendance, 0),
        att.reduce((n, r) => n + r.actualAttendance, 0),
      ];
      const exp = [
        m.newCount,
        m.newAmount,
        m.renewCount,
        m.renewAmount,
        m.refund,
        m.newAmount + m.renewAmount - m.refund,
        m.due,
        m.present,
      ];
      assert.equal(
        att.reduce((n, r) => n + r.scheduleCount, 0),
        m.sessions
      );
      assert.deepEqual(arr, exp, month + ' cash & teaching ' + JSON.stringify({ arr, exp }));
      const consumption =
        await p.$queryRaw`select count(distinct l."scheduleId")::int as sessions,coalesce(sum((item->>'amountCents')::int),0)::int as cents from lesson_logs l cross join lateral jsonb_array_elements(l.allocations) item where l.type='deduct' and l."organizationId"=${a.organizationId} and l."businessDate" between ${month + '-01'} and ${end}`;
      assert.equal(consumption[0].cents, m.consumed * 100);
      const valued = await request(origin, 'consumption/statistics' + qs, auth.main);
      assert.deepEqual(
        [
          valued.actualConsumptionAmount,
          valued.unpricedConsumptionLessons,
          valued.monetaryHistoryComplete,
        ],
        [m.consumed, 0, true]
      );
      audit.months[month] = {
        end,
        actual: arr,
        consumptionCents: consumption[0].cents,
        pageConsumption: valued.actualConsumptionAmount,
      };
    }
    // Independently transcribed cross-year sample from two identified source orders.
    const week = '?startDate=2025-12-29&endDate=2026-01-04';
    const orders = await request(origin, 'cashflow-summary' + week, auth.main);
    const weekRows = await request(origin, 'attendances/class-attendance-stats' + week, auth.main);
    const expectedIds = [
      'ef9ade64-158b-4477-a3f0-2274ca1b4f37',
      '34ad73c1-26bc-492c-a07d-085532e15c01',
    ];
    const signed = await p.conversion.findMany({
      where: { id: { in: expectedIds } },
      orderBy: { conversionDate: 'asc' },
    });
    assert.deepEqual(
      signed.map((o) => [o.studentName, Number(o.price)]),
      [
        ['陶之安', 1520],
        ['周之禾', 1600],
      ]
    );
    assert.deepEqual([orders.newSignup.conversions, orders.totals.netAmount], [2, 3120]);
    const seats = weekRows.reduce(
      ([d, p], r) => [d + r.expectedAttendance, p + r.actualAttendance],
      [0, 0]
    );
    assert.deepEqual(seats, [68, 62]);
    audit.crossYearWeek = {
      start: '2025-12-29',
      end: '2026-01-04',
      orderIds: expectedIds,
      net: 3120,
      due: 68,
      arrived: 62,
    };
    const census = await Promise.all(
      ['student', 'user', 'class'].map((t) => p[t].count({ where: { campusId: a.campusId } }))
    );
    assert.deepEqual(census, a.profile === 'single-v1' ? [150, 12, 20] : [150, 10, 20]);
    audit.census = census;
    for (const [k, tok] of Object.entries(auth)) {
      const scope = await request(origin, 'students?page=1&pageSize=250', tok);
      const names = scope.map((s) => s.name);
      assert.ok(scope.length > 0);
      for (const s of scope) assert.equal(s.campusId, id('campus-' + k));
      const c = await request(
        origin,
        'cashflow-summary?startDate=2026-11-13&endDate=2026-11-13',
        tok
      );
      const r = register();
      const studIds = new Set(
        r.student.filter((s) => s.campusId === id('campus-' + k)).map((s) => s.id)
      );
      const net = r.conversion
        .filter(
          (o) =>
            o.conversionDate === '2026-11-13' &&
            o.approvalStatus === 'confirmed' &&
            studIds.has(o.studentId)
        )
        .reduce((n, o) => n + Number(o.price), 0);
      assert.equal(c.totals.netAmount, net);
      audit.isolation[k] = { returned: names.length, distinctCampus: 1, net };
    }
    const intended =
      await p.$queryRaw`select count(*)::int as invalid from attendances a join schedules s on s.id=a."scheduleId" where not a."isTemporary" and not exists(select 1 from enrollments e where e."studentId"=a."studentId" and e."classId"=s."classId" and e."enrolledAt"<=s."endTime" and (e."endedAt" is null or e."endedAt">s."endTime"))`;
    assert.equal(intended[0].invalid, 0);
    const marks = await p.attendance.findMany({ where: { isTemporary: true } });
    assert(marks.length > 0);
    for (const m of marks) {
      const from = m.notes.split(' ').at(-1);
      const original = await p.attendance.findUniqueOrThrow({
        where: { studentId_scheduleId: { studentId: m.studentId, scheduleId: from } },
      });
      assert.equal(original.status, 'leave');
      assert(original.createdAt < m.createdAt);
    }
    const witness = await p.refund.findUniqueOrThrow({ where: { id: id('refund2') } });
    assert.equal(Number(witness.amountToRefund), witness.lessonsToRefund * 90);
    const transfer = await p.resourceTransfer.findUniqueOrThrow({ where: { id: id('handover') } });
    const old = await p.schedule.findMany({
      where: { classId: id('class1'), status: 'completed' },
      orderBy: { startTime: 'asc' },
    });
    for (const s of old)
      assert.equal(
        s.teacherId,
        s.startTime < transfer.createdAt ? transfer.fromTeacherId : transfer.toTeacherId
      );
    assert.equal(
      (await p.user.findUniqueOrThrow({ where: { id: transfer.fromTeacherId } })).isActive,
      false
    );
    const lost = await p.student.findUniqueOrThrow({ where: { id: id('s3') } });
    assert.equal(lost.status, 'lost');
    for (const n of [2, 3])
      assert.equal(
        await p.attendance.count({
          where: { studentId: id('s' + n), createdAt: { gte: new Date('2026-05-01') } },
        }),
        0
      );
    const noClass = await p.enrollment.count({ where: { studentId: id('s31') } }),
      multi = await p.enrollment.count({ where: { studentId: id('s27'), status: 'active' } });
    assert.equal(noClass, 0);
    assert.equal(multi, 2);
    assert.equal(
      await p.schedule.count({
        where: { classId: id('class19'), startTime: { gte: new Date('2026-09-01') } },
      }),
      0
    );
    assert.equal(
      (await p.conversion.findUniqueOrThrow({ where: { id: id('order4-0') } })).experienceLessonId,
      id('trial4')
    );
    assert.equal(
      await p.conversion.count({ where: { experienceLessonId: id('unconverted0') } }),
      0
    );
    const balances =
      await p.$queryRaw`select count(*)::int as errors from students s join (select "studentId",sum(case when type='add' then lessons else -lessons end) as balance from lesson_logs group by "studentId") l on l."studentId"=s.id where s."remainingLessons"<>balance`;
    assert.equal(balances[0].errors, 0);
    audit.samples = {
      noClass: id('s31'),
      multi: id('s27'),
      transfer: id('s1'),
      churn: id('s3'),
      refund: [witness.id, witness.lessonsToRefund, Number(witness.amountToRefund)],
      makeups: marks.length,
      firstMakeup: marks[0].id,
      handover: transfer.id,
      invalidNormalSeats: 0,
      balanceErrors: 0,
    };
    // Compare actual rows between independently migrated copies; ignore only authentication secrets and login timestamps.
    for (const t of [
      'organizations',
      'campuses',
      'users',
      'classes',
      'students',
      'resource_transfers',
      'experience_lessons',
      'enrollments',
      'schedules',
      'attendances',
      'conversions',
      'refunds',
      'lesson_logs',
    ]) {
      const q = await p.$queryRawUnsafe(
        'select md5(string_agg((to_jsonb(b)' +
          (t === 'users' ? "-'password'-'lastLoginAt'-'updatedAt'" : '') +
          ")::text,'|' order by id)) as hash, count(*)::int as count from " +
          t +
          ' b'
      );
      audit.hashes[t] = q[0];
    }
    save('static-' + copy + '.json', audit);
    return audit;
  } finally {
    await p.$disconnect();
  }
}
async function main() {
  if (process.argv[2] === '--freeze') {
    const target = path.join(dir, 'expected.json');
    fs.writeFileSync(target, JSON.stringify(independent(), null, 2) + '\n', { flag: 'wx' });
    return;
  }
  const base = await verify('base', 'http://127.0.0.1:4372'),
    copy = await verify(
      process.argv[2] || 'flow',
      'http://127.0.0.1:' + require('./runtime.cjs').ports(process.argv[2] || 'flow').backend
    );
  assert.deepEqual(copy.hashes, base.hashes);
  console.log('全年基线双库对账通过', base.census, base.samples);
}
if (require.main === module)
  main().catch((e) => {
    console.error(e.message.slice(0, 2200));
    process.exitCode = 1;
  });
module.exports = { request, login, load, dir, save, verify };
