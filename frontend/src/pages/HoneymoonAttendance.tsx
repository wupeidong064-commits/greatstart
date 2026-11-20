import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Grid, InputNumber, Select, Skeleton, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ChartNoAxesColumn,
  ChevronRight,
  ListChecks,
  Phone,
  RotateCcw,
  Search,
  TrendingDown,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { bzExpandable, bzRowClass, useBzExpand } from '../hooks/useBzExpand';
import { number, sortNumber, type StaffOption } from './staffPerformanceData';
import './CashflowSummary.css';
import './StaffPerformance.css';
import './ClassAttendance.css';
import './HoneymoonAttendance.css';

type Criteria = { teacherId?: string; maxRate: number | null; unassignedOnly: boolean };
type Counts = {
  expectedAttendance: number;
  actualAttendance: number;
  absentCount: number;
  attendanceRate: number | null;
};
type ClassDetail = Counts & {
  classId: string;
  className: string;
  classCode?: string | null;
  teacher?: StaffOption | null;
};
type Student = Counts & {
  id: string;
  studentName: string;
  registrationDate: string;
  daysRemaining: number;
  phone?: string | null;
  isUnassigned: boolean;
  teachers: StaffOption[];
  classes: ClassDetail[];
};
type Summary = {
  total: number;
  avgAttendanceRate: number | null;
  highAttendance: number;
  lowAttendance: number;
  unratedCount: number;
  unassignedCount: number;
};
type Report = {
  students: Student[];
  stats: Summary;
  period: { start: string; end: string };
  caliberNote: string;
};
type Envelope = { success?: boolean; data: unknown };
const initial: Criteria = { maxRate: null, unassignedOnly: false };
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const rate = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const staff = (v: unknown): v is StaffOption =>
  isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string';
const counts = (v: Record<string, unknown>) =>
  count(v.expectedAttendance) &&
  count(v.actualAttendance) &&
  count(v.absentCount) &&
  (v.expectedAttendance === 0 ? v.attendanceRate === null : rate(v.attendanceRate));
const classInfo = (v: unknown) =>
  isRecord(v) &&
  typeof v.classId === 'string' &&
  typeof v.className === 'string' &&
  (v.classCode == null || typeof v.classCode === 'string') &&
  (v.teacher == null || staff(v.teacher)) &&
  counts(v);
const student = (v: unknown) =>
  isRecord(v) &&
  typeof v.id === 'string' &&
  typeof v.studentName === 'string' &&
  date(v.registrationDate) &&
  count(v.daysRemaining) &&
  typeof v.isUnassigned === 'boolean' &&
  (v.phone == null || typeof v.phone === 'string') &&
  Array.isArray(v.teachers) &&
  v.teachers.every(staff) &&
  Array.isArray(v.classes) &&
  v.classes.every(classInfo) &&
  counts(v);
function readReport(data: unknown): Report {
  if (
    !isRecord(data) ||
    !Array.isArray(data.students) ||
    !data.students.every(student) ||
    !isRecord(data.stats) ||
    !count(data.stats.total) ||
    !count(data.stats.highAttendance) ||
    !count(data.stats.lowAttendance) ||
    !count(data.stats.unratedCount) ||
    !count(data.stats.unassignedCount) ||
    (data.stats.avgAttendanceRate !== null && !rate(data.stats.avgAttendanceRate)) ||
    !isRecord(data.period) ||
    !date(data.period.start) ||
    !date(data.period.end) ||
    typeof data.caliberNote !== 'string'
  ) {
    throw new Error('蜜月期统计数据不完整，请重新查询');
  }
  return data as Report;
}
const formatDay = (stamp: string) =>
  stamp.length === 10
    ? stamp
    : new Date(stamp).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
function errorMessage(e: unknown) {
  const reason = isAxiosError(e) && e.response?.data?.error?.message;
  return typeof reason === 'string' ? reason : e instanceof Error ? e.message : '读取失败，请重试';
}
const classLabel = (r: Student) =>
  r.isUnassigned ? '未入班' : r.classes.length > 1 ? r.classes.length + ' 个班级' : r.classes[0]?.className || '已入班';
const staffLabel = (r: Student) => r.teachers.map((t) => t.name).join('、') || '未分配老师';
const pair = (r: Counts) => (
  <span className="cat-attendance-pair">
    <b>{r.actualAttendance}</b>
    <span>/ {r.expectedAttendance}</span>
  </span>
);

function StudentDetail({ row }: { row: Student }) {
  return (
    <section className="hym-detail" aria-label={row.studentName + '逐班出勤'}>
      <header>
        <h3>逐班出勤</h3>
        <span className="hym-contact">
          <Phone size={13} aria-hidden="true" />
          <span>联系电话</span>
          {row.phone ? <a href={'tel:' + row.phone}>{row.phone}</a> : <span>未填写</span>}
        </span>
      </header>
      {row.classes.length ? (
        <ul>
          {row.classes.map((c) => (
            <li key={c.classId}>
              <div className="spf-name">
                <b>{c.className}</b>
                <small>
                  {[c.classCode, c.teacher?.name || '未分配老师'].filter(Boolean).join(' · ')}
                </small>
              </div>
              <div className="hym-detail-count">
                <span>实到 / 应到</span>
                {pair(c)}
              </div>
              <div className="hym-detail-count">
                <span>未到</span>
                <b>{c.absentCount} 次</b>
              </div>
              <div className="hym-detail-count">
                <span>出勤率</span>
                <b>
                  {number(c.attendanceRate, '%')}
                  {c.attendanceRate === null && '（尚无课次）'}
                </b>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>尚未入班，请先到学员管理安排班级；不参与出勤统计。</p>
      )}
    </section>
  );
}

function StudentList({ rows }: { rows: Student[] }) {
  const compact = !Grid.useBreakpoint().md;
  const bz = useBzExpand();
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const close = () => {
    if (bz.expandedId) bz.toggleExpand(bz.expandedId);
  };
  const columns: ColumnsType<Student> = [
    {
      title: '学员',
      key: 'student',
      render: (_, r) => (
        <div className="cat-class-cell">
          {!compact && (
            <span className="cat-class-icon">
              <UserRound size={17} aria-hidden="true" />
            </span>
          )}
          <div className="spf-name">
            <button
              type="button"
              className="hym-student"
              aria-expanded={bz.expandedId === r.id}
              onClick={() => bz.toggleExpand(r.id)}
            >
              {r.studentName}
            </button>
            {compact && (
              <>
                <small>
                  {classLabel(r)} · {staffLabel(r)}
                </small>
                <small>首次报名 {formatDay(r.registrationDate)}</small>
                <small>剩余 {r.daysRemaining} 天</small>
              </>
            )}
          </div>
        </div>
      ),
    },
    ...(!compact
      ? [
          {
            title: '所属班级',
            key: 'class',
            render: (_: unknown, r: Student) => (
              <span className={r.isUnassigned ? 'hym-unassigned-label' : 'hym-secondary-name'}>{classLabel(r)}</span>
            ),
          },
          {
            title: '负责老师',
            key: 'teacher',
            render: (_: unknown, r: Student) => (
              <span className="hym-secondary-name">{staffLabel(r)}</span>
            ),
          },
          {
            title: '首次报名',
            key: 'registration',
            sorter: (a: Student, b: Student) =>
              a.registrationDate.localeCompare(b.registrationDate),
            render: (_: unknown, r: Student) => (
              <div className="spf-name">
                <span>{formatDay(r.registrationDate)}</span>
                <small>剩余 {r.daysRemaining} 天</small>
              </div>
            ),
          },
          {
            title: '实到 / 应到',
            key: 'counts',
            align: 'right' as const,
            render: (_: unknown, r: Student) => r.isUnassigned ? <span className="cat-no-rate">不统计出勤</span> : pair(r),
          },
        ]
      : []),
    {
      title: '出勤率',
      key: 'rate',
      align: 'right',
      width: compact ? 92 : '14%',
      sorter: (a, b) => sortNumber(a.attendanceRate, b.attendanceRate),
      render: (_, r) => (
        <div className="hym-rate">
          {r.isUnassigned ? (
            <span className="hym-unassigned-label">未入班</span>
          ) : r.attendanceRate === null ? (
            <span className="cat-no-rate">尚无课次</span>
          ) : (
            <div className={'cat-rate' + (r.attendanceRate === 0 ? ' cat-zero-rate' : '')}>
              <b>{number(r.attendanceRate, '%')}</b>
              <span aria-hidden="true">
                <i style={{ width: r.attendanceRate + '%' }} />
              </span>
            </div>
          )}
          {compact && !r.isUnassigned && (
            <small>
              实到 / 应到
              <br />
              {r.actualAttendance} / {r.expectedAttendance}
            </small>
          )}
        </div>
      ),
    },
  ];
  return (
    <Table<Student>
      tableLayout="fixed"
      rowKey="id"
      dataSource={rows}
      columns={columns}
      expandable={{
        ...bzExpandable(bz, (r: Student) => <StudentDetail row={r} />),
        columnWidth: compact ? 30 : 40,
        expandIcon: ({ record: r }) => {
          const open = bz.expandedId === r.id;
          return (
            <button
              type="button"
              className={'bz-x-arrow' + (open ? ' is-open' : '')}
              aria-expanded={open}
              aria-label={(open ? '收起 ' : '展开 ') + r.studentName + ' 出勤明细'}
              onClick={() => bz.toggleExpand(r.id)}
            >
              <ChevronRight size={15} />
            </button>
          );
        },
      }}
      rowClassName={(r) => bzRowClass(bz, r)}
      onChange={(_, __, ___, meta) => {
        if (meta.action === 'sort') close();
      }}
      pagination={{
        current: page,
        pageSize: size,
        pageSizeOptions: [10, 20, 50, 100],
        showSizeChanger: true,
        hideOnSinglePage: rows.length <= 10,
        size: compact ? 'small' : 'default',
        showLessItems: compact,
        onChange: (p, s) => {
          close();
          setPage(s === size ? p : 1);
          setSize(s);
        },
      }}
      locale={{
        emptyText: (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选下没有蜜月期学员" />
        ),
      }}
    />
  );
}

function HoneymoonReport() {
  const [draft, setDraft] = useState<Criteria>(initial);
  const [applied, setApplied] = useState<Criteria>(initial);
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState('');
  const [teachers, setTeachers] = useState<StaffOption[]>();
  const [teacherError, setTeacherError] = useState('');
  const [teacherAttempt, setTeacherAttempt] = useState(0);
  const reportRequest = useRef<AbortController>();
  useEffect(() => {
    const c = new AbortController();
    setTeacherError('');
    api
      .get<unknown, Envelope>('/users/teachers', { params: { kind: 'teaching' }, signal: c.signal })
      .then((res) => {
        if (res.success === false || !Array.isArray(res.data) || !res.data.every(staff))
          throw new Error('老师名单格式不完整');
        if (!c.signal.aborted) setTeachers(res.data);
      })
      .catch((e) => {
        if (!c.signal.aborted) setTeacherError(errorMessage(e));
      });
    return () => c.abort();
  }, [teacherAttempt]);

  useEffect(() => {
    const c = new AbortController();
    reportRequest.current = c;
    let disposed = false;
    // Skip StrictMode's discarded mount while keeping the first load automatic.
    queueMicrotask(() => {
      if (disposed) return;
      api
        .get<unknown, Envelope>('/attendances/honeymoon', {
          params: {
            teacherId: applied.teacherId,
            maxAttendanceRate: applied.maxRate ?? undefined,
            unassignedOnly: applied.unassignedOnly || undefined,
          },
          signal: c.signal,
        })
        .then((res) => {
          if (res.success === false) throw new Error('蜜月期名单查询失败');
          const data = readReport(res.data);
          if (!c.signal.aborted) setReport(data);
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(errorMessage(e));
        });
    });
    return () => {
      disposed = true;
      c.abort();
    };
  }, [applied]);

  function query(criteria: Criteria) {
    reportRequest.current?.abort();
    setError('');
    setReport(undefined);
    setApplied({ ...criteria });
  }
  const loading = !report && !error;
  const stats = report?.stats;
  const cards = [
    {
      title: '蜜月期学员',
      value: stats?.total,
      unit: '人',
      note: stats ? '未入班 ' + stats.unassignedCount + ' 人 · 已入班尚无课次 ' + (stats.unratedCount - stats.unassignedCount) + ' 人' : '首次新签报名后 30 天内',
      icon: UsersRound,
    },
    {
      title: '平均出勤率',
      value: stats?.avgAttendanceRate,
      unit: '%',
      note: '仅计算有应到课次的学员',
      icon: ChartNoAxesColumn,
    },
    {
      title: '高出勤学员',
      value: stats?.highAttendance,
      unit: '人',
      note: '出勤率 ≥ 80%',
      icon: ListChecks,
    },
    {
      title: '低出勤学员',
      value: stats?.lowAttendance,
      unit: '人',
      note: '已入班且出勤率 < 60%',
      icon: TrendingDown,
    },
  ];
  return (
    <main className="cfs-page spf-page cat-page hym-page" data-testid="honeymoon-attendance">
      <header className="cfs-heading">
        <div>
          <h1>蜜月期客户出勤</h1>
          <p>蜜月期从首次新签报名日起算 30 天，调班和续费均沿用首次报名日期。</p>
        </div>
      </header>
      <form
        className="cat-filters hym-filters"
        onSubmit={(e) => {
          e.preventDefault();
          query(draft);
        }}
      >
        <div className="cat-field">
          <span>负责老师</span>
          <Select
            className="cfs-staff-select"
            aria-label="负责老师"
            placeholder="全部老师"
            showSearch
            allowClear
            optionFilterProp="label"
            loading={!teachers && !teacherError}
            value={draft.teacherId}
            disabled={draft.unassignedOnly}
            options={teachers?.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(teacherId) => setDraft({ ...draft, teacherId })}
          />
        </div>
        <div className="cat-field">
          <label htmlFor="hym-rate">出勤率不高于</label>
          <InputNumber
            id="hym-rate"
            aria-label="出勤率不高于"
            min={0}
            max={100}
            controls={false}
            suffix="%"
            placeholder="不限"
            value={draft.maxRate}
            disabled={draft.unassignedOnly}
            onChange={(maxRate) => setDraft({ ...draft, maxRate })}
          />
        </div>
        <Button
          htmlType="button"
          className="hym-unassigned-filter"
          type={applied.unassignedOnly ? 'primary' : 'default'}
          aria-pressed={applied.unassignedOnly}
          onClick={() => {
            const next = { ...initial, unassignedOnly: !applied.unassignedOnly };
            setDraft(next);
            query(next);
          }}
        >
          {applied.unassignedOnly ? '显示全部学员' : '未入班学员'}
        </Button>
        <div className="cat-actions">
          <Button
            type="primary"
            className="cat-query"
            htmlType="submit"
            loading={loading}
            icon={<Search size={15} />}
          >
            查询
          </Button>
          <Button
            htmlType="button"
            className="cfs-method-button"
            icon={<RotateCcw size={15} />}
            onClick={() => {
              setDraft(initial);
              query(initial);
            }}
          >
            重置
          </Button>
        </div>
      </form>
      {teacherError && (
        <Alert
          className="spf-alert"
          type="warning"
          showIcon
          message="老师名单加载失败"
          description={teacherError}
          action={
            <Button size="small" onClick={() => setTeacherAttempt((n) => n + 1)}>
              重试老师名单
            </Button>
          }
        />
      )}
      <section
        className="cfs-stats cat-stats hym-stats"
        aria-label="蜜月期查询汇总"
        aria-busy={loading}
      >
        {cards.map(({ title, value, unit, note, icon: Icon }, i) => (
          <article
            key={title}
            className={'cfs-glass cfs-stat' + (i === 0 ? ' cfs-stat-primary' : '')}
          >
            <div className="cfs-stat-label">
              {title}
              <Icon size={16} aria-hidden="true" />
            </div>
            <div className="cfs-money">
              {loading ? (
                <Skeleton.Input active={false} size="small" style={{ width: 64, minWidth: 64 }} />
              ) : (
                <>
                  {number(value)}
                  {value != null && <small>{unit}</small>}
                </>
              )}
            </div>
            <p className="hym-stat-note">{note}</p>
          </article>
        ))}
      </section>
      <section
        className="bz-table-wrap spf-table cat-table hym-table"
        aria-label="蜜月期学员名单"
        aria-busy={loading}
      >
        <header className="spf-table-head">
          <div>
            <h2>蜜月期学员名单</h2>
            <p>
              {report && (
                <span>
                  首次报名 {formatDay(report.period.start)} 至 {formatDay(report.period.end)}
                </span>
              )}
              {applied ? (
                <>
                  <span>
                    {applied.teacherId
                      ? teachers?.find((t) => t.id === applied.teacherId)?.name || '已选老师'
                      : '全部老师'}
                  </span>
                  {applied.unassignedOnly ? <span>仅未入班学员</span> : applied.maxRate != null && <span>出勤率不高于 {applied.maxRate}% · 包含未入班学员</span>}
                </>
              ) : (
                <span>选择条件后查询</span>
              )}
            </p>
          </div>
          {stats && <span className="cat-result-total">{stats.total} 位学员</span>}
        </header>
        {error ? (
          <Alert
            className="cat-table-error"
            type="error"
            showIcon
            message="蜜月期名单查询失败"
            description={error}
            action={
              <Button size="small" onClick={() => query(applied)}>
                重新查询
              </Button>
            }
          />
        ) : loading || !report ? (
          <div className="hym-skeleton" role="status" aria-label="正在读取蜜月期学员">
            <span className="hym-loading-label">正在读取蜜月期学员…</span>
            <Skeleton
              active={false}
              title={false}
              paragraph={{ rows: 6, width: ['86%', '100%', '92%', '100%', '88%', '100%'] }}
            />
          </div>
        ) : (
          <StudentList rows={report.students} />
        )}
      </section>
      {report && <footer className="spf-notes">{report.caliberNote}</footer>}
    </main>
  );
}
export default function HoneymoonAttendance() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  if (!['admin', 'manager'].includes(user.role))
    return <Alert type="warning" message="仅管理员和管理人员可以查看蜜月期客户" />;
  return (
    <HoneymoonReport
      key={JSON.stringify([
        user.id,
        user.organizationId,
        user.campusId,
        user.role,
        user.isPlatformAdmin,
      ])}
    />
  );
}
