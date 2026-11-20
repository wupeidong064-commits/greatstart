import { describe, expect, it } from 'vitest';
import { publicChatCards, publicVerificationNotice } from '../src/services/aiChatPresentation';

describe('customer chat boundary', () => {
  it('keeps query plans, raw rows, filters and failed tool details on the server', () => {
    expect(publicChatCards([
      { tool: 'business_records', rows: [{ name: 'student' }], filters: { domain: 'students' }, modelText: 'internal', systemPrompt: 'secret' },
      { tool: 'business_records', error: 'missing domain', title: 'internal tool failed' },
    ])).toEqual([]);
  });
  it('retains usable report/file cards without nested internal payloads', () => {
    const cards = publicChatCards([
      { tool: 'operating_report', reportId: 'report', title: '周报', rows: ['internal'], usageJson: { calls: [] } },
      { type: 'file', tool: 'report_file', fileId: 'file', status: 'ready', downloadUrl: '/download', params: { domain: 'students' } },
      { tool: 'report_file', status: 'failed', error: 'prisma SQL internal error' },
    ]);
    expect(cards[0]).toMatchObject({ reportId: 'report', title: '周报' });
    expect(cards[1]).toMatchObject({ downloadUrl: '/download', fileId: 'file' });
    expect(JSON.stringify(cards)).not.toMatch(/internal|domain|prisma|usageJson/);
  });
  it('provides a useful verification notice without raw diagnostic values', () => {
    expect(publicVerificationNotice({ numericWarnings: ['999999', '200.31'] })).toBe('回答中部分数字尚未完成核验，请核对后使用。');
    expect(publicVerificationNotice({ numericWarnings: [] })).toBeUndefined();
    expect(publicChatCards(null)).toEqual([]);
  });
  it('keeps a simple reliability notice on old incomplete answers when raw error cards are hidden', () => {
    expect(publicVerificationNotice({}, [{ tool: 'business_records', error: 'missing domain' }]))
      .toBe('这条历史回答的数据查询未完整完成，请重新提问。');
  });
});


describe('retired entry drafts', () => {
  it.each(['collecting', 'ready'])('marks an old %s draft as expired without exposing its payload', status => {
    expect(publicVerificationNotice({ pendingEntry: { status, fields: { contact: '13900000000' } } })).toContain('历史录入草稿已失效');
  });
  it('does not relabel an already submitted historical order as unsaved', () => {
    expect(publicVerificationNotice({ pendingEntry: { status: 'submitted' } })).toBeUndefined();
  });
});
