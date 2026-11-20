/** 快速函数级验证（临时）：reviewBill 并发/竞争/预留感知/回滚 */
import 'dotenv/config';
import crypto from 'crypto';
import prisma from '../src/config/database';
import { reviewBill, adjustAccount } from '../src/services/aiCreditAdminService';

const tag = 'quick-' + crypto.randomUUID().slice(0, 8);
const op = { id: tag, role: 'admin' };

async function main() {
  // T1: 20 并发 charge 同一账单 → 仅扣一次
  const a = await prisma.aiCreditAccount.create({ data: { organizationId: tag, campusId: crypto.randomUUID(), balanceMicros: 1000000, reservedMicros: 0 } });
  const b = await prisma.aiTaskBill.create({ data: { accountId: a.id, organizationId: tag, userId: tag, taskType: 'chat', status: 'pending_review', reservedMicros: 10000, releasedMicros: 10000, usageJson: {} } });
  const rs = await Promise.allSettled(Array.from({ length: 20 }, () => reviewBill({ operator: op, billId: b.id, action: 'charge', actualMicros: 2000 })));
  const after = await prisma.aiCreditAccount.findUniqueOrThrow({ where: { id: a.id } });
  const ledgerN = await prisma.aiCreditLedger.count({ where: { billId: b.id } });
  const dupN = rs.filter((x) => x.status === 'fulfilled' && (x.value as any)?.duplicate).length;
  console.log(`T1 并发charge: 余额=${after.balanceMicros}(期望998000) 流水=${ledgerN}(期望1) duplicate响应=${dupN} 抛错=${rs.filter(x=>x.status==='rejected').length}`);

  // T2: charge vs write_off 竞争 → 唯一终态
  const b2 = await prisma.aiTaskBill.create({ data: { accountId: a.id, organizationId: tag, userId: tag, taskType: 'chat', status: 'pending_review', reservedMicros: 10000, releasedMicros: 10000, usageJson: {} } });
  await Promise.allSettled([
    reviewBill({ operator: op, billId: b2.id, action: 'charge', actualMicros: 2000 }),
    reviewBill({ operator: op, billId: b2.id, action: 'write_off' }),
  ]);
  const b2f = await prisma.aiTaskBill.findUniqueOrThrow({ where: { id: b2.id } });
  console.log(`T2 竞争: 终态=${b2f.status} settled=${b2f.settledMicros}（二者之一，不重复）`);

  // T3: 余额10预留9 → 扣5拒、扣1成
  const c = await prisma.aiCreditAccount.create({ data: { organizationId: tag, campusId: crypto.randomUUID(), balanceMicros: 100000, reservedMicros: 90000 } });
  let rejected = false;
  try { await adjustAccount({ operator: op, accountId: c.id, credits: -5, reason: 't', idempotencyKey: crypto.randomUUID() }); } catch { rejected = true; }
  await adjustAccount({ operator: op, accountId: c.id, credits: -1, reason: 't', idempotencyKey: crypto.randomUUID() });
  const cf = await prisma.aiCreditAccount.findUniqueOrThrow({ where: { id: c.id } });
  console.log(`T3 预留感知: 扣5被拒=${rejected}(期望true) 扣1后余额=${cf.balanceMicros}(期望99000) 可用=${cf.balanceMicros - cf.reservedMicros}(期望9000)`);

  // T4: 流水写入失败（幂等键预占）→ charge 整体回滚
  const d = await prisma.aiCreditAccount.create({ data: { organizationId: tag, campusId: crypto.randomUUID(), balanceMicros: 100000, reservedMicros: 0 } });
  const db = await prisma.aiTaskBill.create({ data: { accountId: d.id, organizationId: tag, userId: tag, taskType: 'chat', status: 'pending_review', reservedMicros: 10000, releasedMicros: 10000, usageJson: {} } });
  await prisma.aiCreditLedger.create({ data: { accountId: d.id, type: 'settle', source: 'review', micros: -1, balanceAfter: 100000, billId: db.id, idempotencyKey: `review-charge-${db.id}` } });
  let rolledBack = false;
  try { await reviewBill({ operator: op, billId: db.id, action: 'charge', actualMicros: 2000 }); } catch { rolledBack = true; }
  const df = await prisma.aiCreditAccount.findUniqueOrThrow({ where: { id: d.id } });
  const dbf = await prisma.aiTaskBill.findUniqueOrThrow({ where: { id: db.id } });
  console.log(`T4 回滚: 抛错=${rolledBack}(期望true) 余额未变=${df.balanceMicros === 100000}(期望true) 账单回pending=${dbf.status === 'pending_review'}(期望true)`);

  // T5: review charge 预留感知：余额10预留9 → 补扣5拒（账单留 pending_review）
  const e = await prisma.aiCreditAccount.create({ data: { organizationId: tag, campusId: crypto.randomUUID(), balanceMicros: 100000, reservedMicros: 90000 } });
  const eb = await prisma.aiTaskBill.create({ data: { accountId: e.id, organizationId: tag, userId: tag, taskType: 'chat', status: 'pending_review', reservedMicros: 50000, releasedMicros: 50000, usageJson: {} } });
  let eRejected = false;
  try { await reviewBill({ operator: op, billId: eb.id, action: 'charge', actualMicros: 50000 }); } catch { eRejected = true; }
  const ebf = await prisma.aiTaskBill.findUniqueOrThrow({ where: { id: eb.id } });
  const ef = await prisma.aiCreditAccount.findUniqueOrThrow({ where: { id: e.id } });
  console.log(`T5 补扣预留感知: 拒=${eRejected}(期望true) 账单保持=${ebf.status}(期望pending_review) 余额未变=${ef.balanceMicros === 100000}(期望true)`);
}

main()
  .catch((e) => { console.error('FAIL:', e?.message ?? e); process.exitCode = 1; })
  .finally(async () => {
    await prisma.aiCreditLedger.deleteMany({ where: { accountId: { contains: tag } } });
    await prisma.aiTaskBill.deleteMany({ where: { organizationId: tag } });
    await prisma.aiCreditAccount.deleteMany({ where: { organizationId: tag } });
    await prisma.$disconnect();
  });
