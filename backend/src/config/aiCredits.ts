/**
 * 校区 AI 积分服务 · 平台配置（唯一来源，业务代码不写死）
 *
 * - 记账单位：微积分（1 积分 = 10000 微积分），整数运算，结算单次舍入。
 * - 换算：1 元模型成本额度 = 100 积分。
 * - 套餐：基础包 ¥68 → 2,000 积分；进阶包 ¥168 → 6,800 积分。
 * - 真实模型价格由平台核定后显式发布；不为未知模型自动生成示例价。
 * - 账单在下单（预留）时快照价格版本，历史消费不随调价变化。
 */

/** 1 积分 = 10000 微积分 */
export const CREDIT_MICROS = 10_000;
/** 1 元模型成本额度 = 100 积分 */
export const CREDITS_PER_YUAN = 100;

/** 充值套餐（credits 为积分） */
export const AI_PACKAGES: Record<string, { name: string; priceYuan: number; credits: number }> = {
  basic: { name: '基础包', priceYuan: 68, credits: 2000 },
  advanced: { name: '进阶包', priceYuan: 168, credits: 6800 },
};

/** 对话输出上限与下限（token）：预留与 affordable 检查共用 */
export const CHAT_MAX_OUTPUT_TOKENS = 2048;
export const CHAT_MIN_OUTPUT_TOKENS = 256;
/** 预留账单超时（毫秒）：超时未结算视为中断/重启遗留，释放预留并转待核对 */
export const RESERVE_STALE_MS = 30 * 60 * 1000;

/** 只有 mock 可显式初始化零价；真实模型必须由平台发布已核定价格。 */
export function priceSeedForModel(model: string): { inputMicrosPer1k: number; outputMicrosPer1k: number; note: string } {
  if (model === 'mock-recorded-v1') return {inputMicrosPer1k:0,outputMicrosPer1k:0,note:'mock 零成本验收，禁止计为真实消费'};
  throw new Error(`模型 ${model} 没有经过核定的默认价格，请显式发布已核实价格版本`);
}

/** 微积分 → 展示字符串（最多 4 位小数，去尾零） */
export function fmtCredits(micros: number): string {
  const sign = micros < 0 ? '-' : '';
  const abs = Math.abs(micros);
  const int = Math.floor(abs / CREDIT_MICROS);
  const frac = abs % CREDIT_MICROS;
  if (frac === 0) return `${sign}${int}`;
  const fracStr = String(frac).padStart(4, '0').replace(/0+$/, '');
  return `${sign}${int}.${fracStr}`;
}

/** fmtCredits 别名（服务层命名） */
export const fmtMicros = fmtCredits;

/** 微积分 → 数字（用于前端数值展示） */
export function microsToNumber(micros: number): number {
  return micros / CREDIT_MICROS;
}

/** 积分（整数或小数）→ 微积分（半向上取整到微积分粒度） */
export function creditsToMicros(credits: number): number {
  return Math.round(credits * CREDIT_MICROS);
}
