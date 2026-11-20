import { actualAmount } from '../utils/actualConsumption';
import type { ColumnsType } from 'antd/es/table';
import { Metric, StaffName, StaffPerformance } from './StaffPerformance';
import {
  amount,
  change,
  finite,
  isTeacherRow,
  number,
  signed,
  sortNumber,
  type TeacherRow,
} from './staffPerformanceData';

type ComparingKey =
  | 'attendanceRate'
  | 'actualConsumptionAmount'
  | 'personalNewRecruits'
  | 'renewalRate'
  | 'totalOrderAmount';
const comparisons: {
  key: ComparingKey;
  title: string;
  unit: string;
  differenceUnit: string;
  money?: boolean;
}[] = [
  { key: 'attendanceRate', title: '出勤率', unit: '%', differenceUnit: ' pp' },
  {
    key: 'actualConsumptionAmount',
    title: '实际课消',
    unit: '元',
    differenceUnit: ' 元',
    money: true,
  },
  { key: 'personalNewRecruits', title: '个人新招', unit: ' 人', differenceUnit: ' 人' },
  { key: 'renewalRate', title: '续费率', unit: '%', differenceUnit: ' pp' },
  { key: 'totalOrderAmount', title: '成单金额', unit: '元', differenceUnit: ' 元', money: true },
];
function Enrollment({ row }: { row: TeacherRow }) {
  const known = row.historyAvailable === true;
  return (
    <div className="spf-net" title={row.historyNote}>
      <b>
        <span style={{ whiteSpace: 'nowrap' }}>
          期初 {number(known ? row.enrollmentStart : null)} →
        </span>{' '}
        <span style={{ whiteSpace: 'nowrap' }}>
          期末 {number(known ? row.enrollmentEnd : null)} 人次
        </span>
      </b>
      <small>
        {known
          ? `新增 ${number(row.enrollmentAdded)} · 减少 ${number(row.enrollmentEnded)} · 净变 ${signed(row.enrollmentNet)}`
          : '历史待核'}
      </small>
    </div>
  );
}
function comparisonCell(
  r: TeacherRow,
  before: TeacherRow | undefined,
  config: (typeof comparisons)[number]
) {
  const key = config.key;
  const partial =
    key === 'totalOrderAmount' &&
    ((r.missingPriceCount ?? 0) > 0 || (before?.missingPriceCount ?? 0) > 0);
  const value = key === 'actualConsumptionAmount' ? actualAmount(r) : r[key];
  const priorValue = key === 'actualConsumptionAmount' ? actualAmount(before) : before?.[key];
  const delta = partial ? null : change(value, priorValue);
  const main =
    key === 'actualConsumptionAmount'
      ? amount(actualAmount(r))
      : config.money
        ? amount(value)
        : number(value, config.unit);
  return (
    <Metric
      emphasis={key === 'actualConsumptionAmount'}
      value={main}
      sub={
        <>
          <span
            className={
              'spf-delta' +
              (delta !== null && delta !== 0 ? (delta > 0 ? ' spf-up' : ' spf-down') : '')
            }
          >
            较上期 {signed(delta, config.differenceUnit)}
          </span>
          {key === 'totalOrderAmount' && (r.missingPriceCount ?? 0) > 0 && (
            <span className="spf-partial">{number(r.missingPriceCount)} 单缺价</span>
          )}
          {key === 'personalNewRecruits' && (r.unlinkedNewOrderCount ?? 0) > 0 && (
            <span className="spf-partial">{number(r.unlinkedNewOrderCount)} 单未关联学员</span>
          )}
        </>
      }
    />
  );
}
function teacherName(row: TeacherRow) {
  return (
    <StaffName
      row={row}
      caption={`${number(row.classCount)} 班 · 当前去重 ${number(row.studentCount)} 人`}
    />
  );
}
function columns(previous: Map<string, TeacherRow>, compact: boolean): ColumnsType<TeacherRow> {
  if (compact)
    return [
      {
        title: '老师 / 本期表现',
        key: 'mobile',
        render: (_, row) => (
          <div className="spf-mobile-record">
            {teacherName(row)}
            <dl className="spf-mobile-grid">
              <div>
                <dt>基本变化</dt>
                <dd>
                  <Enrollment row={row} />
                </dd>
              </div>
              {comparisons.map((c) => (
                <div key={c.key}>
                  <dt>{c.title}</dt>
                  <dd>{comparisonCell(row, previous.get(row.teacherId), c)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ),
      },
    ];
  return [
    {
      title: '老师',
      dataIndex: 'teacherName',
      key: 'teacherName',
      sorter: (a, b) => a.teacherName.localeCompare(b.teacherName, 'zh-CN'),
      render: (_, r) => teacherName(r),
    },
    {
      title: '基本变化',
      key: 'enrollmentNet',
      align: 'right',
      sorter: (a, b) => sortNumber(a.enrollmentNet, b.enrollmentNet),
      render: (_, row) => <Enrollment row={row} />,
    },
    ...comparisons.map((config) => ({
      title: config.title,
      key: config.key,
      align: 'right' as const,
      sorter: (a: TeacherRow, b: TeacherRow) => sortNumber(a[config.key], b[config.key]),
      render: (_: unknown, r: TeacherRow) => comparisonCell(r, previous.get(r.teacherId), config),
    })),
  ];
}

function details(r: TeacherRow) {
  const consumption = actualAmount(r);
  const perStudent =
    finite(consumption) && finite(r.studentCount) && r.studentCount > 0
      ? amount(consumption / r.studentCount) + ' / 人'
      : '—';
  return (
    <div>
      <dl className="bz-x-grid">
        {[
          ['当前负责班级', number(r.classCount, ' 个')],
          ['当前负责学员（去重）', number(r.studentCount, ' 人')],
          ['当前基本盘（活跃学员去重）', number(r.baseCount, ' 人')],
          ['实到人次', number(r.actualAttendance, ' 人次')],
          ['应到人次', number(r.expectedAttendance, ' 人次')],
          ['人均实际课消', perStudent],
          ['区间不续费标记', number(r.nonRenewals, ' 人')],
          ['召回人数', '暂无事件记录'],
        ].map(([key, value]) => (
          <div className="bz-x-item" key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {r.historyNote && <p className="spf-detail-note">{r.historyNote}</p>}
    </div>
  );
}
const notes = (
  <>
    <p>
      基本变化按报名人次统计，同一学员跨班分别计。期初 + 新增 − 减少 =
      期末。姓名下为当前负责的班级数与去重学员数。出勤率和续费率的变化以百分点（pp）表示。
    </p>
    <p>
      实际课消按当前主责班级的场次核销记录归属。付费课按学员购买批次计价，赠课为 0
      元，返还冲回原扣课金额。无场次的活动划课不归入老师业绩。人均实际课消以当前负责学员数为分母。
    </p>
    <p>
      个人新招按本人当期已确认新签的关联学员去重。续费率为本人当期已确认续费的关联学员数除以当前基本盘。成单金额按销售归属统计，缺价时仅展示已知金额。
    </p>
  </>
);
export default function Teachers() {
  return (
    <StaffPerformance
      kind="teacher"
      description="查看老师的报名增减、出勤、课消与成单表现。"
      validate={isTeacherRow}
      columns={columns}
      details={details}
      notes={notes}
    />
  );
}
