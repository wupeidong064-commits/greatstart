import { LEGACY_ENTRY_EXPIRED_NOTICE } from './aiEntryService';

/** Customer chat carries deliverables, never internal query cards or diagnostic traces. */
export function publicChatCards(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<Record<string, unknown>>(card => {
    if (!card || typeof card !== 'object') return [];
    if (card.tool === 'operating_report' && typeof card.reportId === 'string')
      return [{ tool: 'operating_report', reportId: card.reportId, evidenceId: card.evidenceId,
        title: card.title, timeRange: card.timeRange }];
    if (card.tool === 'report_file' || card.type === 'file')
      return [{ tool: 'report_file', type: 'file', fileId: card.fileId, evidenceId: card.evidenceId,
        title: card.title, timeRange: card.timeRange, status: card.status,
        fileName: card.fileName, downloadUrl: card.downloadUrl, canRetry: card.canRetry,
        ...(card.status === 'failed' ? { error: '文件暂未生成成功，请重试。' } : {}) }];
    return [];
  });
}

export function publicVerificationNotice(usage: unknown, internalCards?: unknown): string | undefined {
  if (usage && typeof usage === 'object'
    && ['collecting', 'ready'].includes((usage as any).pendingEntry?.status))
    return LEGACY_ENTRY_EXPIRED_NOTICE;
  // The stored answer already renders any failed source next to the verified results.
  if (usage && typeof usage === 'object' && (usage as any).operatingAnswer?.version) return undefined;
  if (Array.isArray(internalCards) && internalCards.some(c => c?.error && c.tool !== 'report_file' && c.type !== 'file'))
    return '这条历史回答的数据查询未完整完成，请重新提问。';
  return usage && typeof usage === 'object' && Array.isArray((usage as any).numericWarnings)
    && (usage as any).numericWarnings.length > 0 ? '回答中部分数字尚未完成核验，请核对后使用。' : undefined;
}
