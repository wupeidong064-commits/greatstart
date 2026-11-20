import { describe, expect, it, vi } from 'vitest';
import { containsNul, rejectNul } from '../src/middleware/rejectNul';
import { parseUpload } from '../src/services/aiUploadService';

describe('空字符输入保护', () => {
  it('检查嵌套值和字段名，不把普通 null 或二进制内容当成空字符', () => {
    expect(containsNul({ nested: [null, '正常', { value: '错\0误' }] })).toBe(true);
    expect(containsNul({ ['字段\0名']: '正常' })).toBe(true);
    expect(containsNul({ nested: [null, '正常', Buffer.from([0, 1, 2])] })).toBe(false);
    const cyclic: any = {}; cyclic.self = cyclic;
    expect(containsNul(cyclic)).toBe(false);
  });
  it('正常文本放行，地址编码空字符和查询字段名拒绝', () => {
    const next = vi.fn();
    rejectNul({ path: '/students', query: { search: '学员' }, body: { notes: '正常' } } as any, {} as any, next);
    expect(next).toHaveBeenLastCalledWith();
    rejectNul({ path: '/students/a%00b', query: {}, body: {} } as any, {} as any, next);
    expect(next.mock.calls.at(-1)?.[0]).toMatchObject({ statusCode: 400, code: 'INVALID_NUL_CHARACTER' });
    rejectNul({ path: '/students', query: { ['bad\0key']: 'x' }, body: {} } as any, {} as any, next);
    expect(next.mock.calls.at(-1)?.[0]).toMatchObject({ statusCode: 400, code: 'INVALID_NUL_CHARACTER' });
  });
  it('CSV 第几行有空字符会明确指出，正常 CSV 可以解析', () => {
    expect(() => parseUpload(Buffer.from('姓名,备注\n小明,异常\0内容\n'), '资料.csv')).toThrow('第2行包含无法处理的空字符');
    expect(parseUpload(Buffer.from('姓名,备注\n小明,正常\n'), '资料.csv').rowCount).toBeGreaterThan(0);
  });
});
