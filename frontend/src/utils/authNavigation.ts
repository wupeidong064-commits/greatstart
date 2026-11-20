export type SessionUser = { role?: string; isPlatformAdmin?: boolean; jobRole?: string | null; managementLevel?: string } | null | undefined;
export const isWorkUser = (user: SessionUser) => ['teacher', 'coach', 'sales', 'staff'].includes(user?.jobRole ?? user?.role ?? '');
export const managesCampus = (user: SessionUser) => !user?.isPlatformAdmin && ['admin', 'manager'].includes(user?.role || '');
export const canUseAi = managesCampus;
export function homeForUser(user: SessionUser): string {
  if (user?.isPlatformAdmin) return '/organizations';
  if (user?.role === 'parent') return '/student/schedules';
  if (canUseAi(user)) return '/ai';
  return isWorkUser(user) ? '/my-work' : '/favorites';
}
