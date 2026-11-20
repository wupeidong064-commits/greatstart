// Permanent chat-write closure: real HTTP in a new disposable database; no live business data.
const { execFileSync, spawn } = require('node:child_process');
const { randomUUID, randomBytes } = require('node:crypto');
const { userInfo } = require('node:os');
const fs = require('node:fs'), net = require('node:net'), assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = 'buzzer_chat_closed_' + randomBytes(6).toString('hex'), pgport = process.env.AI_ENTRY_TEST_PGPORT || '5432';
const url = 'postgresql://' + encodeURIComponent(userInfo().username) + '@127.0.0.1:' + pgport + '/' + db;
const env = { ...process.env, DATABASE_URL: url, DATABASE_DIRECT_URL: url, JWT_SECRET: randomBytes(32).toString('hex'),
  NODE_ENV: 'test', AI_PROVIDER: 'mock', AI_LIVE_TEST_MODE: '', AI_CHAT_RATE_LIMIT: '100', ARK_API_KEY: '', GLM_API_KEY: '',
  AI_UPLOADS_DIR: '/tmp/' + db + '/uploads', AI_REPORTS_DIR: '/tmp/' + db + '/reports' };
const p = new PrismaClient({ datasources: { db: { url } } }), checks = [];
let child, created = false; const nap = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  execFileSync('createdb', ['-h', '127.0.0.1', '-p', pgport, db]); created = true;
  execFileSync('./node_modules/.bin/prisma', ['migrate', 'deploy'], { cwd: __dirname + '/..', env, stdio: 'pipe' });
  const socket = net.createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r)); env.PORT = String(socket.address().port); await new Promise(r => socket.close(r));
  const org = await p.organization.create({ data: { name: '文字录入关闭验证', code: randomUUID() } });
  const campus = await p.campus.create({ data: { organizationId: org.id, name: '隔离校区', code: 'MAIN' } });
  const password = randomUUID(), user = await p.user.create({ data: { organizationId: org.id, campusId: campus.id, name: '隔离管理员', role: 'staff', managementLevel: 'manager', email: randomUUID() + '@test.local', password: await bcrypt.hash(password, 10) } });
  await p.aiCreditAccount.create({ data: { organizationId: org.id, campusId: campus.id, balanceMicros: 1000000 } });
  await p.aiModelPrice.create({ data: { model: 'mock-recorded-v1', inputMicrosPer1k: 0, outputMicrosPer1k: 0 } });
  const conv = await p.aiConversation.create({ data: { ownerUserId: user.id, organizationId: org.id, campusId: campus.id, title: '旧录入草稿' } });
  const legacyRequestId = randomUUID();
  await p.aiMessage.createMany({ data: [
    { conversationId: conv.id, sequence: 1, role: 'user', content: '今天体验课旧草稿学员成单了' },
    { conversationId: conv.id, sequence: 2, role: 'assistant', content: '旧核对表：金额2800元，20课时；确认录入后保存。', requestId: legacyRequestId,
      usageJson: { calls: [], pendingEntry: { id: randomUUID(), kind: 'new_order', status: 'ready', fields: { studentName: '旧草稿学员', contact: '13900000000', price: '2800', totalLessons: 20, conversionDate: '2026-11-16', paymentStatus: 'paid', salesId: user.id, salesName: user.name, unassigned: true } } } },
  ] });
  child = spawn(process.execPath, ['dist/index.js'], { cwd: __dirname + '/..', env, stdio: 'ignore' });
  const base = 'http://127.0.0.1:' + env.PORT;
  let up = false; for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/health')).ok) { up = true; break; } } catch {} await nap(150); }
  assert(up, 'isolated backend unavailable');
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
  assert.equal(login.status, 200); const token = (await login.json()).data.token;
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
  const counts = async () => Promise.all(['conversion', 'student', 'experienceLesson', 'lessonLog', 'enrollment', 'registrationReceipt'].map(n => p[n].count()));
  assert.deepEqual(await counts(), [0, 0, 0, 0, 0, 0]);
  async function chat(content, cid = conv.id, extra = {}) {
    const r = await fetch(base + '/api/ai/chat', { method: 'POST', headers, body: JSON.stringify({ content, conversationId: cid, requestId: randomUUID(), ...extra }) });
    const raw = await r.text(); assert.equal(r.status, 200, raw);
    const events = raw.split('\n').filter(x => x.startsWith('data: ')).map(x => JSON.parse(x.slice(6)));
    assert(events.some(e => e.done), raw); assert(!events.some(e => e.error), raw);
    return { text: events.map(e => e.delta || '').join(''), events };
  }
  for (const text of ['确认录入', '确认', '金额2800元，20课时，已支付', '电话13900000000', '继续录入']) {
    assert((await chat(text)).text.includes('已关闭'), text);
    assert.deepEqual(await counts(), [0, 0, 0, 0, 0, 0]);
  }
  checks.push('old ready draft, confirmation and field supplementation cannot write any business row');
  for (const text of ['帮我登记体验课', '今天体验课张三成单了', '录入新签，姓名张三，电话13900000000，金额2800元，20课时，已支付，负责人我，暂不分班', '把Excel里的学员导入系统', '删除这些学员']) {
    assert((await chat(text)).text.includes('已关闭'), text);
    assert.deepEqual(await counts(), [0, 0, 0, 0, 0, 0]);
  }
  checks.push('new natural-language writes and imports are closed before model or business queries');
  assert((await chat('确认录入', conv.id, { pendingEntry: { status: 'ready', fields: { studentName: '伪造用户', price: 1 } }, action: 'registerOrder', tools: [{ name: 'register_experience' }] })).text.includes('已关闭'));
  checks.push('forged client-side entry state and writer-tool fields are ignored');
  const history = await fetch(base + '/api/ai/conversations/' + conv.id + '/messages', { headers }); const body = await history.json();
  assert(body.data.messages.some(m => m.verificationNotice?.includes('历史录入草稿已失效')));
  assert((await p.aiMessage.findFirst({ where: { requestId: legacyRequestId } })).content.includes('旧核对表'));
  const replay = await chat('重放旧请求', conv.id, { requestId: legacyRequestId });
  assert(replay.events.some(e => e.verificationNotice?.includes('历史录入草稿已失效'))); assert.deepEqual(await counts(), [0, 0, 0, 0, 0, 0]);
  checks.push('history and idempotent replay mark the old draft expired while retaining its original record');
  assert((await chat('你是谁？')).text.includes('不通过聊天录入'));
  assert((await chat('可以帮我导入数据吗？')).text.includes('报告分析资料'));
  checks.push('identity and import guidance no longer advertise business entry');
  const reportConv = await p.aiConversation.create({ data: { ownerUserId: user.id, organizationId: org.id, campusId: campus.id } });
  await p.aiMessage.create({ data: { conversationId: reportConv.id, sequence: 1, role: 'assistant', content: '本月班级结果', evidenceJson: [{
    evidenceId: randomUUID(), tool: 'class_student_changes', title: '班级学员变化监测', unit: '人', caliber: '登记关闭专项隔离快照',
    timeRange: { start: '2026-11-01', end: '2026-11-30' }, generatedAt: new Date().toISOString(), filters: {}, missing: [],
    columns: [{ key: '班级', label: '班级' }, { key: '在读', label: '在读' }], rows: [{ 班级: '隔离样例班', 在读: 2 }], totals: { 活跃班级数: 1 }, error: null,
  }] } });
  const file = (await chat('针对这个做成表格', reportConv.id)).events.find(e => e.fileCard)?.fileCard;
  assert.equal(file?.status, 'ready'); const download = await fetch(base + file.downloadUrl, { headers }); assert.equal(download.status, 200); assert((await download.arrayBuffer()).byteLength > 1000);
  checks.push('authorized snapshot tabulation and real Excel download remain available');
  const data = new FormData(); data.append('file', new Blob(['业务日期,业务事项,金额\n2026-11-16,隔离分析资料,1\n'], { type: 'text/csv' }), '隔离分析资料.csv');
  const uploaded = await fetch(base + '/api/ai/uploads', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: data }); assert.equal(uploaded.status, 200, await uploaded.text());
  assert.deepEqual(await counts(), [0, 0, 0, 0, 0, 0]); checks.push('analysis attachment upload remains available without creating business records');
  const retired = await fetch(base + '/api/import/experiences', { method: 'POST', headers, body: '{}' }); assert.equal(retired.status, 410);
  checks.push('the retired self-service batch import endpoint stays closed');
  const denied = await fetch(base + '/api/experience-lessons', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer bzsk_not_a_write_credential' }, body: '{}' }); assert.equal(denied.status, 401);
  checks.push('an integration-key-shaped token cannot authenticate normal business write endpoints');
  const usage = await p.aiMessage.findMany({ where: { role: 'assistant', requestId: { not: null } }, select: { usageJson: true } });
  assert(usage.every(m => !(m.usageJson?.calls || []).length)); assert.deepEqual(await counts(), [0, 0, 0, 0, 0, 0]);
  checks.push('all closure and retained-feature checks use zero model calls and zero business writes');
  const result = { passed: checks.length, checks, database: db, isolatedFixtureOnly: true, modelCalls: 0, businessWrites: 0 };
  if (process.env.AI_CHAT_CLOSED_OUTPUT) fs.writeFileSync(process.env.AI_CHAT_CLOSED_OUTPUT, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
})().catch(e => { console.error(e.stack); process.exitCode = 1; }).finally(async () => {
  if (child) { child.kill('SIGTERM'); await Promise.race([new Promise(r => child.once('exit', r)), nap(3000)]); }
  await p.$disconnect(); if (created) execFileSync('dropdb', ['-h', '127.0.0.1', '-p', pgport, '--if-exists', db]);
});
