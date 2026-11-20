import { Modal } from '../components/overlays';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, CircleHelp, Grid3X3, List, RefreshCw, Sparkles, WalletCards } from 'lucide-react';
import api from '../services/api';
import { fmtCredits, formatCreditAmount } from '../utils/aiCredits';
import { useCreditRefresh } from '../hooks/useCreditRefresh';
import { useAuthStore } from '../store/authStore';
import './ai-credits.css';

interface AccountInfo { status: string; balance: string; reserved: string; available: string; totalTopup: string; used: string; fetchedAt: string }
interface PkgInfo { packages: Record<string, { name: string; priceYuan: number; credits: number }>; creditsPerYuan: number }
interface LedgerRow { id: string; type: string; micros: number; balanceAfter: number; reason?: string | null; createdAt: string }
type Tab = 'plans' | 'usage';
type DailyRecord = { date: string; incoming: number; outgoing: number; count: number };
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayLabel = (key: string) => { const [y, m, d] = key.split('-'); return `${y}年${Number(m)}月${Number(d)}日`; };
const amount = formatCreditAmount;

export default function AiCredits() {
  const user = useAuthStore(s => s.user), token = useAuthStore(s => s.token);
  const scope = JSON.stringify([token, user?.id, user?.organizationId, user?.campusId]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const requestVersion = useRef(0);
  const [tab, setTab] = useState<Tab>('plans');
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [pkg, setPkg] = useState<PkgInfo | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [accountState, setAccountState] = useState<'loading' | 'ready' | 'unopened' | 'error'>('loading');
  const [packageError, setPackageError] = useState(false);
  const [ledgerError, setLedgerError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [historyView, setHistoryView] = useState<'list' | 'grid'>('list');
  const [historyPage, setHistoryPage] = useState(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current, ownScope = scope;
    setRefreshing(true);
    const [a, p, l] = await Promise.allSettled([
      api.get('/ai-credits/account'), api.get('/ai-credits/packages'), api.get('/ai-credits/ledger', { params: { limit: 50 } }),
    ]);
    if (version !== requestVersion.current || ownScope !== currentScope.current) return;
    if (a.status === 'fulfilled') {
      setAccount((a.value as any)?.data ?? a.value as unknown as AccountInfo);
      setAccountState('ready');
      setStale(false);
    } else if (a.reason?.response?.status === 404) {
      // 未开通是正常业务状态：清空旧数据展示开通引导
      setAccount(null);
      setStale(false);
      setAccountState('unopened');
    } else {
      // 刷新失败保留旧数据（交互规范：刷新不整块变空），顶部轻提示"数据可能过期"
      if (a.reason?.response?.status !== 404) {
        setStale(true);
        setAccountState(previous => previous === 'ready' ? previous : 'error');
      }
    }
    if (p.status === 'fulfilled') { setPkg((p.value as any)?.data ?? p.value as unknown as PkgInfo); setPackageError(false); }
    else { setPackageError(true); }
    if (l.status === 'fulfilled') { setLedger((l.value as any)?.data ?? []); setLedgerError(false); }
    else { setLedger((prev) => prev); setLedgerError(l.reason?.response?.status !== 404); }
    setRefreshing(false);
  }, [scope]);
  useEffect(() => {
    setAccount(null); setLedger([]); setPkg(null); setPackageError(false); setLedgerError(false); setAccountState('loading'); setHelpOpen(false);
    void load();
    return () => { ++requestVersion.current; };
  }, [load]);
  useCreditRefresh(load);
  const openUpgrade = (code: string | null = null) => { setSelectedPackage(code); setHelpOpen(true); };
  const chosenPackage = selectedPackage ? pkg?.packages[selectedPackage] : null;
  const usedPct = account && Number(account.totalTopup) > 0 ? Math.max(0, Math.min(100, Number(account.used) / Number(account.totalTopup) * 100)) : 0;
  const packages = Object.entries(pkg?.packages ?? {});
  const grouped = new Map<string, DailyRecord>();
  for (const row of ledger) {
    const date = new Date(row.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = dateKey(date);
    const day = grouped.get(key) ?? { date: key, incoming: 0, outgoing: 0, count: 0 };
    if (row.micros > 0) day.incoming += row.micros;
    else day.outgoing += -row.micros;
    day.count += 1;
    grouped.set(key, day);
  }
  const days = [...grouped.values()].sort((a, b) => b.date.localeCompare(a.date));
  const maxPage = Math.max(0, Math.ceil(days.length / 4) - 1);
  const safePage = Math.min(historyPage, maxPage);
  const truncated = ledger.length >= 50;
  const oldestDate = days.at(-1)?.date;
  const gridDates = Array.from({ length: 28 }, (_, i) => {
    const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - (27 - i));
    const key = dateKey(date);
    return { key, day: grouped.get(key), incomplete: truncated && !!oldestDate && key <= oldestDate };
  });
  const maxConsumption = Math.max(1, ...gridDates.map(item => item.day?.outgoing ?? 0));

  return <main className={`credits-page ${tab === 'usage' ? 'is-usage' : ''}`}>
    <header className="credits-heading">
      <div><div className="credits-eyebrow"><span /> 机构 AI 服务</div><h1>套餐与用量</h1><p>按需使用 AI，让每一份投入都清晰可见。</p></div>
      <button className="credits-help" onClick={() => openUpgrade()}><CircleHelp size={16} /> 升级套餐</button>
    </header>
    <div className="credits-nav" role="tablist" aria-label="套餐与用量">
      <button role="tab" aria-selected={tab === 'plans'} onClick={() => setTab('plans')}>套餐介绍</button>
      <button role="tab" aria-selected={tab === 'usage'} onClick={() => setTab('usage')}>用量统计</button>
    </div>
    {tab === 'plans' ? <section className="credits-content" role="tabpanel">
      <div className="credits-section-head"><div><h2>选择适合你的方式</h2><p>课务管理免费使用，AI 功能按积分消耗。</p></div><span className="credits-note">积分由机构共享</span></div>
      {packageError && <Alert type="warning" showIcon message="套餐信息暂时无法获取" action={<Button size="small" onClick={load}>重试</Button>} />}
      <div className="credits-plans">
        <article className="credits-plan"><div className="credits-plan-top"><span className="credits-plan-icon"><WalletCards size={19} /></span><span className="credits-plan-label">基础课务</span></div><h3>免费使用</h3><p className="credits-description">让日常课务有条不紊。</p><div className="credits-price"><span>¥</span>0 <small>永久免费</small></div><div className="credits-plan-rule" /><ul><li><Check /> 学员、班级与课表管理</li><li><Check /> 出勤、划课与课务统计</li><li><Check /> 原始数据导入与导出</li><li><Check /> 外部 AI 只读数据接入</li></ul><div className="credits-plan-footer">课务功能无需购买积分</div></article>
        {packages.map(([code, p], index) => <article key={code} className={`credits-plan ${index === 1 ? 'is-featured' : ''}`}><div className="credits-plan-top"><span className="credits-plan-icon"><Sparkles size={19} /></span><span className="credits-plan-label">AI 积分包</span>{index === 1 && <span className="credits-featured-label">更多额度</span>}</div><h3>{p.name}</h3><p className="credits-description">{index === 0 ? '轻松开启日常 AI 助手。' : '为更频繁的 AI 使用准备。'}</p><div className="credits-price"><span>¥</span>{p.priceYuan}<small> / 次</small></div><div className="credits-allowance"><strong>{p.credits.toLocaleString('zh-CN')}</strong> 积分 <span>· 充值到账</span></div><div className="credits-plan-rule" /><ul><li><Check /> 机构管理员使用 AI 对话</li><li><Check /> 按实际用量消耗积分</li><li><Check /> 同机构管理员共享额度</li><li><Check /> 查看历史回答不重复扣费</li></ul><button className={`credits-plan-action ${index === 1 ? 'primary' : ''}`} onClick={() => openUpgrade(code)}>升级套餐 <ArrowUpRight size={15} /></button></article>)}
      </div>
      <div className="credits-bottom-note"><CircleHelp size={16} /><span>当前通过人工入账开通与充值。积分用于机构内的 AI 服务，普通课务功能不消耗积分。</span><button onClick={() => openUpgrade()}>微信联系升级</button></div>
    </section> : <section className="credits-content credits-usage" role="tabpanel">
      <div className="credits-section-head"><div><h2>用量概览</h2><p>查看机构积分余额与近期变动。</p></div><button className="credits-refresh" onClick={load} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'is-spinning' : ''} /> 刷新</button></div>
      {accountState === 'loading' ? <div className="credits-loading"><Spin /></div> : accountState === 'error' && !account ? <Alert type="warning" showIcon message="用量信息暂时无法获取" action={<Button size="small" onClick={load}>重试</Button>} /> : accountState === 'unopened' ? <div className="credits-empty"><WalletCards size={24} /><strong>尚未开通机构 AI 服务</strong><p>开通后即可在这里查看积分余额与使用记录。</p><button onClick={() => setTab('plans')}>查看套餐</button></div> : account && <>
        {stale && <Alert type="warning" showIcon style={{ marginBottom: 14 }} message="最近一次刷新失败，以下为上次获取的数据（时间可能过期）" action={<Button size="small" onClick={load}>重试</Button>} />}
        {account.status !== 'active' && <Alert type="warning" showIcon message="机构 AI 服务当前已停用，积分余额仍保留。" />}
        <div className="credits-usage-layout"><div className="credits-usage-card"><div className="credits-balance-row"><div><span className="credits-field">可用积分</span><div className="credits-balance">{amount(account.available)} <small>积分</small></div><p>可用于机构内的 AI 服务</p></div><span className="credits-balance-icon"><Sparkles size={22} /></span></div><div className="credits-progress-heading"><span>累计使用情况</span><span>{usedPct.toFixed(1)}%</span></div><div className="credits-progress" role="progressbar" aria-label="累计积分使用比例" aria-valuenow={Number(usedPct.toFixed(1))} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${usedPct}%` }} /></div><div className="credits-progress-caption"><span>已用 {amount(account.used)} 积分</span><span>累计入账 {amount(account.totalTopup)} 积分</span></div><div className="credits-metrics"><div><span>账户总余额</span><strong>{amount(account.balance)} <small>积分</small></strong></div><div><span>任务预留</span><strong>{amount(account.reserved)} <small>积分</small></strong></div><div><span>数据更新于</span><strong className="credits-date">{account.fetchedAt || '—'}</strong></div></div></div>
        <div className="credits-daily-card"><div className="credits-daily-heading"><div><h2>每日积分</h2><p>最近 50 条变动按日期汇总{truncated ? ' · 部分日期可能不完整' : ''}</p></div><div className="credits-view-switch" role="group" aria-label="切换积分显示方式"><button aria-label="日期列表" aria-pressed={historyView === 'list'} onClick={() => setHistoryView('list')}><List size={16} /></button><button aria-label="方格视图" aria-pressed={historyView === 'grid'} onClick={() => setHistoryView('grid')}><Grid3X3 size={16} /></button></div></div>
        {ledgerError ? <Alert type="warning" showIcon message="积分明细暂时无法获取" action={<Button size="small" onClick={load}>重试</Button>} /> : historyView === 'list' ? <>
          {days.length === 0 ? <div className="credits-history-empty">暂无积分变动记录</div> : <div className="credits-daily-list">{days.slice(safePage * 4, safePage * 4 + 4).map(day => <div className="credits-daily-row" key={day.date}><div><strong>{dayLabel(day.date)}</strong><span>{day.count} 笔变动{truncated && day.date === oldestDate ? ' · 不完整' : ''}</span></div><div className="credits-daily-values">{day.outgoing > 0 && <strong>−{fmtCredits(day.outgoing)} <small>消耗</small></strong>}{day.incoming > 0 && <span>+{fmtCredits(day.incoming)} 入账</span>}</div></div>)}</div>}
          {days.length > 4 && <div className="credits-pagination"><span>第 {safePage + 1} / {maxPage + 1} 页</span><div><button aria-label="上一页" disabled={safePage === 0} onClick={() => setHistoryPage(safePage - 1)}><ChevronLeft size={16} /></button><button aria-label="下一页" disabled={safePage === maxPage} onClick={() => setHistoryPage(safePage + 1)}><ChevronRight size={16} /></button></div></div>}
        </> : <div className="credits-heatmap"><div className="credits-heatmap-top"><strong>近 28 天</strong><span>按每日消耗显示</span></div><div className="credits-heatmap-grid">{gridDates.map(({ key, day, incomplete }) => {
          const level = !day?.outgoing ? 0 : Math.max(1, Math.ceil(day.outgoing / maxConsumption * 4));
          const description = incomplete && !day ? `${dayLabel(key)}：超出最近 50 条记录范围，数据未知` : `${dayLabel(key)}：${incomplete ? '数据可能不完整，' : ''}消耗 ${fmtCredits(day?.outgoing ?? 0)} 积分，入账 ${fmtCredits(day?.incoming ?? 0)} 积分`;
          return <button key={key} className={`credits-heat-cell level-${level} ${incomplete ? 'is-incomplete' : ''}`} aria-label={description} title={description} />;
        })}</div><div className="credits-heatmap-footer"><span>{dayLabel(gridDates[0].key)} — 今天</span><div><span>少</span>{[0, 1, 2, 3, 4].map(i => <i key={i} className={`level-${i}`} />)}<span>多</span></div></div><p className="credits-heatmap-note">颜色代表当日消耗；悬停或聚焦方格查看积分。{truncated ? '虚线方格的数据可能不完整。' : ''}</p></div>}
        </div></div>
      </>}
    </section>}
    <Modal title="升级套餐" width={440} open={helpOpen} onCancel={() => setHelpOpen(false)} footer={<Button type="primary" onClick={() => setHelpOpen(false)}>知道了</Button>}>
      <div className="credits-upgrade-contact">
        <p>联系平台运营办理套餐升级（联系方式由部署方配置）。</p>
        {chosenPackage && <div className="credits-upgrade-choice"><strong>{chosenPackage.name}</strong><span>¥{chosenPackage.priceYuan} · {amount(chosenPackage.credits)} 积分</span></div>}
        <p className="credits-upgrade-note">备注机构名称{chosenPackage ? `和“${chosenPackage.name}”` : '及所需套餐'}。确认收款并由平台登记后，积分计入本机构账户；返回页面或刷新即可查看。</p>
      </div>
    </Modal>
  </main>;
}
