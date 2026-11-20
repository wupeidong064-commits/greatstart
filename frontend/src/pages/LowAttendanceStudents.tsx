import { useCallback, useEffect, useState } from 'react';
import { Table, Button, Alert, Select, InputNumber, Space, Progress, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { UsersRound } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import api from '../services/api';
import { useBzExpand, bzExpandable, bzRowClass } from '../hooks/useBzExpand';
import dayjs from 'dayjs';

/**
 * 低出勤学员（bz-table 表格语言）
 *
 * 数据源：既有接口 GET /attendances/low-attendance-students（真实出勤记录）。
 * 判定规则与后端一致并明示在界面上：
 * - 出勤率 =（出勤 + 迟到次数）/ 统计窗口内该班级已点名课次；
 * - 出勤率 < 阈值（默认 60%，可调整）即列为低出勤；
 * - 窗口内没有排课的班级不参与判定（避免「没排课 ≠ 缺勤」的误判）。
 *
 * 未知数显示规则（2026-11-04 用户定稿）：分母为零显示「暂无课次」；
 * 无法取得的数据写「暂不可用」，不把未知显示成 0。
 *
 * 主行（用户定稿）：学员、班级、出勤率、实到/应到；窄屏下学员固定左侧、
 * 出勤率与实到/应到固定右侧，班级滚动。统计期间/负责人/完整号码/考勤明细在展开区。
 */

interface LowAttendanceRow {
  id: string;
  studentName: string;
  phone: string;
  classId: string;
  className: string;
  classCode?: string;
  teacher?: { name?: string } | null;
  scheduleCount: number;
  presentCount: number;
  absentCount: number;
  continuousAbsentCount?: number;
  isContinuousAbsent?: boolean;
  isTemporary?: boolean;
  attendanceRate: number;
}

const WINDOW_OPTIONS = [
  { value: 7, label: '近 7 天' },
  { value: 14, label: '近 14 天' },
  { value: 30, label: '近 30 天' },
  { value: 60, label: '近 60 天' },
];

/** 分母为零 → 暂无课次；数值缺失 → 暂不可用；其余正常渲染 */
function renderCount(value: number | undefined, hasDenominator: boolean): React.ReactNode {
  if (hasDenominator && typeof value === 'number') return value;
  return <span className="bz-na">{hasDenominator ? '暂不可用' : '暂无课次'}</span>;
}

const LowAttendanceStudents: React.FC = () => {
  const [rows, setRows] = useState<LowAttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [threshold, setThreshold] = useState(60);
  const bz = useBzExpand();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const end = dayjs().format('YYYY-MM-DD');
      const start = dayjs().subtract(days, 'day').format('YYYY-MM-DD');
      const res: any = await api.get('/attendances/low-attendance-students', {
        params: { startDate: start, endDate: end, threshold },
      });
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (err: any) {
      setLoadError(err?.response?.data?.message || err?.message || '加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }, [days, threshold]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columns: ColumnsType<LowAttendanceRow> = [
    {
      title: '学员',
      dataIndex: 'studentName',
      key: 'studentName',
      width: 110,
      fixed: 'left' as const,
      render: (text: string, r) => (
        <button
          type="button"
          className="bz-student"
          title="查看详情"
          onClick={(e) => { e.stopPropagation(); bz.toggleExpand(r.id); }}
        >
          {text || '-'}
        </button>
      ),
    },
    {
      title: '班级',
      key: 'className',
      width: 150,
      render: (_, r) => <Space wrap size={4}>{r.className || r.classCode || '-'}{r.isTemporary && <Tag>含临时串课</Tag>}</Space>,
    },
    {
      title: '出勤率',
      dataIndex: 'attendanceRate',
      key: 'attendanceRate',
      width: 160,
      fixed: 'right' as const,
      sorter: (a, b) => a.attendanceRate - b.attendanceRate,
      render: (rate: number, r) => {
        // 分母为零：窗口内该班没有已点名课次 → 暂无课次（不显示 0%）
        if (!r.scheduleCount || r.scheduleCount === 0) {
          return <span className="bz-na">暂无课次</span>;
        }
        if (typeof rate !== 'number' || !Number.isFinite(rate)) {
          return <span className="bz-na">暂不可用</span>;
        }
        return (
          <Space size={8}>
            <Progress
              percent={rate}
              size="small"
              style={{ width: 84 }}
              strokeColor={rate < 30 ? 'var(--bad)' : 'var(--warn)'}
              showInfo={false}
            />
            <span style={{ color: rate < 30 ? 'var(--bad)' : 'var(--warn)', fontWeight: 600 }}>{rate}%</span>
          </Space>
        );
      },
    },
    {
      title: '实到 / 应到',
      key: 'presentOverExpected',
      width: 110,
      align: 'center',
      fixed: 'right' as const,
      render: (_, r) => {
        if (!r.scheduleCount || r.scheduleCount === 0) {
          return <span className="bz-na">暂无课次</span>;
        }
        if (typeof r.presentCount !== 'number' || typeof r.scheduleCount !== 'number') {
          return <span className="bz-na">暂不可用</span>;
        }
        return <span style={{ fontWeight: 600 }}>{r.presentCount}/{r.scheduleCount}</span>;
      },
    },
  ];

  return (
    <div>
      <div className="biz-page-head">
        <div className="biz-head-copy">
          <h1>低出勤学员</h1>
          <p>优先联系出勤率最低、连续缺勤的学员，出勤下滑是流失的最强前兆。</p>
        </div>
        <div className="biz-head-actions">
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
            刷新
          </Button>
        </div>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="判定规则"
        description="仅统计当前在读且已入班的学员；未入班、已离班且无其他在读班级、已确认不续费、流失及归档学员不参与。出勤率 =（出勤 + 迟到次数）÷ 统计期间有效入班课次；低于阈值列为低出勤，没有应到课次时不计算出勤率。"
      />

      <Space style={{ marginBottom: 16 }} wrap>
        <span>统计窗口：</span>
        <Select value={days} options={WINDOW_OPTIONS} onChange={setDays} style={{ width: 120 }} />
        <span>出勤率阈值：</span>
        <InputNumber min={1} max={99} value={threshold} onChange={(v) => setThreshold(v || 60)} />
        <span style={{ color: 'var(--tx3)', fontSize: 12 }}>%（低于该值判为低出勤）</span>
      </Space>

      {loadError && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }} message={loadError} />
      )}

      <div className="bz-table-wrap">
        <Table
          rowKey={(r) => `${r.id}_${r.classId}`}
          columns={columns}
          dataSource={rows}
          loading={loading}
          expandable={bzExpandable<LowAttendanceRow>(bz, (r) => {
            const periodStart = dayjs().subtract(days, 'day').format('M月D日');
            const periodEnd = dayjs().format('M月D日');
            const hasDenominator = (r.scheduleCount ?? 0) > 0;
            return (
              <>
                <dl className="bz-x-grid">
                  <div className="bz-x-item">
                    <dt>统计期间</dt>
                    <dd>{`近 ${days} 天（${periodStart} ~ ${periodEnd}）`}</dd>
                  </div>
                  <div className="bz-x-item">
                    <dt>负责老师</dt>
                    <dd>{r.teacher?.name || '-'}</dd>
                  </div>
                  <div className="bz-x-item">
                    <dt>联系电话</dt>
                    <dd>{r.phone || <span className="bz-na">暂不可用</span>}</dd>
                  </div>
                  <div className="bz-x-item">
                    <dt>窗口内已点名</dt>
                    <dd>{renderCount(r.scheduleCount, hasDenominator)} 次</dd>
                  </div>
                </dl>
                <dl className="bz-x-follow">
                  <dt>考勤明细</dt>
                  <dd className={!hasDenominator ? 'bz-x-follow-empty' : undefined}>
                    {!hasDenominator
                      ? '窗口内该班级没有已点名课次，未参与出勤率判定'
                      : `出勤 ${renderCount(r.presentCount, hasDenominator)} 次 · 缺勤 ${renderCount(r.absentCount, hasDenominator)} 次${
                          r.isContinuousAbsent ? ` · 连续缺勤 ${r.continuousAbsentCount ?? '?'} 次` : ''
                        }`}
                  </dd>
                </dl>
              </>
            );
          }, (r) => `${r.id}_${r.classId}`)}
          rowClassName={(r) => bzRowClass(bz, r, (x) => `${x.id}_${x.classId}`)}
          locale={{
            emptyText: (
              <div className="bz-empty">
                <UsersRound size={28} />
                <p>窗口内没有低于阈值的学员</p>
                <span>当前窗口与阈值下出勤健康；可调整窗口或阈值重新检查。</span>
              </div>
            ),
          }}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `共 ${t} 名低出勤学员` }}
          scroll={{ x: 620 }}
        />
      </div>
    </div>
  );
};

export default LowAttendanceStudents;
