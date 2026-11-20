// HTTP requests against an isolated copy of the schema. Never accepts a business database URL.
const { execFileSync, spawn } = require('node:child_process'),
  { randomUUID, randomBytes } = require('node:crypto'),
  { userInfo } = require('node:os'),
  path = require('node:path');
const { PrismaClient } = require('@prisma/client'),
  bcrypt = require('bcryptjs'),
  assert = require('node:assert/strict');
const backend = path.resolve(__dirname, '..'),
  db = 'buzzer_http_' + randomBytes(6).toString('hex'),
  url = 'postgresql://' + encodeURIComponent(userInfo().username) + '@127.0.0.1:5432/' + db;
const env = {
  ...process.env,
  DATABASE_URL: url,
  DATABASE_DIRECT_URL: url,
  JWT_SECRET: randomBytes(48).toString('hex'),
  NODE_ENV: 'test',
  AI_PROVIDER: 'mock',
  };
const p = new PrismaClient({ datasources: { db: { url } } });
let child,
  port,
  created = false;
const password = randomUUID(),
  delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function http(method, route, token, body, expected) {
  const r = await fetch('http://localhost:' + port + route, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => null);
  assert.ok(
    [expected].flat().includes(r.status),
    method +
      ' ' +
      route +
      ' status ' +
      r.status +
      ' expected ' +
      expected +
      ' ' +
      (json?.error?.message || '')
  );
  return json?.data;
}
async function main() {
  const socket = require('node:net').createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  env.PORT = String(port);
  execFileSync('createdb', ['-h', '127.0.0.1', db]);
  created = true;
  execFileSync('./node_modules/.bin/prisma', ['migrate', 'deploy'], { cwd: backend, env, stdio: 'pipe' });
  const org = await p.organization.create({ data: { name: '甲', code: 'A' } }),
    b = await p.organization.create({ data: { name: '乙', code: 'B' } });
  const camp = (o, code) => p.campus.create({ data: { organizationId: o.id, name: code, code } });
  const c = await camp(org, '1'),
    d = await camp(await p.organization.create({data:{name:'丙',code:'C'}}), 'MAIN'),
    e = await camp(b, '1');
  const hash = await bcrypt.hash(password, 10);
  const account = async (role, cmp, extra = {}) =>
    p.user.create({
      data: {
        name: role,
        email: randomUUID() + '@isolated.test',
        role,
        password: hash,
        organizationId: cmp.organizationId,
        campusId: cmp.id,
        ...extra,
      },
    });
  const admin = await account('admin', c),
    mgr = await account('manager', c),
    sales = await account('sales', c),
    foreign = await account('manager', e),
    plat = await account('admin', c, { isPlatformAdmin: true });
  const other = await p.student.create({ data: { name: '乙生', organizationId: b.id, campusId: e.id } });
  const sibling = await p.student.create({
    data: { name: '独立机构学员', organizationId: d.organizationId, campusId: d.id },
  });
  child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: backend,
    env,
    stdio: 'ignore',
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error('backend exited');
    try {
      ready = (await fetch('http://127.0.0.1:' + port + '/health')).ok;
    } catch {}
    if (ready) break;
    await delay(150);
  }
  assert(ready);
  const login = async (u, pw = password) =>
    (await http('POST', '/api/auth/login', null, { email: u.email, password: pw }, 200)).token;
  const a = await login(admin),
    m = await login(mgr),
    sale = await login(sales);
  const teacher = await login(await account('teacher', c));
  const platformToken=await login(await account('admin',c,{isPlatformAdmin:true,campusId:null}));
  const catalog=await http('GET','/api/ai-credits/packages',platformToken,null,200);
  assert.equal(catalog.packages.basic.credits,2000);
  const single=await http('POST','/api/organizations',platformToken,{name:'单机构积分验收',code:'ONE-WALLET'},201);
  const manager=await http('POST','/api/auth/create-manager',platformToken,{organizationId:single.id,name:'积分管理员',email:'wallet@isolated.test'},201);
  const managerToken=await login(manager,manager.defaultPassword);
  const opened=await Promise.all(Array.from({length:5},()=>http('POST','/api/ai-credits/admin/open',platformToken,{organizationId:single.id},201)));
  assert(opened.every(row=>row.id===opened[0].id));
  const accountId=opened[0].id;
  const accountBefore=await p.aiCreditAccount.findUniqueOrThrow({where:{id:accountId}});
  assert.equal(accountBefore.campusId,manager.campusId);
  assert.equal(await p.aiCreditAccount.count({where:{organizationId:single.id}}),1);
  const topup={accountId,packageCode:'basic',reason:'隔离套餐测试',idempotencyKey:randomUUID()};
  await Promise.all(Array.from({length:3},()=>http('POST','/api/ai-credits/admin/topup',platformToken,topup,201)));
  const wallet=await http('GET','/api/ai-credits/account',managerToken,null,200);
  assert.equal((await p.aiCreditAccount.findUniqueOrThrow({where:{id:accountId}})).balanceMicros,20000000);
  assert.equal(wallet.id,accountId);
  await http('POST','/api/ai-credits/admin/open',platformToken,{organizationId:single.id,campusId:c.id},400);
  await http('POST','/api/ai-credits/admin/disable',platformToken,{accountId},200);
  await http('POST','/api/ai-credits/admin/enable',platformToken,{accountId},200);
  assert.equal(await p.aiCreditAccount.count({where:{organizationId:single.id}}),1);
  assert.equal((await p.aiCreditAccount.findUniqueOrThrow({where:{id:accountId}})).balanceMicros,20000000);
  await http('POST','/api/ai-credits/admin/open',managerToken,{organizationId:single.id},403);
  console.log('PASS institution-only wallet open and manager lookup agree; five concurrent opens one account; three topups one credit; restore original account');

  for (const tok of [sale, teacher])
    for (const route of [
      '/api/statistics/weekly-summary',
      '/api/statistics/monthly-summary',
      '/api/attendances/low-attendance-students',
      '/api/attendances/continuous-leave',
      '/api/attendances/class-attendance-stats',
      '/api/honeymoon/students',
      '/api/cashflow-summary',
      '/api/consumption/statistics',
    ])
      await http('GET', route, tok, null, 403);
  console.log('PASS sales and teacher denied schoolwide finance and operating reports by API');
  for (const route of [
    '/api/students/' + sibling.id,
    '/api/students/' + other.id,
    '/api/users/' + foreign.id,
    '/api/users/' + plat.id,
    '/api/organizations/' + b.id,
    '/api/campuses/' + d.id,
  ])
    await http('GET', route, a, null, [403, 404]);
  const staffRows = await http('GET', '/api/users', a, null, 200);
  assert(
    staffRows.length && staffRows.every((u) => u.campusId === c.id && !('password' in u) && u.id !== plat.id)
  );
  await http('PUT', '/api/users/' + sales.id, sale, { role: 'admin' }, 403);
  await http('PUT', '/api/users/' + sales.id, m, { role: 'admin' }, 403);
  await http('POST', '/api/organizations', a, { code: 'BLOCKED', name: '拒绝' }, 403);
  await http(
    'POST',
    '/api/auth/create-staff',
    m,
    { organizationId: b.id, campusId: e.id, role: 'teacher', name: 'other', email: 'x@x.test' },
    403
  );
  console.log(
    'PASS tenant admin bounded across org/campus; no password hash/platform account; no employee privilege escalation'
  );
  for (const route of ['/api/ai/conversations', '/api/ai/diagnostics', '/api/ai/quota'])
    await http('GET', route, sale, null, 403);
  await http('POST', '/mcp', a, {}, 404);
  const student = await http('POST', '/api/students', m, { name: '初始建档', parentPhone: '13912340011', purchasedLessons: 3 }, 201);
  assert.equal(await p.lessonLog.count({ where: { studentId: student.id, type: 'add', lessons: 3 } }), 1);
  await http('PUT', '/api/students/' + student.id, m, { remainingLessons: 88 }, 409);
  await http('DELETE', '/api/students/' + student.id, m, null, 409);
  const par = await http(
    'POST',
    '/api/auth/create-parent',
    m,
    { email: 'parent@isolated.test', name: '家长', phone: '13912340011', studentId: student.id },
    201
  );
  const parent = await login(par, par.defaultPassword);
  await http(
    'POST',
    '/api/auth/create-parent',
    parent,
    { email: 'ghost@isolated.test', studentId: sibling.id },
    403
  );
  await http('GET', '/api/parent/attendances/' + sibling.id, parent, null, [403, 404]);
  await http('GET', '/api/students', parent, null, 403);
  const linked = await http('GET', '/api/parent/students', parent, null, 200);
  assert(linked.some((s) => s.id === student.id));
  const cls = await p.class.create({
    data: { name: '绑定班', code: 'T1', courseType: '阅读', organizationId: org.id, campusId: c.id },
  });
  const start = new Date(),
    end = new Date(start.getTime() + 3600000);
  await p.enrollment.create({
    data: {
      studentId: student.id,
      classId: cls.id,
      organizationId: org.id,
      enrolledAt: new Date(start.getTime() - 86400000),
    },
  });
  const sch = await p.schedule.create({
    data: { organizationId: org.id, campusId: c.id, classId: cls.id, startTime: start, endTime: end },
  });
  const submit = (status) =>
    http(
      'POST',
      '/api/attendances/batch',
      m,
      { scheduleId: sch.id, entries: [{ studentId: student.id, status }] },
      200
    );
  await submit('present');
  await submit('present');
  const taken = await http('GET', '/api/attendances/class/' + cls.id, m, null, 200);
  assert.equal(taken.actualAttendance, 1);
  assert.equal(taken.attendanceRate, 100);
  await submit('leave');
  const summary = await http('GET', '/api/attendances/class/' + cls.id, m, null, 200);
  assert.equal(summary.expectedAttendance, 1);
  assert.equal(summary.attendanceRate, 0);
  await http('GET', '/api/classes/' + cls.id + '/students', teacher, null, 403);
  await http('GET', '/api/classes/' + cls.id + '/students', sale, null, 403);
  const marked = await http('GET', '/api/attendances/classes', m, null, 200);
  assert.equal(marked.find((c) => c.id === cls.id).attendanceRate, 0);
  await http('POST', '/api/enrollments', sale, { studentId: student.id, classId: cls.id }, 403);
  const saleEnrollments = await http('GET', '/api/enrollments', sale, null, 200);
  assert.equal(saleEnrollments.length, 0);
  const enrollment=await p.enrollment.findFirstOrThrow({where:{studentId:student.id,classId:cls.id}});
  const paid=await http('POST','/api/payments',m,{studentId:student.id,enrollmentId:enrollment.id,amount:120,paymentType:'tuition',paymentMethod:'cash',requestId:randomUUID()},201);
  const detail=await http('GET','/api/payments/'+paid.id,m,null,200);
  assert.equal(detail.paidByUser.id,mgr.id);
  assert(!('password' in detail.paidByUser));
  await http('GET','/api/payments/'+paid.id,sale,null,404);
  const refundBody={studentId:student.id,amountToRefund:10,lessonsToRefund:0,reason:'隔离核验',requestId:randomUUID()};
  await http('POST','/api/refunds',m,refundBody,201);
  for(const route of ['/api/refunds','/api/payments','/api/lesson-logs'])assert.deepEqual(await http('GET',route,sale,null,200),[]);
  await http('POST','/api/refunds',sale,{...refundBody,requestId:randomUUID()},404);
  console.log('PASS campus/class attendance matches actual roll call; other student roster, enrollment, payment, refund and lesson history protected');

  const notices = await http('GET', '/api/parent/notifications/' + student.id, parent, null, 200);
  assert.deepEqual(notices.map((n) => n.title).sort(), ['已划课', '课程已安排', '课时已返还'].sort());
  const ledger = await http('GET', '/api/parent/lesson-logs/' + student.id, parent, null, 200);
  assert.equal(ledger.length, 3);
  assert.equal((await http('GET', '/api/parent/students', parent, null, 200))[0].remainingLessons, 3);
  await assert.rejects(() =>
    p.$transaction(async (tx) => {
      await tx.schedule.update({ where: { id: sch.id }, data: { status: 'cancelled' } });
      throw Error('rollback');
    })
  );
  assert.equal(await p.parentNotice.count({ where: { studentId: student.id } }), 3);
  await http('GET', '/api/parent/notifications/' + sibling.id, parent, null, 403);
  await http('DELETE', '/api/auth/parent-bindings/' + par.id + '/' + student.id, m, null, 200);
  await http('GET', '/api/parent/notifications/' + student.id, parent, null, 403);
  await http('POST', '/api/auth/parent-bindings', m, { parentId: par.id, studentId: student.id }, 200);
  console.log(
    'PASS schedule publication, deduction, correction, replay, transactional rollback, parent unlink/relink'
  );
  const nextClass = await p.class.create({
    data: {
      name: '新班',
      code: 'T2',
      courseType: '阅读',
      organizationId: org.id,
      campusId: c.id,
      capacity: 8,
    },
  });
  const original = await p.enrollment.findFirstOrThrow({
    where: { studentId: student.id, classId: cls.id, status: 'active' },
  });
  const transfer = {
    studentId: student.id,
    fromEnrollmentId: original.id,
    fromClassId: cls.id,
    toClassId: nextClass.id,
  };
  // 2026-11 起调班保护报名历史：有未结束场次考勤的报名不得覆盖式转移（见 2026-11-06 修复）。
  await Promise.all([1, 2].map(() => http('POST', '/api/enrollments/transfer', m, transfer, 409)));
  assert.equal(await p.enrollment.count({ where: { studentId: student.id, status: 'active' } }), 1);
  assert.equal(await p.lessonTransfer.count({ where: { studentId: student.id } }), 0);
  // 无考勤历史的报名并发转移必须原子且只成功一次。
  const cleanStudent = await p.student.create({
    data: { name: '调班学生', organizationId: org.id, campusId: c.id, purchasedLessons: 3, remainingLessons: 3 },
  });
  await p.enrollment.create({
    data: { studentId: cleanStudent.id, classId: cls.id, organizationId: org.id },
  });
  const original2 = await p.enrollment.findFirstOrThrow({
    where: { studentId: cleanStudent.id, classId: cls.id, status: 'active' },
  });
  const transfer2 = {
    studentId: cleanStudent.id,
    fromEnrollmentId: original2.id,
    fromClassId: cls.id,
    toClassId: nextClass.id,
  };
  await Promise.all([1, 2].map(() => http('POST', '/api/enrollments/transfer', m, transfer2, 200)));
  assert.equal(await p.enrollment.count({ where: { studentId: cleanStudent.id, status: 'active' } }), 1);
  assert.equal(await p.lessonTransfer.count({ where: { studentId: cleanStudent.id } }), 1);
  assert((await p.enrollment.findUniqueOrThrow({ where: { id: original2.id } })).endedAt);
  assert.equal((await p.student.findUniqueOrThrow({ where: { id: cleanStudent.id } })).remainingLessons, 3);
  console.log('PASS transfer history protection + concurrent transfer is atomic, keeps balance');
  const occupied = await account('coach', c, {phone:'13912340012'});
  const blank = await p.student.create({
    data: { name: '绑定回滚', organizationId: org.id, campusId: c.id, parentPhone:occupied.phone },
  });
  await http(
    'POST',
    '/api/auth/create-parent',
    m,
    { name: '不能复用教练', phone: occupied.phone, studentId: blank.id },
    409
  );
  assert.equal((await p.student.findUniqueOrThrow({ where: { id: blank.id } })).parentPhone, occupied.phone);
  assert.equal(await p.parentStudentLink.count({where:{studentId:blank.id}}),0);
  console.log(
    'PASS parent owns only linked child; failed account create rolls back binding; student ledger protected'
  );
  await p.student.createMany({
    data: Array.from({ length: 130 }, (_, i) => ({
      name: '续费' + i,
      remainingLessons: i % 2,
      organizationId: org.id,
      campusId: c.id,
    })),
  });
  let rows = await http('GET', '/api/students/renewal?page=6&pageSize=20', m, null, 200);
  assert.equal(rows.length, 20);
  await http(
    'POST',
    '/api/auth/change-password',
    sale,
    { oldPassword: password, newPassword: randomUUID() },
    200
  );
  await http('GET', '/api/auth/me', sale, null, 401);
  console.log('PASS renewal page six is populated; password change invalidates previously issued session');
}
(async () => {
  try {
    await main();
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([new Promise((r) => child.once('close', r)), delay(1000)]);
    }
    await p.$disconnect();
    if (created) execFileSync('dropdb', ['--force', '-h', '127.0.0.1', db]);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
