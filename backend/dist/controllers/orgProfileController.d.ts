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
import { AuthRequest } from '../middleware/auth';
export declare const orgProfileController: {
    /** GET /api/org-profile —— 获取（或复用 24h 内的）机构概况快照 */
    getProfile: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=orgProfileController.d.ts.map