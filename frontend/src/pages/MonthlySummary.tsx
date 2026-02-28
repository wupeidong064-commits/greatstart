import { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, DatePicker, Button, message, Progress, Tag } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  CalendarOutlined,
  RiseOutlined,
  FallOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import { Line, Column, Pie } from '@ant-design/charts';
import dayjs from 'dayjs';
import api from '../services/api';

const { MonthPicker } = DatePicker;

const MonthlySummary = () => {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>({});
  const [selectedMonth, setSelectedMonth] = useState<dayjs.Dayjs>(dayjs());

  useEffect(() => {
    fetchMonthlySummary();
  }, []);

  const fetchMonthlySummary = async () => {
    setLoading(true);
    try {
      const month = selectedMonth.format('YYYY-MM');
      const response = await api.get('/statistics/monthly-summary', {
        params: { month },
      });
      if (response.success && response.data) {
        setSummary(response.data);
      } else {
        setSummary({});
      }
    } catch (error: any) {
      console.error('获取月运营数据失败:', error);
      setSummary({});
      if (error.response?.status !== 404) {
        message.error('获取月运营数据失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMonthChange = (date: any) => {
    if (date) {
      setSelectedMonth(date);
    }
  };

  const weeklyColumns = [
    {
      title: '周次',
      dataIndex: 'week',
      key: 'week',
    },
    {
      title: '新增学员',
      dataIndex: 'newStudents',
      key: 'newStudents',
    },
    {
      title: '新增报名',
      dataIndex: 'newEnrollments',
      key: 'newEnrollments',
    },
    {
      title: '出勤人次',
      dataIndex: 'attendanceCount',
      key: 'attendanceCount',
    },
    {
      title: '出勤率',
      dataIndex: 'attendanceRate',
      key: 'attendanceRate',
      render: (rate: number) => (
        <Progress percent={rate} size="small" style={{ width: 100 }} />
      ),
    },
    {
      title: '收入',
      dataIndex: 'revenue',
      key: 'revenue',
      render: (amount: number) => `¥${amount?.toFixed(2) || '0.00'}`,
    },
  ];

  const trendColumns = [
    {
      title: '指标',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '本月',
      dataIndex: 'current',
      key: 'current',
      render: (value: number, record: any) => {
        if (record.name === '总收入') {
          return `¥${value?.toFixed(2) || '0.00'}`;
        }
        return value;
      },
    },
    {
      title: '上月',
      dataIndex: 'last',
      key: 'last',
      render: (value: number, record: any) => {
        if (record.name === '总收入') {
          return `¥${value?.toFixed(2) || '0.00'}`;
        }
        return value;
      },
    },
    {
      title: '变化',
      dataIndex: 'change',
      key: 'change',
      render: (change: number) => (
        <span style={{ color: change >= 0 ? '#52c41a' : '#ff4d4f' }}>
          {change >= 0 ? <RiseOutlined /> : <FallOutlined />}
          {Math.abs(change)}%
        </span>
      ),
    },
  ];

  // 图表配置：周趋势图
  const weeklyTrendData = (summary.weeklyData || []).map((week: any) => ({
    week: week.week,
    收入: week.revenue || 0,
    新增学员: week.newStudents || 0,
    新增报名: week.newEnrollments || 0,
  }));

  const weeklyTrendConfig = {
    data: weeklyTrendData,
    xField: 'week',
    yField: '收入',
    colorField: 'type',
    point: {
      shapeField: 'circle',
      sizeField: 4,
    },
    interaction: {
      tooltip: {
        marker: false,
      },
    },
    style: {
      lineWidth: 2,
    },
    smooth: true,
    color: '#1890ff',
    axis: {
      y: {
        title: '收入 (¥)',
        labelFormatter: (v: string) => `¥${Number(v).toFixed(0)}`,
      },
    },
  };

  // 图表配置：新增学员/报名趋势
  const enrollmentTrendData: any[] = [];
  (summary.weeklyData || []).forEach((week: any) => {
    enrollmentTrendData.push({ week: week.week, type: '新增学员', value: week.newStudents || 0 });
    enrollmentTrendData.push({ week: week.week, type: '新增报名', value: week.newEnrollments || 0 });
  });

  const enrollmentTrendConfig = {
    data: enrollmentTrendData,
    xField: 'week',
    yField: 'value',
    colorField: 'type',
    group: true,
    style: {
      maxWidth: 40,
    },
    axis: {
      y: {
        title: '人数',
      },
    },
    legend: {
      position: 'top' as const,
    },
  };

  // 图表配置：同比对比图
  const comparisonData = (summary.trends || []).map((trend: any) => ({
    name: trend.name,
    type: '本月',
    value: trend.current,
  })).concat((summary.trends || []).map((trend: any) => ({
    name: trend.name,
    type: '上月',
    value: trend.last,
  })));

  const comparisonConfig = {
    data: comparisonData,
    xField: 'name',
    yField: 'value',
    colorField: 'type',
    group: true,
    style: {
      maxWidth: 60,
    },
    axis: {
      y: {
        title: '数值',
      },
    },
    legend: {
      position: 'top' as const,
    },
  };

  // 图表配置：各周收入占比饼图
  const pieData = (summary.weeklyData || []).map((week: any) => ({
    week: week.week,
    value: week.revenue || 0,
  }));

  const pieConfig = {
    data: pieData,
    angleField: 'value',
    colorField: 'week',
    innerRadius: 0.6,
    label: {
      text: 'week',
      position: 'outside' as const,
    },
    legend: {
      position: 'right' as const,
    },
  };

  // 计算变化趋势
  const getTrend = (trends: any[], name: string) => {
    const trend = (trends || []).find((t: any) => t.name === name);
    return trend?.change || 0;
  };

  return (
    <div>
      <Card>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>月运营数据总结分析</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <MonthPicker
              value={selectedMonth}
              onChange={handleMonthChange}
              format="YYYY-MM"
            />
            <Button type="primary" onClick={fetchMonthlySummary}>
              查询
            </Button>
          </div>
        </div>

        {/* 关键指标卡片 */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card loading={loading}>
              <Statistic
                title="新增学员"
                value={summary.totalNewStudents || 0}
                prefix={<UserOutlined />}
                valueStyle={{ color: '#3f8600' }}
                suffix={
                  <Tag color={getTrend(summary.trends, '新增学员') >= 0 ? 'green' : 'red'} style={{ marginLeft: 8 }}>
                    {getTrend(summary.trends, '新增学员') >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                    {Math.abs(getTrend(summary.trends, '新增学员'))}%
                  </Tag>
                }
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card loading={loading}>
              <Statistic
                title="新增报名"
                value={summary.totalNewEnrollments || 0}
                prefix={<TeamOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card loading={loading}>
              <Statistic
                title="总收入"
                value={summary.totalRevenue || 0}
                prefix={<DollarOutlined />}
                precision={2}
                valueStyle={{ color: '#52c41a' }}
                suffix={
                  <Tag color={getTrend(summary.trends, '总收入') >= 0 ? 'green' : 'red'} style={{ marginLeft: 8 }}>
                    {getTrend(summary.trends, '总收入') >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                    {Math.abs(getTrend(summary.trends, '总收入'))}%
                  </Tag>
                }
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card loading={loading}>
              <Statistic
                title="平均出勤率"
                value={summary.avgAttendanceRate || 0}
                suffix={
                  <>
                    %
                    <Tag color={getTrend(summary.trends, '出勤人次') >= 0 ? 'green' : 'red'} style={{ marginLeft: 8 }}>
                      {getTrend(summary.trends, '出勤人次') >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                      {Math.abs(getTrend(summary.trends, '出勤人次'))}%
                    </Tag>
                  </>
                }
                prefix={<CalendarOutlined />}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>
        </Row>

        {/* 第二行指标卡片 */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card loading={loading}>
              <Statistic
                title="总出勤人次"
                value={summary.totalAttendance || 0}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card loading={loading}>
              <Statistic
                title="新增班级"
                value={summary.newClasses || 0}
                prefix={<TeamOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card loading={loading}>
              <Statistic
                title="活跃学员数"
                value={summary.activeStudents || 0}
                prefix={<UserOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card loading={loading}>
              <Statistic
                title="续费率"
                value={summary.renewalRate || 0}
                suffix="%"
                prefix={<RiseOutlined />}
              />
            </Card>
          </Col>
        </Row>

        {/* 图表区域 */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={12}>
            <Card title="周收入趋势" loading={loading}>
              {weeklyTrendData.length > 0 ? (
                <Line {...weeklyTrendConfig} height={200} />
              ) : (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                  暂无数据
                </div>
              )}
            </Card>
          </Col>
          <Col span={12}>
            <Card title="新增学员/报名趋势" loading={loading}>
              {enrollmentTrendData.length > 0 ? (
                <Column {...enrollmentTrendConfig} height={200} />
              ) : (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                  暂无数据
                </div>
              )}
            </Card>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={12}>
            <Card title="本月 vs 上月对比" loading={loading}>
              {comparisonData.length > 0 ? (
                <Column {...comparisonConfig} height={200} />
              ) : (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                  暂无数据
                </div>
              )}
            </Card>
          </Col>
          <Col span={12}>
            <Card title="各周收入占比" loading={loading}>
              {pieData.length > 0 ? (
                <Pie {...pieConfig} height={200} />
              ) : (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                  暂无数据
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* 数据表格 */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={12}>
            <Card title="每周数据明细" loading={loading}>
              <Table
                columns={weeklyColumns}
                dataSource={summary.weeklyData || []}
                rowKey="week"
                pagination={false}
                size="small"
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card title="同比分析" loading={loading}>
              <Table
                columns={trendColumns}
                dataSource={summary.trends || []}
                rowKey="name"
                pagination={false}
                size="small"
              />
            </Card>
          </Col>
        </Row>

        {summary.analysis && (
          <Card title="运营分析总结" loading={loading}>
            <div style={{ lineHeight: 1.8 }}>
              {summary.analysis.split('\n').map((line: string, index: number) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </Card>
        )}
      </Card>
    </div>
  );
};

export default MonthlySummary;
