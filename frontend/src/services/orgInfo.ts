import api from './api';

/**
 * 机构信息（轻量缓存）：侧栏副标与首页问候语共用的机构名。
 * 登录响应只带 organizationId 不带名称，故按需拉取一次并缓存。
 */
const orgNamePromises = new Map<string, Promise<string | null>>();

export function fetchOrgName(orgId?: string): Promise<string | null> {
  if (!orgId) return Promise.resolve(null);
  if (!orgNamePromises.has(orgId)) {
    const promise = api
      .get(`/organizations/${orgId}`)
      .then((res: any) => {
        const name = res?.data?.name ?? res?.name ?? null;
        return typeof name === 'string' && name.length > 0 ? name : null;
      })
      .catch(() => null);
    orgNamePromises.set(orgId, promise);
  }
  return orgNamePromises.get(orgId)!;
}
