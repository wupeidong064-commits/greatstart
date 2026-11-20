import ReportImportPanel from './ReportImportPanel';
import './AiAttachments.css';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Paperclip, FileText, Trash2, Zap } from 'lucide-react';
import { message, Tooltip } from 'antd';
import { Modal } from './overlays';
import { useAuthStore } from '../store/authStore';
import type { AiQuota } from '../services/aiApi';
export interface AiAttachment {
  id: string;
  fileName: string;
  rowCount: number;
  expiresAt: string;
  issues: string[];
  tables: Array<{
    name: string;
    headerRow: number;
    headers: string[];
    rows: Array<{ source: string; values: unknown[] }>;
  }>;
  paragraphs: Array<{ source: string; text: string }>;
  reportImport?: {confirmed:boolean;receiptId:string;rows:number};
  mapping: Array<{
    table: string;
    nameColumn: string;
    balanceColumn?: string;
    amountColumn?: string;
    amountUnit?: '元' | '万元';
  }>;
}
async function call(url: string, method = 'GET', body?: any) {
  const token = useAuthStore.getState().token;
  const res = await fetch((import.meta.env.VITE_API_BASE || '/api') + '/ai' + url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || data.message || '附件操作失败');
  return data.data;
}
export function AiAttachments({
  items,
  onChange,
  disabled,
  onBusy,
  controls,
}: {
  items: AiAttachment[];
  onChange: (items: AiAttachment[]) => void;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  controls?: ReactNode;
}) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<AiAttachment | null>(null),
    [busy, setBusy] = useState(false);
  const work = async (fn: () => Promise<void>) => {
    setBusy(true);
    onBusy(true);
    try {
      await fn();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  const mapping = (table: string, key: string, value: string) => {
    if (!preview) return;
    const existing = preview.mapping.find((m) => m.table === table) || { table, nameColumn: '' };
    const next = { ...existing, [key]: value };
    setPreview({
      ...preview,
      mapping: [...preview.mapping.filter((m) => m.table !== table), next],
    });
  };
  return (
    <div className="wb-attachments">
      <div className="wb-attachment-toolbar">
        <Tooltip title={<><strong>上传课务文件</strong><br />支持 XLSX、CSV、Word；最多12份，单个8MB，保留7天。仅用于分析。</>}>
          <button
            type="button"
            className="wb-attach-trigger"
            aria-label={busy ? '正在处理附件' : '添加附件'}
            disabled={disabled || busy || items.length >= 12}
            onClick={() => uploadRef.current?.click()}
          >
            <Paperclip size={16} />
            <span>{busy ? '处理中' : '附件'}</span>
          </button>
        </Tooltip>
          <input
            ref={uploadRef}
            type="file"
            aria-label="上传课务文件"
            accept=".xlsx,.csv,.docx"
            disabled={disabled || busy || items.length >= 12}
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              void work(async () => {
                const body = new FormData();
                body.append('file', file);
                const row = await call('/uploads', 'POST', body);
                onChange([...items, row]);
                setPreview(row);
              });
            }}
          />
        {controls}
      </div>
      {items.length > 0 && <ReportImportPanel items={items} onChange={onChange} disabled={disabled||busy}/>}
      {items.map((item) => (
        <div
          className="wb-attachment-item"
          key={item.id}
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}
        >
          <FileText size={16} />
          <button
            className="wb-btn-ghost"
            disabled={disabled || busy}
            onClick={() => setPreview(item)}
          >
            {item.fileName} · {item.rowCount}行 · {item.reportImport?.confirmed?"报告资料已确认":"预览与映射"}
          </button>
          <button
            className="wb-btn-ghost"
            aria-label={'删除附件 ' + item.fileName}
            disabled={disabled || busy}
            onClick={() =>
              void work(async () => {
                await call('/uploads/' + item.id, 'DELETE');
                onChange(items.filter((i) => i.id !== item.id));
              })
            }
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <Modal
        className="wb-attachment-modal"
        title="附件预览与字段映射"
        open={Boolean(preview)}
        onCancel={() => setPreview(null)}
        width={900}
        footer={null}
      >
        {preview && (
          <div style={{ maxHeight: '65vh', overflow: 'auto' }}>
            <p>
              {preview.fileName} · 共{preview.rowCount}条明细 ·
              选择映射后才能对照本机构学员；同名不会自动合并。
            </p>
            {preview.issues.map((text, i) => (
              <p key={i} style={{ color: 'var(--warn)' }}>
                {text}
              </p>
            ))}
            {preview.tables.map((table) => {
              const m = preview.mapping.find((m) => m.table === table.name);
              return (
                <section key={table.name}>
                  <h3>
                    {table.name} · 表头行{table.headerRow} · {table.rows.length}条
                  </h3>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {[
                      ['nameColumn', '姓名列'],
                      ['balanceColumn', '课时列（可选）'],
                      ['amountColumn', '金额列（可选）'],
                    ].map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <select
                          aria-label={table.name + ' ' + label}
                          value={String((m as any)?.[key] || '')}
                          onChange={(e) => mapping(table.name, key, e.target.value)}
                        >
                          <option value="">不映射</option>
                          {table.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <label>
                      金额单位
                      <select
                        aria-label={table.name + ' 金额单位'}
                        value={m?.amountUnit || ''}
                        onChange={(e) => mapping(table.name, 'amountUnit', e.target.value)}
                      >
                        <option value="">请选择</option>
                        <option>元</option>
                        <option>万元</option>
                      </select>
                    </label>
                  </div>
                  <div style={{ overflowX: 'auto', marginTop: 12 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>来源</th>
                          {table.headers.map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.slice(0, 8).map((r) => (
                          <tr key={r.source}>
                            <td>{r.source}</td>
                            {r.values.map((v, i) => (
                              <td key={i}>{String(v ?? '—')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p>预览前8行，分析和导出保留全部明细。</p>
                </section>
              );
            })}
            {preview.paragraphs.slice(0, 10).map((p) => (
              <p key={p.source}>
                {p.source}：{p.text}
              </p>
            ))}
            <button
              className="wb-file-dl"
              disabled={busy || disabled}
              onClick={() =>
                void work(async () => {
                  const row = await call('/uploads/' + preview.id + '/mapping', 'PUT', {
                    mapping: preview.mapping.filter((m) => m.nameColumn),
                  });
                  onChange(items.map((i) => (i.id === row.id ? row : i)));
                  setPreview(null);
                  message.success('字段映射已保存');
                })
              }
            >
              保存映射
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
export function AiUsageDetail({ messageId }: { messageId: string }) {
  const [data, setData] = useState<any>(null),
    [open, setOpen] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="wb-usage-detail" style={{ marginTop: 8 }}>
      <button
        className="wb-btn-ghost"
        disabled={loading}
        onClick={async () => {
          setOpen(!open);
          if (data || open) return;
          setLoading(true);
          setError('');
          try {
            setData(await call('/messages/' + messageId + '/usage'));
          } catch (e: any) {
            setError(e.message);
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? '读取任务用量…' : open ? '收起任务用量' : '查看任务用量'}
      </button>
      {open && error && <p role="alert">{error}</p>}
      {open && data && (
        <div className="wb-ev-card">
          <p>
            任务 {data.bill?.id || data.messageId} · {data.bill?.status || data.status} ·{' '}
            {data.usage?.elapsedMs ?? '—'}毫秒
          </p>
          <p>
            {data.usage?.synthetic
              ? '模拟模型：用量为合成数据，本次零扣费'
              : '配置模型：' + (data.usage?.model || '未记录')}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>用途</th>
                  <th>模型</th>
                  <th>状态</th>
                  <th>输入token</th>
                  <th>输出token</th>
                  <th>耗时ms</th>
                  <th>用量来源</th>
                </tr>
              </thead>
              <tbody>
                {(data.usage?.calls || []).map((c: any, i: number) => (
                  <tr key={i}>
                    <td>
                      {({ intent: '意图识别', chat: '回答', summary: '摘要' } as any)[c.purpose] ||
                        c.purpose}
                    </td>
                    <td>{c.usage?.actualModel || c.model || '未记录'}</td>
                    <td>{c.status}</td>
                    <td>{c.usage?.promptTokens ?? '缺失'}</td>
                    <td>{c.usage?.completionTokens ?? '缺失'}</td>
                    <td>{c.durationMs ?? '—'}</td>
                    <td>{c.usageSource || '未记录'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!(data.usage?.calls || []).length && <p>本地校验或澄清，无模型调用。</p>}
          <p>
            预留 {(data.bill?.reservedMicros || 0) / 10000} · 结算{' '}
            {(data.bill?.settledMicros || 0) / 10000} · 释放{' '}
            {(data.bill?.releasedMicros || 0) / 10000} 积分
          </p>
          <p>{data.bill?.stopReason}</p>
          <p>{data.supplierCostNote}</p>
        </div>
      )}
    </div>
  );
}

/** Non-interactive remaining allowance indicator; details appear only on hover. */
export function AiUsageIndicator({ budget, loading = false }: { budget?: AiQuota['testBudget']; loading?: boolean }) {
  const remainingPercent = budget && budget.limitCny > 0
    ? Math.max(0, Math.min(100, budget.remainingCny / budget.limitCny * 100))
    : null;
  const label = loading ? '正在获取剩余用量' : remainingPercent === null
    ? '剩余用量暂不可用' : `本轮剩余用量 ${remainingPercent.toFixed(1)}%`;
  const level = remainingPercent === null ? ' is-unknown' : remainingPercent <= 5 ? ' is-critical' : remainingPercent <= 20 ? ' is-low' : '';
  return (
    <Tooltip title={label} trigger={['hover']}>
      <span
        className={`wb-usage-indicator${level}`}
        role="img"
        aria-label={label}
        style={{ '--usage-remaining': `${remainingPercent ?? 0}%` } as CSSProperties}
      >
        <span className="wb-usage-ring" aria-hidden="true">
          <span className="wb-usage-icon"><Zap /></span>
        </span>
      </span>
    </Tooltip>
  );
}
