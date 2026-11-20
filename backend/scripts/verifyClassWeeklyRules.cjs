'use strict';
// 班级时间（常规每周规则）+ 每周排课按班级时间生成：隔离库真实验证。
// 全部数据库/服务操作都发生在新建的隔离库与临时目录中，绝不触碰日常库与人工环境。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { execFileSync, spawn } = require('node:child_process');
const { randomBytes, createHmac } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const backend = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'greatstart-weekly-'));
const database = 'weekly_rules_' + randomBytes(8).toString('hex');
assert.match(database, /^weekly_rules_[0-9a-f]{16}$/);
const pguser = process.env.CORE_TEST_PGUSER || os.userInfo().username;
const pgpassword = process.env.CORE_TEST_PGPASSWORD || '';
const pgport = String(Number(process.env.CORE_TEST_PGPORT || 5432));
const url = `postgresql://${encodeURIComponent(pguser)}${pgpassword ? ':' + encodeURIComponent(pgpassword) : ''}@127.0.0.1:${pgport}/${database}`;
const env = {
  PATH: process.env.PATH, HOME: os.homedir(), TMPDIR: os.tmpdir(),
  PGHOST: '127.0.0.1', PGPORT: pgport, PGUSER: pguser, PGPASSWORD: pgpassword,
  DATABASE_URL: url, DATABASE_DIRECT_URL: url, JWT_SECRET: randomBytes(48).toString('hex'),
  NODE_ENV: 'test', AI_PROVIDER: 'mock', ENABLE_MCP: 'false', ENABLE_SWAGGER: 'false',
  DOTENV_CONFIG_PATH: path.join(scratch, 'no-business-env'),
  ARK_API_KEY: '', GLM_API_KEY: '', };
const db = new PrismaClient({ datasources: { db: { url } } });
const checks = [];
let server, port, created = false, serverOutput = '';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = name => { checks.push(name); console.log(`PASS ${checks.length}: ${name}`); };
const run = (command, args) => execFileSync(command, args, { cwd: scratch, env, stdio: 'pipe', timeout: 180000 });
const migrate = () => run(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(scratch, 'prisma/schema.prisma')]);
const tokenFor = u => jwt.sign({ userId: u.id, sessionTag: createHmac('sha256', env.JWT_SECRET).update(u.password).digest('base64url') }, env.JWT_SECRET, { expiresIn: '1h' });
async function request(method, route, token, body, expected = 200) {
  const response = await fetch(`http://127.0.0.1:${port}/api${route}`, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const json = await response.json();
  assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(json).slice(0, 700)}`);
  return expected >= 400 ? json : json.data;
}
const post = (route, token, body, expected) => request('POST', route, token, body, expected);
const rawPost = (route, token, body) => fetch(`http://127.0.0.1:${port}/api${route}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) }).then(async r => ({ status: r.status, json: await r.json() }));
async function freePort() { const socket = net.createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r)); const p = socket.address().port; await new Promise(r => socket.close(r)); return p; }
const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const shanghai = iso => new Date(new Date(iso).getTime() + 8 * 3600000).toISOString().replace('T', ' ').slice(0, 16);

async function main() {
  run('createdb', [database]); created = true;
  fs.cpSync(path.join(backend, 'prisma'), path.join(scratch, 'prisma'), { recursive: true, dereference: true });
  migrate();
  assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name, database);
  check('隔离库创建并完成全部迁移（含 class_weekly_rules）');

  const org = await db.organization.create({ data: { code: database, name: '班级时间回归机构' } });
  const campus = await db.campus.create({ data: { organizationId: org.id, code: 'MAIN', name: '默认范围' } });
  const otherOrg = await db.organization.create({ data: { code: database + '_other', name: '外部机构' } });
  const otherCampus = await db.campus.create({ data: { organizationId: otherOrg.id, code: 'MAIN', name: '默认范围' } });
  const makeUser = (name, role = 'coach', foreign = false) => db.user.create({ data: { name, email: name + '@weekly.test', password: 'test-only-hash', role, organizationId: foreign ? otherOrg.id : org.id, campusId: foreign ? otherCampus.id : campus.id } });
  const admin = await makeUser('admin', 'admin'), teacher = await makeUser('teacher'), teacher2 = await makeUser('teacher2'), foreign = await makeUser('foreign', 'admin', true);
  const at = tokenFor(admin), ft = tokenFor(foreign);
  await db.course.create({ data: { organizationId: org.id, name: '篮球', code: 'COURSE-BB' } });

  port = await freePort();
  // CWD 是无菌临时目录：dotenv 无法加载业务凭据；隔离库 URL 由环境变量显式注入。
  server = spawn(process.execPath, ['--import', path.join(backend, 'node_modules/tsx/dist/loader.mjs'), path.join(backend, 'src/index.ts')], { cwd: scratch, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const pipe of [server.stdout, server.stderr]) pipe.on('data', b => { serverOutput = (serverOutput + b).slice(-14000); });
  let ready = false;
  for (let n = 0; n < 150; n++) { try { const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(300) }); if (r.ok) { ready = true; break; } } catch {} if (server.exitCode !== null) break; await pause(100); }
  assert.ok(ready, '隔离服务未启动: ' + serverOutput.slice(-3000));
  check('隔离服务已启动（真实 HTTP）');

  // ---- 场景1：新建班级（不传 code，带 2 条班级时间规则）----
  const twoRules = [
    { weekday: 2, startTime: '18:00', endTime: '19:00', classroom: 'A101' },
    { weekday: 6, startTime: '10:00', endTime: '11:30', classroom: null },
  ];
  const created1 = await post('/classes', at, { name: '规则一班', courseType: '篮球', capacity: 20, teacherId: teacher.id, weeklyRules: twoRules }, 201);
  assert.match(created1.code, /^CL-/);
  const rulesInDb = await db.classWeeklyRule.findMany({ where: { classId: created1.id }, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] });
  assert.equal(rulesInDb.length, 2);
  assert.deepEqual(rulesInDb.map(r => [r.weekday, r.startTime, r.endTime]), [[2, '18:00', '19:00'], [6, '10:00', '11:30']]);
  assert.equal(await db.schedule.count({ where: { classId: created1.id } }), 0);
  assert.equal(await db.attendance.count({ where: { classId: created1.id } }), 0);
  check('新建班级：code 自动生成、2条规则入库、不产生任何场次');

  // 并发建班 code 唯一
  const concurrent = await Promise.all([1, 2, 3, 4, 5].map(n => post('/classes', at, { name: '并发班' + n, courseType: '篮球', capacity: 10, weeklyRules: [{ weekday: 1, startTime: '09:00', endTime: '10:00' }] }, 201)));
  const codes = concurrent.map(c => c.code);
  assert.equal(new Set(codes).size, 5, '并发建班代码必须唯一: ' + codes.join(','));
  for (const c of concurrent) assert.equal(await db.schedule.count({ where: { classId: c.id } }), 0);
  check('并发建班5个：代码机构内唯一且均不产生场次');

  // 兼容：显式传 code 与 level 仍可接收
  const legacyInput = await post('/classes', at, { name: '兼容班', code: 'OLD-A1', level: '第二阶段', courseType: '篮球', capacity: 8 }, 201);
  assert.equal(legacyInput.code, 'OLD-A1');
  assert.equal(legacyInput.level, '第二阶段');
  check('接口兼容：显式 code 与 level 仍可接收保存（历史语义保留）');

  // 无规则班级
  const noRules = await post('/classes', at, { name: '暂无时间班', courseType: '篮球', capacity: 10, teacherId: teacher.id }, 201);
  assert.deepEqual(noRules.weeklyRules, []);
  const noRulesErr = await post('/schedules/class-rules/preview', at, { classId: noRules.id, startDate: day(3), endDate: day(17) }, 400);
  assert.equal(noRulesErr.error.code, 'NO_CLASS_WEEKLY_RULES');
  check('无规则班级：预览明确拒绝并提示补充班级时间');

  // ---- 场景2：预览与实际场次一致（多时段，含结束日）----
  const previewBody = { classId: created1.id, startDate: day(3), endDate: day(17) };
  const preview1 = await post('/schedules/class-rules/preview', at, previewBody);
  const expectDays = new Set();
  for (let i = 3; i <= 17; i++) {
    const d = new Date(Date.now() + i * 86400000 + 8 * 3600000);
    const weekday = d.getUTCDay();
    if (weekday === 2) expectDays.add(d.toISOString().slice(0, 10) + '|18:00');
    if (weekday === 6) expectDays.add(d.toISOString().slice(0, 10) + '|10:00');
  }
  const gotDays = new Set(preview1.occurrences.map(row => `${row.businessDate}|${shanghai(row.startTime).slice(11, 16)}`));
  assert.deepEqual([...gotDays].sort(), [...expectDays].sort());
  assert.ok(preview1.occurrences.every(row => new Date(row.startTime) > new Date()), '预览场次必须全部在未来');
  assert.equal(preview1.class.id, created1.id);
  assert.equal(preview1.class.teacherId, teacher.id);
  check('预览：周二18:00+周六10:00 与规则逐日一致，且只含未来场次');

  const requestId = crypto.randomUUID();
  const generateBody = { ...previewBody, requestId, expectedClassUpdatedAt: preview1.class.updatedAt };
  const generated = await post('/schedules/class-rules/generate', at, generateBody, 201);
  assert.equal(generated.count, preview1.occurrences.length);
  const dbRows = await db.schedule.findMany({ where: { classId: created1.id, scheduleGroupId: { startsWith: 'classrules-v1:' } }, orderBy: { startTime: 'asc' } });
  assert.equal(dbRows.length, generated.count);
  assert.deepEqual(
    dbRows.map(r => `${shanghai(r.startTime)}|${r.classroom || ''}`),
    preview1.occurrences.map(r => `${shanghai(r.startTime)}|${r.classroom || ''}`),
  );
  assert.ok(dbRows.every(r => r.teacherId === teacher.id), '生成场次必须使用班级负责老师');
  // 结束日包含：范围内最后一个匹配日必须生成
  const lastExpected = [...expectDays].map(s => s.split('|')[0]).sort().pop();
  assert.equal(shanghai(dbRows[dbRows.length - 1].startTime).slice(0, 10), lastExpected);
  check('生成：场次与预览逐场一致（时间/地点/老师），结束日包含，groupId 批次标记');

  // ---- 场景3：重复提交与并发幂等 ----
  const replay = await post('/schedules/class-rules/generate', at, generateBody);
  assert.equal(replay.replayed, true);
  assert.equal(replay.count, generated.count);
  assert.equal(await db.schedule.count({ where: { classId: created1.id } }), generated.count);
  // 网络重试并发：同一 requestId 两个请求同时到达，只能产生一批场次。
  const raceReqId = crypto.randomUUID();
  const raceBody = { classId: created1.id, startDate: day(30), endDate: day(44), requestId: raceReqId, expectedClassUpdatedAt: preview1.class.updatedAt };
  const racePreview = await post('/schedules/class-rules/preview', at, { classId: created1.id, startDate: day(30), endDate: day(44) });
  const race = await Promise.all([rawPost('/schedules/class-rules/generate', at, raceBody), rawPost('/schedules/class-rules/generate', at, raceBody)]);
  race.forEach(row => assert.ok([200, 201].includes(row.status), `同请求并发应成功或重放: ${JSON.stringify(row.json).slice(0, 200)}`));
  const raceCounts = race.map(row => row.json.data?.count);
  assert.deepEqual([...new Set(raceCounts)], [racePreview.occurrences.length], '两响应必须报告同一批次数');
  assert.equal(await db.schedule.count({ where: { classId: created1.id } }), generated.count + racePreview.occurrences.length, '同请求并发不得多建场次');
  // 不同 requestId 再次生成相同范围：精确复用已有场次，不重复创建。
  const reuse = await post('/schedules/class-rules/generate', at, { ...raceBody, requestId: crypto.randomUUID() }, 201);
  assert.equal(reuse.count, racePreview.occurrences.length);
  assert.equal(await db.schedule.count({ where: { classId: created1.id } }), generated.count + racePreview.occurrences.length);
  check('重复提交/并发：同请求并发仅一批，跨请求精确复用，总场次不重复');

  // ---- 场景4：冲突整批回滚 ----
  const classB = await post('/classes', at, { name: '冲突班', courseType: '篮球', capacity: 10, teacherId: teacher.id, weeklyRules: [{ weekday: 2, startTime: '18:30', endTime: '19:30', classroom: 'B01' }] }, 201);
  const previewB = await post('/schedules/class-rules/preview', at, { classId: classB.id, startDate: day(3), endDate: day(17) });
  assert.ok(previewB.conflicts.length > 0, '与规则一班同师同时段应标出冲突');
  const beforeCount = await db.schedule.count();
  const conflictReq = await post('/schedules/class-rules/generate', at, { classId: classB.id, startDate: day(3), endDate: day(17), requestId: crypto.randomUUID(), expectedClassUpdatedAt: previewB.class.updatedAt }, 409);
  assert.equal(conflictReq.error.code, 'SCHEDULE_CONFLICT');
  assert.equal(await db.schedule.count(), beforeCount, '任一场次冲突必须整批回滚');
  check('冲突：预览标注冲突，生成 409 整批回滚，库中无半批数据');

  // ---- 场景5：跨机构权限 ----
  await post('/schedules/class-rules/preview', ft, { classId: created1.id, startDate: day(3), endDate: day(17) }, 403);
  await post('/schedules/class-rules/generate', ft, { classId: created1.id, startDate: day(3), endDate: day(17), requestId: crypto.randomUUID(), expectedClassUpdatedAt: preview1.class.updatedAt }, 403);
  check('跨机构管理员对预览与生成均 403');

  // ---- 场景6：历史保护（老班级 scheduleRule/已有场次/level 不动）----
  const oldClass = await db.class.create({
    data: {
      organizationId: org.id, campusId: campus.id, code: 'LEGACY-01', name: '历史老班', courseType: '篮球',
      capacity: 15, teacherId: teacher2.id, level: '第三阶段',
      scheduleRule: { recurrenceType: 'weekly', startDate: day(-30), endDate: day(30), weekDays: [3], startTime: '15:00', endTime: '16:00', location: '老馆', teacherId: teacher2.id },
    },
  });
  const historical = await db.schedule.create({
    data: { organizationId: org.id, campusId: campus.id, classId: oldClass.id, teacherId: teacher2.id, startTime: new Date(Date.now() + 5 * 86400000), endTime: new Date(Date.now() + 5 * 86400000 + 3600000), classroom: '老馆' },
  });
  const historicalIso = historical.startTime.toISOString();
  await db.enrollment.create({ data: { organizationId: org.id, studentId: (await db.student.create({ data: { name: '历史学员', organizationId: org.id, campusId: campus.id, remainingLessons: 10, purchasedLessons: 10 } })).id, classId: oldClass.id } });
  const updated = await request('PUT', `/classes/${oldClass.id}`, at, {
    name: '历史老班（改名）', teacherId: teacher2.id, courseType: '篮球', capacity: 15,
    weeklyRules: [{ weekday: 3, startTime: '15:00', endTime: '16:00', classroom: '老馆' }],
  });
  assert.deepEqual(updated.weeklyRules.map(r => [r.weekday, r.startTime]), [[3, '15:00']]);
  const afterHist = await db.schedule.findUniqueOrThrow({ where: { id: historical.id } });
  assert.equal(afterHist.startTime.toISOString(), historicalIso);
  assert.equal(afterHist.status, 'scheduled');
  const afterCls = await db.class.findUniqueOrThrow({ where: { id: oldClass.id } });
  assert.deepEqual(afterCls.scheduleRule, oldClass.scheduleRule);
  assert.equal(afterCls.level, '第三阶段');
  check('历史保护：改名+补规则后老场次与 scheduleRule/level 原样保留');

  // ---- 场景7：旧班单次排课 + 补充规则后按班级时间生成 ----
  await post('/schedules', at, { classId: oldClass.id, startTime: `${day(8)}T09:00:00+08:00`, endTime: `${day(8)}T10:00:00+08:00`, classroom: '单次馆' }, 201);
  const previewOld = await post('/schedules/class-rules/preview', at, { classId: oldClass.id, startDate: day(20), endDate: day(40) });
  assert.ok(previewOld.occurrences.length >= 2, '补充规则后应能按规则预览');
  const genOld = await post('/schedules/class-rules/generate', at, { classId: oldClass.id, startDate: day(20), endDate: day(40), requestId: crypto.randomUUID(), expectedClassUpdatedAt: previewOld.class.updatedAt }, 201);
  assert.equal(genOld.count, previewOld.occurrences.length);
  check('旧班级：单次排课可用，补充规则后可按班级时间生成');

  // ---- 场景8：过去日期跳过；范围无未来场次拒绝；参数校验 ----
  const skipPreview = await post('/schedules/class-rules/preview', at, { classId: created1.id, startDate: day(-7), endDate: day(10) });
  assert.ok(skipPreview.skippedPast > 0);
  assert.ok(skipPreview.occurrences.every(row => new Date(row.startTime) > new Date()));
  await post('/schedules/class-rules/preview', at, { classId: created1.id, startDate: day(1), endDate: day(2) }, 400);
  await post('/schedules/class-rules/preview', at, { classId: created1.id, startDate: day(5), endDate: day(3) }, 400);
  const tooLong = await post('/schedules/class-rules/preview', at, { classId: created1.id, startDate: day(1), endDate: day(400) }, 400);
  assert.equal(tooLong.error.code, 'INVALID_TIME');
  const skipGen = await post('/schedules/class-rules/generate', at, { classId: created1.id, startDate: day(-7), endDate: day(10), requestId: crypto.randomUUID(), expectedClassUpdatedAt: skipPreview.class.updatedAt }, 201);
  assert.equal(skipGen.count, skipPreview.occurrences.length);
  check('过去日期跳过（预览/生成口径一致），倒置区间与超跨度拒绝');

  // ---- 场景9：班级时间规则编辑（清空/重叠校验）----
  await request('PUT', `/classes/${created1.id}`, at, { weeklyRules: [] });
  assert.equal(await db.classWeeklyRule.count({ where: { classId: created1.id } }), 0);
  const overlap = await request('PUT', `/classes/${created1.id}`, at, { weeklyRules: [
    { weekday: 1, startTime: '18:00', endTime: '19:00' },
    { weekday: 1, startTime: '18:30', endTime: '20:00' },
  ] }, 400);
  assert.match(overlap.error.message, /不能重叠/);
  assert.equal(await db.classWeeklyRule.count({ where: { classId: created1.id } }), 0, '重叠校验失败不得写入半套规则');
  check('规则编辑：清空生效；同日重叠拒绝且不写半套规则');

  console.log(`\n全部 ${checks.length} 组断言通过（隔离库 ${database}，服务端口 ${port}）`);
}

async function cleanup() {
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await pause(500); server.kill('SIGKILL'); }
  await db.$disconnect().catch(() => {});
  if (created) { try { run('dropdb', ['--if-exists', database]); } catch {} }
  try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {}
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error('FAIL:', error.message);
    if (serverOutput) console.error('server tail:', serverOutput.slice(-2000));
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
})();
