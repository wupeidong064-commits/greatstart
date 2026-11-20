// Run with node from any directory. Run --oracle first to freeze the independent answers.
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  crypto = require('node:crypto');
const net = require('node:net'),
  assert = require('node:assert/strict'),
  { spawn } = require('node:child_process');
const F = require('./aiHistoryFixture.cjs');
const out = path.resolve(__dirname, '../../docs/acceptance/2026-11-16-ai-history-campus');
const oracleFile = path.join(out, 'expected.json');
const expected = Object.fromEntries(F.ranges.map(([name, ...args]) => [name, F.expected(...args)]));
const args = process.argv.slice(2);
if (args.join(' ') === '--oracle') {
  fs.writeFileSync(
    oracleFile,
    JSON.stringify(
      {
        version: 1,
        today: '2026-11-16',
        timezone: 'Asia/Shanghai',
        moneyUnit: '分',
        ranges: F.ranges,
        answers: expected,
      },
      null,
      2
    ) + '\n'
  );
  process.exit(0);
}
assert.deepEqual(
  JSON.parse(fs.readFileSync(oracleFile)).answers,
  expected,
  'Source changed after oracle freeze'
);
if (args.length && !(args.length === 2 && args[0] === '--copy' && /^[a-z0-9]{1,20}$/.test(args[1])))
  throw Error('Expected --copy <lowercase suffix>');
const db = 'buzzer_ai_history_v1' + (args.length ? '_' + args[1] : '');
const state = path.join(
  os.homedir(),
  '.local/state/greatstart-ai-history-v1',
  ...(args.length ? [args[1]] : [])
);
const access = JSON.parse(fs.readFileSync(path.join(state, 'access.json')));
const url = 'postgresql://' + encodeURIComponent(os.userInfo().username) + '@127.0.0.1:5432/' + db;
assert.equal(url, access.databaseUrl);
const env = {
  DATABASE_URL: url,
  DATABASE_DIRECT_URL: url,
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  NODE_ENV: 'test',
  AI_PROVIDER: 'mock',
  AI_LIVE_TEST_MODE: '',
  ARK_API_KEY: '',
  GLM_API_KEY: '',
  DOTENV_CONFIG_PATH: '/dev/null',
};
Object.assign(process.env, env);
const WallDate = Date;
require('./aiHistoryClock.cjs');
require('tsx/cjs');
const { runPlannedTools } = require('../src/services/aiTools.ts');
const prisma = require('../src/config/database.ts').default;
const checks = [],
  failures = [],
  observed = {};
function eq(key, got, want) {
  observed[key] = got;
  try {
    assert.deepEqual(got, want);
    checks.push(key);
  } catch {
    failures.push({ key, got, want });
  }
}
const sortRows = (rows) =>
  rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
const cents = (n) => Math.round(n * 100),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server, base;
async function api(route, token, body) {
  const res = await fetch(base + route, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  return { status: res.status, data: json.data };
}
async function fingerprint() {
  const digest = crypto.createHash('sha256');
  // These fixed identifiers come from the fixture schema. Authentication timestamps are outside business data.
  for (const table of [
    'classes',
    'students',
    'schedules',
    'enrollments',
    'attendances',
    'conversions',
    'refunds',
  ]) {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT row_to_json(t)::text AS encoded FROM ' + table + ' t ORDER BY id'
    );
    digest.update(table + '\n');
    for (const { encoded } of rows) digest.update(encoded + '\n');
  }
  return digest.digest('hex');
}
async function run() {
  const before = await fingerprint();
  const socket = net.createServer();
  await new Promise((r) => socket.listen(0, '127.0.0.1', r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  base = 'http://127.0.0.1:' + port;
  server = spawn(
    process.execPath,
    [
      '--require',
      path.join(__dirname, 'aiHistoryClock.cjs'),
      '--require',
      'tsx/cjs',
      'src/index.ts',
    ],
    {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, ...env, PORT: String(port) },
      stdio: 'ignore',
    }
  );
  for (let i = 0; i < 110; i++) {
    try {
      if ((await fetch(base + '/health')).ok) break;
    } catch {}
    await sleep(100);
  }
  const tokens = {};
  for (const key of ['manager', 'controlManager', 'coachA']) {
    const res = await api('/api/auth/login', null, access.accounts[key]);
    assert.equal(res.status, 200);
    tokens[key] = res.data.token;
  }
  const scoped = (outside) => ({
    organizationId: access.organizationId,
    campusId: outside ? access.controlCampusId : access.campusId,
    userId: F.id(outside ? 'controlManager' : 'manager'),
    today: '2026-11-16',
  });
  for (const [key, startDate, endDate, external] of F.ranges) {
    const query = '?' + new URLSearchParams({ startDate, endDate }),
      token = tokens[external ? 'controlManager' : 'manager'];
    const e = expected[key],
      params = { startDate, endDate };
    const cash = await api('/api/cashflow-summary' + query, token),
      attendance = await api('/api/attendances/class-attendance-stats' + query, token);
    const low = await api('/api/attendances/low-attendance-students' + query, token);
    for (const resp of [cash, attendance, low]) assert.equal(resp.status, 200);
    const c = cash.data;
    eq(
      key + '/page/cash',
      [
        c.newSignup.conversions,
        c.renewal.count,
        ...[
          c.newSignup.amount,
          c.renewal.amount,
          c.refund.amount,
          c.totals.grossAmount,
          c.totals.netAmount,
        ].map(cents),
      ],
      [e.signupCount, e.renewalCount, e.signup, e.renewal, e.refund, e.gross, e.net]
    );
    eq(
      key + '/page/attendance',
      attendance.data.reduce(
        ([x, y], r) => [x + r.expectedAttendance, y + r.actualAttendance],
        [0, 0]
      ),
      [e.due, e.arrived]
    );
    eq(
      key + '/page/low',
      sortRows(low.data.map((r) => [r.classId, r.id, r.scheduleCount, r.presentCount])),
      sortRows(e.low.map((p) => [F.id(p.cls), F.id('s' + p.student), p.due, p.arrived]))
    );
    eq(key + '/page/unique-low', new Set(low.data.map((r) => r.id)).size, e.uniqueLow);
    for (const sales of Object.keys(e.sales)) {
      const personal = await api(
        '/api/cashflow-summary' + query + '&staffId=' + F.id(sales),
        token
      );
      assert.equal(personal.status, 200);
      eq(
        key + '/page/sales/' + sales,
        [cents(personal.data.totals.grossAmount), personal.data.totals.netAmount],
        [e.sales[sales], null]
      );
    }
    const evidence = await runPlannedTools(
      scoped(external),
      ['signup_renewal', 'cost_and_income', 'class_attendance', 'low_attendance_students'].map(
        (name) => ({ name, params })
      )
    );
    assert.equal(evidence.length, 4);
    for (const item of evidence) {
      assert.equal(item.error, null, item.error);
      eq(key + '/tool/range/' + item.tool, item.timeRange, { start: startDate, end: endDate });
    }
    const [orders, money, stats, list] = evidence;
    eq(
      key + '/tool/count',
      [orders.totals.新单数, orders.totals.续费单数],
      [e.signupCount, e.renewalCount]
    );
    eq(
      key + '/tool/money',
      ['新签金额', '续费金额', '已通过退费金额', '总成单额', '净成单额'].map((k) =>
        cents(money.totals[k])
      ),
      [e.signup, e.renewal, e.refund, e.gross, e.net]
    );
    eq(
      key + '/tool/attendance',
      [stats.totals.应到, stats.totals.实到, stats.totals.出勤率],
      [e.due, e.arrived, e.due ? Math.round((e.arrived * 100) / e.due) + '%' : '不可计算']
    );
    eq(
      key + '/tool/low',
      sortRows(list.rows.map((r) => [r.姓名, r.班级, r.应到, r.实到])),
      sortRows(e.low.map((p) => [F.students[p.student], F.classes[p.cls][0], p.due, p.arrived]))
    );
    eq(
      key + '/tool/identified-low',
      sortRows(list.rows.map((r) => [r.classId, r.studentId, r.teacherId])),
      sortRows(e.low.map((p) => [F.id(p.cls), F.id('s' + p.student), F.id(F.classes[p.cls][1])]))
    );
    eq(key + '/tool/unique-low', list.totals.去重学员人数, e.uniqueLow);
    const [perf] = await runPlannedTools(scoped(external), [
      { name: 'teacher_performance', params },
    ]);
    assert.equal(perf.error, null, perf.error);
    const staff = external ? ['controlCoach'] : ['coachA', 'coachB'];
    const taught = F.sessions.filter(
      (s) =>
        s.day >= startDate &&
        s.day <= endDate &&
        s.status === 'completed' &&
        (s.cls === 'X') === !!external
    );
    eq(
      key + '/tool/actual-teacher',
      sortRows(
        perf.rows.map((r) => [
          r.teacherId,
          r.老师,
          r.当前负责班级数,
          r.实际授课场次,
          r.应到,
          r.实到,
          r.出勤率,
        ])
      ),
      sortRows(
        staff.map((t) => {
          const { due, arrived } = e.teaching[t] || { due: 0, arrived: 0 };
          return [
            F.id(t),
            F.users[t],
            Object.values(F.classes).filter((c) => c[1] === t).length,
            taught.filter((s) => s.teacher === t).length,
            due,
            arrived,
            due ? Math.round((arrived / due) * 100) : null,
          ];
        })
      )
    );
    const distribution = {};
    for (const r of list.rows) distribution[r.出勤率] = (distribution[r.出勤率] || 0) + 1;
    eq(key + '/tool/distribution', distribution, e.distribution);
    const factDistribution = Object.fromEntries(
      Object.entries(list.totals).flatMap(([k, n]) => {
        const hit = /^出勤率 (\d+)% 的记录数$/.exec(k);
        return hit ? [[hit[1], n]] : [];
      })
    );
    eq(key + '/tool/fact-distribution', factDistribution, e.distribution);
  }
  eq(
    'permissions/other-campus',
    (await api('/api/cashflow-summary?campusId=' + access.controlCampusId, tokens.manager)).status,
    403
  );
  eq(
    'permissions/coach-no-management',
    (await api('/api/cashflow-summary', tokens.coachA)).status,
    403
  );
  const cross = await runPlannedTools(scoped(false), [
    {
      name: 'class_attendance',
      params: { classId: F.id('X'), startDate: '2026-10-01', endDate: '2026-10-31' },
    },
  ]);
  eq('permissions/cross-class', [cross[0].rows, cross[0].totals], [[], {}]);
  const digest = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
  const after = await fingerprint();
  eq('business/rows-preserved', after, before);
  const report = {
    businessSha256: { before, after },
    observed,
    fixture: db,
    clock:
      'HTTP wall clock fixed at 2026-11-16 12:00 Asia/Shanghai; AI tool context 2026-11-16; explicit query windows',
    testedAt: new WallDate().toISOString(),
    oracleSha256: digest(fs.readFileSync(oracleFile)),
    modelCalls: 0,
    passed: checks.length,
    failed: failures.length,
    checks,
    failures,
  };
  fs.writeFileSync(
    path.join(out, args.length ? 'check-' + args[1] + '.json' : 'check.json'),
    JSON.stringify(report, null, 2) + '\n'
  );
  console.log(JSON.stringify({ db, passed: checks.length, failures }));
  if (failures.length) process.exitCode = 1;
}
run()
  .catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) server.kill('SIGTERM');
    await prisma.$disconnect();
  });
