"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orgProfileController = void 0;
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
/** 快照 TTL：24 小时 */
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
/** 按 机构+授权校区范围 隔离的快照缓存（进程内；重启后下次访问重新生成） */
const snapshotCache = new Map();
const pad = (n) => String(n).padStart(2, '0');
const localDateTime = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
function buildMarkdown(input) {
    const L = [];
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
    }
    else {
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
async function generateSnapshot(organizationId, campusScopeId) {
    const org = await database_1.default.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
    });
    if (!org) {
        throw new errorHandler_1.ApiError('机构不存在', 404, 'ORG_NOT_FOUND');
    }
    const campuses = await database_1.default.campus.findMany({
        where: { organizationId, ...(campusScopeId ? { id: campusScopeId } : {}) },
        select: { name: true },
        orderBy: { createdAt: 'asc' },
    });
    // 课程名称（机构级模板，白名单仅名称——不含价格/描述）
    const courses = await database_1.default.course.findMany({
        where: { organizationId, isActive: true },
        select: { name: true },
        orderBy: { createdAt: 'asc' },
    });
    const classWhere = {
        organizationId,
        status: 'active',
        ...(campusScopeId ? { campusId: campusScopeId } : {}),
    };
    const classes = await database_1.default.class.findMany({ where: classWhere, select: { courseType: true } });
    // 在读学员：范围内班级的有效报名去重（与课消统计 baseCount 同口径）
    const enrollments = await database_1.default.enrollment.findMany({
        where: { organizationId, status: 'active', class: { ...classWhere } },
        select: { studentId: true },
    });
    // 在职教师：teacher/coach 角色；受限校区时按教师所属校区过滤
    const teachers = await database_1.default.user.count({
        where: {
            organizationId,
            role: { in: ['teacher', 'coach'] },
            ...(campusScopeId ? { campusId: campusScopeId } : {}),
        },
    });
    const categoryMap = new Map();
    for (const c of classes) {
        const t = c.courseType || '未分类';
        categoryMap.set(t, (categoryMap.get(t) || 0) + 1);
    }
    const generatedAtDate = new Date();
    const snapshot = {
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
exports.orgProfileController = {
    /** GET /api/org-profile —— 获取（或复用 24h 内的）机构概况快照 */
    getProfile: async (req, res, next) => {
        try {
            const user = req.user;
            // 机构与校区范围只取自登录身份，忽略请求参数
            const organizationId = user?.organizationId;
            const campusScopeId = user?.campusId ?? null;
            if (!organizationId) {
                return next(new errorHandler_1.ApiError('未分配机构', 403, 'FORBIDDEN'));
            }
            const cacheKey = `${organizationId}:${campusScopeId ?? 'ALL'}`;
            const cached = snapshotCache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now()) {
                return (0, response_1.sendSuccess)(res, cached.snapshot);
            }
            const snapshot = await generateSnapshot(organizationId, campusScopeId);
            snapshotCache.set(cacheKey, { snapshot, expiresAt: Date.now() + SNAPSHOT_TTL_MS });
            (0, response_1.sendSuccess)(res, snapshot);
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=orgProfileController.js.map