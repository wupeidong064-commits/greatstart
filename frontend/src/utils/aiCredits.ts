/**
 * 前端 AI 积分展示工具（与后端 config/aiCredits.ts 同一套换算）：
 * 1 积分 = 10000 微积分；账本精度不变，界面最多显示一位小数。
 */
export const CREDIT_MICROS = 10_000;

/** 积分单位 → 展示字符串；不用于入账或扣费运算。 */
export function formatCreditAmount(value: string | number): string {
  if (typeof value === 'string' && !value.trim()) return '—';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) : '—';
}

/** 微积分 → 展示字符串（如 "1.5"、"2,000"） */
export function fmtCredits(micros: number): string {
  return formatCreditAmount(micros / CREDIT_MICROS);
}
