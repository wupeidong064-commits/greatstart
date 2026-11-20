/**
 * 机构数据说明（org profile）—— 供外部 AI 理解机构背景的静态快照导出
 *
 * 产品边界（第一版）：
 * - 只提供白名单内的概况资料（机构基础/教学概况/规模汇总/口径说明），静态导出；
 *   不建设 MCP、外部 API 授权、自动同步或任何业务操作能力。
 * - 白名单在服务端执行：响应只含 markdown 全文与元信息，不夹带任何明细记录。
 * - 禁出：学员/家长个人信息、教师联系方式与薪酬、个人出勤/课时/续费/订单/流水、
 *   精确课表、内部备注、风险名单、AI 分析结果、账号/令牌/接口/数据库信息。
 * - 24 小时快照缓存：按 机构+授权校区范围 隔离；命中即复用（generatedAt 不变），
 *   过期后在下次访问时重新生成；不提供实时刷新或绕过缓存的入口。
 * - 机构与校区范围由登录身份决定（req.user），不信任任何前端提交的机构/校区参数。
 * - 统计复用现有业务口径（在读=活跃报名去重学员、在开=classes.active、在职教师=teacher/coach）。
 * - 不调用 AI 模型生成任何内容。
 */
import { Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';

/** 快照 TTL：24 小时 */
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

interface OrgProfileSnapshot {
  generatedAt: string; // ISO
  orgName: string;
  campusNames: string[];
  markdown: string;
}

/** 按 机构+授权校区范围 隔离的快照缓存（进程内；重启后下次访问重新生成） */
const snapshotCache = new Map<string, { snapshot: OrgProfileSnapshot; expiresAt: number }>();

const pad = (n: number) => String(n).padStart(2, '0');
const localDateTime = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

function buildMarkdown(input: {
  orgName: string;
  campusNames: string[];
  courseNames: string[];
  categories: { type: string; activeClasses: number }[];
  activeStudents: number;
  activeClasses: number;
  teachers: number;
  generatedAt: string;
  hasCampusScope: boolean;
}): string {
  const L: string[] = [];
  L.push('# 机构数据说明');
  L.push('');
  L.push('## 资料范围');
  L.push(`机构：${input.orgName}`);
  L.push(`校区范围：${input.campusNames.length ? input.campusNames.join('、') : '（未设置校区）'}`);
  L.push(`资料生成时间：${input.generatedAt}`);
  L.push('说明：本资料为机构概况快照，不代表实时业务状态。');
  L.push('');
  L.push('## 机构与课程');
  if (input.courseNames.length) {
    L.push(`课程：${input.courseNames.join('、')}`);
  }
  if (input.categories.length) {
    L.push('班型概况：');
    for (const c of input.categories) {
      L.push(`- ${c.type}：在开班级 ${c.activeClasses} 个`);
    }
  } else {
    L.push('班型概况：暂无在开班级。');
  }
  L.push('');
  L.push('## 规模汇总');
  L.push(`- 在读学员：${input.activeStudents} 人`);
  L.push(`- 在开班级：${input.activeClasses} 个`);
  L.push(`- 在职教师：${input.teachers} 人`);
  L.push('');
  L.push('## 统计口径');
  L.push('- 在读学员：授权范围内存在有效（active）报名记录的去重学员数。');
  L.push('- 在开班级：授权范围内状态为 active 的班级数。');
  L.push('- 在职教师：机构内角色为老师/教练的账号数' + (input.hasCampusScope ? '（按授权校区过滤）。' : '。'));
  L.push(`- 资料生成时间：${input.generatedAt}；本资料每 24 小时更新一次。`);
  L.push('');
  L.push('## 使用说明');
  L.push('本资料用于理解机构背景。');
  L.push('未包含个人明细、交易记录与实时业务数据。');
  L.push('需要准确业务结果时，请回到系统查询。');
  L.push('');
  return L.join('\n');
}

async function generateSnapshot(organizationId: string, campusScopeId: string | null): Promise<OrgProfileSnapshot> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  if (!org) {
    throw new ApiError('机构不存在', 404, 'ORG_NOT_FOUND');
  }

  const campuses = await prisma.campus.findMany({
    where: { organizationId, ...(campusScopeId ? { id: campusScopeId } : {}) },
    select: { name: true },
    orderBy: { createdAt: 'asc' },
  });

  // 课程名称（机构级模板，白名单仅名称——不含价格/描述）
  const courses = await prisma.course.findMany({
    where: { organizationId, isActive: true },
    select: { name: true },
    orderBy: { createdAt: 'asc' },
  });

  const classWhere = {
    organizationId,
    status: 'active',
    ...(campusScopeId ? { campusId: campusScopeId } : {}),
  };
  const classes = await prisma.class.findMany({ where: classWhere, select: { courseType: true } });

  // 在读学员：范围内班级的有效报名去重（与课消统计 baseCount 同口径）
  const enrollments = await prisma.enrollment.findMany({
    where: { organizationId, status: 'active', class: { ...classWhere } },
    select: { studentId: true },
  });

  // 在职教师：teacher/coach 角色；受限校区时按教师所属校区过滤
  const teachers = await prisma.user.count({
    where: {
      organizationId,
      role: { in: ['teacher', 'coach'] },
      ...(campusScopeId ? { campusId: campusScopeId } : {}),
    },
  });

  const categoryMap = new Map<string, number>();
  for (const c of classes) {
    const t = c.courseType || '未分类';
    categoryMap.set(t, (categoryMap.get(t) || 0) + 1);
  }

  const generatedAtDate = new Date();
  const snapshot: OrgProfileSnapshot = {
    orgName: org.name,
    campusNames: campuses.map((c) => c.name),
    generatedAt: localDateTime(generatedAtDate),
    markdown: buildMarkdown({
      orgName: org.name,
      campusNames: campuses.map((c) => c.name),
      courseNames: courses.map((c) => c.name),
      categories: Array.from(categoryMap.entries())
        .map(([type, count]) => ({ type, activeClasses: count }))
        .sort((a, b) => a.type.localeCompare(b.type)),
      activeStudents: new Set(enrollments.map((e) => e.studentId)).size,
      activeClasses: classes.length,
      teachers,
      generatedAt: localDateTime(generatedAtDate),
      hasCampusScope: !!campusScopeId,
    }),
  };
  return snapshot;
}

export const orgProfileController = {
  /** GET /api/org-profile —— 获取（或复用 24h 内的）机构概况快照 */
  getProfile: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      // 机构与校区范围只取自登录身份，忽略请求参数
      const organizationId = user?.organizationId;
      const campusScopeId = user?.campusId ?? null;
      if (!organizationId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      const cacheKey = `${organizationId}:${campusScopeId ?? 'ALL'}`;
      const cached = snapshotCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return sendSuccess(res, cached.snapshot);
      }

      const snapshot = await generateSnapshot(organizationId, campusScopeId);
      snapshotCache.set(cacheKey, { snapshot, expiresAt: Date.now() + SNAPSHOT_TTL_MS });
      sendSuccess(res, snapshot);
    } catch (error) {
      next(error);
    }
  },
};
