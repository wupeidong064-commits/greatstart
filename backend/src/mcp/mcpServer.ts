import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { authenticateIntegration } from '../middleware/integrationAuth';
import { ApiError } from '../middleware/errorHandler';
import { computeStudentSessions } from '../services/attendanceStatsService';
import { currentEnrollmentWhere } from '../services/currentEnrollment';
import { followupOccurrenceWhere } from '../services/followupOccurrences';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import {
  buildOrgSnapshot,
  LOW_ATTENDANCE_DEFAULT_DAYS,
  LOW_ATTENDANCE_DEFAULT_THRESHOLD,
} from '../services/aiService';

/**
 * MCP Server（只读）—— 把课务系统的经营数据以标准 MCP Tools 暴露给 AI 客户端（如 Claude）。
 *
 * 边界（务必维持）：
 * - 全部工具只读；任何写数据库的能力不得注册为 MCP 工具。
 * - 所有查询强制 organizationId 隔离（来自服务端认证身份），不接受客户端传入机构参数。
 * - 所有列表类输出有 LIMIT 保护，避免全量导出。
 * - 续费名单工具暂缓：口径内联在 studentController.getRenewalStudents，
 *   需先抽成 service 再接入，避免复刻出错口径（见 docs/mcp-integration.md 待开发清单）。
 */

export interface McpOrgContext {
  organizationId: string;
  userId: string;
  role: string;
}

// ============ 工具实现的共享小工具 ============

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

function asBoundedInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function isoDate(v: unknown): string | null {
  const s = asString(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : s;
}

function jsonText(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

// ============ 工具：具体实现 ============

async function toolContextSummary(ctx: McpOrgContext) {
  const snapshot = await buildOrgSnapshot(ctx.organizationId);
  return jsonText({ ...snapshot, errors: snapshot.errors.map(() => '部分指标查询失败，请稍后重试') });
}

async function toolListTeachers(ctx: McpOrgContext, args: Record<string, unknown>) {
  const search = asString(args.search);
  const data = await prisma.user.findMany({
    where: {
      organizationId: ctx.organizationId, role: { not: 'parent' }, isPlatformAdmin: false, isActive: true,
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    },
    select: { id: true, name: true, role: true, phone: true, email: true, isActive: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }], take: 100,
  });
  return jsonText({ teachers: data || [], count: data?.length ?? 0 });
}

async function toolListStudents(ctx: McpOrgContext, args: Record<string, unknown>) {
  const search = asString(args.search);
  const limit = asBoundedInt(args.limit, 20, 1, 50);
  const data = await prisma.student.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    },
    select: { id: true, name: true, phone: true, status: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: limit,
  });
  return jsonText({
    students: data || [],
    count: data?.length ?? 0,
    note: '最多返回 50 条，可传 search 按姓名检索',
  });
}

/** Uses the same occurrence/enrollment-period facts as the current low-attendance page. */
async function toolLowAttendanceStudents(ctx: McpOrgContext, args: Record<string, unknown>) {
  const days = asBoundedInt(args.days, LOW_ATTENDANCE_DEFAULT_DAYS, 1, 90);
  const threshold = asBoundedInt(args.threshold, LOW_ATTENDANCE_DEFAULT_THRESHOLD, 1, 99);
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const end = new Date(`${today}T23:59:59.999+08:00`);
  const start = new Date(new Date(`${today}T00:00:00+08:00`).getTime() - (days - 1) * 86400000);
  const classes = await prisma.class.findMany({
    where: { organizationId: ctx.organizationId, status: 'active' },
    select: { id: true, name: true, teacher: { select: { name: true } } },
  });
  const classIds = classes.map(c => c.id);
  const schedules = await prisma.schedule.findMany({
    where: { organizationId: ctx.organizationId, classId: { in: classIds }, ...followupOccurrenceWhere(), startTime: { gte: start, lte: end } },
    select: { id: true, classId: true, startTime: true, endTime: true },
  });
  const [enrollments, attendances, students] = await Promise.all([
    prisma.enrollment.findMany({ where: { organizationId: ctx.organizationId, classId: { in: classIds } },
      select: { studentId: true, classId: true, enrolledAt: true, endedAt: true, status: true } }),
    prisma.attendance.findMany({ where: { organizationId: ctx.organizationId, scheduleId: { in: schedules.map(s => s.id) } },
      select: { studentId: true, classId: true, scheduleId: true, status: true, isTemporary: true } }),
    prisma.student.findMany({ where: { organizationId: ctx.organizationId, status: 'active',
      OR: [{ renewalStatus: null }, { renewalStatus: { not: 'no_renewal' } }],
      enrollments: { some: currentEnrollmentWhere({ organizationId: ctx.organizationId }) } },
      select: { id: true, name: true, phone: true } }),
  ]);
  const studentMap = new Map(students.map(s => [s.id, s]));
  const classMap = new Map(classes.map(c => [c.id, c]));
  const rows = computeStudentSessions({ schedules, enrollments, attendances })
    .filter(f => f.rate !== null && f.rate < threshold)
    .flatMap(f => {
      const student = studentMap.get(f.studentId), cls = classMap.get(f.classId);
      return student && cls ? [{ studentId: student.id, studentName: student.name, phone: student.phone,
        className: cls.name, teacherName: cls.teacher?.name ?? null, scheduleCount: f.expected,
        presentCount: f.present, attendanceRate: f.rate }] : [];
    }).sort((a, b) => (a.attendanceRate ?? 0) - (b.attendanceRate ?? 0));
  return jsonText({ days, threshold, startDate: start.toISOString(), endDate: end.toISOString(),
    caliber: `上海日历近 ${days} 天；实到 / 应到课次 < ${threshold}%；按有效入班期间计算，含已过期未点名与临时串课，无应到课次不列入`,
    total: rows.length, students: rows.slice(0, 50) });
}

/**
 * 销售统计（口径与 GET /users/sales-statistics 一致）：
 * 成单金额=conversions.price 合计，按 salesId 归属；新单/续费按 courseType 区分。
 */
async function toolSalesStatistics(ctx: McpOrgContext, args: Record<string, unknown>) {
  const startDate = isoDate(args.startDate);
  const endDate = isoDate(args.endDate);

  const [salesStaff, allConversions] = await Promise.all([
    prisma.user.findMany({
      where: {
        organizationId: ctx.organizationId,
        role: { not: 'parent' }, isPlatformAdmin: false,
      },
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.conversion.findMany({
      where: { organizationId: ctx.organizationId, approvalStatus: 'confirmed',
        ...(startDate || endDate ? { conversionDate: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } } : {}) },
      select: { id: true, salesId: true, courseType: true, price: true, conversionDate: true },
    }),
  ]);

  const isRenewal = (courseType?: string | null): boolean => {
    if (!courseType) return false;
    const ct = courseType.toLowerCase();
    return ct === '续费' || ct === 'renewal' || ct === '续报';
  };

  const summarize = (rows: typeof allConversions) => {
    let amount = new Prisma.Decimal(0);
    let missing = 0;
    for (const row of rows) {
      if (row.price === null) missing++;
      else amount = amount.plus(row.price);
    }
    return { count: rows.length, amount: Number(amount.toString()), missing };
  };
  const statistics = (salesStaff || []).map((s) => {
    const mine = (allConversions || []).filter(
      (c) => c.salesId === s.id
    );
    const total = summarize(mine);
    const renewed = summarize(mine.filter(c => isRenewal(c.courseType)));
    const signed = summarize(mine.filter(c => !isRenewal(c.courseType)));
    return {
      teacherId: s.id,
      teacherName: s.name || s.email || '未知用户',
      role: s.role,
      orderCount: total.count,
      orderAmount: total.amount,
      missingPriceCount: total.missing,
      newOrderCount: signed.count,
      newOrderAmount: signed.amount,
      newMissingPriceCount: signed.missing,
      renewalOrderCount: renewed.count,
      renewalOrderAmount: renewed.amount,
      renewalMissingPriceCount: renewed.missing,
    };
  });
  statistics.sort((a: any, b: any) => b.orderAmount - a.orderAmount);

  return jsonText({
    startDate: startDate || '不限',
    endDate: endDate ? `${endDate}（含当天）` : '不限',
    caliber:
      '仅已确认成单，作废单不计；所有金额为已知价格合计，缺价单计入单数但不计金额，missingPriceCount为缺价单数，真实0元不算缺价；缺价时不能将金额解释为完整销售额，不自动补价；未扣退款，不代表净现金流；按 salesId 归属，新单/续费按 courseType 区分',
    total: statistics.length, statistics: statistics.slice(0, 100),
  });
}

// ============ 工具清单（JSON Schema 声明，全部只读） ============

const TOOLS = [
  {
    name: 'get_context_summary',
    description:
      '获取机构经营速览：活跃班级数、在册学员数、本月成单数与金额（含新单/续费拆分）、低出勤学员数。全部为真实业务数据，60 秒缓存。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_teachers',
    description:
      '查询机构内的老师/工作人员列表（姓名、角色、联系方式），可按姓名模糊搜索。只读，最多 100 条。',
    inputSchema: {
      type: 'object',
      properties: { search: { type: 'string', description: '按姓名模糊搜索（可选）' } },
      additionalProperties: false,
    },
  },
  {
    name: 'list_students',
    description:
      '查询机构学员列表（姓名、电话、状态），可按姓名模糊搜索。只读，默认 20 条、最多 50 条。',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: '按姓名模糊搜索（可选）' },
        limit: { type: 'number', description: '返回条数，1-50，默认 20' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_low_attendance_students',
    description:
      '查询低出勤在读学员：默认上海日历近30天出勤率低于60%，按有效入班期间计算实到/应到，包含已过期未点名及临时串课；无应到不列入，最多50条。',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: '统计窗口天数，1-90，默认 30' },
        threshold: { type: 'number', description: '出勤率阈值（%），1-99，默认 60' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_sales_statistics',
    description:
      '查询已确认成单的销售统计：排除作废单，按销售归属人员统计已知价格合计及新单/续费，返回缺价单数并区分真实0元；缺价时金额不完整，未扣退款，最多100名人员。',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: '起始日期 YYYY-MM-DD（可选，按成单日期过滤）' },
        endDate: { type: 'string', description: '结束日期 YYYY-MM-DD（可选，含当天）' },
      },
      additionalProperties: false,
    },
  },
];

const dateArgument = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(s + 'T00:00:00Z');
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s;
});
const ARGUMENTS: Record<string, z.ZodType> = {
  get_context_summary: z.object({}).strict(),
  list_teachers: z.object({ search: z.string().max(100).optional() }).strict(),
  list_students: z.object({ search: z.string().max(100).optional(), limit: z.number().int().min(1).max(50).optional() }).strict(),
  get_low_attendance_students: z.object({ days: z.number().int().min(1).max(90).optional(), threshold: z.number().int().min(1).max(99).optional() }).strict(),
  get_sales_statistics: z.object({ startDate: dateArgument.optional(), endDate: dateArgument.optional() }).strict()
    .refine(a => !a.startDate || !a.endDate || a.startDate <= a.endDate),
};

// ============ Server 工厂（每请求实例化，无状态） ============

export function buildMcpServer(ctx: McpOrgContext): Server {
  const server = new Server(
    { name: 'buzzer-course-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS.map(tool => ({ ...tool,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  })) }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments || {}) as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(ARGUMENTS, name))
      throw new McpError(ErrorCode.InvalidParams, `未知工具: ${name}`);
    if (!ARGUMENTS[name].safeParse(args).success)
      throw new McpError(ErrorCode.InvalidParams, '工具参数无效，请按说明书提供参数；不能指定机构或校区');
    try {
      switch (name) {
        case 'get_context_summary':
          return await toolContextSummary(ctx);
        case 'list_teachers':
          return await toolListTeachers(ctx, args);
        case 'list_students':
          return await toolListStudents(ctx, args);
        case 'get_low_attendance_students':
          return await toolLowAttendanceStudents(ctx, args);
        case 'get_sales_statistics':
          return await toolSalesStatistics(ctx, args);
        default:
          return {
            content: [{ type: 'text', text: `未知工具: ${name}` }],
            isError: true,
          };
      }
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: '本次查询失败，请稍后重试；没有返回可用数据' }],
        isError: true,
      };
    }
  });

  return server;
}

// ============ 路由挂载（Streamable HTTP，无状态） ============

export const mcpRoutes = Router();

// Only this endpoint accepts integration keys. Do not run legacy body-injecting scope middleware on JSON-RPC.
mcpRoutes.use(rateLimit({ windowMs: 60000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }));
mcpRoutes.use(authenticateIntegration);
mcpRoutes.use(rateLimit({ windowMs: 60000, limit: 60, keyGenerator: (req: AuthRequest) => req.user!.organizationId!,
  standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: '本机构每分钟最多60次接入请求，请稍后重试' } } }));

mcpRoutes.post('/', async (req: AuthRequest, res, next) => {
  const user = req.user;
  if (!user?.organizationId) {
    res.status(403).json({ error: '未分配机构，无法使用 MCP' });
    return;
  }

  // 每个请求独立实例，机构上下文只能由服务端认证注入。
  const server = buildMcpServer({
    organizationId: user.organizationId,
    userId: user.id,
    role: user.role || '',
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    await transport.close();
    await server.close();
    if (!res.headersSent) next(e instanceof ApiError ? e : new ApiError('MCP 请求无法处理，请核对协议和请求格式', 400, 'INVALID_MCP_REQUEST'));
  }
});

// 无状态模式不支持 GET(SSE 长连) 与 DELETE(会话终止)
mcpRoutes.get('/', (_req, res) => {
  res.status(405).json({ error: 'MCP 端点为无状态模式，仅支持 POST' });
});
mcpRoutes.delete('/', (_req, res) => {
  res.status(405).json({ error: 'MCP 端点为无状态模式，仅支持 POST' });
});
