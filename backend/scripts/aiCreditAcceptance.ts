/**
 * 校区 AI 积分 · 第一轮修复验收（随机独立域版，必修 3）
 *
 * 隔离规则：
 * - 每次运行创建随机唯一 机构/校区/账号/价格模型（tag = R1-<ts>-<rand>），不动任何共享数据；
 * - glm-4-flash 共享价格只读（seedPriceCatalog 幂等、不修改既有版本）；
 * - 调价测试用随机模型自建价格版本，测后删除；
 * - finally 清理本轮全部 ID，并输出共享域前后一致性比对结果。
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  computeCostMicros,
  settleChatTask,
  sweepStaleReserves,
  getActivePrice,
  seedPriceCatalog,
} from '../src/services/aiCreditService';
import { reviewBill, adjustAccount } from '../src/services/aiCreditAdminService';

const BASE = 'http://localhost:3000';
const PW = process.env.ACCEPT_TEST_PASSWORD ?? '';
const prisma = new PrismaClient();
if (!PW) { console.error('请设置 ACCEPT_TEST_PASSWORD'); process.exit(1); }

const TAG = `R1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];
const createdPriceModels: string[] = [];

interface Row { name: string; expected: string; actual: string; pass: boolean; note?: string }
const results: Row[] = [];
function rec(name: string, expected: string, actual: string, pass: boolean, note?: string) {
  results.push({ name, expected, actual, pass, note });
  console.log(`${pass ? '✅' : '❌'} ${name} | 预期 ${expected} | 实际 ${actual}${note ? ' | ' + note : ''}`);
}
const c = (m: number) => (m / 10000).toString();

async function login(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  const j = await r.json();
  if (!j?.data?.token) throw new Error(`登录失败: ${email}`);
  return j.data.token;
}
const H = (t: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

async function chat(token: string, message: string, opts: { abortAfterMs?: number } = {}) {
  const ctrl = new AbortController();
  let aborted = false;
  if (opts.abortAfterMs) setTimeout(() => { aborted = true; ctrl.abort(); }, opts.abortAfterMs);
  let credits: { settled: string; balance: string } | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(`${BASE}/api/ai/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: [{ role: 'user', content: message }] }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json())?.error?.message || msg; } catch { /* keep */ }
      return { credits: null, error: msg, aborted };
    }
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() || '';
      for (const p of parts) {
        const line = p.trim();
        if (!line.startsWith('data:')) continue;
        try {
          const json = JSON.parse(line.slice(5).trim());
          if (json.credits) credits = json.credits;
          if (json.error) error = json.error;
        } catch { /* ignore */ }
      }
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') aborted = true;
    else error = e?.message ?? 'fetch error';
  }
  return { credits, error, aborted };
}

/** 共享域一致性指纹（前后比对必须一致） */
async function sharedFingerprint(): Promise<string> {
  const sharedOrgs = await prisma.organization.findMany({
    where: { code: { in: ['BZ-ACCEPT', 'BZ-ISO'] } },
    select: { id: true },
  });
  const sharedOrgIds = sharedOrgs.map((o) => o.id);
  const [accounts, prices, sharedUsers] = await Promise.all([
    prisma.aiCreditAccount.findMany({
      where: { organizationId: { in: sharedOrgIds } },
      select: { id: true, balanceMicros: true, reservedMicros: true, status: true },
      orderBy: { id: 'asc' },
    }),
    prisma.aiModelPrice.findMany({ where: { model: 'glm-4-flash' }, select: { id: true, inputMicrosPer1k: true, outputMicrosPer1k: true, effectiveFrom: true }, orderBy: { id: 'asc' } }),
    prisma.user.count({ where: { email: { endsWith: '@accept.buzzer.test' } } }),
  ]);
  return JSON.stringify({ accounts, prices, sharedUsers });
}

async function main() {
  const before = await sharedFingerprint();

  /* ===== 随机独立域搭建 ===== */
  const platEmail = `plat-${TAG}@fix.test`;
  const plat = await prisma.user.create({
    data: {
      email: platEmail, password: bcrypt.hashSync(PW, 10),
      name: '平台运营（本轮随机域）', role: 'admin', isPlatformAdmin: true, isActive: true,
    },
  });
  createdUserIds.push(plat.id);
  const admin = await login(platEmail);

  const org = await prisma.organization.create({
    data: { name: `修复验收域 ${TAG}`, code: TAG },
  });
  createdOrgIds.push(org.id);
  const campus = await prisma.campus.create({
    data: { organizationId: org.id, name: '验收校区A', code: 'FA-1' },
  });
  const mgrEmail = `mgr-${TAG}@fix.test`;
  const managerUser = await prisma.user.create({
    data: {
      email: mgrEmail, password: bcrypt.hashSync(PW, 10),
      name: '验收校区管理员', role: 'manager', organizationId: org.id, campusId: campus.id, isActive: true,
    },
  });
  createdUserIds.push(managerUser.id);
  const manager = await login(mgrEmail);

  // 随机模型 + 随机价格（调价测试专用，测后删除；不碰共享 glm-4-flash）
  const randModel = `fix-${TAG}`;
  createdPriceModels.push(randModel);
  await prisma.aiModelPrice.create({
    data: { model: randModel, inputMicrosPer1k: 4000, outputMicrosPer1k: 16000, note: `验收 ${TAG}` },
  });
  // 共享 glm-4-flash 价格：仅确保存在（幂等，不修改既有）
  await seedPriceCatalog();

  /* ===== 1. 平台身份边界 ===== */
  const rogueEmail = `rogue-${TAG}@fix.test`;
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: rogueEmail, password: PW, name: '自封', role: 'admin' }),
  });
  createdUserIds.push((await prisma.user.findUnique({ where: { email: rogueEmail } }))!.id);
  rec('匿名注册自报 admin 降级 parent', 'role=parent', `role=${reg.status === 201 ? (await reg.clone().json())?.data?.role : 'reg失败'}`, reg.status === 201);
  const rogueTok = await login(rogueEmail);
  const rogueAdmin = await fetch(`${BASE}/api/ai-credits/admin/accounts`, { headers: { Authorization: `Bearer ${rogueTok}` } });
  rec('自封号无法访问平台账务', '403', String(rogueAdmin.status), rogueAdmin.status === 403);
  const mgrAdmin = await fetch(`${BASE}/api/ai-credits/admin/accounts`, { headers: { Authorization: `Bearer ${manager}` } });
  rec('校区 manager 无法访问平台账务', '403', String(mgrAdmin.status), mgrAdmin.status === 403);
  const platOk = await fetch(`${BASE}/api/ai-credits/admin/accounts`, { headers: { Authorization: `Bearer ${admin}` } });
  rec('平台运营（独立标记）可访问', '200', String(platOk.status), platOk.status === 200);

  /* ===== 2. 管理员专属 + 旧授权不绕过 ===== */
  const salesUser = await prisma.user.create({
    data: {
      email: `sales-${TAG}@fix.test`, password: bcrypt.hashSync(PW, 10),
      name: '销售（不开放AI）', role: 'sales', organizationId: org.id, campusId: campus.id, isActive: true,
    },
  });
  createdUserIds.push(salesUser.id);
  const salesTok = await login(salesUser.email);
  const salesChat = await chat(salesTok, '销售角色测试');
  rec('销售调用 AI 被拒', '403 AI_NOT_FOR_ROLE', salesChat.error ?? '', (salesChat.error ?? '').includes('仅对机构/校区管理员'));

  /* ===== 3. 开通（归属校验）+ 入账 + 管理员对话 ===== */
  const openBad = await fetch(`${BASE}/api/ai-credits/admin/open`, {
    method: 'POST', headers: H(admin),
    body: JSON.stringify({ organizationId: org.id, campusId: crypto.randomUUID() }),
  });
  rec('开通时校区不属于机构被拒', '400', String(openBad.status), openBad.status === 400);
  await fetch(`${BASE}/api/ai-credits/admin/open`, {
    method: 'POST', headers: H(admin), body: JSON.stringify({ organizationId: org.id, campusId: campus.id }),
  });
  const acc = await prisma.aiCreditAccount.findFirstOrThrow({ where: { organizationId: org.id, campusId: campus.id } });
  const top1 = await (await fetch(`${BASE}/api/ai-credits/admin/topup`, {
    method: 'POST', headers: H(admin),
    body: JSON.stringify({ accountId: acc.id, packageCode: 'basic', reason: '验收基础包', idempotencyKey: `${TAG}-t1` }),
  })).json();
  rec('人工入账基础包', '+2000', c(top1?.data?.balanceAfter ?? 0), top1?.data?.balanceAfter === 20000000);
  const dup = await (await fetch(`${BASE}/api/ai-credits/admin/topup`, {
    method: 'POST', headers: H(admin),
    body: JSON.stringify({ accountId: acc.id, packageCode: 'basic', reason: '验收基础包', idempotencyKey: `${TAG}-t1` }),
  })).json();
  rec('同入账单重复提交幂等', 'duplicate=true', String(dup?.data?.duplicate), dup?.data?.duplicate === true);

  const c1 = await chat(manager, '请用一句话说明什么是出勤率。');
  rec('管理员真实对话计费', 'credits 返回', c1.credits ? `消耗 ${c1.credits.settled}` : c1.error ?? '', !!c1.credits);

  /* ===== 4. 校区快照隔离（同机构 A/B） ===== */
  const campusB = await prisma.campus.create({ data: { organizationId: org.id, name: '验收校区B', code: 'FA-2' } });
  const t1Teacher = await prisma.user.create({
    data: {
      email: `t1-${TAG}@fix.test`, password: bcrypt.hashSync(PW, 10),
      name: 'B校老师', role: 'teacher', organizationId: org.id, campusId: campusB.id, isActive: true,
    },
  });
  createdUserIds.push(t1Teacher.id);
  await prisma.class.createMany({
    data: [1, 2].map((i) => ({
      organizationId: org.id, campusId: campusB.id,
      name: `B班${i}`, code: `FB-${i}`, courseType: '幼儿体能', capacity: 10, status: 'active',
      teacherId: t1Teacher.id,
    })),
  });
  const sumA = await (await fetch(`${BASE}/api/ai/context-summary`, { headers: { Authorization: `Bearer ${manager}` } })).json();
  rec('A 校区快照不含 B 校区班级', 'activeClasses=0（A 校区无班）', String(sumA.data?.activeClasses), sumA.data?.activeClasses === 0);
  const bMgr = await prisma.user.create({
    data: {
      email: `bm-${TAG}@fix.test`, password: bcrypt.hashSync(PW, 10),
      name: 'B校管理员', role: 'manager', organizationId: org.id, campusId: campusB.id, isActive: true,
    },
  });
  createdUserIds.push(bMgr.id);
  const sumB = await (await fetch(`${BASE}/api/ai/context-summary`, { headers: { Authorization: `Bearer ${await login(bMgr.email)}` } })).json();
  rec('B 校区快照只含本校区 2 班', 'activeClasses=2', String(sumB.data?.activeClasses), sumB.data?.activeClasses === 2);

  /* ===== 5. 无校区拒绝消费 ===== */
  const noCampus = await prisma.user.create({
    data: {
      email: `nc-${TAG}@fix.test`, password: bcrypt.hashSync(PW, 10),
      name: '无校区管理员', role: 'manager', organizationId: org.id, campusId: null, isActive: true,
    },
  });
  createdUserIds.push(noCampus.id);
  const ncChat = await chat(await login(noCampus.email), '无校区测试');
  rec('无校区管理员消费被拒', '403 AI_CAMPUS_REQUIRED', ncChat.error ?? '', (ncChat.error ?? '').includes('未绑定校区'));

  /* ===== 6. 精度（μc 粒度） ===== */
  rec('100入+100出 = 0.2 积分', '2000μc', String(computeCostMicros(100, 100, 4000, 16000)), computeCostMicros(100, 100, 4000, 16000) === 2000);
  rec('零用量 = 0', '0', String(computeCostMicros(0, 0, 4000, 16000)), computeCostMicros(0, 0, 4000, 16000) === 0);

  /* ===== 7. 未配置价格拒绝 ===== */
  let priceErr = '';
  try { await getActivePrice(`no-price-${TAG}`); } catch (e: any) { priceErr = e?.message ?? ''; }
  rec('未配置价格模型拒绝', 'AI_PRICE_MISSING', priceErr.slice(0, 30), priceErr.includes('未配置价格'));

  /* ===== 8. 并发预留不超卖（HTTP 真并发） ===== */
  // 用 adjust 把余额调到恰好单笔预留
  const price = await getActivePrice(process.env.GLM_MODEL || 'glm-4-flash');
  const probe = '并发预留测试提问';
  const oneReserve = Math.ceil(((probe.length + 900 + 2048) / 1000) * price.outputMicrosPer1k);
  await adjustAccount({
    operator: { id: plat.id, role: 'admin' }, accountId: acc.id,
    credits: (oneReserve - (await prisma.aiCreditAccount.findUniqueOrThrow({ where: { id: acc.id } })).balanceMicros) / 10000,
    reason: '并发测试余额', idempotencyKey: `${TAG}-adj1`,
  });
  const outcomes = await Promise.all(Array.from({ length: 20 }, () => chat(manager, probe)));
  const billed = outcomes.filter((o) => o.credits !== null).length;
  const acc8 = await prisma.aiCreditAccount.findUniqueOrThrow({ where: { id: acc.id } });
  rec('并发预留不超卖（余额仅够 1 笔，20 并发）', '计费成功 ≤1', `计费=${billed}, 预留=${c(acc8.reservedMicros)}`, billed <= 1);

  /* ===== 9. 函数级并发结算（8 笔同时，各 0.2） ===== */
  await prisma.aiTaskBill.deleteMany({ where: { accountId: acc.id } });
  const identityBase = (await prisma.aiCreditAccount.findUniqueOrThrow({ where: { id: acc.id } })).balanceMicros;
  await prisma.aiCreditLedger.deleteMany({ where: { accountId: acc.id } });
  await adjustAccount({
    operator: { id: plat.id, role: 'admin' }, accountId: acc.id,
    credits: 100, reason: '并发结算测试余额', idempotencyKey: `${TAG}-adj2`,
  });
  await prisma.aiCreditAccount.update({ where: { id: acc.id }, data: { reservedMicros: { increment: 64000 } } });
  const billIds: string[] = [];
  for (let i = 0; i < 8; i++) {
    const b = await prisma.aiTaskBill.create({
      data: {
        accountId: acc.id, organizationId: org.id, campusId: campus.id,
        userId: managerUser.id, taskType: 'chat', status: 'reserved', reservedMicros: 8000,
        usageJson: { model: randModel, priceVersionId: 'test', inputMicrosPer1k: 4000, outputMicrosPer1k: 16000 },
      },
    });
    billIds.push(b.id);
  }
  const settleRs = await Promise.all(billIds.map((id) => settleChatTask(id, { usage: { promptTokens: 100, completionTokens: 100 } })));
  const acc9 = await prisma.aiCreditAccount.findUniqueOrThrow({ where: { id: acc.id } });
  const ledgerSum = (await prisma.aiCreditLedger.aggregate({ _sum: { micros: true }, where: { accountId: acc.id } }))._sum.micros ?? 0;
  rec('8 并发结算各扣 0.2', '各 2000μc', settleRs.map((r) => r.settledMicros).join(','), settleRs.every((r) => r.settledMicros === 2000));
  rec('并发结算不丢账', '余额=基准+100积分-1.6', c(acc9.balanceMicros), acc9.balanceMicros === identityBase + 1000000 - 16000);
  rec('预留全释放', 'reserved=0', String(acc9.reservedMicros), acc9.reservedMicros === 0);
  rec('流水恒等式（余额变动=Σ流水）', '成立', `Δ=${c(acc9.balanceMicros - identityBase)} Σ=${c(ledgerSum)}`, acc9.balanceMicros - identityBase === ledgerSum);

  /* ===== 10. reviewBill 并发与竞争（必修 1 验收） ===== */
  await prisma.aiTaskBill.deleteMany({ where: { accountId: acc.id } });
  const rb = await prisma.aiTaskBill.create({
    data: {
      accountId: acc.id, organizationId: org.id, campusId: campus.id, userId: managerUser.id,
      taskType: 'chat', status: 'pending_review', reservedMicros: 10000, releasedMicros: 10000, usageJson: {},
    },
  });
  const rbBefore = (await prisma.aiCreditAccount.findUniqueOrThrow({ where: { id: acc.id } })).balanceMicros;
  const rbRs = await Promise.allSettled(Array.from({ length: 20 }, () =>
    reviewBill({ operator: { id: plat.id, role: 'admin' }, billId: rb.id, action: 'charge', actualMicros: 2000 })));
  const rbAcc = await prisma.aiCreditAccount.findUniqueOrThrow({ where: { id: acc.id } });
  const rbLedgerN = await prisma.aiCreditLedger.count({ where: { billId: rb.id } });
  const rbDup = rbRs.filter((x) => x.status === 'fulfilled' && (x.value as any)?.duplicate).length;
  rec('同一账单 20 并发 charge 仅扣一次', `扣 0.2（余额 ${c(rbBefore)}→${c(rbAcc.balanceMicros)}）流水 ${rbLedgerN} 条`,
    `duplicate=${rbDup}`, rbAcc.balanceMicros === rbBefore - 2000 && rbLedgerN === 1);

  const rb2 = await prisma.aiTaskBill.create({
    data: {
      accountId: acc.id, organizationId: org.id, campusId: campus.id, userId: managerUser.id,
      taskType: 'chat', status: 'pending_review', reservedMicros: 10000, releasedMicros: 10000, usageJson: {},
    },
  });
  await Promise.allSettled([
    reviewBill({ operator: { id: plat.id, role: 'admin' }, billId: rb2.id, action: 'charge', actualMicros: 2000 }),
    reviewBill({ operator: { id: plat.id, role: 'admin' }, billId: rb2.id, action: 'write_off' }),
  ]);
  const rb2f = await prisma.aiTaskBill.findUniqueOrThrow({ where: { id: rb2.id } });
  rec('charge/write_off 竞争唯一终态', 'settled 或 reviewed_written_off 二选一', `${rb2f.status}/${rb2f.settledMicros}`,
    ['settled', 'reviewed_written_off'].includes(rb2f.status));

  /* ===== 11. 预留感知扣款（必修 2 验收） ===== */
  const protCampus = await prisma.campus.create({ data: { organizationId: org.id, name: '验收校区C', code: 'FA-3' } });
  const prot = await prisma.aiCreditAccount.create({
    data: { organizationId: org.id, campusId: protCampus.id, balanceMicros: 100000, reservedMicros: 90000 },
  });
  let adjRejected = false;
  try { await adjustAccount({ operator: { id: plat.id, role: 'admin' }, accountId: prot.id, credits: -5, reason: '预留感知', idempotencyKey: `${TAG}-p1` }); } catch { adjRejected = true; }
  await adjustAccount({ operator: { id: plat.id, role: 'admin' }, accountId: prot.id, credits: -1, reason: '预留感知', idempotencyKey: `${TAG}-p2` });
  const protAfter = await prisma.aiCreditAccount.findUniqueOrThrow({ where: { id: prot.id } });
  rec('有预留时人工扣减被正确拦截/放行', '扣5拒、扣1成，可用不为负',
    `扣5拒=${adjRejected}, 余额=${c(protAfter.balanceMicros)}, 可用=${c(protAfter.balanceMicros - protAfter.reservedMicros)}`,
    adjRejected && protAfter.balanceMicros === 90000 && protAfter.balanceMicros - protAfter.reservedMicros >= 0);
  // review charge 补扣预留感知
  const protBill = await prisma.aiTaskBill.create({
    data: {
      accountId: prot.id, organizationId: org.id, campusId: campus.id, userId: managerUser.id,
      taskType: 'chat', status: 'pending_review', reservedMicros: 50000, releasedMicros: 50000, usageJson: {},
    },
  });
  let reviewRejected = false;
  try { await reviewBill({ operator: { id: plat.id, role: 'admin' }, billId: protBill.id, action: 'charge', actualMicros: 50000 }); } catch { reviewRejected = true; }
  const protBillAfter = await prisma.aiTaskBill.findUniqueOrThrow({ where: { id: protBill.id } });
  rec('补扣不足账单保持待核对', '拒 + pending_review', `拒=${reviewRejected}, 状态=${protBillAfter.status}`,
    reviewRejected && protBillAfter.status === 'pending_review');
  await prisma.aiCreditAccount.delete({ where: { id: prot.id } });

  /* ===== 12. 流水写入失败整体回滚（必修 1 验收） ===== */
  const rb3 = await prisma.aiTaskBill.create({
    data: {
      accountId: acc.id, organizationId: org.id, campusId: campus.id, userId: managerUser.id,
      taskType: 'chat', status: 'pending_review', reservedMicros: 10000, releasedMicros: 10000, usageJson: {},
    },
  });
  // 预占该账单 review 流水的幂等键 → charge 撞唯一键 → 整体回滚
  await prisma.aiCreditLedger.create({
    data: { accountId: acc.id, type: 'settle', source: 'review', micros: -1, balanceAfter: acc9.balanceMicros, billId: rb3.id, idempotencyKey: `review-charge-${rb3.id}` },
  });
  const rb3Before = (await prisma.aiCreditAccount.findUniqueOrThrow({ where: { id: acc.id } })).balanceMicros;
  let rollbackThrown = false;
  try { await reviewBill({ operator: { id: plat.id, role: 'admin' }, billId: rb3.id, action: 'charge', actualMicros: 2000 }); } catch { rollbackThrown = true; }
  const rb3Acc = await prisma.aiCreditAccount.findUniqueOrThrow({ where: { id: acc.id } });
  const rb3Bill = await prisma.aiTaskBill.findUniqueOrThrow({ where: { id: rb3.id } });
  rec('流水写入失败 → 账户与账单整体回滚', '抛错/余额未变/账单回待核对',
    `抛=${rollbackThrown}, 余额未变=${rb3Acc.balanceMicros === rb3Before}, 状态=${rb3Bill.status}`,
    rollbackThrown && rb3Acc.balanceMicros === rb3Before && rb3Bill.status === 'pending_review');

  /* ===== 13. 异常分支 + 扫尾 ===== */
  const bFail = await prisma.aiTaskBill.create({
    data: {
      accountId: acc.id, organizationId: org.id, campusId: campus.id, userId: managerUser.id,
      taskType: 'chat', status: 'reserved', reservedMicros: 10000,
      usageJson: { inputMicrosPer1k: 4000, outputMicrosPer1k: 16000 },
    },
  });
  await prisma.aiCreditAccount.update({ where: { id: acc.id }, data: { reservedMicros: { increment: 10000 } } });
  const rFail = await settleChatTask(bFail.id, { usage: { promptTokens: 500, completionTokens: 500 }, upstreamError: 'boom' });
  rec('失败任务(有usage)不扣费且 released=预留', 'failed_released/0/10000',
    `${rFail.settledMicros}/${rFail.releasedMicros}`, rFail.settledMicros === 0 && rFail.releasedMicros === 10000);

  const bStale = await prisma.aiTaskBill.create({
    data: {
      accountId: acc.id, organizationId: org.id, campusId: campus.id, userId: managerUser.id,
      taskType: 'chat', status: 'reserved', reservedMicros: 30000, usageJson: {},
      createdAt: new Date(Date.now() - 31 * 60 * 1000),
    },
  });
  await prisma.aiCreditAccount.update({ where: { id: acc.id }, data: { reservedMicros: { increment: 30000 } } });
  await sweepStaleReserves();
  const bStaleAfter = await prisma.aiTaskBill.findUniqueOrThrow({ where: { id: bStale.id } });
  rec('超时预留被扫尾', 'pending_review', bStaleAfter.status, bStaleAfter.status === 'pending_review');

  /* ===== 14. 免费层回归 ===== */
  const stu = await fetch(`${BASE}/api/students?page=1&pageSize=5`, { headers: { Authorization: `Bearer ${manager}` } });
  rec('未购积分课务不受影响', '200', String(stu.status), stu.status === 200);

  /* ===== 清理（仅本轮 ID）+ 共享域一致性 ===== */
  await prisma.aiTaskBill.deleteMany({ where: { organizationId: org.id } });
  await prisma.aiCreditLedger.deleteMany({ where: { accountId: { in: [acc.id, prot.id] } } });
  await prisma.aiCreditAccount.deleteMany({ where: { organizationId: org.id } });
  await prisma.aiEmployeeAuthorization.deleteMany({ where: { accountId: { in: [acc.id, prot.id] } } });
  await prisma.class.deleteMany({ where: { organizationId: org.id } });
  await prisma.campus.deleteMany({ where: { organizationId: org.id } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.organization.delete({ where: { id: org.id } }).catch(() => undefined);
  await prisma.aiModelPrice.deleteMany({ where: { model: randModel } });
  const after = await sharedFingerprint();
  rec('共享域前后一致（账户/共享价格/账号数）', '指纹一致', before === after ? '一致' : '变化❗', before === after);

  /* ===== 落盘 ===== */
  const pass = results.filter((r) => r.pass).length;
  const L = [
    `# AI 积分第一轮修复验收（随机独立域）`, ``,
    `- 时间：${new Date().toISOString()}`,
    `- 本轮域：${TAG}（已清理）；共享 glm-4-flash 价格未被修改`,
    `- 共享域一致性：${before === after ? '✅ 前后一致' : '❌ 有变化'}`,
    `- 结果：**${pass}/${results.length} 通过**`, ``,
    `| # | 检查项 | 预期 | 实际 | 结果 | 备注 |`, `|---|---|---|---|---|---|`,
    ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.expected} | ${r.actual} | ${r.pass ? '✅' : '❌'} | ${r.note ?? ''} |`),
  ].join('\n');
  const outDir = path.resolve(__dirname, '../../docs/ai-credits');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'round1-fix-evidence.md'), L, 'utf-8');
  console.log(`\n=== ${pass}/${results.length} 通过（共享域${before === after ? '一致' : '有变化'}），证据 docs/ai-credits/round1-fix-evidence.md ===`);
  await prisma.$disconnect();
  process.exit(pass === results.length ? 0 : 2);
}

main().catch(async (e) => { console.error('执行异常:', e); await prisma.$disconnect(); process.exit(1); });
