/** Independent review. Creates and deletes ONLY its own fixtures. No model calls. */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import prisma from '../src/config/database';
import { computeCostMicros, prepareChatTask, settleChatTask } from '../src/services/aiCreditService';

const root = path.resolve(process.cwd(), '..');
const out = path.join(root, 'docs/ai-credits/independent-review-2026-11-01');
const fixturePath = '/tmp/buzzer-ai-credit-review-fixtures.json';
const base = 'http://localhost:3000';
const results: any[] = [];
let fx: any = { orgIds: [], userIds: [], accountIds: [], model: '', sessions: {} };
function record(name: string, expected: unknown, actual: unknown, pass: boolean) {
  results.push({ name, expected, actual, pass });
  console.log(JSON.stringify(results.at(-1)));
}
async function api(route: string, session?: any, method = 'GET', body?: any) {
  const r = await fetch(base + '/api' + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let j: any;
  try { j = await r.json(); } catch { j = {}; }
  return { status: r.status, data: j.data, error: j.error, message: j.message };
}
async function cleanup() {
  const ids = (await prisma.aiCreditAccount.findMany({ where: { organizationId: { in: fx.orgIds } }, select: { id: true } })).map(x => x.id);
  const beforeExisting = {
    accounts: await prisma.aiCreditAccount.count({ where: { organizationId: { notIn: fx.orgIds } } }),
    bills: await prisma.aiTaskBill.count({ where: { accountId: { notIn: ids } } }),
    ledger: await prisma.aiCreditLedger.count({ where: { accountId: { notIn: ids } } }),
    prices: await prisma.aiModelPrice.count({ where: { model: { not: fx.model } } }),
  };
  if (ids.length) {
    await prisma.aiTaskBill.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.aiCreditLedger.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.aiEmployeeAuthorization.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.aiCreditAccount.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.aiModelPrice.deleteMany({ where: { model: fx.model } });
  await prisma.class.deleteMany({ where: { organizationId: { in: fx.orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: fx.userIds } } });
  await prisma.campus.deleteMany({ where: { organizationId: { in: fx.orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: fx.orgIds } } });
  if (fs.existsSync(fixturePath)) fs.unlinkSync(fixturePath);
  const afterExisting = {
    accounts: await prisma.aiCreditAccount.count(),
    bills: await prisma.aiTaskBill.count(),
    ledger: await prisma.aiCreditLedger.count(),
    prices: await prisma.aiModelPrice.count(),
  };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'cleanup.json'), JSON.stringify({
    beforeExisting, afterExisting,
    existingCountsUnchanged: JSON.stringify(beforeExisting) === JSON.stringify(afterExisting),
    remainingScratchOrganizations: await prisma.organization.count({ where: { id: { in: fx.orgIds } } }),
    remainingScratchUsers: await prisma.user.count({ where: { id: { in: fx.userIds } } }),
    privateSessionFileDeleted: !fs.existsSync(fixturePath),
  }, null, 2));
  console.log('Scratch fixtures removed; pre-existing records untouched.');
}
async function main() {
  if (process.argv.includes('--cleanup')) {
    fx = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    await cleanup();
    return;
  }
  if (fs.existsSync(fixturePath)) throw new Error('Clean up the preceding review fixtures before starting another run.');
  if (await prisma.aiTaskBill.count({ where: { status: 'reserved', createdAt: { lt: new Date(Date.now() - 1800000) } } })) {
    throw new Error('Existing stale reservations detected. Refusing to invoke the globally scoped production sweeper.');
  }
  fs.mkdirSync(out, { recursive: true });
  const tag = crypto.randomBytes(5).toString('hex');
  fx.model = `independent-review-${tag}`;
  process.env.GLM_MODEL = fx.model;
  const pw = 'Review!' + crypto.randomBytes(16).toString('hex') + 'Aa7';
  const hash = await bcrypt.hash(pw, 10);
  const org = await prisma.organization.create({ data: { name: '独立复核临时机构', code: 'REVIEW-' + tag } });
  const other = await prisma.organization.create({ data: { name: '独立复核隔离机构', code: 'REVIEW-ISO-' + tag } });
  fx.orgIds.push(org.id, other.id);
  const ca = await prisma.campus.create({ data: { organizationId: org.id, name: '复核 A 校区', code: 'A' } });
  const cb = await prisma.campus.create({ data: { organizationId: org.id, name: '复核 B 校区', code: 'B' } });
  const cc = await prisma.campus.create({ data: { organizationId: org.id, name: '复核未开通校区', code: 'C' } });
  const ci = await prisma.campus.create({ data: { organizationId: other.id, name: '复核隔离校区', code: 'ISO' } });
  fx.org = org; fx.campuses = { ca, cb, cc, ci };
  const makeUser = async (key: string, role: string, organizationId: string | null, campusId: string | null) => {
    const u = await prisma.user.create({ data: { email: `${key}-${tag}@review.buzzer.test`, name: '复核 ' + key, password: hash, role, organizationId, campusId } });
    fx.userIds.push(u.id);
    const l = await api('/auth/login', undefined, 'POST', { email: u.email, password: pw });
    if (l.status !== 200 || !l.data?.token) throw new Error('Fixture login failed: ' + key);
    fx.sessions[key] = l.data;
    return u;
  };
  const plat = await makeUser('platform', 'admin', null, null);
  const mgr = await makeUser('manager', 'manager', org.id, ca.id);
  const teacher = await makeUser('teacher', 'teacher', org.id, ca.id);
  const teacherB = await makeUser('teacherB', 'teacher', org.id, cb.id);
  await makeUser('managerC', 'manager', org.id, cc.id);
  await makeUser('orgadmin', 'admin', org.id, ca.id);
  await makeUser('isolated', 'manager', other.id, ci.id);
  const A = fx.sessions.platform;
  const M = fx.sessions.manager;
  const T = fx.sessions.teacher;
  const open = await api('/ai-credits/admin/open', A, 'POST', { organizationId: org.id, campusId: ca.id });
  const aid = open.data.id;
  fx.accountIds.push(aid); fx.accountId = aid;
  const top = await api('/ai-credits/admin/topup', A, 'POST', { accountId: aid, packageCode: 'basic', reason: '独立复核测试入账', idempotencyKey: tag + '-basic' });
  record('Basic package', '68 yuan -> 2000 credits', { status: top.status, balanceMicros: top.data?.balanceAfter }, top.status === 201 && top.data?.balanceAfter === 20000000);
  const dup = await api('/ai-credits/admin/topup', A, 'POST', { accountId: aid, packageCode: 'basic', reason: '独立复核重复提交', idempotencyKey: tag + '-basic' });
  record('Sequential duplicate topup', 'same balance, duplicate=true', { duplicate: dup.data?.duplicate, balanceMicros: dup.data?.balanceAfter }, dup.data?.duplicate && dup.data?.balanceAfter === 20000000);
  const denied = await api('/ai-credits/admin/topup', M, 'POST', { accountId: aid, packageCode: 'basic', reason: '越权负例', idempotencyKey: tag + '-deny' });
  record('Manager cannot self-topup', 403, denied.status, denied.status === 403);
  const unauthorized = await api('/ai/chat', T, 'POST', { messages: [{ role: 'user', content: '未授权应拒绝，不调用模型' }] });
  record('Unauthorized teacher rejected before model', 403, unauthorized.status, unauthorized.status === 403);
  const pkgs = await api('/ai-credits/packages', M);
  record('Package prices', { basic: 68, advanced: 168 }, pkgs.data?.packages, pkgs.data?.packages?.basic?.priceYuan === 68 && pkgs.data?.packages?.advanced?.credits === 6800);
  const small = computeCostMicros(100, 100, 4000, 16000);
  record('Usage precision', { expectedMicros: 2000, credits: 0.2 }, { actualMicros: small, credits: small / 10000 }, small === 2000);

  // Check that a tenant admin cannot acquire platform-level access.
  const tenantAdmin = await api('/ai-credits/admin/accounts', fx.sessions.orgadmin);
  record('Tenant admin cannot list all AI accounts', 403, { status: tenantAdmin.status, rows: Array.isArray(tenantAdmin.data) ? tenantAdmin.data.length : 0 }, tenantAdmin.status === 403);
  const regEmail = `registered-${tag}@review.buzzer.test`;
  const reg = await api('/auth/register', undefined, 'POST', { email: regEmail, password: pw, name: '复核公开注册', role: 'admin' });
  let regAccess = 0;
  const registered = await prisma.user.findUnique({ where: { email: regEmail } });
  if (registered) {
    fx.userIds.push(registered.id);
    const l = await api('/auth/login', undefined, 'POST', { email: regEmail, password: pw });
    if (l.data?.token) regAccess = (await api('/ai-credits/admin/accounts', l.data)).status;
  }
  record('Anonymous registration cannot gain billing administration', 'registration rejected or platform endpoints 403', { registerStatus: reg.status, assignedRole: registered?.role, accountsStatus: regAccess }, !registered || regAccess !== 200);

  // Same-organization campus boundary, with 1 class in A and 2 in B.
  await prisma.class.createMany({ data: [
    { organizationId: org.id, campusId: ca.id, name: 'A1', code: 'A1', courseType: '测试' },
    { organizationId: org.id, campusId: cb.id, name: 'B1', code: 'B1', courseType: '测试' },
    { organizationId: org.id, campusId: cb.id, name: 'B2', code: 'B2', courseType: '测试' },
  ] });
  const summary = await api('/ai/context-summary', M);
  record('AI context limited to current campus', { activeClasses: 1 }, { status: summary.status, activeClasses: summary.data?.activeClasses }, summary.data?.activeClasses === 1);
  const crossAuth = await api('/ai-credits/authorizations', M, 'POST', { userId: teacherB.id, limitCredits: 10 });
  record('Manager cannot authorize another campus employee', '403 or 404', { status: crossAuth.status }, [403, 404].includes(crossAuth.status));
  const unopen = await api('/ai-credits/account', fx.sessions.managerC);
  record('Unopened account response', 'expected 404', { status: unopen.status }, unopen.status === 404);
  const noAiHeaders = { Authorization: `Bearer ${fx.sessions.managerC.token}` };
  for (const [route, name, binary] of [
    ['/students?page=1&pageSize=5', 'Unopened campus can list students', false],
    ['/students/export/excel', 'Unopened campus can export original data', true],
    ['/org-profile', 'Data explanation remains free', false],
  ] as const) {
    const response = await fetch(base + '/api' + route, { headers: noAiHeaders });
    const bytes = Buffer.from(await response.arrayBuffer());
    const signature = bytes.subarray(0, 2).toString();
    record(name, binary ? '200 XLSX (PK archive)' : '200', {
      status: response.status,
      ...(binary ? { signature, contentType: response.headers.get('content-type') } : {}),
    }, response.status === 200 && (!binary || signature === 'PK'));
  }

  // Two simultaneous accounting updates must preserve both debit and reservation values.
  const makeBill = async (amount = 10000) => prisma.aiTaskBill.create({ data: {
    accountId: aid, organizationId: org.id, campusId: ca.id, userId: teacher.id,
    taskType: 'chat', reservedMicros: amount,
    usageJson: { model: fx.model, inputMicrosPer1k: 4000, outputMicrosPer1k: 16000 },
  } });
  const reset = async (balance: number, reserved = 0) => {
    await prisma.aiTaskBill.deleteMany({ where: { accountId: aid } });
    await prisma.aiCreditLedger.deleteMany({ where: { accountId: aid } });
    await prisma.aiCreditAccount.update({ where: { id: aid }, data: { balanceMicros: balance, reservedMicros: reserved, status: 'active' } });
  };
  await reset(60000);
  const preparations = await Promise.allSettled(Array.from({ length: 8 }, () => prepareChatTask({ ...mgr, role: 'manager' }, 1000)));
  const afterPrep = await prisma.aiCreditAccount.findUniqueOrThrow({ where: { id: aid } });
  record('Concurrent reserve cannot exceed account balance', 'reserved<=60000; at most one 50000 reservation', { accepted: preparations.filter(x => x.status === 'fulfilled').length, balance: afterPrep.balanceMicros, reserved: afterPrep.reservedMicros }, afterPrep.reservedMicros <= afterPrep.balanceMicros);

  await reset(1000000);
  await prisma.aiEmployeeAuthorization.upsert({ where: { accountId_userId: { accountId: aid, userId: teacher.id } }, create: { accountId: aid, userId: teacher.id, limitMicros: 50000 }, update: { limitMicros: 50000, status: 'active' } });
  const empPreps = await Promise.allSettled(Array.from({ length: 6 }, () => prepareChatTask({ ...teacher, role: 'teacher' }, 1000)));
  const empReserved = await prisma.aiTaskBill.aggregate({ where: { accountId: aid, userId: teacher.id, status: 'reserved' }, _sum: { reservedMicros: true } });
  record('Employee limit includes in-flight reservations', 'reserved<=50000', { accepted: empPreps.filter(x => x.status === 'fulfilled').length, reserved: empReserved._sum.reservedMicros }, (empReserved._sum.reservedMicros ?? 0) <= 50000);

  await reset(1000000, 80000);
  const bills = await Promise.all(Array.from({ length: 8 }, () => makeBill()));
  await Promise.all(bills.map(b => settleChatTask(b.id, { usage: { promptTokens: 100, completionTokens: 100 } })));
  const settledAccount = await prisma.aiCreditAccount.findUniqueOrThrow({ where: { id: aid } });
  const debit = await prisma.aiCreditLedger.aggregate({ where: { accountId: aid }, _sum: { micros: true } });
  const amount = debit._sum.micros ?? 0;
  record('Concurrent settlement preserves ledger and releases all reserves', { balance: 1000000 + amount, reserved: 0 }, { balance: settledAccount.balanceMicros, reserved: settledAccount.reservedMicros, ledgerDelta: amount }, settledAccount.balanceMicros === 1000000 + amount && settledAccount.reservedMicros === 0);

  await reset(1000000, 10000);
  const b = await makeBill();
  await settleChatTask(b.id, { upstreamError: 'independent test: provider failed' });
  const failed = await prisma.aiTaskBill.findUniqueOrThrow({ where: { id: b.id } });
  record('Failure records released reserve correctly', { status: 'failed_released', released: 10000 }, { status: failed.status, released: failed.releasedMicros }, failed.status === 'failed_released' && failed.releasedMicros === 10000);

  await reset(1000000, 10000);
  const errWithUsage = await makeBill();
  await settleChatTask(errWithUsage.id, { usage: { promptTokens: 100, completionTokens: 100 }, upstreamError: 'provider failed; no usable result' });
  const failureUsage = await prisma.aiTaskBill.findUniqueOrThrow({ where: { id: errWithUsage.id } });
  record('Failed undelivered task not billed even if provider consumed tokens', { settledMicros: 0 }, { status: failureUsage.status, settledMicros: failureUsage.settledMicros }, failureUsage.settledMicros === 0);

  await reset(1000000, 10000);
  const missing = await makeBill();
  await settleChatTask(missing.id, {});
  const missingBill = await prisma.aiTaskBill.findUniqueOrThrow({ where: { id: missing.id } });
  record('Normal completion missing usage goes to review', 'pending_review', missingBill.status, missingBill.status === 'pending_review');

  // Duplicate request idempotency: sequential control vs concurrent response quality.
  await reset(0);
  const sameKey = tag + '-concurrent-topup';
  const topups = await Promise.all(Array.from({ length: 6 }, () => api('/ai-credits/admin/topup', A, 'POST', { accountId: aid, packageCode: 'basic', reason: '独立复核并发重复单', idempotencyKey: sameKey })));
  const sameAccount = await prisma.aiCreditAccount.findUniqueOrThrow({ where: { id: aid } });
  record('Concurrent duplicate topups all return idempotent success', 'all 200/201, balance 20000000', { statuses: topups.map(x => x.status), balance: sameAccount.balanceMicros }, topups.every(x => [200, 201].includes(x.status)) && sameAccount.balanceMicros === 20000000);

  const wrongCampus = await api('/ai-credits/admin/open', A, 'POST', { organizationId: org.id, campusId: ci.id });
  record('Account campus must belong to account organization', '400 or 404', { status: wrongCampus.status }, [400, 404].includes(wrongCampus.status));
  const unknownModelPrice = await prisma.aiModelPrice.findFirst({ where: { model: fx.model } });
  record('Unknown model must require a verified price configuration', 'reject rather than silently assign example price', { seeded: !!unknownModelPrice, input: unknownModelPrice?.inputMicrosPer1k, output: unknownModelPrice?.outputMicrosPer1k }, !unknownModelPrice);

  // Restore a simple scratch wallet for browser verification, without touching other accounts.
  await reset(0);
  await api('/ai-credits/admin/topup', A, 'POST', { accountId: aid, packageCode: 'basic', reason: '独立复核浏览器样例', idempotencyKey: tag + '-ui' });
  await prisma.aiEmployeeAuthorization.updateMany({ where: { accountId: aid, userId: teacher.id }, data: { limitMicros: 50000, status: 'active' } });
  fs.writeFileSync(fixturePath, JSON.stringify(fx), { mode: 0o600 });
  fs.writeFileSync(path.join(out, 'probe-results.json'), JSON.stringify({ date: '2026-11-01', method: 'real localhost API + actual PostgreSQL + service functions; NO model requests; isolated scratch fixtures', results }, null, 2));
  console.log(JSON.stringify({ total: results.length, passed: results.filter(x => x.pass).length, failed: results.filter(x => !x.pass).length, output: path.join(out, 'probe-results.json'), fixtures: 'kept temporarily for browser verification' }));
}
main().catch(async e => {
  console.error(e.message);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(fixturePath, JSON.stringify(fx), { mode: 0o600 });
  fs.writeFileSync(path.join(out, 'probe-results.json'), JSON.stringify({ results, error: e.message }, null, 2));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
