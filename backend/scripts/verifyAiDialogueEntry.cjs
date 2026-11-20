// HISTORICAL positive test for the retired 2026-11-16 chat-entry candidate.
// Current closure verification is verifyAiChatEntryClosed.cjs. Do not treat this as current acceptance.
// Real HTTP + PostgreSQL business writes, exclusively in a newly created disposable database.
const { execFileSync, spawn } = require('node:child_process');
const { randomUUID, randomBytes } = require('node:crypto');
const { userInfo } = require('node:os');
const net = require('node:net');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = 'buzzer_ai_entry_' + randomBytes(6).toString('hex');
const portPG = process.env.AI_ENTRY_TEST_PGPORT || '5432';
const url = 'postgresql://' + encodeURIComponent(userInfo().username) + '@127.0.0.1:' + portPG + '/' + db;
const env = { ...process.env, DATABASE_URL: url, DATABASE_DIRECT_URL: url, JWT_SECRET: randomBytes(32).toString('hex'),
  NODE_ENV: 'test', AI_PROVIDER: 'mock', AI_CHAT_RATE_LIMIT: '100', ARK_API_KEY: '', GLM_API_KEY: '', AI_UPLOAD_DIR: '/tmp/' + db + '/uploads',
  AI_REPORT_DIR: '/tmp/' + db + '/reports' };
const p = new PrismaClient({ datasources: { db: { url } } });
const checks = []; let child, created = false;
const delay = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  execFileSync('createdb', ['-h', '127.0.0.1', '-p', portPG, db]); created = true;
  execFileSync('./node_modules/.bin/prisma', ['migrate', 'deploy'], { cwd: __dirname + '/..', env, stdio: 'pipe' });
  const sock = net.createServer(); await new Promise(r => sock.listen(0, '127.0.0.1', r));
  env.PORT = String(sock.address().port); await new Promise(r => sock.close(r));
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const org = await p.organization.create({ data: { name: '对话录入隔离验收', code: randomUUID() } });
  const outside = await p.organization.create({ data: { name: '其他机构', code: randomUUID() } });
  const campus = await p.campus.create({ data: { name: '校区', code: 'MAIN', organizationId: org.id } });
  const otherCampus = await p.campus.create({ data: { name: '外部', code: 'MAIN', organizationId: outside.id } });
  const password = randomUUID(), hash = await bcrypt.hash(password, 10);
  const makeUser = (role, c, name) => p.user.create({ data: { name, role: role === 'manager' ? 'staff' : role,
    managementLevel: role === 'manager' ? 'manager' : 'none', email: randomUUID() + '@test.local', password: hash, organizationId: c.organizationId, campusId: c.id } });
  const manager = await makeUser('manager', campus, '登记负责人');
  const another = await makeUser('manager', campus, '另一管理员');
  const foreign = await makeUser('manager', otherCampus, '外部管理员');
  await p.aiModelPrice.create({ data: { model: 'mock-recorded-v1', inputMicrosPer1k: 0, outputMicrosPer1k: 0 } });
  for (const c of [campus, otherCampus]) await p.aiCreditAccount.create({ data: { organizationId: c.organizationId, campusId: c.id, balanceMicros: 1000000 } });
  const experience = await p.experienceLesson.create({ data: { organizationId: org.id, studentName: '对话成单小甲', contact: '13900000000', scheduleDate: today, assigneeId: manager.id, assigneeName: manager.name, status: 'completed' } });
  await p.experienceLesson.create({ data: { organizationId: outside.id, studentName: experience.studentName, contact: '13900000099', scheduleDate: today, assigneeId: foreign.id, status: 'completed' } });
  child = spawn(process.execPath, ['dist/index.js'], { cwd: __dirname + '/..', env, stdio: 'ignore' });
  const base = 'http://127.0.0.1:' + env.PORT;
  let up = false;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(base + '/health')).ok) { up = true; break; } } catch {} await delay(150); }
  assert(up, 'isolated backend did not start');
  async function http(method, path, token, body) {
    return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  }
  async function login(user) { const r = await http('POST', '/api/auth/login', null, { email: user.email, password }); assert.equal(r.status, 200); return (await r.json()).data.token; }
  const token = await login(manager), token2 = await login(another), foreignToken = await login(foreign);
  async function chat(content, cid, useToken = token, requestId = randomUUID()) {
    const response = await http('POST', '/api/ai/chat', useToken, { content, requestId, ...(cid ? { conversationId: cid } : {}) });
    const raw = await response.text(); const events = raw.split('\n').filter(x => x.startsWith('data: ')).map(x => JSON.parse(x.slice(6)));
    return { status: response.status, events, text: events.map(x => x.delta || '').join(''), cid: events.find(x => x.conversationId)?.conversationId || cid, raw, requestId };
  }
  const counts = async () => [await p.conversion.count(), await p.student.count(), await p.lessonLog.count(), await p.registrationReceipt.count()];
  let turn = await chat('今天体验课对话成单小甲成单了'); const cid = turn.cid;
  assert.equal(turn.status, 200, turn.raw); assert(turn.text.includes('成交金额'), turn.raw); assert.deepEqual(await counts(), [0, 0, 0, 0]);
  checks.push('literal trial match is tenant-scoped; missing fields produce a draft with zero business writes');
  turn = await chat('金额2800元，20课时，已支付，暂不分班', cid);
  assert(turn.text.includes('确认录入'), turn.raw); assert(turn.text.includes('13900000000')); assert(!turn.text.includes('13900000099')); assert.deepEqual(await counts(), [0, 0, 0, 0]);
  const history = await http('GET', '/api/ai/conversations/' + cid + '/messages', token); assert.equal(history.status, 200);
  assert((await history.json()).data.messages.at(-1).content.includes('当前尚未保存'));
  checks.push('multi-turn supplementation and history reload retain the reviewed payload without saving');
  for (const t of [token2, foreignToken]) assert([403, 404].includes((await chat('确认录入', cid, t)).status));
  assert.deepEqual(await counts(), [0, 0, 0, 0]); checks.push('other users and institutions cannot confirm the owned draft');
  const confirms = await Promise.all(Array.from({ length: 3 }, () => chat('确认录入', cid)));
  assert(confirms.every(x => [200, 409].includes(x.status)), JSON.stringify(confirms));
  turn = confirms.find(x => x.text.includes('已保存新签成单')); assert(turn, JSON.stringify(confirms));
  assert.deepEqual(await counts(), [1, 1, 1, 1]);
  const order = await p.conversion.findFirst(); const student = await p.student.findFirst();
  assert.equal(String(order.price), '2800'); assert.equal(order.totalLessons, 20); assert.equal(order.studentId, student.id);
  assert.equal(student.remainingLessons, 20); assert.equal(student.purchasedLessons, 20);
  assert.equal((await p.experienceLesson.findUnique({ where: { id: experience.id } })).status, 'converted');
  assert.equal(await p.enrollment.count(), 0); assert.equal(await p.payment.count(), 0);
  checks.push('explicit confirmation atomically creates the order, profile, lesson credit and receipt, updates the trial, and does not fabricate a cash receipt');
  const countMessages = await p.aiMessage.count();
  const replay = await chat('确认录入', cid, token, turn.requestId); assert(replay.text.includes('已保存新签成单')); assert.equal(await p.aiMessage.count(), countMessages);
  assert((await chat('确认录入', cid)).text.includes('无需重复录入')); assert.deepEqual(await counts(), [1, 1, 1, 1]);
  checks.push('same-request replay and a repeated confirmation do not duplicate orders, profiles, lesson credits or receipts');
  const full = await p.class.create({ data: { organizationId: org.id, campusId: campus.id, name: '满员测试班', courseType: '英语', code: randomUUID(), capacity: 1 } });
  const occupant = await p.student.create({ data: { organizationId: org.id, campusId: campus.id, name: '满员占位' } });
  await p.enrollment.create({ data: { organizationId: org.id, classId: full.id, studentId: occupant.id } });
  let bad = await chat('录入新签，姓名故障小乙，电话13900000001，金额100元，2课时，已支付，负责人我，班级满员测试班');
  assert(bad.text.includes('确认录入'), bad.raw); const baseline = await counts();
  bad = await chat('确认录入', bad.cid); assert(bad.text.includes('尚未保存'), bad.raw); assert.deepEqual(await counts(), baseline);
  checks.push('a full class rejects confirmation and rolls back profile, order, lesson credit and receipt together');
  let cancel = await chat('录入新签，姓名取消小丙，电话13900000002，金额0元，0课时，未支付，负责人我，暂不分班');
  assert(cancel.text.includes('确认录入'), cancel.raw); cancel = await chat('取消录入', cancel.cid); assert(cancel.text.includes('已取消')); assert.deepEqual(await counts(), baseline);
  checks.push('explicit zero values are reviewed correctly; cancellation does not create business records');
  let revoke = await chat('录入新签，姓名撤权小丁，电话13900000003，金额100元，2课时，已支付，负责人我，暂不分班', null, token2);
  assert(revoke.text.includes('确认录入'), revoke.raw); await p.user.update({ where: { id: another.id }, data: { role: 'staff', managementLevel: 'none' } });
  assert.equal((await chat('确认录入', revoke.cid, token2)).status, 403); assert.deepEqual(await counts(), baseline);
  checks.push('revoking manager privileges between review and confirmation prevents a write');
  const results = { passed: checks.length, checks, database: db, environment: 'disposable PostgreSQL + real HTTP', realModelCalls: 0, liveBusinessWrites: 0, isolatedFixtureOnly: true };
  if (process.env.AI_ENTRY_TEST_OUTPUT) fs.writeFileSync(process.env.AI_ENTRY_TEST_OUTPUT, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results));
})().catch(e => { console.error(e.stack); process.exitCode = 1; }).finally(async () => {
  if (child) { child.kill('SIGTERM'); await Promise.race([new Promise(r => child.once('exit', r)), delay(3000)]); }
  await p.$disconnect();
  if (created) execFileSync('dropdb', ['-h', '127.0.0.1', '-p', portPG, '--if-exists', db]);
});
