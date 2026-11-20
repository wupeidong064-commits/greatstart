// Only run against a newly created disposable local PostgreSQL database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import express from 'express';
import jwt from 'jsonwebtoken';
import p from '../src/config/database';
import { userRoutes } from '../src/routes/users';
import { resourceTransferRoutes } from '../src/routes/resourceTransfers';
import { mcpRoutes } from '../src/mcp/mcpServer';
import { sessionTag } from '../src/middleware/auth';
import { securityConfig } from '../src/config/security';
import { errorHandler } from '../src/middleware/errorHandler';
import { lockScheduleWrites } from '../src/services/scheduleConflicts';

async function main() {
  const database = new URL(process.env.DATABASE_URL!);
  assert(['localhost', '127.0.0.1'].includes(database.hostname));
  assert.match(database.pathname, /^\/buzzer_system_review_\d+$/);
  assert.equal(process.env.DATABASE_URL, process.env.DATABASE_DIRECT_URL);
  const checks: string[] = [];
  const org = await p.organization.create({ data: { name: '改岗与MCP独立验收', code: randomUUID() } });
  const campus = await p.campus.create({ data: { organizationId: org.id, name: '默认', code: 'MAIN' } });
  const scope = { organizationId: org.id, campusId: campus.id };
  const person = (role = 'coach', extra = {}) => p.user.create({ data: { ...scope, role, name: '隔离测试人员', email: randomUUID() + '@qa.invalid', password: 'isolated-only', ...extra } });
  const admin = await person('staff', { managementLevel: 'super' });
  const teacher = await person(), recipient = await person('teacher');
  const token = (user: typeof admin) => jwt.sign({ userId: user.id, sessionTag: sessionTag(user.password) }, securityConfig.jwt.secret, { expiresIn: '1h' });
  const app = express(); app.use(express.json()); app.use('/api/users', userRoutes); app.use('/api/resource-transfers', resourceTransferRoutes); app.use('/api/mcp', mcpRoutes); app.use(errorHandler);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const request = async (path: string, body?: object, method = 'POST', actor = admin) => {
    const r = await fetch(base + path, { method, headers: { Authorization: 'Bearer ' + token(actor), 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json() as any };
  };
  const change = async (targetId: string, body: object, actor = admin) => {
    const current = await p.user.findUniqueOrThrow({ where: { id: targetId } });
    return request('/users/' + targetId, { expectedUpdatedAt: current.updatedAt.toISOString(), ...body }, 'PUT', actor);
  };
  const cls = (teacherId: string, status = 'active') => p.class.create({ data: { ...scope, name: '待移交班', code: randomUUID(), courseType: '篮球', teacherId, status } });
  const student = (recallTeacherId: string, extra = {}) => p.student.create({ data: { ...scope, name: '待回访孩子', recallTeacherId, status: 'lost', ...extra } });
  try {
    const activeClass = await cls(teacher.id);
    const rejected = await change(teacher.id, { role: 'sales', name: '不得保存' });
    assert.equal(rejected.status, 409); assert.equal(rejected.body.error.code, 'TEACHER_ROLE_HAS_RESPONSIBILITIES');
    assert.equal((await p.user.findUniqueOrThrow({ where: { id: teacher.id } })).role, 'coach');
    assert.equal((await p.user.findUniqueOrThrow({ where: { id: teacher.id } })).name, teacher.name);
    checks.push('在职空班阻止改岗，姓名与岗位整笔保留');
    await p.class.update({ where: { id: activeClass.id }, data: { status: 'inactive' } });
    assert.equal((await change(teacher.id, { role: 'staff' })).status, 409); checks.push('停课空班仍要求移交');
    assert.equal((await change(teacher.id, { name: '允许改名' })).status, 200); checks.push('仍有责任时可正常修改姓名');
    assert.equal((await change(teacher.id, { role: 'teacher' })).status, 200); checks.push('teacher与coach互换保留教师岗位');
    const lost = await student(teacher.id);
    const handover = await request('/resource-transfers/execute-batch', { fromTeacherId: teacher.id, assignments: [{ classId: activeClass.id, toTeacherId: recipient.id }], requestId: randomUUID() });
    assert.equal(handover.status, 200, JSON.stringify(handover.body));
    assert.equal((await change(teacher.id, { role: 'sales' })).status, 409); checks.push('班级交完但沉默回访未交完仍阻止改岗');
    const recallHandover = await request('/resource-transfers/dormant/execute-batch', { fromUserId: teacher.id, assignments: [{ kind: 'student', resourceId: lost.id, toUserId: recipient.id }], requestId: randomUUID() });
    assert.equal(recallHandover.status, 200, JSON.stringify(recallHandover.body));
    assert.equal((await change(teacher.id, { role: 'sales' })).status, 200);
    assert.equal((await p.class.findUniqueOrThrow({ where: { id: activeClass.id } })).teacherId, recipient.id);
    assert.equal((await p.student.findUniqueOrThrow({ where: { id: lost.id } })).recallTeacherId, recipient.id);
    checks.push('真实班级与沉默交接完成后可改岗，交接结果保留');
    for (const extra of [{ status: 'active', renewalStatus: 'no_renewal' }, { status: 'active', renewalStatus: null }]) {
      const owner = await person(); await student(owner.id, extra);
      assert.equal((await change(owner.id, { role: 'staff' })).status, 409);
    }
    checks.push('不续费及召回待入班两种回访责任均阻止改岗');
    const historical = await person(); await cls(historical.id, 'deleted'); await student(historical.id, { status: 'archived' });
    assert.equal((await change(historical.id, { role: 'staff' })).status, 200); checks.push('已删除班级和已归档学员不阻断改岗');
    const leadOwner = await person();
    const lead = await p.lead.create({ data: { organizationId: org.id, customerName: '保留线索', contact: '13900000000', assigneeId: leadOwner.id, status: 'new' } });
    assert.equal((await change(leadOwner.id, { role: 'sales' })).status, 200);
    assert.equal((await p.lead.findUniqueOrThrow({ where: { id: lead.id } })).assigneeId, leadOwner.id); checks.push('鱼池责任可随销售岗位保留，不额外强制交接');
    assert.equal((await change(recipient.id, { role: 'sales' }, leadOwner)).status, 403); checks.push('普通人员不能通过改岗接口绕过管理权限');
    const foreign = await p.organization.create({ data: { name: '外机构', code: randomUUID() } });
    const other = await person('coach', { organizationId: foreign.id, campusId: null });
    assert.equal((await change(other.id, { role: 'sales' })).status, 404); checks.push('跨机构目标拒绝修改');

    const racing = await person();
    let pending: ReturnType<typeof change> | undefined;
    await p.$transaction(async tx => {
      await lockScheduleWrites(tx, org.id);
      pending = change(racing.id, { role: 'staff' });
      for (let i = 0; ; i++) {
        const locks = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`;
        if (Number(locks[0].n)) break;
        assert(i < 100, 'Expected class-lock wait'); await new Promise(r => setTimeout(r, 20));
      }
      await tx.class.create({ data: { ...scope, teacherId: racing.id, name: '并发新班', code: randomUUID(), courseType: '篮球' } });
    }, { timeout: 10000 });
    assert.equal((await pending!).status, 409); assert.equal((await p.user.findUniqueOrThrow({ where: { id: racing.id } })).role, 'coach');
    checks.push('真实排课锁等待后重查新增班级，不能并发穿透改岗');

    const prices = [100, 0, null, 20.5, null];
    const orders = [];
    for (let i = 0; i < prices.length; i++) orders.push(await p.conversion.create({ data: { organizationId: org.id, salesId: teacher.id, studentName: '价格验收', contact: '13900000000', conversionDate: '2026-11-13', price: prices[i], courseType: i >= 3 ? 'renewal' : 'new', approvalStatus: 'confirmed' } }));
    await p.conversion.create({ data: { organizationId: org.id, salesId: teacher.id, studentName: '不应纳入', contact: '13900000000', conversionDate: '2026-11-13', price: 999, approvalStatus: 'voided' } });
    const rpc = (method: string, params: object) => request('/mcp', { jsonrpc: '2.0', id: randomUUID(), method, params });
    assert.equal((await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'isolated-review', version: '1' } })).status, 200);
    const stats = await rpc('tools/call', { name: 'get_sales_statistics', arguments: { startDate: '2026-11-13', endDate: '2026-11-13' } });
    assert.equal(stats.status, 200, JSON.stringify(stats.body));
    const data = JSON.parse(stats.body.result.content[0].text), row = data.statistics.find((r: any) => r.teacherId === teacher.id);
    assert.equal(row.orderCount, 5); assert.equal(row.orderAmount, 120.5); assert.equal(row.missingPriceCount, 2);
    assert.equal(row.newMissingPriceCount, 1); assert.equal(row.renewalMissingPriceCount, 1); assert.equal(row.newOrderAmount, 100);
    assert.match(data.caliber, /已知价格合计/); assert.match(data.caliber, /真实0元不算缺价/);
    checks.push('真实HTTP MCP统计区分0元与缺价，保留新签续费分类，排除作废');
    const after = await p.conversion.findMany({ where: { id: { in: orders.map(row => row.id) } }, orderBy: { id: 'asc' } });
    assert.equal(after.filter(row => row.price === null).length, 2); assert.equal(after.filter(row => row.price?.equals(0)).length, 1);
    checks.push('MCP查询后两笔历史缺价仍为NULL，真实零元仍为0');
    mkdirSync('../docs/acceptance/2026-11-13-system-review-fixes', { recursive: true });
    writeFileSync('../docs/acceptance/2026-11-13-system-review-fixes/http-results.json', JSON.stringify({ at: new Date().toISOString(), database: database.pathname.slice(1), passed: checks.length, checks }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, checks }));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => p.$disconnect());
