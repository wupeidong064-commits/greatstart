import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, DatePicker, Empty, Grid, Segmented, Select, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ChartNoAxesCombined, RefreshCw, RotateCcw } from 'lucide-react';
import { isAxiosError } from 'axios';
import dayjs from 'dayjs';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useBusinessRefresh } from '../hooks/useBusinessRefresh';
import { bzExpandable, bzRowClass, useBzExpand } from '../hooks/useBzExpand';
import {
  asDate,
  presetRange,
  previousRange,
  rangeLabel,
  type StaffOption,
  type StaffRow,
  type DateRange,
  type Period,
} from './staffPerformanceData';
import './CashflowSummary.css';
import './StaffPerformance.css';

type Props<T extends StaffRow> = {
  kind: 'teacher' | 'sales';
  description: string;
  validate: (row: unknown) => row is T;
  columns: (previous: Map<string, T>, compact: boolean) => ColumnsType<T>;
  details?: (row: T) => ReactNode;
  notes: ReactNode;
};
type Envelope = { success?: boolean; data: unknown };
type Result<T> = { rows: T[]; error: string; loading: boolean };
const loadingState = { rows: [], error: '', loading: true };
const roleName: Record<string, string> = {
  teacher: '老师',
  coach: '老师',
  sales: '销售',
  staff: '工作人员',
  manager: '管理人员',
  admin: '管理员',
};
const presets: { label: string; value: Period }[] = [
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '上月', value: 'lastMonth' },
];
const rowKey = (r: StaffRow) => r.teacherId;

function errorText(error: unknown) {
  if (isAxiosError(error) && typeof error.response?.data?.error?.message === 'string')
    return error.response.data.error.message;
  return error instanceof Error ? error.message : '读取失败，请重试';
}

function useRows<T extends StaffRow>({
  enabled,
  kind,
  validate,
  start,
  end,
  staffId,
  refresh,
}: {
  enabled: boolean;
  kind: Props<T>['kind'];
  validate: Props<T>['validate'];
  start: string;
  end: string;
  staffId?: string;
  refresh: number;
}): Result<T> {
  const [result, setResult] = useState<Result<T>>(loadingState);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setResult(loadingState);
    const teacher = kind === 'teacher';
    const path = teacher ? '/users/coach-statistics' : '/users/sales-statistics';
    const params = {
      startDate: start,
      endDate: end,
      ...(staffId ? { [teacher ? 'teacherId' : 'salesId']: staffId } : {}),
    };
    api
      .get<unknown, Envelope>(path, { params, signal: controller.signal })
      .then((response) => {
        if (
          response.success === false ||
          !Array.isArray(response.data) ||
          !response.data.every(validate)
        )
          throw new Error('统计响应不完整，请重新加载');
        if (!controller.signal.aborted)
          setResult({ rows: response.data, loading: false, error: '' });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ rows: [], loading: false, error: errorText(error) });
      });
    return () => controller.abort();
  }, [enabled, kind, validate, start, end, staffId, refresh]);
  return result;
}

export function StaffName({ row, caption }: { row: StaffRow; caption?: string }) {
  return (
    <div className="spf-name">
      <b>{row.teacherName}</b>
      {(caption || row.role) && <small>{caption || roleName[row.role || ''] || '工作人员'}</small>}
    </div>
  );
}

export function Metric({
  value,
  sub,
  emphasis = false,
}: {
  value: string;
  sub?: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className={'spf-metric' + (emphasis ? ' spf-emphasis' : '')}>
      <b>{value}</b>
      {sub !== undefined && <small>{sub}</small>}
    </div>
  );
}

export function StaffPerformance<T extends StaffRow>(props: Props<T>) {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  const scope = JSON.stringify([
    user.id,
    user.organizationId,
    user.campusId,
    user.role,
    user.isPlatformAdmin,
  ]);
  return <PerformanceReport key={scope} {...props} />;
}

function PerformanceReport<T extends StaffRow>({
  kind,
  columns,
  validate,
  details,
  notes,
  description,
}: Props<T>) {
  const teacher = kind === 'teacher';
  const group = teacher ? '老师' : '销售人员';
  const [range, setRange] = useState<DateRange>(() => presetRange('month'));
  const [period, setPeriod] = useState<Period>('month');
  const [staffId, setStaffId] = useState<string>();
  const [options, setOptions] = useState<StaffOption[]>([]);
  const [optionsError, setOptionsError] = useState('');
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [optionReload, setOptionReload] = useState(0);
  const [previousReload, setPreviousReload] = useState(0);
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10);
  const expand = useBzExpand();
  const compact = Grid.useBreakpoint().md === false;
  const previous = previousRange(range);
  const current = useRows({
    enabled: true,
    kind,
    validate,
    start: asDate(range[0]),
    end: asDate(range[1]),
    staffId,
    refresh: reload,
  });
  const prior = useRows({
    enabled: teacher,
    kind,
    validate,
    start: asDate(previous[0]),
    end: asDate(previous[1]),
    staffId,
    refresh: reload + previousReload,
  });
  useBusinessRefresh(() => setReload((value) => value + 1));

  useEffect(() => {
    const controller = new AbortController();
    setOptionsLoading(true);
    setOptionsError('');
    api
      .get<unknown, Envelope>('/users/teachers', {
        params: { kind: teacher ? 'teaching' : 'staff' },
        signal: controller.signal,
      })
      .then((response) => {
        if (
          response.success === false ||
          !Array.isArray(response.data) ||
          !response.data.every((r) => r && typeof r.id === 'string' && typeof r.name === 'string')
        )
          throw new Error('人员选项响应不完整');
        if (!controller.signal.aborted) setOptions(response.data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setOptions([]);
          setOptionsError(errorText(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setOptionsLoading(false);
      });
    return () => controller.abort();
  }, [teacher, optionReload]);

  function selectDates(nextRange: DateRange, key: Period) {
    setRange(nextRange);
    setPeriod(key);
    setPage(1);
  }
  function refresh() {
    setReload((n) => n + 1);
    setOptionReload((n) => n + 1);
  }
  const previousRows =
    teacher && !prior.error && !prior.loading
      ? new Map(prior.rows.map((r) => [r.teacherId, r]))
      : new Map<string, T>();
  const reportColumns = columns(previousRows, compact);
  return (
    <main className="cfs-page spf-page" data-testid={kind + '-performance'}>
      <header className="cfs-heading">
        <div>
          <div className="cfs-eyebrow">
            <ChartNoAxesCombined size={14} aria-hidden="true" />
            人员业绩
          </div>
          <h1>{teacher ? '老师数据' : '销售数据'}</h1>
          <p>{description}</p>
        </div>
      </header>
      <div className="cfs-toolbar spf-toolbar">
        <Segmented<Period>
          aria-label="统计时间快捷选择"
          value={period}
          options={
            period === 'custom' ? [...presets, { label: '自定义', value: 'custom' }] : presets
          }
          onChange={(key) => {
            if (key !== 'custom') selectDates(presetRange(key), key);
          }}
        />
        <DatePicker.RangePicker
          className="cfs-date-range"
          aria-label="统计日期"
          value={range}
          allowClear={false}
          format="YYYY-MM-DD"
          onChange={(dates) => {
            if (dates?.[0] && dates[1]) selectDates([dates[0], dates[1]], 'custom');
          }}
        />
        {range[1].isAfter(dayjs(), 'day') && (
          <span className="cfs-unit" role="note">
            含未来日期 · 按已登记记录统计
          </span>
        )}
        <span className="cfs-toolbar-spacer" />
        <Select
          className="cfs-staff-select"
          aria-label={group + '筛选'}
          placeholder={'全部' + group}
          showSearch
          optionFilterProp="label"
          value={staffId}
          loading={optionsLoading}
          allowClear
          options={options.map((r) => ({ label: r.name, value: r.id }))}
          notFoundContent={optionsError ? '人员选项读取失败' : '暂无可选人员'}
          onChange={(value) => {
            setStaffId(value);
            setPage(1);
          }}
        />
        <Tooltip title="重置筛选">
          <Button
            className="cfs-refresh"
            aria-label="重置筛选"
            icon={<RotateCcw size={15} />}
            onClick={() => {
              selectDates(presetRange('month'), 'month');
              setStaffId(undefined);
            }}
          />
        </Tooltip>
        <Tooltip title="刷新统计">
          <Button
            className="cfs-refresh"
            aria-label="刷新统计"
            icon={<RefreshCw size={15} />}
            onClick={refresh}
            disabled={current.loading}
          />
        </Tooltip>
      </div>
      {optionsError && (
        <Alert
          className="spf-alert"
          type="warning"
          showIcon
          message="人员选项加载失败"
          description={optionsError}
          action={<Button onClick={() => setOptionReload((n) => n + 1)}>重试人员选项</Button>}
        />
      )}
      {teacher && prior.error && (
        <Alert
          className="spf-alert"
          type="warning"
          showIcon
          message="上期统计加载失败，比较值暂不可用"
          description={prior.error}
          action={<Button onClick={() => setPreviousReload((n) => n + 1)}>重试上期</Button>}
        />
      )}
      {current.error && (
        <Alert
          className="spf-alert"
          type="error"
          showIcon
          message="本期统计加载失败"
          description={current.error}
          action={<Button onClick={() => setReload((n) => n + 1)}>重试统计</Button>}
        />
      )}
      <section className="bz-table-wrap spf-table cfs-results" aria-label={group + '业绩明细'}>
        <div className="spf-table-head">
          <div>
            <h2>{teacher ? '教学表现' : '销售表现'}</h2>
            <p>
              本期 {rangeLabel(range)}
              {teacher && <span>上期 {rangeLabel(previous)}</span>}
            </p>
          </div>
          {!current.error && !current.loading && (
            <span className="spf-total">
              {current.rows.length} 位{group}
            </span>
          )}
        </div>
        {!current.error && (
          <Table<T>
            rowKey={rowKey}
            columns={reportColumns}
            dataSource={current.rows}
            loading={current.loading}
            expandable={details ? bzExpandable(expand, details, rowKey) : undefined}
            rowClassName={(row) => (details ? bzRowClass(expand, row, rowKey) : '')}
            pagination={{
              current: page,
              pageSize,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              hideOnSinglePage: false,
              showTotal: (total) => `共 ${total} 位${group}`,
              onChange: (next, size) => {
                setPage(size === pageSize ? next : 1);
                setPageSize(size);
              },
            }}
            locale={{
              emptyText: current.loading ? (
                '正在读取统计'
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={'当前筛选下暂无' + group}
                />
              ),
            }}
          />
        )}
      </section>
      <footer className="spf-notes">{notes}</footer>
    </main>
  );
}
