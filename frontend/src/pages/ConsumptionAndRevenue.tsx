import { Drawer, Modal } from '../components/overlays';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, DatePicker, Form, InputNumber, Segmented, Tooltip, message } from 'antd';
import {
  Activity,
  ChartNoAxesCombined,
  CircleHelp,
  Layers3,
  RefreshCw,
  Settings2,
  Users,
  Wallet,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import dayjs, { type Dayjs } from 'dayjs';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useBusinessRefresh } from '../hooks/useBusinessRefresh';
import { normalizeRole } from '../utils/dataFilter';
import { actualAmount, type ActualConsumption } from '../utils/actualConsumption';
import './CashflowSummary.css';
import './ConsumptionAndRevenue.css';

type DateRange = [Dayjs, Dayjs];
type Period = 'week' | 'month' | 'lastMonth' | 'custom';
type Numeric = number | null;
interface Flow {
  historyAvailable: boolean;
  startCount: Numeric;
  endCount: Numeric;
  added: Numeric;
  note: string;
}
interface PeriodCourseTypes {
  rows: { name: string; count: Numeric }[];
  totalClasses: Numeric;
  historyAvailable: boolean;
  note: string;
}
interface Statistics extends ActualConsumption {
  totalAttendance: number;
  baseCount: number;
  attendanceRate: Numeric;
  present: number;
  totalAttendanceCount: number;
  completedSchedules: number;
  classCount: number;
  fullClassRate: Numeric;
  periodCourseTypes?: PeriodCourseTypes;
  seatStats: { occupied: number; capacity: number };
  baseFlow: Flow & {
    removedTotal: Numeric;
    removedNonRenewal: number;
    lostStudents: Numeric;
    archivedStudents: number;
    undecidedStudents: number;
    distinctStudents: number;
    multiClassStudents: number;
  };
  classFlow: Flow & { removed: Numeric };
  revenueNote: string;
  caliberNote: string;
}
type Segment = { label: string; count: Numeric; color: string };
const countFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 });
const moneyFormat = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const validNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const display = (value: unknown, suffix = '') =>
  validNumber(value) ? countFormat.format(value) + suffix : '—';
const percent = (value: unknown) => display(value, '%');
const typeColors = ['var(--ui-chart-1)', 'var(--ui-chart-2)', 'var(--ui-chart-3)'];
const periodOptions: { label: string; value: Period }[] = [
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '上月', value: 'lastMonth' },
];

function presetRange(key: Exclude<Period, 'custom'>): DateRange {
  const now = dayjs();
  if (key === 'week') return [now.subtract((now.day() + 6) % 7, 'day'), now];
  if (key === 'lastMonth')
    return [now.subtract(1, 'month').startOf('month'), now.subtract(1, 'month').endOf('month')];
  return [now.startOf('month'), now];
}

function validStats(value: unknown): value is Statistics {
  if (!value || typeof value !== 'object') return false;
  const s = value as Statistics;
  const base = s.baseFlow,
    classes = s.classFlow;
  const validFlow = (flow: Flow, removed: Numeric) =>
    typeof flow.historyAvailable === 'boolean' &&
    [flow.startCount, flow.endCount, flow.added, removed].every(
      (n) => validNumber(n) || (!flow.historyAvailable && n === null)
    );
  return (
    !!base &&
    !!classes &&
    !!s.seatStats &&
    validFlow(base, base.removedTotal) &&
    validFlow(classes, classes.removed) &&
    [
      s.baseCount,
      s.classCount,
      s.totalAttendance,
      s.present,
      s.totalAttendanceCount,
      s.completedSchedules,
      s.seatStats.capacity,
      s.seatStats.occupied,
      base.removedNonRenewal,
      base.archivedStudents,
      base.undecidedStudents,
      base.distinctStudents,
      base.multiClassStudents,
    ].every(validNumber) &&
    (validNumber(base.lostStudents) || (!base.historyAvailable && base.lostStudents === null)) &&
    [s.attendanceRate, s.fullClassRate].every((n) => n === null || validNumber(n))
  );
}

function validPeriodCourseTypes(value?: PeriodCourseTypes): value is PeriodCourseTypes {
  const count = (n: unknown) => n === null || (validNumber(n) && Number.isSafeInteger(n) && n >= 0);
  return (
    !!value &&
    Array.isArray(value.rows) &&
    typeof value.historyAvailable === 'boolean' &&
    typeof value.note === 'string' &&
    count(value.totalClasses) &&
    value.rows.every((row) => row && typeof row.name === 'string' && count(row.count))
  );
}

function errorText(error: unknown, fallback: string) {
  if (isAxiosError(error) && typeof error.response?.data?.error?.message === 'string')
    return error.response.data.error.message;
  return error instanceof Error ? error.message : fallback;
}

function DetailTiles({ items }: { items: { label: string; value: string; detail?: string }[] }) {
  return (
    <dl className="cns-tiles">
      {items.map((item) => (
        <div key={item.label}>
          <dt>
            {item.detail ? (
              <Tooltip title={item.detail}>
                <span tabIndex={0}>{item.label}</span>
              </Tooltip>
            ) : (
              item.label
            )}
          </dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FlowChart({
  flow,
  removed,
  startLabel,
  endLabel,
  addedLabel,
  removedLabel,
  removedDetail,
  range,
  unit,
}: {
  flow?: Flow;
  removed?: Numeric;
  startLabel: string;
  endLabel: string;
  addedLabel: string;
  removedLabel: string;
  removedDetail?: string;
  range: DateRange;
  unit: '人次' | '个';
}) {
  if (flow?.historyAvailable === false)
    return (
      <Alert
        className="cns-history-warning"
        type="warning"
        showIcon
        message={
          unit === '人次'
            ? '历史报名日期不完整，无法核定期间人数变化'
            : '历史报名日期不完整，无法核定期间班级变化'
        }
      />
    );
  const scale = Math.max(flow?.startCount ?? 0, flow?.endCount ?? 0, 1);
  const added = flow?.added;
  const net =
    validNumber(flow?.endCount) && validNumber(flow?.startCount)
      ? flow.endCount - flow.startCount
      : null;
  const comparison = validNumber(net)
    ? `期末较期初 ${net >= 0 ? '+' : ''}${display(net, ' ' + unit)}`
    : undefined;
  return (
    <div className="cns-flow-chart">
      {[
        { label: startLabel, value: flow?.startCount, date: range[0] },
        { label: endLabel, value: flow?.endCount, date: range[1] },
      ].map((row) => (
        <div className="cns-bar-row" key={row.label} title={comparison}>
          <div className="cns-bar-label">
            {row.label}
            <small>{row.date.format('MM/DD')}</small>
          </div>
          <div className="cns-bar-track" aria-hidden="true">
            <i style={{ width: validNumber(row.value) ? `${(row.value / scale) * 100}%` : 0 }} />
          </div>
          <strong>
            {display(row.value)}
            <small>{unit}</small>
          </strong>
        </div>
      ))}
      <div className="cns-flow-legend">
        <span>
          <i className="cns-incoming" />
          {addedLabel} <b>{validNumber(added) ? '+' + display(added) : '—'}</b>
        </span>
        <span>
          <i className="cns-outgoing" />
          {removedDetail ? (
            <Tooltip title={removedDetail}>
              <span tabIndex={0}>{removedLabel}</span>
            </Tooltip>
          ) : (
            removedLabel
          )}{' '}
          <b>{validNumber(removed) ? '−' + display(removed) : '—'}</b>
        </span>
      </div>
    </div>
  );
}

function Composition({
  segments,
  value,
  label,
  empty,
  total,
  hideZeroShare = false,
}: {
  segments: Segment[];
  value: string;
  label: string;
  empty: string;
  total: Numeric;
  hideZeroShare?: boolean;
}) {
  const canShowShare =
    validNumber(total) && total > 0 && segments.every((s) => validNumber(s.count));
  const chartId = useId().replace(/:/g, '');
  const circumference = 2 * Math.PI * 46;
  let running = 0;
  const arcs = segments.flatMap((segment, index) => {
    if (!canShowShare || !validNumber(segment.count) || segment.count <= 0) return [];
    const offset = running;
    running += segment.count;
    return [{ segment, index, length: segment.count / total * circumference, offset: offset / total * circumference }];
  });
  return (
    <div className="cns-composition">
      <div
        className="cfs-ring cns-ring"
        style={{ background: 'none' }}
        aria-label={label + ' ' + value}
      >
        <svg viewBox="0 0 104 104" aria-hidden="true" className="cns-donut">
          <defs>{arcs.map(({ segment, index }) => <pattern key={index} id={`${chartId}-${index}`} width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill={segment.color} />
            {index >= 3 && (index % 2 ? <circle cx="3" cy="3" r="1" fill="var(--card)" /> : <path d="M0 0L6 6M-3 3L3 9M3-3L9 3" stroke="var(--card)" strokeWidth="1.5" />)}
          </pattern>)}</defs>
          <circle cx="52" cy="52" r="46" fill="none" stroke="var(--cfs-track)" strokeWidth="8" />
          {arcs.map(({ segment, index, length, offset }) => <circle key={index} cx="52" cy="52" r="46" fill="none" stroke={`url(#${chartId}-${index})`} strokeWidth="8" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 52 52)"><title>{segment.label}：{display(segment.count)}，{percent(Math.round(length / circumference * 100))}</title></circle>)}
        </svg>
        <span>
          <b>{value}</b>
          <small>{label}</small>
        </span>
      </div>
      <div className="cns-composition-legend">
        {segments.length ? (
          <ul>
            {segments.map((s, index) => (
              <li key={index}>
                <i className={index < 3 ? undefined : index % 2 ? 'pattern-dots' : 'pattern-lines'} style={{ backgroundColor: s.color }} aria-hidden="true" />
                <span>{s.label}</span>
                <b>
                  {display(s.count)} <small>个</small>
                </b>
                <small>
                  {hideZeroShare && s.count === 0
                    ? null
                    : canShowShare && validNumber(s.count)
                      ? percent(Math.round((s.count / total) * 100))
                      : '—'}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p>{empty}</p>
        )}
      </div>
    </div>
  );
}

export default function ConsumptionAndRevenue() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  const scope = JSON.stringify([
    user.id,
    user.organizationId,
    user.campusId,
    user.role,
    user.isPlatformAdmin ?? false,
  ]);
  return (
    <ConsumptionReport
      key={scope}
      canManageSettings={['admin', 'manager'].includes(normalizeRole(user.role))}
    />
  );
}

function ConsumptionReport({ canManageSettings }: { canManageSettings: boolean }) {
  const [range, setRange] = useState<DateRange>(() => presetRange('month'));
  const [period, setPeriod] = useState<Period>('month');
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [maxClasses, setMaxClasses] = useState<Numeric>(null);
  const [settingsError, setSettingsError] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [form] = Form.useForm<{ maxClasses: number }>();
  const statsRequest = useRef(0),
    settingsRequest = useRef(0),
    saveRequest = useRef(0);
  const start = range[0].format('YYYY-MM-DD'),
    end = range[1].format('YYYY-MM-DD');

  const loadStats = useCallback(async () => {
    const version = ++statsRequest.current;
    setLoading(true);
    setError('');
    setStats(null);
    try {
      const response = await api.get('/consumption/statistics', {
        params: { startDate: start, endDate: end },
      });
      if (!validStats(response.data)) throw new Error('统计响应不完整，请重试');
      if (version === statsRequest.current) setStats(response.data);
    } catch (e) {
      if (version === statsRequest.current) setError(errorText(e, '统计加载失败'));
    } finally {
      if (version === statsRequest.current) setLoading(false);
    }
  }, [start, end]);
  useBusinessRefresh(() => void loadStats());
  const loadSettings = useCallback(async () => {
    const version = ++settingsRequest.current;
    setSettingsError(false);
    try {
      const response = await api.get('/settings/maxClasses');
      const value = Number(response.data?.value);
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error('配置无效');
      if (version === settingsRequest.current) setMaxClasses(value);
    } catch {
      if (version === settingsRequest.current) {
        setMaxClasses(null);
        setSettingsError(true);
      }
    }
  }, []);
  useEffect(() => {
    const request = statsRequest;
    loadStats();
    return () => {
      request.current++;
    };
  }, [loadStats]);
  useEffect(() => {
    const request = settingsRequest;
    const save = saveRequest;
    loadSettings();
    return () => {
      request.current++;
      save.current++;
    };
  }, [loadSettings]);

  async function saveSettings({ maxClasses: value }: { maxClasses: number }) {
    if (!canManageSettings || saving) return;
    const version = ++saveRequest.current;
    setSaving(true);
    try {
      await api.put('/settings/maxClasses', { value: String(value) });
      if (saveRequest.current !== version) return;
      settingsRequest.current++;
      setMaxClasses(value);
      setSettingsError(false);
      setSettingsOpen(false);
      message.success('最大开班数已保存');
    } catch (e) {
      if (saveRequest.current === version) message.error(errorText(e, '保存失败'));
    } finally {
      if (saveRequest.current === version) setSaving(false);
    }
  }

  const base = stats?.baseFlow,
    classes = stats?.classFlow;
  const utilization =
    stats && maxClasses ? Math.round((stats.classCount / maxClasses) * 1000) / 10 : null;
  const periodTypes = validPeriodCourseTypes(stats?.periodCourseTypes)
    ? stats.periodCourseTypes
    : undefined;
  const types: Segment[] = (periodTypes?.rows || []).map((type, i) => ({
    label: type.name,
    count: type.count,
    color: typeColors[i % typeColors.length],
  }));
  const seats: Segment[] = stats
    ? [
        { label: '已占名额', count: stats.seatStats.occupied, color: 'var(--cfs-purple)' },
        {
          label: '空余名额',
          count: Math.max(0, stats.seatStats.capacity - stats.seatStats.occupied),
          color: 'var(--cns-free)',
        },
      ]
    : [];
  const consumption = actualAmount(stats);
  const revenueNote =
    '付费课按学员实际使用的购买批次核销，赠课为 0 元。课时返还冲回原扣课金额。';
  const notes = [
    {
      title: '实际课消收入',
      text:
        stats?.monetaryHistoryComplete !== undefined
          ? stats.revenueNote || revenueNote
          : revenueNote,
    },
    { title: '出勤率', text: stats?.caliberNote },
    { title: '基本盘人数变化', text: base?.note },
    { title: '基本盘班级数变化', text: classes?.note },
    { title: '课程类型占比', text: periodTypes?.note },
  ];
  const removedDetail = `流失学员按区间内结束的报名人次计算，含调班。不续费标记 ${display(base?.removedNonRenewal)} 人为预警。`;
  const enrollmentTiles = [
    {
      label: '流失（去重）',
      value: display(base?.lostStudents, ' 人'),
      detail: '区间内报名结束的学员按人去重，含调班。不续费标记单独列为预警。',
    },
    {
      label: '归档',
      value: display(base?.archivedStudents, ' 人'),
      detail: '区间内执行归档操作的学员数。',
    },
    {
      label: '未定班',
      value: display(base?.undecidedStudents, ' 人'),
      detail:
        '当前尚未进入任何活跃班级花名册的活跃学员，含新建档未定班、移除或归档恢复后待重排的学员，未计入基本盘。',
    },
    {
      label: '多班',
      value: display(base?.multiClassStudents, ' 人'),
      detail: `当前同时报名两个及以上活跃班级的学员数。基本盘多班分别计，去重后实际 ${display(base?.distinctStudents)} 人。`,
    },
  ];
  return (
    <main className="cfs-page cns-page">
      <header className="cfs-heading">
        <div>
          <div className="cfs-eyebrow">
            <ChartNoAxesCombined size={14} aria-hidden="true" />
            经营概览
          </div>
          <h1>课消收入总结</h1>
          <p>查看所选区间的课消、基本盘变化和班级类型，以及当前名额占用。</p>
        </div>
        <Button
          className="cfs-method-button"
          icon={<CircleHelp size={15} />}
          onClick={() => setMethodOpen(true)}
          disabled={!stats}
        >
          统计口径
        </Button>
      </header>
      <div className="cfs-toolbar cns-toolbar">
        <Segmented<Period>
          aria-label="统计时间快捷选择"
          value={period}
          options={
            period === 'custom'
              ? [...periodOptions, { label: '自定义', value: 'custom' }]
              : periodOptions
          }
          onChange={(key) => {
            if (key !== 'custom') {
              setPeriod(key);
              setRange(presetRange(key));
            }
          }}
        />
        <DatePicker.RangePicker
          aria-label="统计日期"
          className="cfs-date-range"
          value={range}
          allowClear={false}
          onChange={(dates) => {
            if (dates?.[0] && dates[1]) {
              setRange([dates[0], dates[1]]);
              setPeriod('custom');
            }
          }}
        />
        {range[1].isAfter(dayjs(), 'day') && (
          <span className="cfs-unit" role="note">
            含未来日期 · 按已登记记录统计
          </span>
        )}
        <div className="cfs-toolbar-spacer" />
        {canManageSettings && (
          <Button
            className="cfs-method-button cns-settings"
            icon={<Settings2 size={15} />}
            onClick={() => {
              form.setFieldsValue({ maxClasses: maxClasses ?? undefined });
              setSettingsOpen(true);
            }}
          >
            设置开班容量
          </Button>
        )}
        <Tooltip title="刷新统计">
          <Button
            className="cfs-refresh"
            aria-label="刷新统计"
            disabled={loading}
            icon={<RefreshCw size={16} />}
            onClick={() => {
              loadStats();
              loadSettings();
            }}
          />
        </Tooltip>
      </div>
      {error && (
        <Alert
          className="cns-alert"
          type="error"
          showIcon
          message="统计加载失败，数值暂不可用"
          description={error}
          action={<Button onClick={loadStats}>重试统计</Button>}
        />
      )}
      {settingsError && (
        <Alert
          className="cns-alert"
          type="warning"
          showIcon
          message="最大开班数加载失败，开班使用率暂不可用"
          action={<Button onClick={loadSettings}>重试配置</Button>}
        />
      )}
      <div className="cfs-results" aria-busy={loading}>
        {loading && (
          <span role="status" className="cns-sr">
            正在加载统计
          </span>
        )}
        <section className="cfs-stats cns-stats" aria-label="课消概览">
          <article className="cfs-glass cfs-stat cfs-stat-primary">
            <div className="cfs-stat-label">
              <span title={revenueNote}>
                实际课消收入
              </span>
              <Wallet size={17} />
            </div>
            <div className="cfs-money">
              {consumption !== null ? (
                <>
                  <span>¥</span>
                  {moneyFormat.format(consumption)}
                </>
              ) : (
                '—'
              )}
            </div>
            <div className="cns-stat-foot">
              净划课 <b>{display(stats?.totalAttendance)} 课时</b>
              <span>付费课按批次核销 · 赠课 0 元</span>
            </div>
          </article>
          <article className="cfs-glass cfs-stat">
            <div className="cfs-stat-label">
              <span title={stats?.caliberNote}>出勤率</span>
              <Activity size={17} />
            </div>
            <div className="cns-attendance">
              <div className="cfs-money">
                {display(stats?.attendanceRate)}
                {validNumber(stats?.attendanceRate) && <small>%</small>}
              </div>
              <div className="cns-meter" aria-hidden="true">
                <i
                  style={{ width: percent(Math.min(100, Math.max(0, stats?.attendanceRate ?? 0))) }}
                />
              </div>
            </div>
            <div className="cns-stat-foot">
              实到 <b>{display(stats?.present)} 人次</b>
              <span>·</span>应到 <b>{display(stats?.totalAttendanceCount)} 人次</b>
            </div>
          </article>
          <article className="cfs-glass cfs-stat">
            <div className="cfs-stat-label">
              <span>基本盘总人数</span>
              <Users size={17} />
            </div>
            <div className="cfs-money">
              {display(stats?.baseCount)}
              <small>人次</small>
            </div>
            <div className="cns-stat-foot">当前活跃班级在读报名 · 多班分别计</div>
          </article>
        </section>
        <section className="cns-panel-grid" aria-label="区间报名与班级变化">
          <article className="cfs-glass cns-panel">
            <div className="cfs-panel-heading">
              <h2>基本盘人数变化</h2>
              <span className="cfs-unit">所选区间 · 人次</span>
            </div>
            <FlowChart
              flow={base}
              removed={base?.removedTotal}
              startLabel="期初人数"
              endLabel="期末人数"
              addedLabel="新增学员"
              removedLabel="流失学员"
              removedDetail={removedDetail}
              range={range}
              unit="人次"
            />
            <DetailTiles items={enrollmentTiles} />
            <p className="cns-panel-foot">
              新增与流失按报名人次统计，同一学员跨班分别计。未定班与多班为当前快照。
            </p>
          </article>
          <article className="cfs-glass cns-panel">
            <div className="cfs-panel-heading">
              <h2>基本盘班级数变化</h2>
              <span className="cfs-unit">所选区间 · 个</span>
            </div>
            <FlowChart
              flow={classes}
              removed={classes?.removed}
              startLabel="期初班级数"
              endLabel="期末班级数"
              addedLabel="开班数"
              removedLabel="关班数"
              range={range}
              unit="个"
            />
            <DetailTiles
              items={[
                { label: '区间已完成场次', value: display(stats?.completedSchedules, ' 场') },
                { label: '最大开班数', value: display(maxClasses, ' 个') },
                { label: '开班使用率', value: percent(utilization) },
              ]}
            />
            <p className="cns-panel-foot">
              开班指班级从无报名变为有报名，关班指最后一条报名结束。使用率按当前在读班级数与最大开班数计算。
            </p>
          </article>
        </section>
        <section className="cns-panel-grid cns-snapshots" aria-label="区间课程类型与当前名额">
          <article className="cfs-glass cns-panel">
            <div className="cfs-panel-heading">
              <h2>课程类型占比</h2>
              <span className="cfs-unit">所选区间</span>
            </div>
            <Composition
              segments={types}
              value={display(periodTypes?.totalClasses, ' 个')}
              total={periodTypes?.totalClasses ?? null}
              label="区间有报名班级"
              hideZeroShare
              empty={periodTypes ? '所选区间暂无班级' : '区间班级数据暂不可用'}
            />
            <p className="cns-panel-foot">
              {periodTypes?.note || '统计所选区间内有有效报名的班级，同一班级只计一次。'}
            </p>
          </article>
          <article className="cfs-glass cns-panel">
            <div className="cfs-panel-heading">
              <h2>满班率（名额占用）</h2>
              <span className="cfs-unit">当前快照</span>
            </div>
            <Composition
              segments={seats}
              total={stats ? Math.max(stats.seatStats.capacity, stats.seatStats.occupied) : null}
              value={percent(stats?.fullClassRate)}
              label="名额占用"
              empty="数据暂不可用"
            />
            <p className="cns-panel-foot">
              学员名额总计 <b>{display(stats?.seatStats.capacity, ' 个')}</b>（各班容量之和）
            </p>
          </article>
        </section>
      </div>
      <Drawer
        title="统计口径"
        rootClassName="cfs-method-drawer"
        open={methodOpen}
        onClose={() => setMethodOpen(false)}
        width="min(420px, calc(var(--ui-vw, 1vw) * 100))"
      >
        <p className="cfs-method-period">
          {start} 至 {end}
        </p>
        {notes.map((note) => (
          <section key={note.title}>
            <h3>{note.title}</h3>
            <p>{note.text || '—'}</p>
          </section>
        ))}
        <section>
          <h3>报名明细</h3>
          <p>{removedDetail}</p>
          {enrollmentTiles.map((item) => (
            <p key={item.label}>
              <strong>{item.label}</strong> · {item.detail}
            </p>
          ))}
        </section>
      </Drawer>
      {canManageSettings && (
        <Modal
          title="设置最大开班数"
          open={settingsOpen}
          forceRender
          onCancel={() => {
            if (!saving) setSettingsOpen(false);
          }}
          onOk={() => form.submit()}
          confirmLoading={saving}
          cancelButtonProps={{ disabled: saving }}
          okText="保存"
          cancelText="取消"
          centered
          styles={{ body: { overflowY: 'auto', maxHeight: 'calc(var(--ui-vh, 1vh) * 60)' } }}
        >
          <p className="cns-modal-note">
            <Layers3 size={16} aria-hidden="true" />
            班级数量上限参考，与班级内学员名额无关，不代表场地时段利用率。
          </p>
          <Form form={form} onFinish={saveSettings} layout="vertical">
            <Form.Item
              name="maxClasses"
              label="最大开班数"
              rules={[
                { required: true, message: '请输入最大开班数' },
                {
                  type: 'integer',
                  min: 1,
                  max: Number.MAX_SAFE_INTEGER,
                  message: '请输入大于 0 的有效整数',
                },
              ]}
            >
              <InputNumber
                min={1}
                max={Number.MAX_SAFE_INTEGER}
                precision={0}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Form>
        </Modal>
      )}
    </main>
  );
}
