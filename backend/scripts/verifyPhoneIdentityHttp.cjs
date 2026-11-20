// Dedicated temporary database and random HTTP port; never reads the business DB URL.
const { execFileSync, spawn } = require('node:child_process');
const { randomUUID, randomBytes } = require('node:crypto');
const { userInfo } = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const backend = path.resolve(__dirname, '..');
const database = 'buzzer_phone_' + randomBytes(6).toString('hex');
const url = 'postgresql://' + encodeURIComponent(userInfo().username) + '@127.0.0.1:5432/' + database;
const env = { ...process.env, DATABASE_URL: url, DATABASE_DIRECT_URL: url,
  JWT_SECRET: randomBytes(48).toString('hex'), NODE_ENV: 'test', AI_PROVIDER: 'mock',
  };
const p = new PrismaClient({ datasources: { db: { url } } });
const password = randomUUID(), checks = [];
let child, port, created = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function http(method, route, token, body, expected = 200) {
  const response = await fetch('http://127.0.0.1:' + port + '/api' + route, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  assert.ok([expected].flat().includes(response.status), method + ' ' + route + ': ' + response.status + ' expected ' + expected);
  return json.data;
}
const login = async email => (await http('POST', '/auth/login', null, { email, password })).token;
async function main() {
  execFileSync('createdb', ['-h', '127.0.0.1', database]); created = true;
  execFileSync('./node_modules/.bin/prisma', ['migrate', 'deploy'], { cwd: backend, env, stdio: 'pipe' });
  const socket = require('node:net').createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const hash = await bcrypt.hash(password, 10);
  const platform = await p.user.create({ data: { email: 'platform@isolated.test', name: '平台', password: hash, role: 'admin', isPlatformAdmin: true } });
  child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: backend, env: { ...env, PORT: String(port) }, stdio: 'ignore' });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { await fetch('http://127.0.0.1:' + port + '/health'); ready = true; break; } catch { await delay(100); }
  }
  assert.ok(ready, 'isolated backend startup');
  const token = await login(platform.email);
  const org = await http('POST', '/organizations', token, { name: '手机号机构', code: 'PHONE' }, 201);
  const other = await http('POST', '/organizations', token, { name: '外机构', code: 'OTHER' }, 201);
  const campus = await p.campus.findFirstOrThrow({ where: { organizationId: org.id } });
  const outside = await p.campus.findFirstOrThrow({ where: { organizationId: other.id } });
  const create = (route, actor, body, expected = 201) => http('POST', '/auth/' + route, actor, body, expected);
  const manager = await create('create-manager', token, { organizationId: org.id, name: '手机管理员', phone: '+86 138 0000 0001', password });
  assert.equal(manager.phone, '13800000001'); assert.equal(manager.email, null); assert.equal(manager.accountReused, false);
  const managerToken = (await http('POST', '/auth/login-phone', null, { phone: '+86 138 0000 0001', password })).token;
  const users = [];
  for (const [i, role] of ['teacher', 'coach', 'sales', 'staff'].entries()) {
    const account = await create('create-staff', managerToken, { name: role, phone: '1380000000' + (i + 2), role });
    assert.equal(account.email, null); assert.ok(account.defaultPassword.length >= 8);
    assert.equal((await http('POST', '/auth/login-phone', null, { phone: account.phone, password: account.defaultPassword })).user.role, role);
    users.push(account);
  }
  await p.user.update({ where: { id: platform.id }, data: { phone: '13800000009' } });
  assert.equal((await http('POST', '/auth/login-phone', null, { phone: '13800000009', password })).user.isPlatformAdmin, true);
  await http('POST', '/auth/login', null, { phone: manager.phone, password });
  checks.push('teacher/coach/sales/staff/manager手机唯一账号无假邮箱可登录，平台已有手机号也可登录，自动密码随机');
  const old = await create('create-staff', managerToken, { name: '旧邮箱兼容', email: 'old@isolated.test', role: 'coach', password });
  assert.equal(old.phone, null); await login(old.email);
  checks.push('旧邮箱账号仍可创建登录，邮箱与手机号至少一项');
  await create('create-staff', managerToken, { name: '无身份', role: 'coach' }, 400);
  await create('create-staff', managerToken, { name: '重复', phone: '+8613800000002', role: 'coach' }, 409);
  await create('create-staff', managerToken, { name: '假号码', phone: '8613800000006', role: 'coach' }, 400);
  checks.push('手机号正规化后重复拒绝且无身份/无效手机号拒绝');
  const guardian = '13900000001';
  const children = [];
  for (let i = 0; i < 4; i++) children.push(await p.student.create({ data: { organizationId: org.id, campusId: campus.id, name: '孩子' + i, parentPhone: guardian } }));
  const parentBodies = children.slice(0, 2).map(child => ({ name: '家长', phone: guardian, studentId: child.id }));
  const parents = await Promise.all(parentBodies.map(body => create('create-parent', managerToken, body)));
  assert.equal(parents[0].id, parents[1].id);
  const first = parents.find(parent => parent.accountReused === false), reused = parents.find(parent => parent.accountReused === true);
  assert.ok(first.defaultPassword); assert.ok(!('defaultPassword' in reused));
  const storedPassword = (await p.user.findUniqueOrThrow({ where: { id: first.id } })).password;
  const replay = await create('create-parent', managerToken, { ...parentBodies[0], password: 'UntrustedOverwrite99' });
  assert.equal(replay.accountReused, true); assert.ok(!('defaultPassword' in replay));
  assert.equal((await p.user.findUniqueOrThrow({ where: { id: first.id } })).password, storedPassword);
  assert.equal(await p.parentStudentLink.count({ where: { parentId: first.id } }), 2);
  await http('POST', '/auth/login-phone', null, { phone: guardian, password: first.defaultPassword });
  checks.push('并发同号两个孩子复用一个parent，重放不改密码/不返回旧密码，不自动绑定未提交孩子');
  await Promise.all([1, 2, 3].map(() => create('create-parent', managerToken, { name: '家长', phone: guardian, studentId: children[2].id })));
  assert.equal(await p.parentStudentLink.count({ where: { parentId: first.id, studentId: children[2].id } }), 1);
  checks.push('同孩子并发重放仅一条绑定');
  const stranger = await p.student.create({ data: { organizationId: org.id, campusId: campus.id, name: '别家孩子', parentPhone: '13900000002' } });
  const foreign = await p.student.create({ data: { organizationId: other.id, campusId: outside.id, name: '外机构孩子', parentPhone: guardian } });
  await create('create-parent', managerToken, { name: '冒领', phone: guardian, studentId: stranger.id }, 403);
  await create('create-parent', managerToken, { name: '外机构孩子', phone: guardian, studentId: foreign.id }, 403);
  await create('create-parent', token, { organizationId: other.id, name: '跨机构同号', phone: guardian, studentId: foreign.id }, 409);
  const roleChild = await p.student.create({ data: { organizationId: org.id, campusId: campus.id, name: '同员工号', parentPhone: users[0].phone } });
  await create('create-parent', managerToken, { name: '不能把教练变家长', phone: users[0].phone, studentId: roleChild.id }, 409);
  assert.equal(await p.parentStudentLink.count({ where: { parentId: first.id } }), 3);
  checks.push('他人孩子/外机构孩子/跨机构同号/其他角色同号拒绝，无误绑定和权限提升');
  await http('PUT', '/users/' + users[1].id, managerToken, { phone: '+86 ' + users[0].phone, name: '不应改名' }, 409);
  assert.equal((await p.user.findUniqueOrThrow({ where: { id: users[1].id } })).name, 'coach');
  await http('PUT', '/users/' + users[1].id, managerToken, { phone: '' }, 400);
  await http('PUT', '/users/' + first.id, managerToken, { phone: users[0].phone }, 403);
  const foreignStaff = await create('create-staff', token, { organizationId: other.id, phone: '13800000010', role: 'sales', name: '外机构销售' });
  await http('PUT', '/users/' + foreignStaff.id, managerToken, { phone: '13800000011' }, 404);
  await http('PUT', '/users/' + users[1].id, managerToken, { phone: '+86 138 0000 0012' });
  await http('POST', '/auth/login-phone', null, { phone: '13800000012', password: users[1].defaultPassword });
  checks.push('编辑手机号冲突和越权拒绝且不改其他字段，不可移除唯一登录身份；合法改号正规化后可登录');
  await create('applications', null, { organizationName: '手机号申请', contactName: '申请人', phone: '+86 137 0000 0001' }, 202);
  await create('applications', null, { organizationName: '手机号申请重复', contactName: '申请人', phone: '13700000001' }, 202);
  assert.equal(await p.campusApplication.count({ where: { phone: '13700000001', status: 'pending' } }), 1);
  const application = await p.campusApplication.findFirstOrThrow({ where: { phone: '13700000001' } });
  const approval = await http('POST', '/auth/applications/' + application.id + '/review', token, { action: 'approve' });
  assert.equal(approval.email, null); assert.equal(approval.phone, '13700000001');
  const applied = await http('POST', '/auth/login-phone', null, { phone: approval.phone, password: approval.defaultPassword });
  assert.equal(applied.user.role, 'manager'); assert.equal(applied.user.campus.code, 'MAIN');
  checks.push('手机号申请去重，审批手机号一致且邮箱null，创建MAIN管理员并可登录');
  await http('POST', '/auth/register', null, { phone: '13700000002', password }, 403);
  await http('POST', '/auth/register-phone', null, { phone: '13700000002', password }, 403);
  for (const route of ['send-otp', 'verify-otp', 'reset-password']) await create(route, null, { phone: guardian }, 409);
  // Account authentication is local: password rotation invalidates existing sessions.
  const rotate = users[3], rotatedPassword = randomUUID();
  const prior = await http('POST', '/auth/login-phone', null, { phone: rotate.phone, password: rotate.defaultPassword });
  await http('POST', '/auth/change-password', prior.token, { oldPassword: 'wrong-password', newPassword: rotatedPassword }, 400);
  await http('POST', '/auth/change-password', prior.token, { oldPassword: rotate.defaultPassword, newPassword: rotatedPassword });
  await http('GET', '/auth/me', prior.token, null, 401);
  await http('POST', '/auth/login-phone', null, { phone: rotate.phone, password: rotate.defaultPassword }, 401);
  const fresh = await http('POST', '/auth/login-phone', null, { phone: rotate.phone, password: rotatedPassword });
  assert.equal((await http('GET', '/auth/me', fresh.token)).id, rotate.id);
  // These legacy provider URLs have no mounted router, regardless of a valid local token.
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    await http(method, '/memfire/users' + (['PUT','DELETE'].includes(method) ? '/' + rotate.id : ''), token, method === 'GET' ? null : {}, 404);
  }
  checks.push('本地改密校验原密码、旧密码不可登录、旧令牌失效、新密码登录；旧外部用户路径四种方法均404');
  await p.user.update({ where: { id: first.id }, data: { isActive: false } });
  await http('POST', '/auth/login-phone', null, { phone: guardian, password: first.defaultPassword }, 403);
  await p.organization.update({ where: { id: org.id }, data: { isActive: false } });
  await http('POST', '/auth/login-phone', null, { phone: manager.phone, password }, 403);
  checks.push('公开注册仍关闭/短信明确未接入/停用账号和机构拒绝手机号登录');
  console.log(JSON.stringify({ database, port, passed: checks.length, checks }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child) { child.kill('SIGTERM'); await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); }); }
  await p.$disconnect();
  if (created) { execFileSync('dropdb', ['-h', '127.0.0.1', database]); console.log('CLEANED temporary database and HTTP process'); }
});
