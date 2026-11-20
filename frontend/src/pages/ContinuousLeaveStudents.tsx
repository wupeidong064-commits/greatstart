import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Grid,
  InputNumber,
  Select,
  Skeleton,
  Switch,
  Table,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CalendarDays,
  ChevronRight,
  Phone,
  RotateCcw,
  Search,
  UserRound,
  UserRoundX,
  UsersRound,
} from 'lucide-react';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { bzExpandable, bzRowClass, useBzExpand } from '../hooks/useBzExpand';
import './CashflowSummary.css';
import './StaffPerformance.css';
import './ClassAttendance.css';
import './ContinuousLeaveStudents.css';

type Range = [Dayjs, Dayjs];
type Teacher = { id: string; name: string };
type Filter = {
  range: Range | null;
  teacherId?: string;
  threshold: number;
  continuousOnly: boolean;
};
type Row = {
  id: string;
  studentName: string;
  phone?: string | null;
  classId: string;
  className: string;
  classCode?: string | null;
  teacher?: Teacher | null;
  enrollmentDate?: string | null;
  scheduleCount: number;
  presentCount: number;
  absentCount: number;
  continuousAbsentCount: number;
  attendanceRate: number;
  isContinuousAbsent: boolean;
  isTemporary?: boolean;
};
type Envelope = { success?: boolean; data: unknown };
const today = () => dayjs(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }));
const recent = (n: number): Range => [today().subtract(n - 1, 'day'), today()];
const initial = (): Filter => ({ range: recent(30), threshold: 60, continuousOnly: false });
const keyOf = (r: Row) => `${r.id}:${r.classId}`;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const teacher = (v: unknown): v is Teacher =>
  record(v) && typeof v.id === 'string' && typeof v.name === 'string';
const period = (r: Range | null) =>
  r ? `${r[0].format('YYYY-MM-DD')} 至 ${r[1].format('YYYY-MM-DD')}` : '最近30天（默认）';
function readRows(v: unknown): Row[] {
  if (
    !Array.isArray(v) ||
    !v.every(
      (r) =>
        record(r) &&
        typeof r.id === 'string' &&
        typeof r.studentName === 'string' &&
        typeof r.classId === 'string' &&
        typeof r.className === 'string' &&
        (r.teacher == null || teacher(r.teacher)) &&
        count(r.scheduleCount) &&
        r.scheduleCount > 0 &&
        count(r.presentCount) &&
        r.presentCount <= r.scheduleCount &&
        count(r.absentCount) &&
        count(r.continuousAbsentCount) &&
        typeof r.isContinuousAbsent === 'boolean' &&
        typeof r.attendanceRate === 'number' &&
        Number.isFinite(r.attendanceRate) &&
        r.attendanceRate >= 0 &&
        r.attendanceRate <= 100 &&
        (r.enrollmentDate == null ||
          (typeof r.enrollmentDate === 'string' && Number.isFinite(Date.parse(r.enrollmentDate))))
    )
  )
    throw new Error('学员出勤数据不完整，请重试');
  return v;
}
function failure(e: unknown) {
  const v = e as { response?: { data?: { error?: { message?: unknown } } }; message?: string };
  const message = v.response?.data?.error?.message;
  return typeof message === 'string' ? message : v.message || '读取失败，请稍后重试';
}
function AttendanceList({ rows, filter }: { rows: Row[]; filter: Filter }) {
  const bz = useBzExpand(),
    compact = !Grid.useBreakpoint().md;
  const [page, setPage] = useState(1),
    [size, setSize] = useState(20);
  const close = () => {
    if (bz.expandedId) bz.toggleExpand(bz.expandedId);
  };
  const columns: ColumnsType<Row> = [
    {
      title: '学员',
      key: 'student',
      width: compact ? undefined : 200,
      render: (_, r) => (
        <div className="cls-person">
          {!compact && (
            <span className="cat-class-icon">
              <UserRound size={17} />
            </span>
          )}
          <div className="spf-name">
            <button
              className="cls-student"
              aria-expanded={bz.expandedId === keyOf(r)}
              onClick={() => bz.toggleExpand(keyOf(r))}
            >
              {r.studentName}
            </button>
            <small>
              {compact
                ? `${r.className} · ${r.teacher?.name || '未分配老师'}`
                : r.isTemporary
                  ? '含临时串课记录'
                  : '查看联系方式与出勤明细'}
            </small>
          </div>
        </div>
      ),
    },
    ...(!compact
      ? [
          {
            title: '班级 / 老师',
            key: 'class',
            width: 235,
            render: (_: unknown, r: Row) => (
              <div className="spf-name">
                <b>{r.className}</b>
                <small>{r.teacher?.name || '未分配老师'}</small>
              </div>
            ),
          },
          {
            title: '实到 / 应到',
            key: 'counts',
            align: 'right' as const,
            width: 135,
            render: (_: unknown, r: Row) => (
              <div className="spf-metric">
                <b>
                  {r.presentCount} / {r.scheduleCount} <small>次</small>
                </b>
                <small>未到 {r.absentCount} 次</small>
              </div>
            ),
          },
        ]
      : []),
    {
      title: '出勤率',
      key: 'rate',
      width: compact ? 86 : 170,
      sorter: (a, b) => a.attendanceRate - b.attendanceRate,
      render: (_, r) => (
        <div className="cls-rate">
          <span>
            <b>{r.attendanceRate}%</b>
            {compact && (
              <small>
                {r.presentCount}/{r.scheduleCount} 次
              </small>
            )}
          </span>
          {!compact && (
            <i aria-hidden="true">
              <i style={{ width: `${r.attendanceRate}%` }} />
            </i>
          )}
        </div>
      ),
    },
    {
      title: compact ? '连续未到' : '最近连续未到',
      key: 'continuous',
      width: compact ? 87 : 145,
      sorter: (a, b) => a.continuousAbsentCount - b.continuousAbsentCount,
      render: (_, r) => (
        <span className={`cls-streak${r.isContinuousAbsent ? ' is-risk' : ''}`}>
          {r.continuousAbsentCount} <small>次</small>
        </span>
      ),
    },
  ];
  return (
    <Table<Row>
      columns={columns}
      dataSource={rows}
      rowKey={keyOf}
      tableLayout="fixed"
      expandable={{
        ...bzExpandable(
          bz,
          (r) => (
            <>
              <dl className="bz-x-grid cls-details">
                <div className="bz-x-item">
                  <dt>联系电话</dt>
                  <dd>
                    {r.phone ? (
                      <a href={`tel:${r.phone}`}>
                        <Phone size={13} />
                        {r.phone}
                      </a>
                    ) : (
                      '未填写'
                    )}
                  </dd>
                </div>
                <div className="bz-x-item">
                  <dt>班级 / 代码</dt>
                  <dd>
                    {r.className}
                    <small>{r.classCode || '未填写班级代码'}</small>
                  </dd>
                </div>
                <div className="bz-x-item">
                  <dt>负责老师</dt>
                  <dd>{r.teacher?.name || '未分配'}</dd>
                </div>
                <div className="bz-x-item">
                  <dt>统计期间</dt>
                  <dd>{period(filter.range)}</dd>
                </div>
                <div className="bz-x-item">
                  <dt>实到 / 应到课次</dt>
                  <dd>
                    {r.presentCount} / {r.scheduleCount} 次
                  </dd>
                </div>
                <div className="bz-x-item">
                  <dt>未到课次</dt>
                  <dd>{r.absentCount} 次</dd>
                </div>
                <div className="bz-x-item">
                  <dt>最近连续未到</dt>
                  <dd>{r.continuousAbsentCount} 次</dd>
                </div>
                <div className="bz-x-item">
                  <dt>入班日期</dt>
                  <dd>
                    {r.enrollmentDate
                      ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(
                          new Date(r.enrollmentDate)
                        )
                      : '未记录'}
                  </dd>
                </div>
              </dl>
              <p className="spf-detail-note">
                {r.isTemporary ? '含临时串课；' : ''}
                实到包含出勤与迟到。连续未到从统计期间最近一次已处理课次向前计算。
              </p>
            </>
          ),
          keyOf
        ),
        columnWidth: compact ? 28 : 36,
        expandIcon: ({ record: r }) => {
          const open = bz.expandedId === keyOf(r);
          return (
            <button
              className={`bz-x-arrow${open ? ' is-open' : ''}`}
              aria-expanded={open}
              aria-label={`${open ? '收起' : '展开'} ${r.studentName} ${r.className} 明细`}
              onClick={() => bz.toggleExpand(keyOf(r))}
            >
              <ChevronRight size={15} />
            </button>
          );
        },
      }}
      rowClassName={(r) => bzRowClass(bz, r, keyOf)}
      onChange={(_, __, ___, { action }) => {
        if (action === 'sort') close();
      }}
      pagination={{
        current: page,
        pageSize: size,
        pageSizeOptions: [10, 20, 50, 100],
        showSizeChanger: true,
        hideOnSinglePage: rows.length <= 10,
        size: compact ? 'small' : 'default',
        showLessItems: compact,
        showTotal: (total) => `${total} 条班级记录`,
        onChange: (n, s) => {
          close();
          setPage(s === size ? n : 1);
          setSize(s);
        },
      }}
      locale={{
        emptyText: (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <>
                <b>当前筛选下没有待关注学员</b>
                <span className="cls-empty-note">可调整日期、老师或出勤率后重新查询。</span>
              </>
            }
          />
        ),
      }}
    />
  );
}
function ContinuousLeaveReport() {
  const [draft, setDraft] = useState<Filter>(initial),
    [applied, setApplied] = useState<Filter>(draft);
  const [rows, setRows] = useState<Row[]>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [teachers, setTeachers] = useState<Teacher[]>(),
    [teacherError, setTeacherError] = useState(''),
    [teacherAttempt, setTeacherAttempt] = useState(0);
  const request = useRef(0),
    controller = useRef<AbortController>();
  const firstFilter = useRef(draft);
  useEffect(() => {
    const abort = new AbortController();
    setTeacherError('');
    api
      .get<unknown, Envelope>('/users/teachers', {
        params: { kind: 'teaching' },
        signal: abort.signal,
      })
      .then((res) => {
        if (abort.signal.aborted) return;
        if (res.success === false || !Array.isArray(res.data) || !res.data.every(teacher))
          throw new Error('老师名单不完整，请重试');
        setTeachers(res.data);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setTeacherError(failure(e));
      });
    return () => abort.abort();
  }, [teacherAttempt]);
  const query = useCallback(async (filter: Filter) => {
    const id = ++request.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setApplied(filter);
    setRows(undefined);
    setError('');
    setLoading(true);
    try {
      // Send Shanghai calendar dates: slicing a UTC ISO date in the API can shift it back one day.
      const res = await api.get<unknown, Envelope>('/attendances/low-attendance-students', {
        params: {
          ...(filter.range
            ? {
                startDate: filter.range[0].format('YYYY-MM-DD'),
                endDate: filter.range[1].format('YYYY-MM-DD'),
              }
            : {}),
          teacherId: filter.teacherId,
          threshold: filter.threshold,
          continuousAbsentOnly: filter.continuousOnly,
        },
        signal: abort.signal,
      });
      if (id !== request.current || abort.signal.aborted) return;
      if (res.success === false) throw new Error('查询失败，请重试');
      setRows(readRows(res.data));
    } catch (e) {
      if (id === request.current && !abort.signal.aborted) setError(failure(e));
    } finally {
      if (id === request.current && !abort.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let disposed = false;
    // StrictMode's discarded mount must not send a second automatic request.
    queueMicrotask(() => {
      if (!disposed) void query(firstFilter.current);
    });
    return () => {
      disposed = true;
      request.current++;
      controller.current?.abort();
    };
  }, [query]);
  function reset() {
    const defaults = initial();
    setDraft(defaults);
    void query(defaults);
  }
  const total = rows ? new Set(rows.map((r) => r.id)).size : null;
  const continuous = rows
    ? new Set(rows.filter((r) => r.isContinuousAbsent).map((r) => r.id)).size
    : null;
  const classes = rows ? new Set(rows.map((r) => r.classId)).size : null;
  const stats = [
    {
      title: '待关注学员',
      value: total,
      unit: '人',
      note: '同一学员多班去重',
      icon: <UsersRound size={17} />,
      primary: true,
    },
    {
      title: '连续未到 ≥2次',
      value: continuous,
      unit: '人',
      note: '当前名单内的连续未到学员',
      icon: <UserRoundX size={17} />,
    },
    {
      title: '涉及班级',
      value: classes,
      unit: '个',
      note: '当前名单覆盖的班级',
      icon: <CalendarDays size={17} />,
    },
  ];
  return (
    <main className="cfs-page spf-page cat-page cls-page" data-testid="continuous-leave-report">
      <header className="cfs-heading">
        <div>
          <h1>连续请假学员</h1>
          <p>把需要回访的学员找出来，出勤与联系方式在一页看清。</p>
        </div>
      </header>
      <form
        className="cat-filters cls-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void query(draft);
        }}
      >
        <div className="cat-field cat-dates">
          <span>课程日期</span>
          <DatePicker.RangePicker
            aria-label="课程日期"
            className="cfs-date-range"
            popupClassName="cat-calendar"
            value={draft.range}
            allowClear
            format="YYYY-MM-DD"
            placeholder={['近30天（默认）', '截至当前时间']}
            presets={[
              { label: '最近7天', value: recent(7) },
              { label: '最近14天', value: recent(14) },
              { label: '最近30天', value: recent(30) },
              { label: '本月', value: [today().startOf('month'), today()] },
              {
                label: '上月',
                value: [
                  today().subtract(1, 'month').startOf('month'),
                  today().subtract(1, 'month').endOf('month'),
                ],
              },
            ]}
            onChange={(dates) =>
              setDraft({ ...draft, range: dates?.[0] && dates[1] ? [dates[0], dates[1]] : null })
            }
          />
        </div>
        <div className="cat-field">
          <span>负责老师</span>
          <Select
            aria-label="负责老师"
            className="cfs-staff-select"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部老师"
            loading={!teachers && !teacherError}
            value={draft.teacherId}
            options={teachers?.map((r) => ({ value: r.id, label: r.name }))}
            onChange={(teacherId) => setDraft({ ...draft, teacherId })}
          />
        </div>
        <div className="cat-field cat-rate-field">
          <label htmlFor="cls-threshold">出勤率低于</label>
          <InputNumber
            id="cls-threshold"
            aria-label="出勤率低于"
            value={draft.threshold}
            min={0}
            max={100}
            precision={0}
            suffix="%"
            controls={false}
            onChange={(threshold) => setDraft({ ...draft, threshold: threshold ?? 60 })}
          />
        </div>
        <div className="cls-continuous">
          <Switch
            id="cls-continuous"
            checked={draft.continuousOnly}
            onChange={(continuousOnly) => setDraft({ ...draft, continuousOnly })}
          />
          <label htmlFor="cls-continuous">仅连续未到 ≥2次</label>
        </div>
        <div className="cat-actions">
          <Button
            className="cat-query"
            type="primary"
            htmlType="submit"
            icon={<Search size={15} />}
            loading={loading}
          >
            查询
          </Button>
          <Button
            htmlType="button"
            className="cfs-method-button"
            icon={<RotateCcw size={15} />}
            onClick={reset}
          >
            重置
          </Button>
        </div>
      </form>
      {teacherError && (
        <Alert
          className="spf-alert"
          showIcon
          type="warning"
          message="老师名单加载失败"
          description={teacherError}
          action={
            <Button size="small" onClick={() => setTeacherAttempt((n) => n + 1)}>
              重试老师名单
            </Button>
          }
        />
      )}
      <section className="cfs-stats cat-stats cls-stats" aria-label="查询汇总" aria-busy={loading}>
        {stats.map((s) => (
          <article
            className={`cfs-glass cfs-stat${s.primary ? ' cfs-stat-primary' : ''}`}
            key={s.title}
          >
            <div className="cfs-stat-label">
              {s.title}
              {s.icon}
            </div>
            <div className="cfs-money">
              {loading ? (
                <Skeleton.Input active={false} size="small" style={{ width: 64, minWidth: 64 }} />
              ) : (
                <>
                  {s.value ?? '—'}
                  {s.value !== null && <small>{s.unit}</small>}
                </>
              )}
            </div>
            <p className="cls-stat-note">{s.note}</p>
          </article>
        ))}
      </section>
      <section
        className="bz-table-wrap spf-table cat-table cls-table"
        aria-label="学员出勤名单"
        aria-busy={loading}
      >
        <header className="spf-table-head">
          <div>
            <h2>待关注名单</h2>
            <p>
              <span>{applied ? period(applied.range) : '选择条件后查询'}</span>
              {applied && (
                <>
                  <span>
                    {applied.teacherId
                      ? teachers?.find((t) => t.id === applied.teacherId)?.name || '已选老师'
                      : '全部老师'}
                  </span>
                  <span>
                    出勤率低于 {applied.threshold}%
                    {applied.continuousOnly ? ' · 连续未到 ≥2次' : ''}
                  </span>
                </>
              )}
            </p>
          </div>
          {rows && (
            <span className="cat-result-total">
              {total} 位学员 · {rows.length} 条记录
            </span>
          )}
        </header>
        {error ? (
          <Alert
            className="cls-query-error"
            type="error"
            showIcon
            message="出勤名单查询失败"
            description={error}
            action={
              <Button
                size="small"
                onClick={() => {
                  if (applied) void query(applied);
                }}
              >
                重新查询
              </Button>
            }
          />
        ) : loading || !rows ? (
          <div className="cls-skeleton" role="status" aria-label="正在读取出勤名单">
            <span className="cls-loading-label">正在读取出勤名单…</span>
            <Skeleton
              active={false}
              title={false}
              paragraph={{ rows: 6, width: ['86%', '100%', '92%', '100%', '88%', '100%'] }}
            />
          </div>
        ) : (
          <AttendanceList key={request.current} rows={rows} filter={applied} />
        )}
      </section>
      <footer className="spf-notes cls-notes">
        <p>
          仅统计当前在读且已入班的学员；未入班、已确定不续费、流失及归档学员不参与。统计已点名或已经结束的有效场次，实到包含出勤和迟到；未到包含请假、缺勤及未点名、漏点名。补划后按最新结果更新，没有应到课次的学员不参与判定。
        </p>
        <p>连续未到从所选期间最近课次向前计算；同一学员在不同班级分别列出，汇总人数去重。</p>
      </footer>
    </main>
  );
}
export default function ContinuousLeaveStudents() {
  const user = useAuthStore((s) => s.user);
  return (
    <ContinuousLeaveReport
      key={JSON.stringify([
        user?.id,
        user?.organizationId,
        user?.campusId,
        user?.role,
        user?.isPlatformAdmin,
      ])}
    />
  );
}
