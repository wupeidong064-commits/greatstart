// Dedicated temporary database and random HTTP port; never reads the business DB URL.
const { execFileSync, spawn } = require('node:child_process');
const { randomUUID, randomBytes } = require('node:crypto');
const { userInfo } = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const backend = path.resolve(__dirname, '..');
const database = 'buzzer_single_org_' + randomBytes(6).toString('hex');
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
  const org = await http('POST', '/organizations', token, { name: '手建机构', code: 'MANUAL' }, 201);
  const main = await p.campus.findMany({ where: { organizationId: org.id } });
  assert.equal(main.length, 1); assert.equal(main[0].code, 'MAIN');
  checks.push('手工创建机构事务内自动生成唯一MAIN');
  await http('POST', '/organizations', token, { name: '重复', code: 'MANUAL' }, [400, 409]);
  assert.equal(await p.organization.count({ where: { code: 'MANUAL' } }), 1);
  assert.equal(await p.campus.count({ where: { organizationId: org.id } }), 1);
  checks.push('重复机构代码不产生残留机构或范围');
  const manager = await http('POST', '/auth/create-manager', token, {
    organizationId: org.id, email: 'manager@isolated.test', name: '客户管理员', password,
  }, 201);
  assert.equal(manager.campusId, main[0].id); assert.equal(manager.role, 'manager');
  const managerToken = await login(manager.email);
  const me = await http('GET', '/auth/me', managerToken);
  assert.equal(me.isPlatformAdmin, false); assert.equal(me.campusId, main[0].id);
  checks.push('平台仅传机构创建管理员并可登录，自动归属默认范围且非平台账号');
  const other = await http('POST', '/organizations', token, { name: '第二机构', code: 'OTHER' }, 201);
  const otherCampus = await p.campus.findFirstOrThrow({ where: { organizationId: other.id } });
  await http('POST', '/auth/create-manager', token, { organizationId: org.id, campusId: otherCampus.id, email: 'injected@isolated.test', name: '注入', password }, 403);
  await http('POST', '/auth/create-manager', managerToken, { organizationId: org.id, email: 'forbidden@isolated.test', name: '越权', password }, 403);
  await http('POST', '/organizations', managerToken, { name: '越权机构', code: 'FORBIDDEN' }, 403);
  await http('GET', '/organizations/' + other.id, managerToken, null, 403);
  const staff = await http('POST', '/auth/create-staff', managerToken, { name: '员工', email: 'staff@isolated.test', role: 'coach', password }, 201);
  assert.equal(staff.campusId, main[0].id);
  await http('POST', '/auth/create-staff', managerToken, { name: '外机构员工', email: 'external@isolated.test', role: 'coach', organizationId: other.id, password }, 403);
  await http('POST', '/auth/create-staff', managerToken, { name: '外范围员工', email: 'campus@isolated.test', role: 'coach', campusId: otherCampus.id, password }, 403);
  checks.push('客户员工自动默认归属，跨机构/范围注入、客户管理平台资源全部拒绝');
  for (const current of [token, managerToken]) {
    await http('POST', '/campuses', current, { organizationId: org.id, name: '额外范围', code: 'EXTRA' }, 409);
    await http('DELETE', '/campuses/' + main[0].id, current, null, 409);
  }
  assert.equal(await p.campus.count({ where: { organizationId: org.id } }), 1);
  assert.equal((await p.campus.findUniqueOrThrow({ where: { id: main[0].id } })).isActive, true);
  checks.push('平台与客户均不能新增/删除campus，原范围未改变');
  await http('POST', '/auth/applications', null, { organizationName: '申请机构', contactName: '申请人', email: 'application@isolated.test' }, 202);
  const application = await p.campusApplication.findFirstOrThrow({ where: { email: 'application@isolated.test' } });
  const review = await http('POST', '/auth/applications/' + application.id + '/review', token, { action: 'approve' });
  assert.ok(review.defaultPassword);
  await http('POST', '/auth/applications/' + application.id + '/review', token, { action: 'approve' }, 409);
  const approved = await p.campusApplication.findUniqueOrThrow({ where: { id: application.id } });
  const appliedScopes = await p.campus.findMany({ where: { organizationId: approved.organizationId } });
  assert.equal(appliedScopes.length, 1); assert.equal(appliedScopes[0].code, 'MAIN');
  const appliedUser = await p.user.findUniqueOrThrow({ where: { email: application.email } });
  assert.equal(appliedUser.campusId, appliedScopes[0].id);
  await http('POST', '/auth/login', null, { email: application.email, password: review.defaultPassword });
  assert.equal(await p.organization.count({ where: { name: '申请机构' } }), 1);
  checks.push('公开申请批准建唯一MAIN和管理员，可登录；重复批准409且不重复开通');
  await http('POST', '/auth/applications', null, { organizationName: '并发申请', contactName: '申请人', email: 'concurrent@isolated.test' }, 202);
  const concurrent = await p.campusApplication.findFirstOrThrow({ where: { email: 'concurrent@isolated.test' } });
  await Promise.all([1, 2].map(() => http('POST', '/auth/applications/' + concurrent.id + '/review', token, { action: 'approve' }, [200, 409])));
  assert.equal(await p.organization.count({ where: { name: '并发申请' } }), 1);
  checks.push('并发审批只生成一个机构');
  await http('POST', '/auth/applications', null, { organizationName: '回滚申请', contactName: '申请人', email: manager.email }, 202);
  const rollback = await p.campusApplication.findFirstOrThrow({ where: { email: manager.email } });
  await http('POST', '/auth/applications/' + rollback.id + '/review', token, { action: 'approve' }, 409);
  assert.equal((await p.campusApplication.findUniqueOrThrow({ where: { id: rollback.id } })).status, 'pending');
  assert.equal(await p.organization.count({ where: { name: '回滚申请' } }), 0);
  checks.push('审批邮箱冲突回滚：申请仍pending且无残留机构/范围');
  await p.campus.update({ where: { id: main[0].id }, data: { code: 'LEGACY' } });
  const legacy = await http('POST', '/auth/create-manager', token, { organizationId: org.id, name: '旧唯一范围', email: 'legacy@isolated.test', password }, 201);
  assert.equal(legacy.campusId, main[0].id);
  await p.campus.create({ data: { organizationId: org.id, name: '旧额外范围', code: 'OLD2' } });
  await http('POST', '/auth/create-manager', token, { organizationId: org.id, name: '冲突', email: 'conflict@isolated.test', password }, 409);
  assert.equal(await p.user.count({ where: { email: 'conflict@isolated.test' } }), 0);
  checks.push('旧唯一范围兼容，历史多范围409且未建账号');
  console.log(JSON.stringify({ database, port, passed: checks.length, checks }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child) { child.kill('SIGTERM'); await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); }); }
  await p.$disconnect();
  if (created) { execFileSync('dropdb', ['-h', '127.0.0.1', database]); console.log('CLEANED temporary database and HTTP process'); }
});
