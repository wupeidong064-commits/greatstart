import { AiAttachments, AiUsageIndicator, type AiAttachment } from '../components/AiAttachments';
import { usePanelData } from '../hooks/usePanelData';
import { useCreditRefresh } from '../hooks/useCreditRefresh';
import { announceCreditUpdate } from '../services/creditRefresh';
import { formatCreditAmount } from '../utils/aiCredits';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles as BulbOutlined, ArrowUp as SendOutlined, Square as StopOutlined, ArrowDown as DownOutlined, RotateCcw as ReloadOutlined, History as HistoryIcon, CalendarDays, UsersRound, ChartNoAxesCombined, Wallet, BellDot, MessageSquarePlus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  streamChat,
  fetchWeekStats,
  fetchAiQuota,
  fetchWeekNewSigning,
  fetchAlerts,
  fetchTodaySchedules,
  listConversations,
  fetchConversationMessages,
  renameConversationApi,
  deleteConversationApi,
  type ConversationItem,
  type TodayScheduleRow,
} from '../services/aiApi';
import { Form, Input, Select, message as antdMessage } from 'antd';
import { Modal } from '../components/overlays';
import TodayFocus from '../components/TodayFocus';
import { MagneticSurface } from '../components/MagneticSurface';
import { fetchOrgName } from '../services/orgInfo';
import { useAuthStore } from '../store/authStore';
import dayjs from 'dayjs';

/**
 * 经营工作台（登录默认页，复刻原型 #view-home）
 *
 * 结构：主栏（问候 → 4 指标卡 → AI 输入框+快捷提问 → 对话流）
 *      + 右栏（AI 会话 / 今日待处理 / 今日课表）；≤1100px 单列、右栏并排、≤640px 堆叠。
 * 数据：业务数字全部来自既有业务接口；对话历史来自服务端会话记忆（G1），
 *      刷新后自动恢复上次会话与阅读位置。
 * 交互：对话流内部滚动由 autoFollowEnabled / isGenerating / isNearBottom 状态机管理
 *      （rAF 合并 + 上滚解锁）；停止按钮中断生成并保留部分回答。
 */

const QUICK_CHIPS = [
  { t: '本周异常速览', q: '本周有哪些异常需要我处理？' },
  { t: '基本盘变化分析', q: '分析本周各老师基本盘变化' },
  { t: '新报未到课提醒', q: '上周新报学员哪些还没来上过课？' },
  { t: '班级学员变化监测', q: '本月各班学员变化监测：每班的当前在读人数、容量与满班率，以及区间入班人数' },
];

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

const nowGreeting = () => {
  const h = new Date().getHours();
  return h < 11 ? '上午好' : h < 18 ? '下午好' : '晚上好';
};

const dateLine = () => {
  const d = dayjs();
  return `周${WEEK_CN[d.day()]}，${d.month() + 1}月${d.date()}日`;
};

/* ---------------- 轻量富文本渲染：加粗 / 列表 / 表格 / 语义色 ---------------- */

function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`} className="hl">{part.slice(2, -2)}</strong>;
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

function RichContent({ content }: { content: string }) {
  const blocks = useMemo(() => {
    const lines = content.split('\n');
    const out: React.ReactNode[] = [];
    let i = 0;
    let key = 0;

    while (i < lines.length) {
      const trimmed = lines[i].trim();

      if (trimmed.startsWith('|') && i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
        const rows: string[][] = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
          if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
          i++;
        }
        if (rows.length > 0) {
          const [header, ...body] = rows;
          out.push(
            <div className="wb-answer-table" key={`t${key++}`}>
            <table className="wb-ai-table">
              <thead>
                <tr>
                  {header.map((c, ci) => (
                    <th key={ci}>{renderInline(c, `th${key}-${ci}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((c, ci) => (
                      <td key={ci}>{renderInline(c, `td${key}-${ri}-${ci}`)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          );
        }
        continue;
      }

      if (/^[-*•]\s+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
          i++;
        }
        out.push(
          <ul key={`l${key++}`}>
            {items.map((item, ii) => (
              <li key={ii}>{renderInline(item, `li${key}-${ii}`)}</li>
            ))}
          </ul>
        );
        continue;
      }

      if (trimmed === '') {
        i++;
        continue;
      }

      const heading = trimmed === '建议做法' || trimmed === '比较依据' || trimmed.startsWith('建议执行期：')
        || / · (?:截至 )?\d{4}-\d{2}-\d{2}(?: 至 \d{4}-\d{2}-\d{2})?$/.test(trimmed);
      if (heading) out.push(<h3 className="wb-answer-heading" key={`h${key++}`}>{trimmed}</h3>);
      else if (/^AI\s*建议仅供参考[。.]?$/.test(trimmed))
        out.push(<p className="wb-answer-note" key={`n${key++}`}>{trimmed}</p>);
      else out.push(<p key={`p${key++}`}>{renderInline(trimmed, `ln${key}`)}</p>);
      i++;
    }
    return out;
  }, [content]);

  return <>{blocks}</>;
}

/* ---------------- 数据面板小件 ---------------- */

/* ---------------- G2 证据卡（数据卡确定性渲染，数字只来自服务端受控查询） ---------------- */

function OperatingReportPreview({reportId}:{reportId:string}) {
 const [html,setHtml]=useState(''),[error,setError]=useState(''),[open,setOpen]=useState(false);
 useEffect(()=>{if(!open||html)return;const abort=new AbortController();const token=useAuthStore.getState().token;void fetch(`/api/ai/pilot-reports/${reportId}`,{headers:token?{Authorization:`Bearer ${token}`}:{},signal:abort.signal}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error?.message||'报告读取失败');setHtml(j.data.reportHtml||'');}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>abort.abort();},[reportId,open,html]);
 return <div className="wb-operating-report wb-ev-card"><strong>经营报告正文与明细</strong><p>阅读完整正文、业务表和资料来源，关闭后可继续追问。</p><button className="wb-file-dl" type="button" onClick={()=>setOpen(true)}>阅读完整报告</button>
 {open&&<Modal open={open} title="完整运营报告" onCancel={()=>setOpen(false)} width={1100} footer={null}>{error?<p>{error}</p>:html?<iframe title="对话中的完整运营报告" sandbox="" srcDoc={html} style={{display:'block',width:'100%',height:'74vh',border:0,background:'var(--card)'}}/>:<p>正在读取完整报告…</p>}</Modal>}</div>;
}

function EvidenceCards({ cards }: { cards: NonNullable<ChatMsg['evidences']> }) {
  type Card = NonNullable<ChatMsg['evidences']>[number];
  const [fileUpdates, setFileUpdates] = useState<Record<string, Partial<Card>>>({});
  const [retrying, setRetrying] = useState<string | null>(null);
  const downloadLocks = useRef(new Set<string>());
  const [downloadStatus, setDownloadStatus] = useState<Record<string, {busy: boolean; text: string; failed?: boolean}>>({});
  const retryFile = async (card: Card) => {
    if (!card.fileId || retrying) return;
    setRetrying(card.fileId);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`/api/ai/report-files/${card.fileId}/retry`, {
        method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok || !data.data?.fileCard) throw new Error(data.error?.message || '重新生成失败');
      setFileUpdates((prev) => ({ ...prev, [card.fileId!]: data.data.fileCard }));
    } catch (err: any) {
      antdMessage.error(err?.message || '重新生成失败');
    } finally { setRetrying(null); }
  };
  /* G3 步骤3：文件卡下载（服务端鉴权 fetch→blob→a[download]；进行中不可下载） */
  const handleDownload = async (c: Card) => {
    if (!c.downloadUrl || c.status !== 'ready') return;
    const key = c.fileId || c.evidenceId || c.downloadUrl;
    if (downloadLocks.current.has(key)) return;
    const token = useAuthStore.getState().token;
    const isCurrent = () => token === useAuthStore.getState().token;
    downloadLocks.current.add(key);
    setDownloadStatus(prev => ({...prev,[key]:{busy:true,text:'正在准备下载…'}}));
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(c.downloadUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal:controller.signal });
      if (!isCurrent()) return;
      if (!res.ok) {
        if (res.status === 410 && c.fileId) {
          setFileUpdates((prev) => ({ ...prev, [c.fileId!]: { status: 'failed', error: '文件已丢失，可从已保存快照重新生成' } }));
        }
        throw new Error(res.status === 410 ? '文件已丢失，请从快照重新生成或重新生成报告' : '下载失败（' + String(res.status) + '），请重试');
      }
      const blob = await res.blob();
      if (!isCurrent()) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dispositionName = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1];
      a.download = dispositionName ? decodeURIComponent(dispositionName) : c.fileName || 'report.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Embedded browsers may consume the URL asynchronously after the click.
      // Immediate revocation races that handoff and can silently lose the file.
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setDownloadStatus(prev => ({...prev,[key]:{busy:false,text:'下载已发起，请查看浏览器下载列表；若未出现文件，可再次点击下载。'}}));
    } catch (e: any) {
      if (!isCurrent()) return;
      const text = e?.name === 'AbortError' ? '下载请求超时，请重试' : '下载失败：' + (e?.message || '网络错误');
      setDownloadStatus(prev => ({...prev,[key]:{busy:false,text,failed:true}}));
      antdMessage.error(text);
    } finally {
      window.clearTimeout(timeout);
      downloadLocks.current.delete(key);
    }
  };
  return (
    <div className="wb-ev-list">
      {cards.map((original) => {
        const c = { ...original, ...(original.fileId ? fileUpdates[original.fileId] : {}) };
        const downloading = downloadStatus[c.fileId || c.evidenceId || c.downloadUrl || ''];
        return (
        c.tool === 'operating_report' && c.reportId ? <OperatingReportPreview key={c.reportId} reportId={c.reportId}/> : c.tool === 'report_file' ? (
          <div key={c.fileId || c.evidenceId || c.title} className="wb-file-card">
            <div className="wb-file-head">
              <span className="wb-file-title">{c.title}</span>
              {c.timeRange && <span className="wb-ev-meta">{c.timeRange.start} ~ {c.timeRange.end}</span>}
            </div>
            {c.status === 'ready' && c.downloadUrl && (
              <button type="button" className="wb-file-dl" disabled={downloading?.busy} onClick={() => handleDownload(c)}>{downloading?.busy ? '正在准备下载…' : `下载 ${c.fileName?.endsWith('.docx')?'Word':c.fileName?.endsWith('.html')?'网页':'Excel'}`}</button>
            )}
            {downloading && <p role={downloading.failed ? 'alert' : 'status'} aria-live="polite">{downloading.text}</p>}
            {c.status === 'processing' && <div className="wb-ev-missing">报告生成中…（生成完成前不可下载）</div>}
            {c.status === 'failed' && <div className="wb-ev-missing">报告生成失败：{c.error || '请重新发起'}</div>}
            {c.status === 'failed' && c.fileId && c.canRetry!==false && (
              <button type="button" className="wb-file-dl" disabled={retrying !== null} onClick={() => retryFile(c)}>
                {retrying === c.fileId ? '重新生成中…' : '从快照重新生成（不重复消费）'}
              </button>
            )}
          </div>
        ) : c.error ? (
          <div key={c.evidenceId} className="wb-ev-card" role="note">
            <strong>这部分数据查询未完成</strong>
            <p>该回答的查询依据不完整，请重新提问。诊断信息已保留。</p>
          </div>
        ) : (
        <div key={c.evidenceId} className="wb-ev-card">
          <div className="wb-ev-head">
            <span className="wb-ev-title">{c.title}</span>
            {c.timeRange && (
              <span className="wb-ev-meta">{c.timeRange.start} ~ {c.timeRange.end}</span>
            )}
          </div>
          {Object.keys(c.totals||{}).length>0&&<dl className="wb-ev-summary">{Object.entries(c.totals).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{String(value??'—')}</dd></div>)}</dl>}
          {c.columns.length > 0 && c.rows.length > 0 && (
            <div className="wb-ev-table-scroll"><table className="wb-ai-table">
              <thead>
                <tr>{c.columns.map((col) => <th key={col.key}>{col.label}</th>)}</tr>
              </thead>
              <tbody>
                {c.rows.slice(0,50).map((row, ri) => (
                  <tr key={ri}>
                    {c.columns.map((col) => (
                      <td key={col.key}>{String(row[col.key] ?? '—')}</td>
                    ))}
                  </tr>
                ))}
                {c.columns.some(col => c.totals?.[col.key] !== undefined) && (
                  <tr className="wb-ev-totals">
                    {c.columns.map((col, ci) => (
                      <td key={col.key}>
                        {ci === 0
                          ? '合计'
                          : c.totals[col.key] !== undefined
                            ? String(c.totals[col.key])
                            : ''}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>{c.rows.length>50&&<div className="wb-ev-preview-note">共{c.rows.length}条，页面预览前50条；导出文件保留全量。</div>}</div>
          )}
          {c.caliber && <div className="wb-ev-caliber">口径：{c.caliber}</div>}
          {c.missing.length > 0 && <div className="wb-ev-missing">缺失/说明：{c.missing.join('；')}</div>}
          {c.error && <div className="wb-ev-missing">查询失败：{c.error}</div>}
        </div>
        )
      ); })}
    </div>
  );
}

/* ---------------- 主组件 ---------------- */

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  /** R2-4：数字核验警告（未在证据中出现的数字） */
  verificationNotice?: string;
  serverMessageId?: string;
  evidences?: Array<{
    evidenceId: string;
    tool: string;
    title: string;
    unit: string;
    caliber: string;
    timeRange: { start: string; end: string } | null;
    missing: string[];
    columns: Array<{ key: string; label: string }>;
    rows: Array<Record<string, unknown>>;
    totals: Record<string, unknown>;
    error: string | null;
    /* G3 步骤3：报告文件卡（tool=report_file） */
    fileId?: string;
    status?: string;
    downloadUrl?: string | null;
    reportId?: string;
    canRetry?: boolean;
    fileName?: string | null;
  }>;
}

let msgSeq = 0;
const nextMsgId = () => `m${Date.now()}_${msgSeq++}`;

const AiWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  /* ----- 机构名（问候语与侧栏共用缓存） ----- */
  const [orgName, setOrgName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchOrgName(user?.organizationId).then((name) => {
      if (!cancelled) setOrgName(name);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.organizationId]);

  /* ----- 指标卡数据 ----- */
  const panelScope = JSON.stringify([token, user?.id, user?.organizationId, user?.campusId, user?.role, user?.managementLevel, new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)]);
  const quota = usePanelData(fetchAiQuota, panelScope, false);
  const activeModel = quota.data?.model || quota.data?.testBudget?.model;
  const modelLabel = activeModel === 'doubao-seed-2-1-lite-260915'
    ? <span title="豆包 Seed 2.1 Lite"><span className="wb-model-brand">豆包 </span>Seed 2.1 Lite</span>
    : activeModel;
  useCreditRefresh(quota.reload, Boolean(user?.organizationId));
  const chatAllowed = !quota.error && quota.data?.chatAvailable === true;
  const billingNotice = quota.error ? 'AI 服务状态更新失败，请重试。' : quota.data && !chatAllowed ? quota.data.billingReason || 'AI 服务暂不可用，请检查积分与开通状态。' : null;
  const weekStats = usePanelData(fetchWeekStats, panelScope);
  const newSigning = usePanelData(fetchWeekNewSigning, panelScope);
  const alerts = usePanelData(fetchAlerts, panelScope);
  const schedules = usePanelData(fetchTodaySchedules, panelScope);

  const fmtAmount = (n: number | null) => {
    if (n === null) return '—';
    return n >= 10000 ? `¥${(n / 10000).toFixed(1)}万` : `¥${Math.round(n).toLocaleString()}`;
  };

  const pillValue = (loading: boolean, v: number | null | undefined, fallback = '—') =>
    v !== null && v !== undefined ? String(v) : loading ? '…' : fallback;

  /* ----- 对话状态机（G1：会话记忆，历史由服务端持有） ----- */
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [input, setInput] = useState('');
  const [attachments,setAttachments]=useState<AiAttachment[]>([]);
  const [attachmentBusy,setAttachmentBusy]=useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoFollowEnabled, setAutoFollowEnabled] = useState(true);
  const [isNearBottom, setIsNearBottom] = useState(true);
  // 会话列表与当前会话
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [showAllConvs, setShowAllConvs] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ConversationItem | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const renameLock = useRef(false);
  useEffect(() => {
    setRenameTarget(null);
    setRenameTitle('');
    setRenameError('');
  }, [user?.id, user?.organizationId, user?.campusId]);
  const activeConvRef = useRef<string | null>(null);
  const loadConversationRef = useRef<((id: string) => Promise<void>) | null>(null);
  useEffect(() => { activeConvRef.current = activeConvId; }, [activeConvId]);

  /** 初始化：拉会话列表 + 恢复上次会话（刷新接续） */
  useEffect(() => {
    let cancelled = false;
    listConversations()
      .then((list) => {
        if (cancelled) return;
        setConversations(list);
        const saved = (() => {
          try { return localStorage.getItem(`bz-ai-conv-${user?.id ?? 'anon'}`); } catch { return null; }
        })();
        if (saved && list.some((c) => c.id === saved)) {
          loadConversationRef.current?.(saved);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [user?.id]);

  const chatlogRef = useRef<HTMLDivElement | null>(null);
  const foldedScrollTopRef = useRef<number | null>(null);
  const foldButtonRef = useRef<HTMLButtonElement | null>(null);
  const resumeButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(()=>{setAttachments([]);},[activeConvId]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autoFollowRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const suppressUntilRef = useRef(0);
  // 程序滚动标志：跟随 rAF/回底写入产生的 scroll 事件不参与解锁判定（防竞态误判）
  const programmaticScrollRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    autoFollowRef.current = autoFollowEnabled;
  }, [autoFollowEnabled]);

  const prefersReducedMotion = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    []
  );

  const checkNearBottom = useCallback((): boolean => {
    const el = chatlogRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  }, []);

  useLayoutEffect(() => {
    const el = chatlogRef.current;
    const savedTop = foldedScrollTopRef.current;
    if (savedTop === null) return;
    if (chatCollapsed) {
      resumeButtonRef.current?.focus({ preventScroll: true });
    } else if (el?.clientHeight) {
      foldedScrollTopRef.current = null;
      el.scrollTop = autoFollowRef.current ? el.scrollHeight : savedTop;
      lastScrollTopRef.current = el.scrollTop;
      suppressUntilRef.current = performance.now() + 500;
      setIsNearBottom(checkNearBottom());
      foldButtonRef.current?.focus({ preventScroll: true });
    }
  }, [chatCollapsed, checkNearBottom]);

  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      const el = chatlogRef.current;
      if (!el?.clientHeight) return;
      suppressUntilRef.current = performance.now() + 500;
      programmaticScrollRef.current = true;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth && !prefersReducedMotion ? 'smooth' : 'auto' });
      requestAnimationFrame(() => { programmaticScrollRef.current = false; });
    },
    [prefersReducedMotion]
  );

  const scheduleFollow = useCallback(() => {
    if (!autoFollowRef.current) return;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = chatlogRef.current;
      if (el?.clientHeight) {
        programmaticScrollRef.current = true;
        el.scrollTop = el.scrollHeight;
        // 写入产生的 scroll 事件在本帧后派发，随后复位标志
        requestAnimationFrame(() => { programmaticScrollRef.current = false; });
      }
    });
  }, []);

  // 上滚一律视为用户意图（解锁跟随）；程序滚动抑制窗只压向下事件
  useEffect(() => {
    const el = chatlogRef.current;
    if (!el) return undefined;
    lastScrollTopRef.current = el.scrollTop;
    const onScroll = () => {
      if (!el.clientHeight) return;
      if (programmaticScrollRef.current) {
        // 上滚（scrollTop 变小）即使撞上程序滚动标志也按用户解锁处理：
        // 跟随 rAF 只会把视口拉向底部，向上位移只可能来自用户/外部滚动
        if (el.scrollTop < lastScrollTopRef.current - 1) {
          programmaticScrollRef.current = false;
        } else {
          // 程序滚动（跟随/回底）产生的位移：仅更新位置基准，不改变解锁状态
          lastScrollTopRef.current = el.scrollTop;
          return;
        }
      }
      const delta = el.scrollTop - lastScrollTopRef.current;
      lastScrollTopRef.current = el.scrollTop;
      if (delta < -2) {
        setIsNearBottom(false);
        setAutoFollowEnabled(false);
        // 取消已排队的跟随写入：否则 rAF 可在本次 scroll 事件后执行，
        // 把视口拉回底部并以正向 scroll 事件重开跟随（上滚解锁被间歇吞掉——实测复现）
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        return;
      }
      if (performance.now() < suppressUntilRef.current) return;
      const near = checkNearBottom();
      setIsNearBottom(near);
      setAutoFollowEnabled(near);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      abortRef.current?.abort();
    };
  }, [checkNearBottom]);

  /** R1-8：分页状态（向更早加载）+ 切换代际保护（旧响应不覆盖新会话） */
  const [msgPage, setMsgPage] = useState<{ hasMore: boolean; oldestSequence: number | null }>({ hasMore: false, oldestSequence: null });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const convGenRef = useRef(0);

  /** 恢复会话：拉取服务端最新一页并还原到对话流（保持阅读位置） */
  const loadConversation = useCallback(async (id: string) => {
    const gen = ++convGenRef.current; // 代际：切换后旧请求结果直接丢弃
    try {
      const page = await fetchConversationMessages(id, 50);
      if (convGenRef.current !== gen) return; // 已切到其他会话
      foldedScrollTopRef.current = null;
      setChatCollapsed(false);
      setMessages(page.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        error: m.status === 'failed' ? true : undefined,
        evidences: Array.isArray(m.evidences) ? (m.evidences as ChatMsg['evidences']) : undefined,
        verificationNotice: m.verificationNotice,
      })));
      setMsgPage({ hasMore: page.hasMore, oldestSequence: page.oldestSequence });
      setActiveConvId(id);
      try { localStorage.setItem(`bz-ai-conv-${user?.id ?? 'anon'}`, id); } catch { /* ignore */ }
      requestAnimationFrame(() => scrollToBottom(false));
    } catch {
      if (convGenRef.current === gen) antdMessage.error('会话加载失败，请重试');
    }
  }, [user?.id, scrollToBottom]);
  useEffect(() => { loadConversationRef.current = loadConversation; });

  /** 向更早翻页：prepend 更早消息，保持当前阅读位置（记录滚动高度差） */
  const loadOlder = useCallback(async () => {
    if (!activeConvId || !msgPage.hasMore || !msgPage.oldestSequence || loadingOlder) return;
    const gen = convGenRef.current;
    setLoadingOlder(true);
    try {
      const prevHeight = chatlogRef.current?.scrollHeight ?? 0;
      const prevTop = chatlogRef.current?.scrollTop ?? 0;
      const page = await fetchConversationMessages(activeConvId, 50, msgPage.oldestSequence);
      if (convGenRef.current !== gen) return;
      const older = page.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        error: m.status === 'failed' ? true : undefined,
        evidences: Array.isArray(m.evidences) ? (m.evidences as ChatMsg['evidences']) : undefined,
      }));
      setMessages((prev) => [...older, ...prev]);
      setMsgPage({ hasMore: page.hasMore, oldestSequence: page.oldestSequence });
      // 修正滚动位置：补偿 prepend 的高度增量，避免视口跳动
      requestAnimationFrame(() => {
        const el = chatlogRef.current;
        if (el) el.scrollTop = prevTop + (el.scrollHeight - prevHeight);
      });
    } catch {
      antdMessage.error('更早消息加载失败');
    } finally {
      setLoadingOlder(false);
    }
  }, [activeConvId, msgPage, loadingOlder]);

  const hasConversation = messages.length > 0 || isGenerating;
  const chatting = hasConversation && !chatCollapsed;

  /** 刷新会话列表（静默） */
  const refreshConvList = useCallback(() => {
    listConversations()
      .then((list) => setConversations(list))
      .catch(() => undefined);
  }, []);

  const send = useCallback(
    async (text: string, opts?: { skipUserAppend?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed || isGenerating || attachmentBusy) return;
      if (!chatAllowed) { antdMessage.info(billingNotice || 'AI 服务暂不可用'); return; }

      const requestId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const userMsg: ChatMsg = { id: nextMsgId(), role: 'user', content: trimmed };
      const aiMsg: ChatMsg = { id: nextMsgId(), role: 'assistant', content: '' };

      foldedScrollTopRef.current = null;
      setChatCollapsed(false);
      setMessages((prev) => (opts?.skipUserAppend ? [...prev, aiMsg] : [...prev, userMsg, aiMsg]));
      setInput('');
      setIsGenerating(true);
      setAutoFollowEnabled(true);
      setIsNearBottom(true);
      requestAnimationFrame(() => scrollToBottom(true));

      const controller = new AbortController();
      abortRef.current = controller;

      const updateAi = (updater: (prev: string) => string) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsg.id ? { ...m, content: updater(m.content) } : m))
        );
      };

      try {
        await streamChat(
          { conversationId: activeConvRef.current, content: trimmed, requestId,uploadIds:attachments.map(a=>a.id) },
          {
            onMessage:(id)=>setMessages(prev=>prev.map(m=>m.id===aiMsg.id?{...m,serverMessageId:id}:m)),
            onConversation: (cid, meta) => {
              if (!activeConvRef.current) {
                setActiveConvId(cid);
                try { localStorage.setItem(`bz-ai-conv-${user?.id ?? 'anon'}`, cid); } catch { /* ignore */ }
                refreshConvList();
              } else if (meta?.replay) {
                setActiveConvId(cid);
              }
            },
            onDelta: (delta) => {
              updateAi((prev) => prev + delta);
              scheduleFollow();
            },
            onError: () => undefined,
            onDone: () => undefined,
            onCredits: (c) => {
              announceCreditUpdate();
              if (Number(c.settled) > 0) {
                antdMessage.success(`本次 AI 对话消耗 ${formatCreditAmount(c.settled)} 积分，机构余额 ${formatCreditAmount(c.balance)}`);
              }
            },
            onEvidences: (cards) => {
              setMessages((prev) =>
                prev.map((m) => (m.id === aiMsg.id ? { ...m, evidences: cards as ChatMsg['evidences'] } : m))
              );
            },
            onFileCard: (card) => {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== aiMsg.id) return m;
                  const fc = card as any as { evidenceId?: string };
                  const ev=(m.evidences||[]).filter(x=>!(x.tool==='report_file'&&x.fileId===(card as any).fileId));
                  const next: ChatMsg['evidences'] = [
                    ...ev,
                    { evidenceId: fc?.evidenceId || 'file-' + m.id, ...(card as object) },
                  ] as ChatMsg['evidences'];
                  return { ...m, evidences: next };
                })
              );
            },
            onVerificationNotice: (notice) => {
              setMessages((prev) =>
                prev.map((m) => (m.id === aiMsg.id ? { ...m, verificationNotice: notice } : m))
              );
            },
          },
          controller.signal
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsg.id && m.content.trim() === ''
              ? { ...m, content: '（未收到有效回答，请重试）', error: true }
              : m
          )
        );
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          updateAi((prev) => (prev.trim() === '' ? '已停止生成。' : `${prev}\n\n（已停止生成）`));
        } else {
          updateAi(() => err?.message || 'AI 服务暂时不可用，请稍后重试');
          setMessages((prev) => prev.map((m) => (m.id === aiMsg.id ? { ...m, error: true } : m)));
        }
      } finally {
        abortRef.current = null;
        setIsGenerating(false);
        quota.reload();
      }
    },
    [isGenerating, chatAllowed, billingNotice, scheduleFollow, scrollToBottom, user?.id, refreshConvList,attachments,attachmentBusy]
  );

  const retryLast = useCallback(() => {
    if (isGenerating) return;
    // 服务端重试：复用用户消息（不重复落库），本地去掉失败气泡后只追加新回复
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    setMessages((prev) => {
      const next = [...prev];
      while (next.length > 0 && next[next.length - 1].role === 'assistant' && next[next.length - 1].error) {
        next.pop();
      }
      return next;
    });
    send(lastUser.content, { skipUserAppend: true });
  }, [isGenerating, messages, send]);

  const lastMsg = messages[messages.length - 1];
  const showTyping = isGenerating && lastMsg?.role === 'assistant' && lastMsg.content === '';
  const showJump = chatting && !autoFollowEnabled && !isNearBottom;

  const scheduleRows: TodayScheduleRow[] = schedules.data ?? [];
  /* 今日课表：叠卡概览 ↔ 展开列表；"下一节"=当前时间之后最近的一节，全过期则第一节 */
  const [schedStackOpen, setSchedStackOpen] = useState(false);
  const nextSchedIdx = (() => {
    if (scheduleRows.length === 0) return 0;
    const nowHM = new Date().toTimeString().slice(0, 5);
    const idx = scheduleRows.findIndex((s) => s.time > nowHM);
    return idx === -1 ? 0 : idx;
  })();

  const saveRename = async () => {
    if (!renameTarget || renameLock.current) return;
    const title = renameTitle.trim();
    if (!title) { setRenameError('请输入会话名称'); return; }
    renameLock.current = true;
    setRenaming(true);
    setRenameError('');
    try {
      await renameConversationApi(renameTarget.id, title);
      setRenameTarget(null);
      await refreshConvList();
    } catch { setRenameError('重命名失败，请重试'); }
    finally { renameLock.current = false; setRenaming(false); }
  };

  return (
    <div className={`wb-home${chatting ? ' is-chatting' : ''}`}>
      <div className={`wb-inner${chatting ? ' is-chatting' : ''}`}>
        {/* ---------- 主栏 ---------- */}
        <div className={`wb-main${chatting ? ' is-chatting' : ''}`}>
          {!chatting && (
            <div className="wb-greet wb-fade-in">
              <span className="wb-kicker"><span /> 工作台 · 每一份成长，都有迹可循</span>
              <h1>{nowGreeting()}，需要我为你做些什么？</h1>
              <p>
                {orgName ? `${orgName} · ` : ''}
                {dateLine()} · 今日运营概览
              </p>
            </div>
          )}

          {!chatting && (
            <div className="wb-pills">
              <MagneticSurface className="wb-pill">
                <span className="pk"><UsersRound size={14} /> 在册学员</span>
                <span className="pv" title={weekStats.error ? '接口暂不可用' : undefined}>
                  {pillValue(weekStats.loading, weekStats.data?.activeStudents ?? null)}
                </span>
              </MagneticSurface>
              <MagneticSurface className="wb-pill">
                <span className="pk"><ChartNoAxesCombined size={14} /> 本周课消 · 人次</span>
                <span className="pv" title={weekStats.error ? '接口暂不可用' : undefined}>
                  {pillValue(weekStats.loading, weekStats.data?.weekConsumption ?? null)}
                </span>
              </MagneticSurface>
              <MagneticSurface className="wb-pill">
                <span className="pk"><Wallet size={14} /> 本周新签金额</span>
                <span
                  className="pv"
                  title={
                    newSigning.data?.truncated
                      ? '成单较多，金额可能略有遗漏（详见交付说明）'
                      : newSigning.error
                        ? '接口暂不可用'
                        : undefined
                  }
                >
                  {newSigning.data ? fmtAmount(newSigning.data.amount) : newSigning.loading ? '…' : '—'}
                </span>
              </MagneticSurface>
              <MagneticSurface className={`wb-pill${(alerts.data?.total ?? 0) > 0 ? ' warn' : ''}`}>
                <span className="pk"><BellDot size={14} /> 业务预警</span>
                <span className="pv" title={alerts.error ? '刷新失败，显示最近一次取得的风险数据' : '业务风险总数；个人勾选只记录跟进进度，不减少风险数量'}>
                  {pillValue(alerts.loading, alerts.data ? alerts.data.total : null, '—')}
                </span>
              </MagneticSurface>
            </div>
          )}

          {/* AI 输入框 + 快捷提问 */}
          <div className="wb-composer">
            {billingNotice && <div className="wb-service-status" role="status" style={{ marginBottom: 8, fontSize: 12, color: 'var(--tx3)' }}>
              {billingNotice} {!quota.loading && !chatAllowed && <button type="button" className="wb-btn-ghost" onClick={quota.reload}>重新检查</button>}
            </div>}
            <div className="wb-composer-box wb-composer-integrated">
              <div className="wb-composer-entry">
                <span className="wb-spark">
                  <BulbOutlined />
                </span>
                <input
                  ref={inputRef}
                  id="wb-chat-input"
                  className="wb-chat-input"
                  placeholder="问问你的经营数据，例如：本周哪些班级出勤下降？"
                  aria-label="向蜂鸣 AI 提问"
                  value={input}
                  disabled={isGenerating || !chatAllowed}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(input);
                  }}
                />
              </div>
              <AiAttachments
                items={attachments}
                onChange={setAttachments}
                disabled={isGenerating || !chatAllowed}
                onBusy={setAttachmentBusy}
                controls={<>
                  <Select
                    className="wb-model-select"
                    aria-label="选择AI模型"
                    value={activeModel}
                    placeholder="正在连接模型"
                    disabled={!activeModel || isGenerating || Boolean(quota.error)}
                    variant="borderless"
                    suffixIcon={<ChevronDown size={13} />}
                    options={activeModel ? [{ value: activeModel, label: modelLabel }] : []}
                    virtual={false}
                    popupMatchSelectWidth={220}
                  />
                  <div className="wb-composer-actions">
                    <AiUsageIndicator budget={quota.error ? undefined : quota.data?.testBudget} loading={quota.loading} />
                    {isGenerating ? (
                      <button
                        type="button"
                        className="wb-send-btn"
                        title="停止生成"
                        aria-label="停止生成"
                        onClick={() => abortRef.current?.abort()}
                      >
                        <StopOutlined />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="wb-send-btn"
                        title={chatAllowed ? "发送" : billingNotice || "AI 暂不可用"}
                        aria-label="发送"
                        disabled={input.trim() === '' || !chatAllowed || attachmentBusy}
                        onClick={() => send(input)}
                      >
                        <SendOutlined />
                      </button>
                    )}
                  </div>
                </>}
              />
            </div>
            <div className="wb-chips">
              {hasConversation && chatCollapsed && (
                <button type="button" className="bz-chip is-resume" ref={resumeButtonRef}
                  aria-controls="wb-chatlog" aria-expanded={false} onClick={() => setChatCollapsed(false)}>
                  <ChevronDown size={14} aria-hidden="true" /> 继续对话
                </button>
              )}
              {QUICK_CHIPS.map((c) => (
                <button
                  key={c.t}
                  type="button"
                  className="bz-chip"
                  disabled={isGenerating || !chatAllowed}
                  onClick={() => send(c.q)}
                >
                  {c.t}
                </button>
              ))}
            </div>
          </div>

          {chatting && (
            <div className="wb-chat-actions">
              <button type="button" ref={foldButtonRef} className="wb-btn-ghost wb-chat-fold"
                aria-controls="wb-chatlog" aria-expanded={true} onClick={() => {
                  foldedScrollTopRef.current = chatlogRef.current?.scrollTop ?? 0;
                  setChatCollapsed(true);
                }}>
                <ChevronUp size={15} aria-hidden="true" /> 收起对话
              </button>
            </div>
          )}
          {/* 对话流（主栏剩余高度内滚 + 跟随状态机）；顶部可向更早翻页（R1-8） */}
          <div id="wb-chatlog" className={`wb-chatlog${chatCollapsed ? ' is-hidden' : ''}`} ref={chatlogRef}>
            {msgPage.hasMore && messages.length > 0 && (
              <div className="wb-load-older">
                <button type="button" className="wb-btn-ghost" onClick={loadOlder} disabled={loadingOlder}>
                  <HistoryIcon size={13} />
                  {loadingOlder ? '加载中…' : '加载更早消息'}
                </button>
              </div>
            )}
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="wb-msg-user">
                  {m.content}
                </div>
              ) : (
                <div key={m.id} className={`wb-msg-ai${m.error ? ' is-error' : ''}`}>
                  <div className="ai-tag">
                    <BulbOutlined /> 蜂鸣 AI
                  </div>
                  {m.verificationNotice && (
                    <div className="wb-num-warn" role="alert">
                      {m.verificationNotice}
                    </div>
                  )}
                  {m.content ? <RichContent content={m.content} /> : null}
                  {showTyping && m.id === lastMsg?.id && (
                    <div className="wb-typing">
                      <i />
                      <i />
                      <i />
                    </div>
                  )}
                  {m.evidences && m.evidences.some(c => c.tool === 'report_file' || c.tool === 'operating_report')
                    && <EvidenceCards cards={m.evidences.filter(c => c.tool === 'report_file' || c.tool === 'operating_report')} />}
                  {m.error && !isGenerating && (
                    <p>
                      <a
                        role="button"
                        tabIndex={0}
                        onClick={retryLast}
                        onKeyDown={(e) => e.key === 'Enter' && retryLast()}
                        style={{ color: 'var(--acc-strong)', cursor: 'pointer' }}
                      >
                        <ReloadOutlined /> 重试
                      </a>
                    </p>
                  )}
                </div>
              )
            )}
          </div>
          <div className="wb-jump">
            {showJump && (
              <button
                type="button"
                aria-label={isGenerating ? '有新回复，回到底部' : '回到底部'}
                title={isGenerating ? '有新回复，回到底部' : '回到底部'}
                onClick={() => { setAutoFollowEnabled(true); scrollToBottom(true); inputRef.current?.focus(); }}
              >
                <DownOutlined size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* ---------- 右栏：AI 会话 / 今日待处理 / 今日课表 ---------- */}
        <aside className="wb-side">
          <div className="wb-block">
            <div className="wb-block-head">
              <h3><MessageSquarePlus size={16} /> AI 会话</h3>
              <button
                type="button"
                className="wb-btn-new-chat"
                title="开始一个新会话"
                aria-label="新建会话"
                onClick={async () => {
                  abortRef.current?.abort();
                  setActiveConvId(null);
                  setMessages([]);
                  foldedScrollTopRef.current = null;
                  setChatCollapsed(false);
                  try { localStorage.removeItem(`bz-ai-conv-${user?.id ?? 'anon'}`); } catch { /* ignore */ }
                }}
              >
                <MessageSquarePlus size={14} />
                <span>新对话</span>
              </button>
            </div>
            <div className="wb-panel">
              {conversations.length === 0 ? (
                <div className="wb-conv-empty">
                  <MessageSquarePlus size={20} />
                  <p>还没有历史会话</p>
                  <span>在下方输入框提问，第一条消息会自动建立会话；刷新后可随时回到这里继续。</span>
                </div>
              ) : (
                <ul className="wb-conv-list">
                  {(showAllConvs ? conversations : conversations.slice(0, 8)).map((c) => (
                    <li
                      key={c.id}
                      className={`wb-conv-item${c.id === activeConvId ? ' is-active' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => { if (c.id !== activeConvId) { abortRef.current?.abort(); loadConversation(c.id); } }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (c.id !== activeConvId) { abortRef.current?.abort(); loadConversation(c.id); } } }}
                    >
                      <span className="wb-conv-title">{c.title || '未命名会话'}</span>
                      <span className="wb-conv-meta">{dayjs(c.updatedAt).format('MM-DD HH:mm')}</span>
                      <span className="wb-conv-actions">
                        <a
                          role="button"
                          tabIndex={0}
                          title="重命名"
                          aria-label="重命名会话"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameTarget(c);
                            setRenameTitle(c.title || '未命名会话');
                            setRenameError('');
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Pencil size={13} />
                        </a>
                        <a
                          role="button"
                          tabIndex={0}
                          title="删除会话"
                          aria-label="删除会话"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversationApi(c.id)
                              .then(() => {
                                refreshConvList();
                                if (c.id === activeConvId) {
                                  setActiveConvId(null);
                                  setMessages([]);
                                  foldedScrollTopRef.current = null;
                                  setChatCollapsed(false);
                                  try { localStorage.removeItem(`bz-ai-conv-${user?.id ?? 'anon'}`); } catch { /* ignore */ }
                                }
                              })
                              .catch(() => antdMessage.error('删除失败'));
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Trash2 size={13} />
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {conversations.length > 8 && (
                <button
                  type="button"
                  className="wb-btn-ghost is-block"
                  onClick={() => setShowAllConvs((v) => !v)}
                >
                  {showAllConvs ? '收起会话列表' : `查看全部 ${conversations.length} 个会话`}
                </button>
              )}
            </div>
          </div>

          <TodayFocus {...alerts} navigate={navigate} />

          <div className="wb-block">
            <div className="wb-block-head">
              <h3><CalendarDays size={16} /> 今日课表</h3>
              <span className="sub">
                {schedules.loading
                  ? '加载中…'
                  : schedules.error
                    ? '加载失败'
                    : `${dateLine()} · 共 ${scheduleRows.length} 个班次`}
              </span>
            </div>
            <div className="wb-panel">
              {schedules.loading ? (
                <div className="wb-empty">加载中…</div>
              ) : schedules.error ? (
                <div className="wb-empty">
                  {schedules.error}{' '}
                  <a role="button" tabIndex={0} style={{ color: 'var(--acc-strong)', cursor: 'pointer' }} onClick={schedules.reload}>
                    重试
                  </a>
                </div>
              ) : scheduleRows.length === 0 ? (
                <div className="wb-empty">今日无排课。</div>
              ) : schedStackOpen || scheduleRows.length === 1 ? (
                /* 展开列表：时间顺序，当前课标记 */
                <>
                  {scheduleRows.length > 1 && (
                    <button
                      type="button"
                      className="focus-text-button"
                      style={{ marginBottom: 8 }}
                      onClick={() => setSchedStackOpen(false)}
                    >
                      收起概览
                    </button>
                  )}
                  <table className="wb-dt">
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>班级</th>
                        <th>老师</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleRows.slice(0, 8).map((s, i) => (
                        <tr
                          key={s.id}
                          data-path="/operation/weekly-schedule"
                          onClick={() => navigate('/operation/weekly-schedule')}
                          title="打开周课表"
                          style={i === nextSchedIdx ? { fontWeight: 600 } : undefined}
                        >
                          <td>{s.time}{i === nextSchedIdx && <span style={{ color: 'var(--acc-strong)', marginLeft: 6, fontSize: 12 }}>下一节</span>}</td>
                          <td>{s.className}</td>
                          <td>{s.teacherName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                /* 叠卡概览：下一节突出，露边两层，剩余数量标注 */
                <div
                  className="wb-sched-stack"
                  role="button"
                  tabIndex={0}
                  aria-label={`展开今日全部 ${scheduleRows.length} 节课`}
                  onClick={() => setSchedStackOpen(true)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSchedStackOpen(true); } }}
                >
                  <div className="ws-card ws-l2" aria-hidden="true" />
                  <div className="ws-card ws-l1" aria-hidden="true" />
                  <div className="ws-card ws-main">
                    <span className="ws-time">{scheduleRows[nextSchedIdx]?.time}</span>
                    <span className="ws-main-copy">
                      <strong>{scheduleRows[nextSchedIdx]?.className}</strong>
                      <small>{scheduleRows[nextSchedIdx]?.teacherName || '待安排老师'}</small>
                    </span>
                    <span className="ws-badge">
                      {nextSchedIdx === 0 ? '今日第一节' : '下一节'}
                    </span>
                  </div>
                  {scheduleRows.length > 2 && <span className="ws-more">今日还有 {scheduleRows.length - 1} 节</span>}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
      <Modal title="重命名会话" open={!!renameTarget} width={440} okText="保存"
        confirmLoading={renaming} onCancel={() => { if (!renameLock.current) setRenameTarget(null); }}
        onOk={() => void saveRename()}>
        <Form layout="vertical" onFinish={() => void saveRename()}>
          <Form.Item label="会话名称" required validateStatus={renameError ? 'error' : undefined} help={renameError || undefined}>
            <Input autoFocus maxLength={60} showCount value={renameTitle} disabled={renaming} onChange={event => { setRenameTitle(event.target.value); setRenameError(''); }} placeholder="输入会话名称" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AiWorkspace;
