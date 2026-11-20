import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Grid,
  InputNumber,
  Pagination,
  Select,
  Table,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CalendarCheck2,
  ChartNoAxesColumn,
  ChevronRight,
  ListChecks,
  RotateCcw,
  Search,
  UsersRound,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import dayjs from 'dayjs';
import api from '../services/api';
import { cacheService, CACHE_TTL } from '../services/cacheService';
import { useAuthStore } from '../store/authStore';
import { bzExpandable, bzRowClass, useBzExpand } from '../hooks/useBzExpand';
import { useBusinessRefresh } from '../hooks/useBusinessRefresh';
import {
  asDate,
  finite,
  number,
  rangeLabel,
  sortNumber,
  type DateRange,
  type StaffOption,
} from './staffPerformanceData';
import './CashflowSummary.css';
import './StaffPerformance.css';
import './ClassAttendance.css';

type Filter = { range: DateRange | null; teacherId?: string; maxRate: number | null };
type Counts = {
  actualAttendance: number;
  expectedAttendance: number;
  attendanceRate: number | null;
};
type ClassRow = Counts & {
  classId: string;
  className: string;
  classCode?: string | null;
  teacher?: StaffOption | null;
  totalStudents: number;
  scheduleCount: number;
};
type Session = Counts & { id: string; startTime: string; endTime: string; markedStudents: number };
type SessionPage = {
  data: Session[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};
type Envelope = { success?: boolean; data: unknown };
const todayInShanghai = () =>
  dayjs(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }));
const recent = (days: number): DateRange => {
  const today = todayInShanghai();
  return [today.subtract(days - 1, 'day'), today];
};
const initialFilter = (): Filter => ({ range: recent(7), maxRate: null });
const classKey = (row: ClassRow) => row.classId;
const dateParams = (range: DateRange | null) =>
  new URLSearchParams(range ? { startDate: asDate(range[0]), endDate: asDate(range[1]) } : {});
function statsUrl(filter: Filter) {
  const query = dateParams(filter.range);
  if (filter.teacherId) query.set('teacherId', filter.teacherId);
  if (filter.maxRate !== null) query.set('maxAttendanceRate', String(filter.maxRate));
  return '/attendances/class-attendance-stats' + (query.size ? '?' + query : '');
}

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const count = (v: unknown) => finite(v) && Number.isInteger(v) && v >= 0;
const validCounts = (v: Record<string, unknown>) =>
  count(v.actualAttendance) &&
  count(v.expectedAttendance) &&
  (v.expectedAttendance === 0 ? v.attendanceRate === null : finite(v.attendanceRate));
const staff = (v: unknown): v is StaffOption =>
  record(v) && typeof v.id === 'string' && typeof v.name === 'string';
function readTeachers(value: unknown): StaffOption[] {
  if (!Array.isArray(value) || !value.every(staff)) throw new Error('老师名单格式不完整');
  return value;
}
function readClasses(value: unknown): ClassRow[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (v) =>
        record(v) &&
        typeof v.classId === 'string' &&
        typeof v.className === 'string' &&
        (v.classCode == null || typeof v.classCode === 'string') &&
        (v.teacher == null || staff(v.teacher)) &&
        count(v.totalStudents) &&
        count(v.scheduleCount) &&
        validCounts(v)
    )
  ) {
    throw new Error('班级统计数据不完整');
  }
  return value.filter(row => row.expectedAttendance > 0);
}
function readSessions(value: unknown): SessionPage {
  if (
    !record(value) ||
    !Array.isArray(value.data) ||
    !value.data.every(
      (v) =>
        record(v) &&
        typeof v.id === 'string' &&
        typeof v.startTime === 'string' &&
        Number.isFinite(Date.parse(v.startTime)) &&
        typeof v.endTime === 'string' &&
        Number.isFinite(Date.parse(v.endTime)) &&
        count(v.markedStudents) &&
        validCounts(v)
    ) ||
    !record(value.pagination) ||
    !['page', 'pageSize', 'total', 'totalPages'].every((k) =>
      count((value.pagination as Record<string, unknown>)[k])
    )
  ) {
    throw new Error('场次明细数据不完整');
  }
  return value as SessionPage;
}

type ReadResult<T> = { key: string; source: string; data?: T; error?: string };
function useReportRead<T>(
  url: string,
  parse: (v: unknown) => T,
  cacheKey?: string,
  enabled = true,
  revision = 0
) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<ReadResult<T>>();
  const source = JSON.stringify([url, cacheKey]);
  const key = JSON.stringify([source, attempt, revision]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const fetch = async () => {
      const res = await api.get<unknown, Envelope>(url, {
        signal: cacheKey ? undefined : controller.signal,
      });
      if (!res || res.success === false) throw new Error('读取失败，请重试');
      return parse(res.data);
    };
    const request = cacheKey ? cacheService.get(cacheKey, fetch, CACHE_TTL.MEDIUM) : fetch();
    request
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, source, data });
      })
      .catch((error) => {
        const message = isAxiosError(error) && error.response?.data?.error?.message;
        if (!controller.signal.aborted)
          setResult((previous) => ({
            key,
            source,
            data: previous?.source === source ? previous.data : undefined,
            error:
              typeof message === 'string'
                ? message
                : error instanceof Error
                  ? error.message
                  : '读取失败，请重试',
          }));
      });
    return () => controller.abort();
  }, [url, parse, cacheKey, enabled, key, source]);
  return {
    // Focus refreshes update in place; different filters never borrow old rows.
    data: result?.source === source ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    loading: enabled && result?.key !== key,
    retry: () => setAttempt((n) => n + 1),
  };
}

const dayFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const clockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
function SessionDetails({
  row,
  range,
  active,
  revision,
}: {
  row: ClassRow;
  range: DateRange | null;
  active: boolean;
  revision: number;
}) {
  const [page, setPage] = useState(1);
  const params = dateParams(range);
  params.set('page', String(page));
  params.set('pageSize', '10');
  const sessions = useReportRead(
    '/attendances/class/' + encodeURIComponent(row.classId) + '/sessions?' + params,
    readSessions,
    undefined,
    active,
    revision
  );
  return (
    <section className="cat-sessions" aria-label={row.className + '课程场次明细'}>
      <div className="cat-session-heading">
        <h3>课程场次明细</h3>
        <span>共 {sessions.data?.pagination.total ?? row.scheduleCount} 场</span>
      </div>
      {sessions.error ? (
        <Alert
          type="error"
          showIcon
          message="场次明细加载失败"
          description={sessions.error}
          action={
            <Button size="small" onClick={sessions.retry}>
              重试明细
            </Button>
          }
        />
      ) : !sessions.data ? (
        <p role="status">正在读取场次…</p>
      ) : !sessions.data.data.length ? (
        <p>该时段没有已处理的课程场次。</p>
      ) : (
        <>
          <div className="cat-session-list">
            <div className="cat-session-labels">
              <span>课程日期与时间</span>
              <span>实到 / 应到</span>
              <span>考勤已登记人数</span>
            </div>
            {sessions.data.data.map((s) => {
              const start = new Date(s.startTime),
                end = new Date(s.endTime);
              const date = dayFormat.format(start),
                endDate = dayFormat.format(end);
              const early = s.markedStudents > 0 && +start > Date.now();
              return (
                <div className="cat-session-row" key={s.id}>
                  <div className="cat-session-time">
                    <strong>{date}</strong>
                    <span>
                      {clockFormat.format(start)}–{endDate !== date ? endDate + ' ' : ''}
                      {clockFormat.format(end)}
                    </span>
                    {early && <em>提前已登记</em>}
                  </div>
                  <div>
                    <small>实到 / 应到 </small>
                    {s.actualAttendance} / {s.expectedAttendance}
                  </div>
                  <div>
                    <small>考勤已登记 </small>
                    {s.markedStudents} 人
                  </div>
                </div>
              );
            })}
          </div>
          {sessions.data.pagination.totalPages > 1 && (
            <Pagination
              size="small"
              current={page}
              pageSize={10}
              showSizeChanger={false}
              total={sessions.data.pagination.total}
              onChange={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}

function Rate({ row }: { row: ClassRow }) {
  if (row.attendanceRate == null) return <span className="cat-no-rate">无应到人次</span>;
  return (
    <div className={'cat-rate' + (row.attendanceRate === 0 ? ' cat-zero-rate' : '')}>
      <b>{number(row.attendanceRate)}%</b>
      <span aria-hidden="true">
        <i style={{ width: Math.min(100, Math.max(0, row.attendanceRate)) + '%' }} />
      </span>
    </div>
  );
}

function Results({ filter, teacherName, revision }: { filter: Filter; teacherName?: string; revision: number }) {
  const result = useReportRead(statsUrl(filter), readClasses, undefined, true, revision);
  const rows = result.data;
  const totals = rows?.reduce(
    (sum, row) => ({
      sessions: sum.sessions + row.scheduleCount,
      actual: sum.actual + row.actualAttendance,
      expected: sum.expected + row.expectedAttendance,
    }),
    { sessions: 0, actual: 0, expected: 0 }
  );
  const cards = [
    { label: '期间上课次数', value: number(totals?.sessions), unit: '场', icon: CalendarCheck2 },
    { label: '实到人次', value: number(totals?.actual), unit: '人次', icon: ListChecks },
    { label: '应到人次', value: number(totals?.expected), unit: '人次', icon: UsersRound },
    {
      label: '综合出勤率',
      value: totals?.expected ? number((100 * totals.actual) / totals.expected) : '—',
      unit: '%',
      icon: ChartNoAxesColumn,
    },
  ];
  const compact = Grid.useBreakpoint().md === false;
  const expand = useBzExpand();
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const closeRow = () => {
    if (expand.expandedId) expand.toggleExpand(expand.expandedId);
  };
  const columns: ColumnsType<ClassRow> = [
    {
      title: '班级名称',
      key: 'class',
      render: (_, row) => (
        <div className="cat-class-cell">
          <span className="cat-class-icon" aria-hidden="true"><UsersRound size={17} /></span>
          <div className="spf-name cat-class-name">
          <b>{row.className}</b>
          {row.classCode && <small className="cat-class-code" title={row.classCode}>{row.classCode}</small>}
          {compact && (
            <div className="cat-mobile-counts">
              <span>
                {row.teacher?.name || '未分配老师'} · 当前 {row.totalStudents} 人
              </span>
              <span>期间上课 {row.scheduleCount} 次</span>
              <span>
                实到 / 应到 {row.actualAttendance} / {row.expectedAttendance}
              </span>
            </div>
          )}
          </div>
        </div>
      ),
    },
    ...(!compact
      ? [
          {
            title: '负责老师',
            key: 'teacher',
            render: (_: unknown, r: ClassRow) => r.teacher?.name || '未分配',
          },
          {
            title: '当前人数',
            key: 'students',
            align: 'right' as const,
            render: (_: unknown, r: ClassRow) => <span className="cat-numeric">{r.totalStudents}<small>人</small></span>,
          },
          {
            title: '期间上课次数',
            key: 'sessions',
            align: 'right' as const,
            render: (_: unknown, r: ClassRow) => <b className="cat-count">{r.scheduleCount} 次</b>,
          },
          {
            title: '实到 / 应到人次',
            key: 'attendance',
            align: 'right' as const,
            render: (_: unknown, r: ClassRow) => (
              <span className="cat-attendance-pair">
                <b>{r.actualAttendance}</b><span>/ {r.expectedAttendance}</span>
              </span>
            ),
          },
        ]
      : []),
    {
      title: '出勤率',
      key: 'rate',
      align: 'right',
      width: compact ? 91 : '14%',
      sorter: (a, b) => sortNumber(a.attendanceRate, b.attendanceRate),
      render: (_, row) => <Rate row={row} />,
    },
  ];
  return (
    <>
      <div
        className="cfs-stats cat-stats"
        aria-label="当前筛选出勤汇总"
        aria-busy={result.loading}
      >
        {cards.map(({ label, value, unit, icon: Icon }, index) => (
          <section
            className={'cfs-glass cfs-stat' + (index === 0 ? ' cfs-stat-primary' : '')}
            key={label}
          >
            <div className="cfs-stat-label">
              {label}
              <Icon size={16} aria-hidden="true" />
            </div>
            <div className="cfs-money">
              {value}
              {value !== '—' && <small>{unit}</small>}
            </div>
          </section>
        ))}
      </div>
      <section className="bz-table-wrap spf-table cat-table" aria-label="班级出勤明细" aria-busy={result.loading}>
        <header className="spf-table-head">
          <div>
            <h2>班级出勤明细</h2>
            <p>
              <span>{filter.range ? rangeLabel(filter.range) : '全部时间'}</span>
              <span>{filter.teacherId ? teacherName || '已选老师' : '全部老师'}</span>
              {filter.maxRate !== null && <span>出勤率不高于 {filter.maxRate}%</span>}
            </p>
          </div>
          {rows && <span className="spf-total cat-result-total">{result.loading ? '正在更新… · ' : ''}{rows.length} 个班级</span>}
        </header>
        {result.error && (
          <Alert
            className="cat-table-error"
            type="error"
            showIcon
            message={rows ? '刷新失败，当前保留上次查询结果' : '班级出勤统计加载失败'}
            description={result.error}
            action={
              <Button size="small" onClick={result.retry}>
                重试统计
              </Button>
            }
          />
        )}
        {(rows || !result.error) && (
          <Table<ClassRow>
            rowKey={classKey}
            dataSource={rows ?? []}
            columns={columns}
            loading={{ spinning: !rows && !result.error, delay: 180 }}
            expandable={{
              ...bzExpandable(
                expand,
                (row: ClassRow) =>
                  expand.expandedRowKeys.includes(row.classId) ? (
                    <SessionDetails
                      row={row}
                      range={filter.range}
                      active={expand.expandedId === row.classId}
                      revision={revision}
                    />
                  ) : null,
                classKey
              ),
              columnWidth: compact ? 30 : 40,
              expandIcon: ({ record }) => {
                const open = expand.expandedId === record.classId;
                return (
                  <button
                    type="button"
                    className={'bz-x-arrow' + (open ? ' is-open' : '')}
                    aria-expanded={open}
                    aria-label={(open ? '收起 ' : '展开 ') + record.className + ' 场次明细'}
                    onClick={() => expand.toggleExpand(record.classId)}
                  >
                    <ChevronRight size={15} />
                  </button>
                );
              },
            }}
            rowClassName={(row) => bzRowClass(expand, row, classKey)}
            onChange={(_, __, ___, { action }) => {
              if (action === 'sort') closeRow();
            }}
            pagination={{
              current: page,
              pageSize: size,
              pageSizeOptions: [10, 20, 50, 100],
              showSizeChanger: true,
              showLessItems: compact,
              size: compact ? 'small' : 'default',
              hideOnSinglePage: (rows?.length ?? 0) <= 10,
              onChange: (n, nextSize) => {
                closeRow();
                setPage(size === nextSize ? n : 1);
                setSize(nextSize);
              },
            }}
            locale={{
              emptyText: !rows ? (
                '正在读取出勤统计…'
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    filter.maxRate === 0 ? '当前范围内没有出勤率为 0% 的班级' : '当前期间没有可统计的班级'
                  }
                />
              ),
            }}
          />
        )}
      </section>
      <footer className="spf-notes">
        仅显示所选期间有应到人次的班级。实到为0的班级保留，出勤率显示0%。
      </footer>
    </>
  );
}

function AttendanceReport({ scope }: { scope: string }) {
  const [draft, setDraft] = useState<Filter>(initialFilter);
  const [applied, setApplied] = useState(draft);
  const [revision, setRevision] = useState(0);
  const teachers = useReportRead(
    '/users/teachers?kind=teaching',
    readTeachers,
    'class-attendance-teachers:' + scope
  );
  function apply(filter: Filter) {
    setDraft(filter);
    setApplied(filter);
    setRevision((r) => r + 1);
  }
  useBusinessRefresh(() => setRevision((r) => r + 1));
  const today = todayInShanghai();
  const last = today.subtract(1, 'month');
  const presets: { label: string; value: DateRange }[] = [
    { label: '最近7天', value: recent(7) },
    { label: '最近14天', value: recent(14) },
    { label: '最近30天', value: recent(30) },
    { label: '本月', value: [today.startOf('month'), today.endOf('month')] },
    { label: '上月', value: [last.startOf('month'), last.endOf('month')] },
  ];
  return (
    <main className="cfs-page spf-page cat-page" data-testid="class-attendance">
      <header className="cfs-heading">
        <div>
          <h1>班级出勤</h1>
          <p>按课程日期统计已处理场次，每场计一次。展开班级可核对每场考勤。</p>
        </div>
      </header>
      <form
        className="cat-filters"
        onSubmit={(e) => {
          e.preventDefault();
          apply(draft);
        }}
      >
        <div className="cat-field cat-dates">
          <span>课程日期</span>
          <DatePicker.RangePicker
            className="cfs-date-range"
            popupClassName="cat-calendar"
            aria-label="课程日期"
            format="YYYY-MM-DD"
            allowClear
            placeholder={['开始日期', '结束日期']}
            presets={presets}
            value={draft.range}
            onChange={(dates) =>
              setDraft({ ...draft, range: dates?.[0] && dates[1] ? [dates[0], dates[1]] : null })
            }
          />
        </div>
        <div className="cat-field">
          <span>负责老师</span>
          <Select
            className="cfs-staff-select"
            aria-label="负责老师"
            placeholder="全部老师"
            showSearch
            allowClear
            optionFilterProp="label"
            loading={!teachers.data && !teachers.error}
            value={draft.teacherId}
            options={teachers.data?.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(teacherId) => setDraft({ ...draft, teacherId })}
          />
        </div>
        <div className="cat-field cat-rate-field">
          <label htmlFor="cat-rate-limit">出勤率不高于</label>
          <div>
            <InputNumber
              id="cat-rate-limit"
              aria-label="出勤率不高于"
              min={0}
              max={100}
              controls={false}
              suffix="%"
              placeholder="不限"
              value={draft.maxRate}
              onChange={(maxRate) => setDraft({ ...draft, maxRate })}
            />
          </div>
        </div>
        <div className="cat-actions">
          <Button
            className="cat-query"
            type="primary"
            htmlType="submit"
            icon={<Search size={15} />}
          >
            查询
          </Button>
          <Button
            className="cfs-method-button"
            htmlType="button"
            aria-label="重置筛选"
            icon={<RotateCcw size={15} />}
            onClick={() => apply(initialFilter())}
          >
            重置
          </Button>
        </div>
      </form>
      {teachers.error && (
        <Alert
          className="spf-alert"
          type="warning"
          showIcon
          message="老师选项加载失败"
          description={teachers.error}
          action={<Button onClick={teachers.retry}>重试老师选项</Button>}
        />
      )}
      <Results
        key={statsUrl(applied)}
        filter={applied}
        revision={revision}
        teacherName={teachers.data?.find((t) => t.id === applied.teacherId)?.name}
      />
    </main>
  );
}

export default function ClassAttendance() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  if (!['admin', 'manager'].includes(user.role))
    return <Alert type="warning" message="仅管理员和管理人员可以查看班级出勤" />;
  const scope = JSON.stringify([
    user.id,
    user.organizationId,
    user.campusId,
    user.role,
    user.isPlatformAdmin,
  ]);
  return <AttendanceReport key={scope} scope={scope} />;
}
