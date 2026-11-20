import type { ColumnsType } from 'antd/es/table';
import { Metric, StaffName, StaffPerformance } from './StaffPerformance';
import { amount, isSalesRow, number, sortNumber, type SalesRow } from './staffPerformanceData';

type CountKey = 'addedCount' | 'invitationCount' | 'attendanceCount';
const activity: { title: string; key: CountKey; unit: string }[] = [
  { title: '添加线索', key: 'addedCount', unit: ' 条' },
  { title: '登记邀约', key: 'invitationCount', unit: ' 条' },
  { title: '体验到场', key: 'attendanceCount', unit: ' 次' },
];
const orders = [
  { title: '成单合计', money: 'orderAmount', count: 'orderCount', missing: 'missingPriceCount' },
  {
    title: '新签成单',
    money: 'newOrderAmount',
    count: 'newOrderCount',
    missing: 'newMissingPriceCount',
  },
  {
    title: '续费成单',
    money: 'renewalOrderAmount',
    count: 'renewalOrderCount',
    missing: 'renewalMissingPriceCount',
  },
] as const;
function orderCell(r: SalesRow, metric: (typeof orders)[number]) {
  const missing = r[metric.missing];
  return (
    <Metric
      emphasis={metric.money === 'orderAmount'}
      value={amount(r[metric.money])}
      sub={
        <>
          {number(r[metric.count], ' 单')}
          {!!missing && <span className="spf-partial">{number(missing)} 单缺价</span>}
        </>
      }
    />
  );
}
function columns(_previous: Map<string, SalesRow>, compact: boolean): ColumnsType<SalesRow> {
  if (compact)
    return [
      {
        title: '人员 / 本期表现',
        key: 'mobile',
        render: (_, r) => (
          <div className="spf-mobile-record">
            <StaffName row={r} />
            <dl className="spf-mobile-grid">
              {activity.map((c) => (
                <div key={c.key}>
                  <dt>{c.title}</dt>
                  <dd>
                    <Metric value={number(r[c.key], c.unit)} />
                  </dd>
                </div>
              ))}
              {orders.map((c) => (
                <div key={c.money}>
                  <dt>{c.title}</dt>
                  <dd>{orderCell(r, c)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ),
      },
    ];
  return [
    {
      title: '人员',
      dataIndex: 'teacherName',
      key: 'teacherName',
      sorter: (a, b) => a.teacherName.localeCompare(b.teacherName, 'zh-CN'),
      render: (_, r) => <StaffName row={r} />,
    },
    ...activity.map((c) => ({
      title: c.title,
      key: c.key,
      align: 'right' as const,
      sorter: (a: SalesRow, b: SalesRow) => sortNumber(a[c.key], b[c.key]),
      render: (_: unknown, r: SalesRow) => <Metric value={number(r[c.key], c.unit)} />,
    })),
    ...orders.map((c) => ({
      title: c.title,
      key: c.money,
      align: 'right' as const,
      sorter: (a: SalesRow, b: SalesRow) => sortNumber(a[c.money], b[c.money]),
      render: (_: unknown, r: SalesRow) => orderCell(r, c),
    })),
  ];
}
const notes = (
  <>
    <p>添加线索与登记邀约按创建日期统计，已取消的邀约仍计入登记数。体验到场按上课日期统计。</p>
    <p>
      成单合计包括已确认的新签与续费，按成单日期和销售归属统计。缺价单计入单数，金额仅汇总已知价格。
    </p>
  </>
);
export default function TeacherDashboard() {
  return (
    <StaffPerformance
      kind="sales"
      description="按人员查看线索、邀约、到场，以及新签和续费成单。"
      validate={isSalesRow}
      columns={columns}
      notes={notes}
    />
  );
}
