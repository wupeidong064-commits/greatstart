export type PendingRegistration = {
  requestId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  preview?: Record<string, unknown>;
};

type RegistrationActor = { id: string; organizationId?: string; campusId?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registrationStorageKey(kind: 'lead' | 'experience' | 'conversion', user: RegistrationActor) {
  if (!user.id || !user.organizationId || !user.campusId) throw new Error('未分配机构或校区，无法登记');
  return `pending-registration:v1:${JSON.stringify([user.organizationId, user.campusId, user.id, kind])}`;
}

export function readPendingRegistration(key: string): PendingRegistration | null {
  const raw = sessionStorage.getItem(key);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || !UUID.test(value.requestId) || !value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)
      || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new Error('invalid');
    return value;
  } catch {
    // The original operation may already have committed. Do not discard its key and create another.
    throw new Error('有无法读取的待确认登记，请联系管理员核对后再新增');
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('登记内容含有无效数字，请检查后重试');
  return value;
}

export function createPendingRegistration(key: string, payload: Record<string, unknown>, preview?: Record<string, unknown>): PendingRegistration {
  const normalized = canonical(payload) as Record<string, unknown>;
  const existing = readPendingRegistration(key);
  if (existing) {
    if (JSON.stringify(canonical(existing.payload)) !== JSON.stringify(normalized)) throw new Error('上一笔登记结果尚未确认，请先重试原登记');
    return existing;
  }
  const pending = { requestId: crypto.randomUUID(), payload: normalized, createdAt: new Date().toISOString(), ...(preview ? { preview: canonical(preview) as Record<string, unknown> } : {}) };
  const raw = JSON.stringify(pending);
  sessionStorage.setItem(key, raw);
  if (sessionStorage.getItem(key) !== raw) throw new Error('无法保存登记重试记录，请检查浏览器存储后再提交');
  return pending;
}

export function clearPendingRegistration(key: string) {
  sessionStorage.removeItem(key);
  if (sessionStorage.getItem(key) !== null) throw new Error('登记已保存，但无法清除本机重试记录；请重试原登记以核对结果');
}

export function isDefinitiveRegistrationFailure(error: unknown) {
  const e = error as { response?: { status?: number; data?: { error?: { code?: string } } } };
  const code = e?.response?.data?.error?.code || '';
  if (/IDEMPOTENCY|REQUEST_IN_PROGRESS|PAYLOAD_MISMATCH/.test(code)) return false;
  // Auth changes and transient errors do not establish the outcome of a previous request.
  return [400, 404, 409, 422].includes(e?.response?.status || 0);
}
