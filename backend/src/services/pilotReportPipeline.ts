// 试点运营报告管线（CJS 服务模块的 TS 包装）：仅转发调用，不含业务逻辑
import fs from 'fs';
import path from 'path';
import { createHash } from 'node:crypto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const impl = require('./pilotReportPipelineV2.cjs') as { runPilotReportPipeline: (taskId: string, options?: unknown) => Promise<unknown> };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const facts = require('./reportFacts.cjs') as {
  validateRequest: (request: { kind?: string; periodStart?: unknown; periodEnd?: unknown }) => { kind: string; start: string; end: string; days: number };
};

export const validateReportRequest = facts.validateRequest;

export async function runPilotReportPipeline(taskId: string, options?: unknown): Promise<unknown> {
  return impl.runPilotReportPipeline(taskId, options);
}

const PILOT_REPORT_DIR = path.resolve(process.env.AI_REPORT_OUTPUT_DIR || path.join(process.cwd(), 'storage/operating-reports'));
const PILOT_TASK_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 安全校验后读取报告文件（basename 白名单 + 目录包含断言），失败返回 null */
export function readPilotReportFile(taskId: string, format: string, files?: Record<string, { path?: string; sha256?: string }>): Buffer | null {
  if (!PILOT_TASK_ID_RE.test(taskId)) return null;
  if (!['html', 'docx', 'xlsx'].includes(format)) return null;
  const metadata = files?.[format];
  const selected = metadata?.path;
  const name = selected ? path.basename(selected) : taskId + '.' + format;
  if (!new RegExp('^' + taskId + '(?:\\.presentation-\\d+)?\\.' + format + '$').test(name)) return null;
  const relocated = selected && path.dirname(path.resolve(selected)) !== PILOT_REPORT_DIR;
  if (relocated && !metadata?.sha256) return null;
  if (path.basename(name) !== name) return null;
  const resolved = path.resolve(PILOT_REPORT_DIR, name);
  if (!resolved.startsWith(PILOT_REPORT_DIR + path.sep)) return null;
  try {
    const buffer = fs.readFileSync(resolved);
    if (metadata?.sha256 && createHash('sha256').update(buffer).digest('hex') !== metadata.sha256) return null;
    return buffer;
  } catch {
    return null;
  }
}
