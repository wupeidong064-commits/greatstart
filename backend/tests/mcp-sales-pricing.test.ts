import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { db } = vi.hoisted(() => ({ db: { user: { findMany: vi.fn() }, conversion: { findMany: vi.fn() } } }));
vi.mock('../src/config/database', () => ({ default: db }));
vi.mock('../src/services/aiService', () => ({ buildOrgSnapshot: vi.fn(), LOW_ATTENDANCE_DEFAULT_DAYS: 30, LOW_ATTENDANCE_DEFAULT_THRESHOLD: 60 }));
import { buildMcpServer } from '../src/mcp/mcpServer';

const order = (price: string | null, courseType = 'new') => ({ salesId: 'seller', courseType, price: price === null ? null : new Prisma.Decimal(price) });
async function callSales() {
  const server = buildMcpServer({ organizationId: 'org', userId: 'manager', role: 'manager' });
  const client = new Client({ name: 'pricing-regression', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a);
  try {
    const result: any = await client.callTool({ name: 'get_sales_statistics', arguments: {} });
    return JSON.parse(result.content[0].text);
  } finally { await client.close(); await server.close(); }
}

describe('MCP销售统计缺价与真实零元', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findMany.mockResolvedValue([{ id: 'seller', name: '销售', role: 'sales' }]);
  });
  it('真实0元不是缺价，缺价同时保留单数与分类计数', async () => {
    const rows = [order('100'), order('0'), order(null), order('20.50', 'renewal'), order(null, '续费')];
    db.conversion.findMany.mockResolvedValue(rows);
    const data = await callSales();
    expect(data.statistics[0]).toMatchObject({ orderCount: 5, orderAmount: 120.5, missingPriceCount: 2,
      newOrderCount: 3, newOrderAmount: 100, newMissingPriceCount: 1,
      renewalOrderCount: 2, renewalOrderAmount: 20.5, renewalMissingPriceCount: 1 });
    expect(data.caliber).toContain('已知价格合计'); expect(data.caliber).toContain('缺价时不能将金额解释为完整销售额');
    expect(rows[2].price).toBeNull(); expect(rows[4].price).toBeNull();
    expect(db.conversion.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: 'org', approvalStatus: 'confirmed' });
  });
  it('全缺价与全部真实零元可以区分', async () => {
    db.conversion.findMany.mockResolvedValue([order(null)]);
    expect((await callSales()).statistics[0]).toMatchObject({ orderAmount: 0, missingPriceCount: 1 });
    db.conversion.findMany.mockResolvedValue([order('0')]);
    expect((await callSales()).statistics[0]).toMatchObject({ orderAmount: 0, missingPriceCount: 0 });
  });
  it('用十进制金额精确求和', async () => {
    db.conversion.findMany.mockResolvedValue([order('0.10'), order('0.20')]);
    expect((await callSales()).statistics[0]).toMatchObject({ orderAmount: 0.3, missingPriceCount: 0 });
  });
  it('无订单时保留人员行并返回零缺价', async () => {
    db.conversion.findMany.mockResolvedValue([]);
    expect((await callSales()).statistics[0]).toMatchObject({ orderCount: 0, orderAmount: 0, missingPriceCount: 0, renewalMissingPriceCount: 0 });
  });
});
