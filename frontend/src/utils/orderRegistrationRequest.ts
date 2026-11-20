import type { PendingRegistration } from './registrationRequest';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, canonical(v)]));
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('登记内容含无效数字');
  return value;
};

function parse(raw: string): PendingRegistration {
  try {
    const value = JSON.parse(raw);
    if (!value || !uuid.test(value.requestId) || !value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)
      || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new Error('invalid');
    return value;
  } catch { throw new Error('有无法读取的待确认成单，请先核对成单和课时，不要重复登记'); }
}

async function locked<T>(key: string, work: () => T): Promise<T> {
  if (!navigator.locks?.request) throw new Error('当前浏览器不支持安全成单，请使用新版浏览器');
  return navigator.locks.request(`signup-registration:${key}`, work);
}

function readAndMigrate(key: string): PendingRegistration | null {
  const raw = localStorage.getItem(key), legacy = sessionStorage.getItem(key);
  let current = raw === null ? null : parse(raw);
  if (legacy !== null) {
    const previous = parse(legacy);
    if (current && (current.requestId !== previous.requestId || JSON.stringify(canonical(current.payload)) !== JSON.stringify(canonical(previous.payload)))) {
      throw new Error('存在两笔待确认成单，请先联系管理员逐笔核对');
    }
    if (!current) {
      localStorage.setItem(key, legacy);
      if (localStorage.getItem(key) !== legacy) throw new Error('无法保存待确认成单');
      current = previous;
    }
    sessionStorage.removeItem(key);
  }
  return current;
}

export function readPendingSignup(key: string) {
  return locked(key, () => readAndMigrate(key));
}

export class SignupPendingConflict extends Error {
  constructor(public pending: PendingRegistration) { super('另一窗口有待确认成单，请先核对原登记'); this.name = 'SignupPendingConflict'; }
}

export function preparePendingSignup(key: string, payload: Record<string, unknown>, preview?: Record<string, unknown>) {
  return locked(key, () => {
    const existing = readAndMigrate(key), normalized = canonical(payload) as Record<string, unknown>;
    if (existing) {
      if (JSON.stringify(canonical(existing.payload)) !== JSON.stringify(normalized)) throw new SignupPendingConflict(existing);
      return { pending: existing, existing: true };
    }
    const pending: PendingRegistration = { requestId: crypto.randomUUID(), payload: normalized, createdAt: new Date().toISOString(), ...(preview ? { preview: canonical(preview) as Record<string, unknown> } : {}) };
    const raw = JSON.stringify(pending);
    localStorage.setItem(key, raw);
    if (localStorage.getItem(key) !== raw) throw new Error('无法保存成单重试记录，请检查浏览器存储');
    return { pending, existing: false };
  });
}

export function clearPendingSignup(key: string, requestId: string) {
  return locked(key, () => {
    const current = readAndMigrate(key);
    if (current?.requestId === requestId) {
      localStorage.removeItem(key);
      if (localStorage.getItem(key) !== null) throw new Error('成单已处理，但本机记录未清除，请重试原成单核对');
    }
  });
}

// A changed committed order is a reconciliation outcome, not proof that the original POST rolled back.
export function signupNeedsReview(error: unknown) {
  return (error as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code === 'USE_CONVERSION_CORRECTION';
}

export function acknowledgeReviewedSignup(key: string, requestId: string) {
  return locked(key, () => {
    const current = readAndMigrate(key);
    if (current?.requestId !== requestId) return;
    // Keep the original identifier after a deliberate acknowledgement; never silently replace it on a 409.
    const marker = JSON.stringify({ requestId, outcome: 'reviewed-changed-order', acknowledgedAt: new Date().toISOString() });
    localStorage.setItem(`${key}:last-reviewed`, marker);
    if (localStorage.getItem(`${key}:last-reviewed`) !== marker) throw new Error('无法保留核对记录，请重试');
    localStorage.removeItem(key);
    if (localStorage.getItem(key) !== null) throw new Error('无法结束待确认记录，请重试');
  });
}
