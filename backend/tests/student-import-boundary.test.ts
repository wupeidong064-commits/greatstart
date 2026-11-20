import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import { once } from 'node:events';
vi.mock('../src/middleware/auth', () => ({ authenticate: (_req: any, _res: any, next: any) => next() }));
vi.mock('../src/middleware/rbac', () => ({ requireOrganizationAccess: () => (_req: any, _res: any, next: any) => next() }));
const { transaction, campusFind } = vi.hoisted(() => ({ transaction: vi.fn(), campusFind: vi.fn().mockResolvedValue({ id: 'c' }) }));
vi.mock('../src/config/database', () => ({ default: { $transaction: transaction, campus: { findFirst: campusFind } } }));
vi.mock('../src/utils/studentAccess', () => ({ studentAccess: () => ({ actor: { id: 'u', role: 'admin', organizationId: 'o', campusId: 'c' }, management: true, where: {} }) }));
vi.mock('../src/services/studentResponsibility', () => ({ renewalAccess: () => ({ actor: { id: 'u', role: 'admin', organizationId: 'o', campusId: 'c' }, campus: { organizationId: 'o', campusId: 'c' }, management: true, where: {} }) }));
import { importRoutes } from '../src/routes/import';
import { errorHandler } from '../src/middleware/errorHandler';
import { validateStudentName, validateContactPhone, validateBusinessDate } from '../src/utils/studentProfileFields';
import { isValidContactPhone } from '../../frontend/src/utils/phone';
import { registerOrder } from '../src/services/orderRegistrationService';
import { orderProfileChanges } from '../src/services/studentOrderProfile';
import { studentController } from '../src/controllers/studentController';
import { renewStudentIdempotently } from '../src/services/renewalService';
const actor = { id: 'u', role: 'admin', organizationId: 'o', campusId: 'c' };
const request = (body: object) => ({ user: actor, body, get: () => undefined } as any);
describe('客户自助导入下线与学员资料边界', () => {
  it('旧导入接口返回关闭，其他接口可访问', async () => {
    const app = express(); app.use('/api/import', importRoutes); app.get('/api/export', (_req, res) => res.send('ok')); app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    try {
      const port = (server.address() as any).port;
      for (const [path, method] of [['/api/import/execute', 'POST'], ['/api/import/preview', 'POST'], ['/api/import/template/students', 'GET']]) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, { method });
        expect(response.status).toBe(410); expect((await response.json() as any).error.code).toBe('IMPORT_RETIRED');
      }
      expect((await fetch(`http://127.0.0.1:${port}/api/export`)).status).toBe(200);
    } finally { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
  });
  it('姓名为空、超长及 NUL 拒绝，50 字允许', () => {
    expect(validateStudentName('张'.repeat(50))).toHaveLength(50);
    for (const value of ['', '张'.repeat(51), '张\0三']) expect(() => validateStudentName(value)).toThrow();
  });
  it('电话可空，可用手机、座机和国际格式，非法字母及 NUL 被前后端拒绝', () => {
    for (const value of ['', '13800138000', '010-12345678', '+852 2345 6789']) { expect(() => validateContactPhone(value)).not.toThrow(); expect(isValidContactPhone(value)).toBe(true); }
    for (const value of ['abc123', '123', '1234\0'+'5678']) { expect(() => validateContactPhone(value)).toThrow(); expect(isValidContactPhone(value)).toBe(false); }
  });
  it('上海当天及过去允许，未来和无效日期拒绝', () => {
    const now = new Date('2026-11-15T16:00:00Z');
    expect(validateBusinessDate('2026-11-16', '成单日期', now)).toBe('2026-11-16');
    expect(validateBusinessDate('2020-01-01', '成单日期', now)).toBe('2020-01-01');
    expect(() => validateBusinessDate('2026-11-17', '成单日期', now)).toThrow('不能晚于今天');
    expect(() => validateBusinessDate('2026-02-30', '成单日期', now)).toThrow();
  });
  it('新签未来日期和超长姓名在事务前拒绝', async () => {
    transaction.mockClear();
    await expect(registerOrder(request({ conversionDate: '2099-01-01', studentName: '小明', contact: '13800138000' }))).rejects.toThrow('不能晚于今天');
    await expect(registerOrder(request({ studentName: '张'.repeat(51), contact: '13800138000' }))).rejects.toThrow('50');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('成单姓名修改校验，未改动历史姓名不强制改写', () => {
    const existing = { studentName: '张'.repeat(600), contact: '13800138000' } as any;
    expect(orderProfileChanges(existing, { studentName: existing.studentName })).toEqual({});
    expect(() => orderProfileChanges(existing, { studentName: '王'.repeat(51) })).toThrow('50');
  });
  it('新成单拒绝非电话联系方式且不进入事务',async()=>{
    transaction.mockReset();
    for(const contact of ['abc-def-!!!','wechat_123','123','1234\0'+'5678']){
      await expect(registerOrder(request({studentName:'电话回归',contact,totalLessons:10,price:1000}))).rejects.toMatchObject({code:'INVALID_PHONE'});
    }
    expect(transaction).not.toHaveBeenCalled();
  });
  it('编辑成单只校验新改的电话，保留原历史联系方式和备注编辑',()=>{
    const existing={contact:'历史微信号',notes:'原备注'} as any;
    expect(orderProfileChanges(existing,{contact:'历史微信号',notes:'新备注'})).toEqual({notes:'新备注'});
    expect(()=>orderProfileChanges(existing,{contact:'another_wechat'})).toThrow('电话号码');
    for(const contact of ['13800138000','010-12345678','+852 2345 6789'])expect(orderProfileChanges(existing,{contact})).toEqual({contact});
  });
  it('手动建档拒绝无效电话、超长姓名，正常号码可以进入创建事务', async () => {
    const call = async (body: any) => {
      const next = vi.fn(), res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await studentController.createStudent(request(body), res, next);
      return { next, res };
    };
    transaction.mockReset();
    for (const body of [{ name: '小明', phone: 'abc123' }, { name: '小明', parentPhone: 'abc123' }, { name: '张'.repeat(600) }]) {
      const result = await call(body); expect(result.next.mock.calls[0][0].statusCode).toBe(400);
    }
    expect(transaction).not.toHaveBeenCalled();
    const create = vi.fn().mockResolvedValue({ id: 's', name: '小明' });
    transaction.mockImplementation(async fn => fn({ student: { create } }));
    const result = await call({ name: '小明', phone: '010-12345678', parentPhone: '+852 2345 6789' });
    expect(result.next).not.toHaveBeenCalled();
    expect(create.mock.calls[0][0].data).toMatchObject({ phone: '010-12345678', parentPhone: '+852 2345 6789' });
  });
  it('续费未来日期在事务之前被拒绝', async () => {
    transaction.mockReset();
    await expect(renewStudentIdempotently(request({ existingStudentId: 's', totalLessons: 10, requestId: '11111111-1111-4111-8111-111111111111', conversionDate: '2099-01-01' }))).rejects.toThrow('不能晚于今天');
    expect(transaction).not.toHaveBeenCalled();
  });

});
