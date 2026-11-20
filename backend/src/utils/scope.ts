import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';

// 业务范围解析（G0 安全基线）。
// organizationId 与 campusId 只从鉴权身份读取；请求参数仅做一致性校验，不能扩大范围。
// 缺少 organizationId 一律拒绝，绝不解释为全部机构。

export interface RequestScope {
  organizationId: string;
  campusId: string | null; // null = 机构级（本机构全部校区），不是跨机构
}

export function resolveScope(req: AuthRequest): RequestScope {
  const user = (req as any).user;
  if (!user || typeof user.organizationId !== 'string' || !user.organizationId) {
    throw new ApiError('未分配机构，拒绝无范围查询', 403, 'FORBIDDEN');
  }
  const orgId: string = user.organizationId;
  const campusId: string | null = user.campusId ?? null;
  const q: any = (req as any).query || {};
  const b: any = (req as any).body || {};
  if (q.organizationId && q.organizationId !== orgId) {
    throw new ApiError('无权访问该机构数据', 403, 'ORG_MISMATCH');
  }
  if (b.organizationId && b.organizationId !== orgId) {
    throw new ApiError('无权访问该机构数据', 403, 'ORG_MISMATCH');
  }
  if (q.campusId && campusId && q.campusId !== campusId) {
    throw new ApiError('无权访问其他校区数据', 403, 'CAMPUS_MISMATCH');
  }
  if (b.campusId && campusId && b.campusId !== campusId) {
    throw new ApiError('无权访问其他校区数据', 403, 'CAMPUS_MISMATCH');
  }
  return { organizationId: orgId, campusId };
}

// 校区条件组装：机构级不过滤 campus（=本机构全部校区）；校区级严格等于本人校区
export function campusWhere(scope: RequestScope): { campusId?: string } {
  return scope.campusId ? { campusId: scope.campusId } : {};
}
