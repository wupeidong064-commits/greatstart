import type { AiIntent } from './aiIntent';

export const CHAT_ENTRY_CLOSED_REPLY = '工作台已关闭通过聊天录入或修改业务数据。体验登记请到“体验课表”，新签请到“成单信息”，续费请使用学员的续费入口，学员建档请到“学员管理”，均按当前账号权限办理。附件仍可用于分析、核对和生成报告，不会写入业务档案。';
export const LEGACY_ENTRY_EXPIRED_NOTICE = '这条历史录入草稿已失效，工作台文字录入已关闭。请在相应业务页面办理。';

/** Presentation only. Actual safety comes from removal of every chat business writer. */
export function blockedChatEntryIntent(question: string, hasLegacyDraft = false): AiIntent | undefined {
  const q = question.trim();
  const closed = (): AiIntent => ({ parsedOk: true, reply: CHAT_ENTRY_CLOSED_REPLY });
  if (/^(?:确认录入|确认保存|确认提交|确认成单|确定录入|录入吧|保存吧|提交吧|继续录入|取消录入|放弃录入)[。！!\s]*$/.test(q)) return closed();
  if (hasLegacyDraft && /^(?:确认|确定|好的|可以|对|是的|继续)[。！!\s]*$/.test(q)) return closed();
  // Analysis, definitions and management advice remain available, including questions
  // referring to records that were registered in the business pages.
  const mixedWrite = /(?:然后|再|并|顺便)\s*(?:帮我|替我)?\s*(?:录入|登记|写入|创建|新增|修改|删除)/.test(q);
  if (/查询|查一下|查查|统计|分析|汇总|对比|比较|查看|列出|导出|生成报告|口径|定义|区别|多少|几笔|几单|哪些|是否|有没有/.test(q)
    && !mixedWrite) return undefined;
  if (hasLegacyDraft && /^(?:金额|课时|电话|联系方式|负责人|班级)\s*[：:]?\s*(?:\d|我)/.test(q)) return closed();
  if (/(?:体验课?|新签|学员|学生).{0,35}(?:成单了|成单啦|签约了|报名了)/.test(q)
    && !/吗|么|多少|几笔|几单|哪些|是否|有没有/.test(q)) return closed();
  const business = /体验|学员|学生|成单|新签|续费|订单|课时|档案|报名|课表|排课|班级|出勤|到课|缴费|退款|退费/;
  const mutate = /录入|录一下|登记|导入|写入|创建|新增|提交|保存|建档|修改|删除|作废|取消|签到|点名|扣课|上系统|记到|记进/;
  if (business.test(q) && mutate.test(q) && !/^(?:为什么|如何|怎么|怎样).*(?:口径|统计|分析|计算|定义|区别)/.test(q)) return closed();
  if (/(?:把|将).{0,12}(?:这些|这份|这个|上面的).{0,12}(?:录入|写入|存进|上系统)/.test(q)) return closed();
  return undefined;
}

/** Fail-closed compatibility for stale internal callers. No data services are imported. */
export async function handleEntry(_request: unknown, question: string, previous: unknown, _today: string) {
  const blocked = blockedChatEntryIntent(question, Boolean(previous));
  return blocked?.reply ? { reply: blocked.reply } : undefined;
}
