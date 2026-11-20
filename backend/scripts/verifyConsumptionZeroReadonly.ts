// Read-only verification against the current acceptance database. No fixture writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import express from 'express';
import jwt from 'jsonwebtoken';
import p from '../src/config/database';
import { authenticate, sessionTag } from '../src/middleware/auth';
import { securityConfig } from '../src/config/security';
import { errorHandler } from '../src/middleware/errorHandler';
import { teachingPerformance, personnelOptions } from '../src/services/personnelStatisticsService';
import { consumptionRoutes } from '../src/routes/consumption';
import { sessionUser } from '../src/services/managementAccess';
const evidence = '../docs/acceptance/2026-11-13-consumption-zero-default';
async function main() {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/buzzer_human_e519c5c0');
  const mode: any = await p.$queryRaw`SHOW default_transaction_read_only`;
  assert.equal(mode[0].default_transaction_read_only, 'on');
  const teacher = await p.user.findFirstOrThrow({ where: { name: 'test1', role: 'coach', isActive: true } });
  const admin = await p.user.findFirstOrThrow({ where: { organizationId: teacher.organizationId, campusId: teacher.campusId, isActive: true, OR: [{ managementLevel: { in: ['super', 'manager'] } }, { role: { in: ['admin', 'manager'] } }] } });
  const token = (u: typeof teacher) => jwt.sign({ userId: u.id, sessionTag: sessionTag(u.password) }, securityConfig.jwt.secret, { expiresIn: '15m' });
  const app = express();
  app.use((req, res, next) => req.method === 'GET' ? next() : res.status(405).json({ error: { message: 'Read-only verifier' } }));
  app.get('/api/auth/me', authenticate, async (req: any, res, next) => { try { const u = await p.user.findUniqueOrThrow({ where: { id: req.user.id } }); res.json({ success: true, data: sessionUser(u) }); } catch(e) { next(e); } });
  app.get('/api/users/teachers', authenticate, async (req: any, res, next) => { try { res.json({ success: true, data: await personnelOptions(req) }); } catch(e) { next(e); } });
  app.get('/api/users/coach-statistics', authenticate, async (req: any, res, next) => { try { res.json({ success: true, data: await teachingPerformance(req) }); } catch(e) { next(e); } });
  app.use('/api/consumption', consumptionRoutes); app.use(errorHandler);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const baseApi = `http://127.0.0.1:${(server.address() as any).port}`;
  const get = async (u: typeof teacher, path: string) => { const r = await fetch(baseApi + '/api' + path, { headers: { Authorization: 'Bearer ' + token(u) } }); assert.equal(r.status, 200); return (await r.json() as any).data; };
  try {
    const teachers = await get(teacher, '/users/coach-statistics?startDate=2026-11-01&endDate=2026-11-13');
    assert.equal(teachers.length, 1); assert.equal(teachers[0].teacherId, teacher.id);
    const mine = teachers[0]; assert.equal(typeof mine.actualConsumptionAmount, 'number'); assert.equal(mine.actualConsumptionAmount, mine.knownConsumptionAmount);
    assert(!/待核|已核部分|金额尚未计入/.test(mine.consumptionNote));
    const summary = await get(admin, '/consumption/statistics?startDate=2026-11-01&endDate=2026-11-13');
    assert.equal(typeof summary.actualConsumptionAmount, 'number'); assert.equal(summary.totalRevenue, summary.actualConsumptionAmount); assert.equal(summary.confirmedRevenue, summary.actualConsumptionAmount);
    assert(!/待核|已核部分|金额尚未计入/.test(summary.revenueNote));
    writeFileSync(evidence + '/source-http.json', JSON.stringify({ at: new Date().toISOString(), databaseReadOnly: true, teacher: { amount: mine.actualConsumptionAmount, unpricedLessons: mine.unpricedConsumptionLessons }, summary: { amount: summary.actualConsumptionAmount, unpricedLessons: summary.unpricedConsumptionLessons }, passed: 3, checks: ['教师本人范围统计金额按零元默认返回数值，原始缺价依据保留', '机构实际课消、总收入、确认收入金额同源，无待核说明', 'PostgreSQL default_transaction_read_only=on，接口只允许GET'] }, null, 2));
    const config = { baseApi, profiles: { teacher: { user: sessionUser(teacher), token: token(teacher) }, admin: { user: sessionUser(admin), token: token(admin) } } };
    await new Promise<void>((resolve, reject) => { const child = spawn(process.execPath, ['scripts/verifyConsumptionZeroUi.mjs'], { cwd: '../frontend', env: { ...process.env, CONSUMPTION_ZERO_QA: JSON.stringify(config) }, stdio: ['ignore', 'inherit', 'inherit'] }); child.once('error', reject); child.once('exit', c => c === 0 ? resolve() : reject(Error('Consumption browser verification failed'))); });
    console.log('PASS 3 read-only source HTTP checks');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
main().catch(e => { console.error(e); process.exitCode=1; }).finally(() => p.$disconnect());
