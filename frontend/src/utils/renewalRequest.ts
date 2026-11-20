/** Both renewal entry points share one durable receipt and one Web Lock per actor. */
export type PendingRenewal = {
  requestId: string;
  existingStudentId: string;
  studentName: string;
  classId: string | null;
  totalLessons: number;
  price: number | null;
  paymentMethod: string | null;
  paymentStatus: string;
  salesId: string | null;
  conversionDate: string;
  notes: string;
};
export type RenewalSnapshot = { pending: PendingRenewal | null; revision: string | null };
type Actor = { id: string; organizationId?: string; campusId?: string } | null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function renewalStorageKey(user: Actor) {
  if (!user?.id || !user.organizationId || !user.campusId) throw new Error('账号缺少机构或校区信息，无法办理续费');
  return `pending-renewal:v1:${JSON.stringify([user.organizationId, user.campusId, user.id])}`;
}
export function parsePendingRenewal(raw: string): PendingRenewal {
  try {
    const v = JSON.parse(raw);
    if (!v || !uuid.test(v.requestId) || typeof v.existingStudentId !== 'string' || !v.existingStudentId || typeof v.studentName !== 'string' ||
      !Number.isSafeInteger(v.totalLessons) || v.totalLessons <= 0 || typeof v.conversionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.conversionDate) ||
      (v.price !== null && (typeof v.price !== 'number' || !Number.isFinite(v.price) || v.price < 0)) ||
      !['classId', 'paymentMethod', 'salesId'].every(k => v[k] === null || typeof v[k] === 'string') ||
      typeof v.paymentStatus !== 'string' || typeof v.notes !== 'string') throw new Error('invalid');
    return v;
  } catch { throw new Error('存在无法读取的待确认续费记录，请先联系管理员核对成单及课时，不要重复提交。'); }
}
async function locked<T>(key: string, work: () => T): Promise<T> {
  if (!key) throw new Error('账号状态无效，无法办理续费');
  if (!navigator.locks?.request) throw new Error('当前浏览器不支持安全续费，请使用新版浏览器。');
  return navigator.locks.request(`renewal-storage:${key}`, work);
}
const canonical = (v: PendingRenewal) => JSON.stringify(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
function read(key: string): RenewalSnapshot {
  const revision = localStorage.getItem(`${key}:settled`);
  if (revision !== null && !uuid.test(revision)) throw new Error('续费核对记录损坏，请联系管理员核对');
  const raw = localStorage.getItem(key), legacy = sessionStorage.getItem(key);
  let pending = raw === null ? null : parsePendingRenewal(raw);
  if (legacy !== null) {
    const old = parsePendingRenewal(legacy);
    // A tab's old session receipt must never resurrect an already confirmed request.
    if (old.requestId !== revision) {
      if (pending && canonical(pending) !== canonical(old)) throw new Error('存在两笔待确认续费，请先联系管理员逐笔核对。');
      if (!pending) {
        localStorage.setItem(key, legacy);
        if (localStorage.getItem(key) !== legacy) throw new Error('无法保存待确认续费记录');
        pending = old;
      }
    }
    sessionStorage.removeItem(key);
    if (sessionStorage.getItem(key) !== null) throw new Error('无法迁移待确认续费记录');
  }
  // Clearing may have stopped between writing the settlement marker and removing the receipt.
  if (pending?.requestId === revision) {
    localStorage.removeItem(key);
    if (localStorage.getItem(key) !== null) throw new Error('无法清除已核对续费记录');
    pending = null;
  }
  return { pending, revision };
}
export function readRenewalSnapshot(key: string) { return locked(key, () => read(key)); }
export class RenewalPendingConflict extends Error {
  constructor(public snapshot: RenewalSnapshot) {
    super(snapshot.pending ? '另一窗口有待确认续费，请核对原记录后重试' : '此表单对应的续费已由另一窗口处理，请关闭后重新打开再登记新一笔');
    this.name = 'RenewalPendingConflict';
  }
}
export function preparePendingRenewal(key: string, payload: Omit<PendingRenewal, 'requestId'>, observed: RenewalSnapshot) {
  return locked(key, () => {
    const current = read(key);
    if (current.revision !== observed.revision || current.pending?.requestId !== observed.pending?.requestId) throw new RenewalPendingConflict(current);
    if (current.pending) return { pending: current.pending, existing: true };
    const pending = parsePendingRenewal(JSON.stringify({ ...payload, requestId: crypto.randomUUID() }));
    const raw = JSON.stringify(pending);
    localStorage.setItem(key, raw);
    if (localStorage.getItem(key) !== raw) throw new Error('无法保存待确认记录，请检查浏览器存储');
    return { pending, existing: false };
  });
}
export function clearPendingRenewal(key: string, requestId: string) {
  return locked(key, () => {
    const current = read(key);
    if (current.pending?.requestId !== requestId) return;
    localStorage.setItem(`${key}:settled`, requestId);
    if (localStorage.getItem(`${key}:settled`) !== requestId) throw new Error('无法保留续费核对记录，请重试原续费');
    localStorage.removeItem(key);
    if (localStorage.getItem(key) !== null) throw new Error('续费已处理，本机记录未清除，请重试原续费核对');
  });
}
export function acknowledgeReviewedRenewal(key: string, requestId: string, account: string) {
  return locked(key, () => {
    const current = read(key);
    if (current.pending?.requestId !== requestId) throw new RenewalPendingConflict(current);
    const marker = JSON.stringify({ requestId, account, outcome: 'reviewed-changed-order', acknowledgedAt: new Date().toISOString() });
    localStorage.setItem(`${key}:last-reviewed`, marker);
    if (localStorage.getItem(`${key}:last-reviewed`) !== marker) throw new Error('无法保留人工核对记录，请重试');
    localStorage.setItem(`${key}:settled`, requestId);
    if (localStorage.getItem(`${key}:settled`) !== requestId) throw new Error('无法保留续费核对记录，请重试');
    localStorage.removeItem(key);
    if (localStorage.getItem(key) !== null) throw new Error('无法结束待确认续费，请重试');
  });
}
export function isDefinitiveRenewalFailure(error: unknown) {
  const e = error as { response?: { status?: number; data?: { error?: { code?: string } } } };
  const code = e?.response?.data?.error?.code || '';
  if (/IDEMPOTENCY|REQUEST_IN_PROGRESS|PAYLOAD_MISMATCH/.test(code)) return false;
  return e?.response?.status === 400 || (e?.response?.status === 409 && ['MULTIPLE_CLASSES', 'CLASS_FULL', 'STUDENT_ARCHIVED', 'STUDENT_UNAVAILABLE', 'ENROLLMENT_HAS_FUTURE_ATTENDANCE', 'ENROLLMENT_ALREADY_ENDED', 'INVALID_ENROLLMENT_PERIOD', 'DUPLICATE_RENEWAL'].includes(code));
}
