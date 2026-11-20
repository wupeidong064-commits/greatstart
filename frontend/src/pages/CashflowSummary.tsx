import { Drawer } from '../components/overlays';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Alert, Button, DatePicker, Empty, Segmented, Select, Skeleton, Tooltip } from 'antd';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BookOpen, ChartNoAxesCombined, CircleHelp, RefreshCw, RotateCcw, Users, Wallet } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import dayjs, { type Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import './CashflowSummary.css';

type DateRange = [Dayjs, Dayjs];
type PeriodKey = 'week' | 'lastWeek' | 'month' | 'lastMonth' | 'custom';
type DailyAmount = { date: string; newSignupAmount: number; renewalAmount: number; refundAmount: number; netAmount: number | null };
interface CashflowReport {
  version: 2;
  period: { startDate: string; endDate: string; timezone: string };
  generatedAt: string;
  staffOptions: { id: string; name: string }[];
  scopeNotes: string[];
  caliber: { orders: string; experience: string; renewal: string; refund: string };
  totals: { grossAmount: number; netAmount: number | null };
  newSignup: { conversions: number; amount: number; totalLeads: number | null; invitedExperience: number; scheduledExperience: number; attendedExperience: number; convertedExperience: number; conversionRate: number | null };
  renewal: { count: number; amount: number; renewedStudents: number; pendingStudents: number; outstandingStudents: number; totalEligible: number; renewalRate: number | null; threshold?: number };
  refund: { count: number; approvedCount: number; approvedAmount: number; approvedLessons: number; cancelledCount: number };
  daily: DailyAmount[];
}
const yuan = (amount: number) => amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (value: number | null) => value === null ? '—' : `${value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })}%`;
const today = () => dayjs(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }));
function presetRange(key: Exclude<PeriodKey, 'custom'>): DateRange {
  const now = today(), monday = now.subtract((now.day() + 6) % 7, 'day');
  if (key === 'week') return [monday, now];
  if (key === 'lastWeek') return [monday.subtract(7, 'day'), monday.subtract(1, 'day')];
  if (key === 'lastMonth') return [now.subtract(1, 'month').startOf('month'), now.subtract(1, 'month').endOf('month')];
  return [now.startOf('month'), now];
}
function validReport(value: unknown): value is CashflowReport {
  if (!value || typeof value !== 'object') return false;
  const r = value as CashflowReport;
  return r.version === 2 && !!r.period && !!r.caliber && Array.isArray(r.daily) && Array.isArray(r.staffOptions) && Array.isArray(r.scopeNotes)
    && !!r.newSignup && !!r.renewal && !!r.refund && !!r.totals
    && [r.totals.grossAmount, r.newSignup.amount, r.renewal.amount, r.refund.approvedAmount].every(n => Number.isFinite(n) && n >= 0)
    && [r.newSignup.conversions, r.newSignup.invitedExperience, r.newSignup.scheduledExperience, r.newSignup.attendedExperience, r.newSignup.convertedExperience,
      r.renewal.count, r.renewal.renewedStudents, r.renewal.pendingStudents, r.renewal.outstandingStudents, r.renewal.totalEligible,
      r.refund.approvedCount, r.refund.approvedLessons, r.refund.count, r.refund.cancelledCount].every(n => Number.isSafeInteger(n) && n >= 0)
    && [r.newSignup.conversionRate, r.renewal.renewalRate].every(n => n === null || Number.isFinite(n) && n >= 0 && n <= 100)
    && (r.totals.netAmount === null || Number.isFinite(r.totals.netAmount))
    && (r.newSignup.totalLeads === null || Number.isSafeInteger(r.newSignup.totalLeads) && r.newSignup.totalLeads >= 0)
    && Number.isFinite(Date.parse(r.generatedAt))
    && r.staffOptions.every(s => typeof s.id === 'string' && typeof s.name === 'string')
    && r.daily.every(d => typeof d.date === 'string' && [d.newSignupAmount, d.renewalAmount, d.refundAmount].every(n => Number.isFinite(n) && n >= 0));
}
function RateRing({ value, label }: { value: number | null; label: string }) {
  return <div className={`cfs-ring${value === null ? ' is-empty' : ''}`} style={{ '--rate': `${Math.min(100, Math.max(0, value ?? 0))}%` } as CSSProperties} role="img" aria-label={`${label}：${value === null ? '暂无可计算数据' : pct(value)}`}>
    <span><b>{pct(value)}</b><small>{label}</small></span>
  </div>;
}
function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey?: string; value?: number; color?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const names: Record<string, string> = { newSignupAmount: '新签金额', renewalAmount: '续费金额', refundAmount: '退费金额' };
  return <div className="cfs-chart-tooltip"><b>{label}</b>{payload.map(item => <div key={item.dataKey}><span><i style={{ background: item.color }} />{names[item.dataKey || '']}</span><strong>¥{yuan(Number(item.value))}</strong></div>)}</div>;
}

const CashflowSummary = () => {
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const [periodKey, setPeriodKey] = useState<PeriodKey>('month');
  const [dateRange, setDateRange] = useState<DateRange>(() => presetRange('month'));
  const [staffId, setStaffId] = useState<string>();
  const [staffOptions, setStaffOptions] = useState<CashflowReport['staffOptions']>([]);
  const [data, setData] = useState<CashflowReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [methodOpen, setMethodOpen] = useState(false);
  const requestId = useRef(0);
  const [reload, setReload] = useState(0);
  const startDate = dateRange[0].format('YYYY-MM-DD'), endDate = dateRange[1].format('YYYY-MM-DD');
  const refresh = useCallback(() => setReload(v => v + 1), []);

  useEffect(() => { setStaffId(undefined); setStaffOptions([]); }, [user?.id, user?.organizationId, user?.campusId]);

  useEffect(() => {
    const controller = new AbortController(), id = ++requestId.current;
    setLoading(true); setError(''); setData(null);
    if (dayjs(endDate).diff(dayjs(startDate), 'day') > 365 || endDate < startDate) {
      setError('请选择起止顺序正确、最多 366 天的统计区间。'); setLoading(false); return;
    }
    api.get<unknown, { data: unknown }>('/cashflow-summary', { params: { startDate, endDate, staffId }, signal: controller.signal })
      .then(response => {
        if (id !== requestId.current || controller.signal.aborted) return;
        if (!validReport(response.data)) throw new Error('统计数据格式不完整，请刷新重试。');
        setStaffOptions(response.data.staffOptions);
        setData(response.data);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted || id !== requestId.current) return;
        const err = e as { response?: { data?: { error?: { message?: string }; message?: string } }; message?: string };
        setError(err.response?.data?.error?.message || err.response?.data?.message || err.message || '暂时无法读取经营数据，请重试。');
      })
      .finally(() => { if (id === requestId.current && !controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [startDate, endDate, staffId, user?.id, user?.organizationId, user?.campusId, reload]);
  useEffect(() => {
    window.addEventListener('business-data-changed', refresh); window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('business-data-changed', refresh); window.removeEventListener('focus', refresh); };
  }, [refresh]);
  const pickPreset = (key: string | number) => {
    setPeriodKey(key as PeriodKey);
    if (key !== 'custom') setDateRange(presetRange(key as Exclude<PeriodKey, 'custom'>));
  };
  const totalOrders = data ? data.newSignup.conversions + data.renewal.count : 0;
  const signupShare = data && data.totals.grossAmount > 0 ? data.newSignup.amount / data.totals.grossAmount * 100 : 0;
  const hasAmounts = data?.daily.some(d => d.newSignupAmount !== 0 || d.renewalAmount !== 0 || d.refundAmount !== 0);

  return <div className="cfs-page">
    <header className="cfs-heading">
      <div><div className="cfs-eyebrow"><ChartNoAxesCombined size={14} strokeWidth={2} /> 经营概览</div><h1>现金流收入总结</h1><p>新签、续费与退费，一眼看清。</p></div>
      <Button className="cfs-method-button" icon={<CircleHelp size={15} />} onClick={() => setMethodOpen(true)} disabled={!data}>统计口径</Button>
    </header>
    <div className="cfs-toolbar">
      <Segmented aria-label="统计时间快捷选择" value={periodKey} onChange={pickPreset} options={[{ label: '本周', value: 'week' }, { label: '上周', value: 'lastWeek' }, { label: '本月', value: 'month' }, { label: '上月', value: 'lastMonth' }, ...(periodKey === 'custom' ? [{ label: '自定义', value: 'custom' }] : [])]} />
      <DatePicker.RangePicker aria-label="统计日期" value={dateRange} onChange={dates => { if (dates?.[0] && dates[1]) { setPeriodKey('custom'); setDateRange([dates[0], dates[1]]); } }} allowClear={false} format="YYYY-MM-DD" className="cfs-date-range" />
      <div className="cfs-toolbar-spacer" />
      <Select aria-label="业绩归属人员" placeholder="全部人员" value={staffId} onChange={setStaffId} options={staffOptions} fieldNames={{ label: 'name', value: 'id' }} allowClear showSearch optionFilterProp="name" className="cfs-staff-select" notFoundContent="暂无可归属人员" />
      <Tooltip title="刷新统计"><Button aria-label="刷新统计" className="cfs-refresh" icon={<RefreshCw size={16} className={loading ? 'cfs-refreshing' : ''} />} onClick={refresh} disabled={loading} /></Tooltip>
    </div>
    {error ? <div className="cfs-error" role="alert"><Alert type="error" showIcon message="经营数据加载失败" description={error} action={<Button onClick={refresh}>重新加载</Button>} /><p>本次未显示统计结果，避免把读取失败误认为零数据。</p></div> : loading || !data ? <div className="cfs-loading" aria-label="正在读取经营数据"><div className="cfs-loading-grid">{[0, 1, 2, 3].map(i => <div className="cfs-glass" key={i}><Skeleton active paragraph={{ rows: 2 }} /></div>)}</div><div className="cfs-glass"><Skeleton active paragraph={{ rows: 7 }} /></div></div> : <div className="cfs-results" key={`${data.period.startDate}-${data.period.endDate}-${staffId || 'all'}`}>
      {(staffId || data.scopeNotes.length > 1) && <div className="cfs-scope-note"><CircleHelp size={14} /><span>{staffId ? '已筛选人员业绩；退费仍显示全校区数据。' : ''}{data.scopeNotes.filter(note => /^有 \d/.test(note)).join(' ')}</span></div>}
      <section className="cfs-stats" aria-label="本期经营汇总">
        <article className="cfs-glass cfs-stat cfs-stat-primary">
          <div className="cfs-stat-label"><span>本期成单金额</span><Wallet size={17} /></div>
          <div className="cfs-money" data-testid="gross-amount"><span>¥</span>{yuan(data.totals.grossAmount)}</div>
          <div className="cfs-stat-foot"><span>新签 + 续费</span><b>{totalOrders} <small>单</small></b></div>
        </article>
        <article className="cfs-glass cfs-stat">
          <div className="cfs-stat-label"><span>新签金额</span><ArrowUpRight size={17} /></div>
          <div className="cfs-money" data-testid="signup-amount"><span>¥</span>{yuan(data.newSignup.amount)}</div>
          <div className="cfs-stat-foot"><span>新增成单</span><b data-testid="signup-orders">{data.newSignup.conversions} <small>单</small></b></div>
        </article>
        <article className="cfs-glass cfs-stat">
          <div className="cfs-stat-label"><span>续费金额</span><RotateCcw size={16} /></div>
          <div className="cfs-money" data-testid="renewal-amount"><span>¥</span>{yuan(data.renewal.amount)}</div>
          <div className="cfs-stat-foot"><span>{data.renewal.renewedStudents} 人完成续费</span><b>{data.renewal.count} <small>单</small></b></div>
        </article>
        <article className="cfs-glass cfs-stat cfs-stat-refund">
          <div className="cfs-stat-label"><span>退费金额</span><ArrowDownLeft size={17} /></div>
          <div className="cfs-money" data-testid="refund-amount"><span>¥</span>{yuan(data.refund.approvedAmount)}</div>
          <div className="cfs-stat-foot"><span>已确认退费 · {data.refund.approvedCount} 笔</span><b data-testid="refund-people">{data.refund.count} <small>人</small></b></div>
        </article>
      </section>
      <section className="cfs-analysis-grid" aria-label="经营趋势与转化">
        <article className="cfs-glass cfs-trend-panel">
          <div className="cfs-panel-heading"><div><h2>成单与退费趋势</h2><p>{data.period.startDate.replace(/-/g, '.')} — {data.period.endDate.replace(/-/g, '.')}</p></div><span className="cfs-unit">元 / 日</span></div>
          <div className="cfs-chart" aria-label="每日新签、续费与退费金额趋势">
            {hasAmounts ? <ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.daily} margin={{ top: 12, right: 8, left: -21, bottom: 0 }}>
              <defs><linearGradient id="cfs-signup-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--cfs-purple)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--cfs-purple)" stopOpacity={0.015} /></linearGradient><linearGradient id="cfs-renewal-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--cfs-lilac)" stopOpacity={0.22} /><stop offset="100%" stopColor="var(--cfs-lilac)" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="var(--cfs-chart-grid)" strokeDasharray="3 5" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={35} tick={{ fill: 'var(--cfs-muted)', fontSize: 12 }} tickFormatter={date => dayjs(date).format('M/D')} tickMargin={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--cfs-muted)', fontSize: 12 }} width={60} tickFormatter={v => Math.abs(v) >= 10000 ? `${v / 10000}万` : Math.abs(v) >= 1000 ? `${v / 1000}k` : String(v)} />
              <ChartTooltip content={<TrendTooltip />} cursor={{ stroke: 'var(--cfs-chart-grid)' }} />
              <Area type="linear" dataKey="newSignupAmount" name="新签金额" stroke="var(--cfs-purple)" strokeWidth={2.5} fill="url(#cfs-signup-fill)" isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2 }} />
              <Area type="linear" dataKey="renewalAmount" name="续费金额" stroke="var(--cfs-lilac)" strokeWidth={2} fill="url(#cfs-renewal-fill)" isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2 }} />
              <Line type="linear" dataKey="refundAmount" name="退费金额" stroke="var(--cfs-peach)" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            </ComposedChart></ResponsiveContainer> : <div className="cfs-chart-empty"><ChartNoAxesCombined size={32} strokeWidth={1.5} /><b>{totalOrders > 0 ? '本期暂无已登记的非零金额' : '本期暂无成单或退费记录'}</b><span>{totalOrders > 0 ? '零元单计入笔数，缺价单未计入金额。' : '可切换日期，查看其他期间。'}</span></div>}
          </div>
          <div className="cfs-legend"><span><i className="cfs-dot-signup" />新签金额</span><span><i className="cfs-dot-renewal" />续费金额</span><span><i className="cfs-dot-refund" />退费金额</span></div>
        </article>
        <article className="cfs-glass cfs-rate-panel">
          <div className="cfs-panel-heading"><h2>体验课转化</h2><Users size={16} /></div>
          <RateRing value={data.newSignup.conversionRate} label="到场成单率" />
          <div className="cfs-funnel" aria-label="体验课预约、到场和成单情况">
            {[
              { name: '预约体验', value: data.newSignup.scheduledExperience, className: 'cfs-funnel-scheduled' },
              { name: '实际到场', value: data.newSignup.attendedExperience, className: 'cfs-funnel-attended' },
              { name: '到场后成单', value: data.newSignup.convertedExperience, className: 'cfs-funnel-converted' },
            ].map(item => <div className="cfs-funnel-row" key={item.name}><span>{item.name}</span><div className="cfs-funnel-track"><i className={item.className} style={{ width: `${data.newSignup.scheduledExperience ? item.value / data.newSignup.scheduledExperience * 100 : 0}%` }} /></div><b>{item.value}<small>次</small></b></div>)}
          </div>
          <div className="cfs-panel-note">按本期上课的体验记录计算，每次体验只计一次成单。</div>
          <div className="cfs-invitation"><span>本期邀约 <b data-testid="invited-experience">{data.newSignup.invitedExperience}</b> 条</span><small>按登记时间</small></div>
        </article>
        <article className="cfs-glass cfs-rate-panel">
          <div className="cfs-panel-heading"><h2>续费跟进</h2><RotateCcw size={16} /></div>
          <RateRing value={data.renewal.renewalRate} label="续费跟进率" />
          <div className="cfs-renewal-breakdown"><div><i className="cfs-dot-signup" /><span>本期已续费</span><b data-testid="renewed-people">{data.renewal.renewedStudents}<small>人</small></b></div><div><i className="cfs-dot-pending" /><span>尚待跟进</span><b data-testid="pending-renewal-people">{data.renewal.outstandingStudents}<small>人</small></b></div></div>
          <div className="cfs-panel-note">已续费 ÷ {data.renewal.totalEligible} 名应跟进学员。尚待跟进为当前剩余 ≤ {data.renewal.threshold ?? 10} 节、且本期未续费的学员。</div>
        </article>
      </section>
      <section className="cfs-bottom-grid">
        <article className="cfs-glass cfs-composition-panel">
          <div className="cfs-composition-top"><h2>成单结构</h2><span>{data.totals.grossAmount > 0 ? `新签 ${pct(signupShare)} · 续费 ${pct(100 - signupShare)}` : '本期暂无成单金额'}</span></div>
          <div className="cfs-composition-track" role="img" aria-label={`新签占比${pct(signupShare)}，续费占比${data.totals.grossAmount > 0 ? pct(100 - signupShare) : '无数据'}`}><i className="cfs-dot-signup" style={{ width: `${signupShare}%` }} /><i className="cfs-dot-renewal" style={{ width: `${data.totals.grossAmount > 0 ? 100 - signupShare : 0}%` }} /></div>
          <div className="cfs-composition-foot"><span>{data.newSignup.totalLeads === null ? '新增线索暂不可归属' : `本期新增线索 ${data.newSignup.totalLeads} 条`}</span><button onClick={() => navigate('/cashflow/order-info')}>查看成单明细 <ArrowRight size={14} /></button></div>
        </article>
        <article className="cfs-glass cfs-refund-panel">
          <div><h2>退费与冲减</h2><p><b>{data.refund.count}</b> 人 · <b>{data.refund.approvedCount}</b> 笔 · 退回 <b>{data.refund.approvedLessons}</b> 节</p></div>
          <div className="cfs-refund-right"><span>已取消 {data.refund.cancelledCount} 笔，不计入退费金额</span><button onClick={() => navigate('/students/refunds')}>查看退费记录 <ArrowRight size={14} /></button></div>
        </article>
      </section>
      <footer className="cfs-footer"><span><BookOpen size={13} /> 收入按成单信息表的新签、续费金额统计，净额扣除已确认退费。</span><span>{data.totals.netAmount !== null ? `扣除退费后的成单净额 ¥${yuan(data.totals.netAmount)} · ` : ''}更新于 {new Date(data.generatedAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })}</span></footer>
    </div>}
    <Drawer title="统计口径" open={methodOpen} onClose={() => setMethodOpen(false)} width={420} rootClassName="cfs-method-drawer">
      {data ? <><p className="cfs-method-period">{data.period.startDate} 至 {data.period.endDate} · 北京时间</p>{([{ title: '新签与续费', key: 'orders' }, { title: '到场成单率', key: 'experience' }, { title: '续费跟进率', key: 'renewal' }, { title: '退费人数与金额', key: 'refund' }] as const).map(item => <section key={item.key}><h3>{item.title}</h3><p>{data.caliber[item.key]}</p></section>)}<section><h3>数据归属</h3>{data.scopeNotes.map(note => <p key={note}>{note}</p>)}</section><div className="cfs-method-tip">零分母显示「—」，表示暂时没有可计算样本。退费取消后不计入金额，已作废成单不计入新签与续费。</div></> : <Empty description="暂无统计数据" />}
    </Drawer>
  </div>;
};
export default CashflowSummary;
