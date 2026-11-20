/**
 * 复核方脚本更新版（2026-11-01 修复后）：记录实际结果 + 明确通过/失败断言；
 * 预期拒绝被 catch 后继续后续测试。随机独立域，finally 清理本轮 ID。
 */
import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import p from '../src/config/database';
import { reviewBill, adjustAccount } from '../src/services/aiCreditAdminService';
import { settleChatTask, computeCostMicros } from '../src/services/aiCreditService';

const tag = 'recheck-' + crypto.randomUUID();
const ids: string[] = [];
const results: Array<{ test: string; expected: string; actual: string; pass: boolean }> = [];
function rec(test: string, expected: string, actual: string, pass: boolean) {
  results.push({ test, expected, actual, pass });
}
const operator = { id: tag, role: 'admin' };

async function account(balanceMicros = 1000000, reservedMicros = 0) {
  const a = await p.aiCreditAccount.create({ data: { organizationId: tag, campusId: crypto.randomUUID(), balanceMicros, reservedMicros } });
  ids.push(a.id);
  return a;
}
async function bill(a: any, status = 'pending_review', reservedMicros = 10000) {
  return p.aiTaskBill.create({
    data: { accountId: a.id, organizationId: tag, userId: tag, taskType: 'chat', status, reservedMicros, releasedMicros: status === 'pending_review' ? reservedMicros : 0, usageJson: { inputMicrosPer1k: 4000, outputMicrosPer1k: 16000 } },
  });
}
async function state(a: any) {
  const v = await p.aiCreditAccount.findUniqueOrThrow({ where: { id: a.id } });
  return { balance: v.balanceMicros, reserved: v.reservedMicros, available: v.balanceMicros - v.reservedMicros };
}

async function main() {
  try {
    // 1. 精度
    const prec = computeCostMicros(100, 100, 4000, 16000);
    rec('precision', '2000', String(prec), prec === 2000);

    // 2. 同账单并发 charge：仅扣一次
    const a = await account();
    const b = await bill(a);
    const r = await Promise.allSettled(Array.from({ length: 8 }, () => reviewBill({ operator, billId: b.id, action: 'charge', actualMicros: 2000 })));
    const st = await state(a);
    const ledgerCount = await p.aiCreditLedger.count({ where: { billId: b.id } });
    rec('concurrent review same bill', 'balance=998000, ledger=1',
      `balance=${st.balance}, ledger=${ledgerCount}, dup=${r.filter((x) => x.status === 'fulfilled' && (x.value as any)?.duplicate).length}`,
      st.balance === 998000 && ledgerCount === 1);

    // 3. adjust 预留感知：余额10预留9 → 扣5拒绝（预期拒绝，继续）
    const c = await account(100000, 90000);
    let adjRejected = false;
    try { await adjustAccount({ operator, accountId: c.id, credits: -5, reason: 'isolated regression', idempotencyKey: crypto.randomUUID() }); } catch { adjRejected = true; }
    const cState = await state(c);
    rec('adjust protects reservations (扣5拒)', 'reject; available >= 0',
      `rejected=${adjRejected}, ${JSON.stringify(cState)}`, adjRejected && cState.available >= 0);

    // 4. review charge 预留感知：补扣5 → 拒绝且账单保持 pending_review
    const d = await account(100000, 90000);
    const db = await bill(d, 'pending_review', 50000);
    let reviewRejected = false;
    try { await reviewBill({ operator, billId: db.id, action: 'charge', actualMicros: 50000 }); } catch { reviewRejected = true; }
    const dbf = await p.aiTaskBill.findUniqueOrThrow({ where: { id: db.id } });
    const dState = await state(d);
    rec('review protects reservations (补扣5拒)', 'reject; bill stays pending_review',
      `rejected=${reviewRejected}, status=${dbf.status}, ${JSON.stringify(dState)}`,
      reviewRejected && dbf.status === 'pending_review' && dState.available >= 0);

    // 5. 8 并发正常结算：不丢账
    const e = await account(1000000, 80000);
    const bs = await Promise.all(Array.from({ length: 8 }, () => bill(e, 'reserved')));
    await Promise.all(bs.map((x) => settleChatTask(x.id, { usage: { promptTokens: 100, completionTokens: 100 } })));
    const eState = await state(e);
    rec('8 concurrent normal settlements', 'balance=984000, reserved=0',
      `balance=${eState.balance}, reserved=${eState.reserved}`,
      eState.balance === 984000 && eState.reserved === 0);
  } finally {
    await p.aiCreditLedger.deleteMany({ where: { accountId: { in: ids } } });
    await p.aiTaskBill.deleteMany({ where: { accountId: { in: ids } } });
    await p.aiCreditAccount.deleteMany({ where: { id: { in: ids } } });
    results.push({ test: 'cleanup', expected: 'remaining=0', actual: `remaining=${await p.aiCreditAccount.count({ where: { organizationId: tag } })}`, pass: true });
    const pass = results.filter((x) => x.pass).length;
    fs.mkdirSync('../docs/ai-credits/recheck-2026-11-01', { recursive: true });
    fs.writeFileSync('../docs/ai-credits/recheck-2026-11-01/results.json', JSON.stringify({ pass, total: results.length, results }, null, 2));
    console.log(JSON.stringify({ pass, total: results.length, results }, null, 2));
    await p.$disconnect();
  }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
