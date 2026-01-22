import { Card, Row, Col, Statistic, Table, message, DatePicker, Space, Tag, Switch, Progress } from 'antd';
import { useState, useEffect } from 'react';
import { 
  UserOutlined, 
  TeamOutlined, 
  CheckCircleOutlined, 
  DollarOutlined, 
  AppstoreOutlined, 
  WalletOutlined, 
  HomeOutlined, 
  PercentageOutlined,
  CalendarOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  FilterOutlined,
  FallOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import { memfireDB } from '../services/memfireDB';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const ConsumptionAndRevenue = () => {
  const [loading, setLoading] = useState(false);
  const [classChangesLoading, setClassChangesLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);
  const [statistics, setStatistics] = useState({
    totalAttendance: 0,       // 整体出勤人数（去重）
    totalAttendanceCount: 0,  // 出勤人次（不去重）
    baseCount: 0,             // 基本盘人数
    rosterCount: 0,           // 花名册人数
    newRecruits: 0,           // 新增人数
    recalled: 0,              // 召回人数
    nonRenewals: 0,           // 不续费人数
    deletedRoster: 0,         // 删除花名册人数
    attendanceRate: 0,        // 出勤率
    lessonPrice: 0,           // 课单价
    classCount: 0,            // 班级数（总数）
    preschoolClassCount: 0,   // 幼儿班数
    eliteClassCount: 0,       // 精英班数
    totalRevenue: 0,          // 整体确认收入
    fullClassRate: 0,         // 满班率
    venueUtilizationRate: 0,  // 场地使用率
    completedSchedules: 0,    // 已完成排课数
  });
  
  // 班级人数变化相关状态
  const [classChanges, setClassChanges] = useState<any[]>([]);
  const [classChangeStats, setClassChangeStats] = useState({
    totalClasses: 0,
    decreasedClasses: 0,
    increasedClasses: 0,
    unchangedClasses: 0,
    totalLost: 0,
    totalNewAdded: 0,
    netChange: 0,
  });
  const [showDecreasedOnly, setShowDecreasedOnly] = useState(false);

  useEffect(() => {
    fetchStatistics();
    fetchClassChanges();
  }, [dateRange]);

  const fetchStatistics = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].startOf('day').toISOString();
        params.endDate = dateRange[1].endOf('day').toISOString();
      }
      
      const stats = await memfireDB.consumption.getStatistics(params);
      setStatistics(stats);
    } catch (error: any) {
      console.error('获取统计数据失败:', error);
      message.error(error.message || '获取统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchClassChanges = async () => {
    setClassChangesLoading(true);
    try {
      const params: any = {};
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].startOf('day').toISOString();
        params.endDate = dateRange[1].endOf('day').toISOString();
      }
      
      const result = await memfireDB.consumption.getClassStudentChanges(params);
      setClassChanges(result.classes);
      setClassChangeStats(result.stats);
    } catch (error: any) {
      console.error('获取班级人数变化失败:', error?.message || error);
      // 如果出错，设置默认值
      setClassChanges([]);
      setClassChangeStats({
        totalClasses: 0,
        decreasedClasses: 0,
        increasedClasses: 0,
        unchangedClasses: 0,
        totalLost: 0,
        totalNewAdded: 0,
        netChange: 0,
      });
    } finally {
      setClassChangesLoading(false);
    }
  };

  // 过滤显示的班级数据
  const filteredClassChanges = showDecreasedOnly 
    ? classChanges.filter(c => c.change < 0)
    : classChanges;

  const handleDateRangeChange = (dates: [dayjs.Dayjs, dayjs.Dayjs] | null) => {
    setDateRange(dates);
  };

  // 获取时间范围描述
  const getDateRangeText = () => {
    if (dateRange && dateRange[0] && dateRange[1]) {
      return `${dateRange[0].format('YYYY-MM-DD')} 至 ${dateRange[1].format('YYYY-MM-DD')}`;
    }
    return '全部时间';
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>课消收入总结</h1>
        <Space>
          <RangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
            format="YYYY-MM-DD"
            allowClear
            presets={[
              { label: '本周', value: [dayjs().startOf('week'), dayjs().endOf('week')] },
              { label: '本月', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
              { label: '上月', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
              { label: '本季度', value: [dayjs().startOf('quarter'), dayjs().endOf('quarter')] },
            ]}
          />
        </Space>
      </div>

      {/* 时间范围提示 */}
      <div style={{ 
        marginBottom: 24, 
        padding: '12px 16px', 
        background: '#fafafa', 
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center'
      }}>
        <CalendarOutlined style={{ marginRight: 8, color: '#1890ff' }} />
        <span>统计时间范围：<strong>{getDateRangeText()}</strong></span>
      </div>
      
      {/* 统计卡片区域 - 第一行：核心指标 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card loading={loading} hoverable>
            <Statistic
              title="基本盘人数"
              value={statistics.baseCount}
              prefix={<UserOutlined style={{ color: '#52c41a' }} />}
              suffix="人"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading} hoverable>
            <Statistic
              title="整体出勤人次"
              value={statistics.totalAttendanceCount}
              prefix={<CheckCircleOutlined style={{ color: '#1890ff' }} />}
              suffix="人次"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading} hoverable>
            <Statistic
              title="出勤率"
              value={statistics.attendanceRate}
              suffix="%"
              prefix={<TeamOutlined style={{ color: statistics.attendanceRate >= 80 ? '#52c41a' : statistics.attendanceRate >= 60 ? '#faad14' : '#ff4d4f' }} />}
              valueStyle={{ 
                color: statistics.attendanceRate >= 80 ? '#52c41a' : 
                       statistics.attendanceRate >= 60 ? '#faad14' : '#ff4d4f' 
              }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading} hoverable>
            <Statistic
              title="出勤学员数"
              value={statistics.totalAttendance}
              prefix={<UserOutlined style={{ color: '#722ed1' }} />}
              suffix="人"
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>
      
      {/* 第二行：班级统计 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card loading={loading} hoverable>
            <Statistic
              title="班级总数"
              value={statistics.classCount}
              prefix={<AppstoreOutlined style={{ color: '#13c2c2' }} />}
              suffix="个"
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading} hoverable>
            <Statistic
              title="幼儿班"
              value={statistics.preschoolClassCount}
              prefix={<AppstoreOutlined style={{ color: '#1890ff' }} />}
              suffix="个"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading} hoverable>
            <Statistic
              title="精英班"
              value={statistics.eliteClassCount}
              prefix={<AppstoreOutlined style={{ color: '#722ed1' }} />}
              suffix="个"
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading} hoverable>
            <Statistic
              title="满班率"
              value={statistics.fullClassRate}
              suffix="%"
              prefix={<PercentageOutlined style={{ color: statistics.fullClassRate >= 80 ? '#52c41a' : statistics.fullClassRate >= 60 ? '#faad14' : '#ff4d4f' }} />}
              valueStyle={{ 
                color: statistics.fullClassRate >= 80 ? '#52c41a' : 
                       statistics.fullClassRate >= 60 ? '#faad14' : '#ff4d4f' 
              }}
            />
          </Card>
        </Col>
      </Row>

      {/* 第三行：收入相关 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card loading={loading} hoverable>
            <Statistic
              title="整体确认收入"
              value={statistics.totalRevenue}
              prefix={<WalletOutlined style={{ color: '#f5222d' }} />}
              precision={2}
              suffix="元"
              valueStyle={{ color: '#f5222d', fontWeight: 'bold' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card loading={loading} hoverable>
            <Statistic
              title="课单价"
              value={statistics.lessonPrice}
              prefix={<DollarOutlined style={{ color: '#fa8c16' }} />}
              precision={2}
              suffix="元/人次"
              valueStyle={{ color: '#fa8c16', fontWeight: 'bold' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card loading={loading} hoverable>
            <Statistic
              title="场地使用率"
              value={statistics.venueUtilizationRate}
              suffix="%"
              prefix={<HomeOutlined style={{ color: statistics.venueUtilizationRate >= 70 ? '#52c41a' : statistics.venueUtilizationRate >= 50 ? '#faad14' : '#ff4d4f' }} />}
              valueStyle={{ 
                color: statistics.venueUtilizationRate >= 70 ? '#52c41a' : 
                       statistics.venueUtilizationRate >= 50 ? '#faad14' : '#ff4d4f' 
              }}
            />
          </Card>
        </Col>
      </Row>

      {/* 统计数据汇总表格 */}
      <Card title="数据汇总" style={{ marginTop: 24 }}>
        <Table
          loading={loading}
          columns={[
            {
              title: '基本盘人数',
              dataIndex: 'baseCount',
              key: 'baseCount',
              align: 'center',
              render: (val: number) => <strong style={{ color: '#3f8600' }}>{val} 人</strong>,
            },
            {
              title: '出勤人次',
              dataIndex: 'totalAttendanceCount',
              key: 'totalAttendanceCount',
              align: 'center',
              render: (val: number) => `${val} 人次`,
            },
            {
              title: '出勤率',
              dataIndex: 'attendanceRate',
              key: 'attendanceRate',
              align: 'center',
              render: (val: number) => (
                <Tag color={val >= 80 ? 'green' : val >= 60 ? 'orange' : 'red'}>
                  {val}%
                </Tag>
              ),
            },
            {
              title: '整体确认收入',
              dataIndex: 'totalRevenue',
              key: 'totalRevenue',
              align: 'center',
              render: (val: number) => <strong style={{ color: '#cf1322' }}>¥{val.toFixed(2)}</strong>,
            },
            {
              title: '课单价',
              dataIndex: 'lessonPrice',
              key: 'lessonPrice',
              align: 'center',
              render: (val: number) => `¥${val.toFixed(2)}/人次`,
            },
            {
              title: '已完成排课',
              dataIndex: 'completedSchedules',
              key: 'completedSchedules',
              align: 'center',
              render: (val: number) => `${val} 节`,
            },
          ]}
          dataSource={[statistics]}
          pagination={false}
          rowKey={() => 'summary'}
          bordered
        />
      </Card>

      {/* 基本盘变化统计 */}
      <Card 
        title={
          <span>
            基本盘变化
            <span style={{ fontSize: 12, color: '#999', marginLeft: 16, fontWeight: 'normal' }}>
              基本盘 = 花名册 + 新增 + 召回 - 不续费 - 流失（停卡）
            </span>
          </span>
        } 
        style={{ marginTop: 24 }}
      >
        <Table
          loading={loading}
          columns={[
            {
              title: '花名册人数',
              dataIndex: 'rosterCount',
              key: 'rosterCount',
              align: 'center',
              render: (val: number) => <span style={{ color: '#1890ff', fontWeight: 'bold' }}>{val} 人</span>,
            },
            {
              title: (
                <span>
                  <span style={{ color: '#52c41a' }}>+</span> 新增
                </span>
              ),
              dataIndex: 'newRecruits',
              key: 'newRecruits',
              align: 'center',
              render: (val: number) => <span style={{ color: '#52c41a' }}>+{val} 人</span>,
            },
            {
              title: (
                <span>
                  <span style={{ color: '#52c41a' }}>+</span> 召回
                </span>
              ),
              dataIndex: 'recalled',
              key: 'recalled',
              align: 'center',
              render: (val: number) => <span style={{ color: '#52c41a' }}>+{val} 人</span>,
            },
            {
              title: (
                <span>
                  <span style={{ color: '#ff4d4f' }}>-</span> 不续费
                </span>
              ),
              dataIndex: 'nonRenewals',
              key: 'nonRenewals',
              align: 'center',
              render: (val: number) => <span style={{ color: '#ff4d4f' }}>-{val} 人</span>,
            },
            {
              title: (
                <span>
                  <span style={{ color: '#ff4d4f' }}>-</span> 流失（停卡）
                </span>
              ),
              dataIndex: 'deletedRoster',
              key: 'deletedRoster',
              align: 'center',
              render: (val: number) => <span style={{ color: '#ff4d4f' }}>-{val} 人</span>,
            },
            {
              title: '= 基本盘人数',
              dataIndex: 'baseCount',
              key: 'baseCount',
              align: 'center',
              render: (val: number) => (
                <span style={{ 
                  color: '#fff', 
                  background: '#52c41a', 
                  padding: '4px 12px', 
                  borderRadius: 4,
                  fontWeight: 'bold'
                }}>
                  {val} 人
                </span>
              ),
            },
          ]}
          dataSource={[statistics]}
          pagination={false}
          rowKey={() => 'base-change'}
          bordered
        />
      </Card>

      {/* 班级学员人数变化监测 */}
      <Card 
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              班级学员变化监测
              <span style={{ fontSize: 12, color: '#999', marginLeft: 16, fontWeight: 'normal' }}>
                监控各班级学员人数变动情况
              </span>
            </span>
            <Space>
              <span style={{ fontSize: 14, fontWeight: 'normal', color: '#666' }}>
                仅显示人数减少班级
              </span>
              <Switch 
                checked={showDecreasedOnly}
                onChange={setShowDecreasedOnly}
                checkedChildren={<FilterOutlined />}
                unCheckedChildren={<FilterOutlined />}
              />
            </Space>
          </div>
        }
        style={{ marginTop: 24 }}
      >
        {/* 班级变化汇总统计 */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={4}>
            <div style={{ 
              textAlign: 'center', 
              padding: '16px', 
              background: '#f0f5ff', 
              borderRadius: 8,
              border: '1px solid #d6e4ff'
            }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>
                {classChangeStats.totalClasses}
              </div>
              <div style={{ color: '#666', marginTop: 4 }}>班级总数</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ 
              textAlign: 'center', 
              padding: '16px', 
              background: '#fff1f0', 
              borderRadius: 8,
              border: '1px solid #ffccc7'
            }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#ff4d4f' }}>
                <FallOutlined style={{ marginRight: 4 }} />
                {classChangeStats.decreasedClasses}
              </div>
              <div style={{ color: '#666', marginTop: 4 }}>人数减少</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ 
              textAlign: 'center', 
              padding: '16px', 
              background: '#f6ffed', 
              borderRadius: 8,
              border: '1px solid #b7eb8f'
            }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>
                <RiseOutlined style={{ marginRight: 4 }} />
                {classChangeStats.increasedClasses}
              </div>
              <div style={{ color: '#666', marginTop: 4 }}>人数增加</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ 
              textAlign: 'center', 
              padding: '16px', 
              background: '#fafafa', 
              borderRadius: 8,
              border: '1px solid #d9d9d9'
            }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#999' }}>
                <MinusOutlined style={{ marginRight: 4 }} />
                {classChangeStats.unchangedClasses}
              </div>
              <div style={{ color: '#666', marginTop: 4 }}>无变化</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ 
              textAlign: 'center', 
              padding: '16px', 
              background: '#fff7e6', 
              borderRadius: 8,
              border: '1px solid #ffd591'
            }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#fa8c16' }}>
                -{classChangeStats.totalLost}
              </div>
              <div style={{ color: '#666', marginTop: 4 }}>总流失人数</div>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ 
              textAlign: 'center', 
              padding: '16px', 
              background: classChangeStats.netChange >= 0 ? '#f6ffed' : '#fff1f0', 
              borderRadius: 8,
              border: `1px solid ${classChangeStats.netChange >= 0 ? '#b7eb8f' : '#ffccc7'}`
            }}>
              <div style={{ 
                fontSize: 24, 
                fontWeight: 'bold', 
                color: classChangeStats.netChange >= 0 ? '#52c41a' : '#ff4d4f' 
              }}>
                {classChangeStats.netChange >= 0 ? '+' : ''}{classChangeStats.netChange}
              </div>
              <div style={{ color: '#666', marginTop: 4 }}>净变化</div>
            </div>
          </Col>
        </Row>

        {/* 班级列表 */}
        <Table
          loading={classChangesLoading}
          columns={[
            {
              title: '班级名称',
              dataIndex: 'name',
              key: 'name',
              width: 150,
              render: (name: string, record: any) => (
                <div>
                  <div style={{ fontWeight: 500 }}>{name}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>{record.code}</div>
                </div>
              ),
            },
            {
              title: '负责教练',
              dataIndex: 'teacherName',
              key: 'teacherName',
              width: 100,
              render: (name: string) => (
                <span style={{ color: name === '未分配' ? '#999' : '#333' }}>{name}</span>
              ),
            },
            {
              title: '当前人数',
              dataIndex: 'currentStudents',
              key: 'currentStudents',
              width: 100,
              align: 'center',
              render: (val: number, record: any) => (
                <span style={{ fontWeight: 'bold' }}>{val} / {record.maxStudents}</span>
              ),
            },
            {
              title: '满班率',
              dataIndex: 'fullnessRate',
              key: 'fullnessRate',
              width: 120,
              align: 'center',
              render: (val: number) => (
                <Progress 
                  percent={val} 
                  size="small" 
                  strokeColor={val >= 80 ? '#52c41a' : val >= 50 ? '#1890ff' : '#faad14'}
                  format={(percent) => `${percent}%`}
                />
              ),
            },
            {
              title: '新增',
              dataIndex: 'newAdded',
              key: 'newAdded',
              width: 80,
              align: 'center',
              render: (val: number) => (
                <span style={{ color: val > 0 ? '#52c41a' : '#999' }}>
                  {val > 0 && <ArrowUpOutlined style={{ marginRight: 4 }} />}
                  +{val}
                </span>
              ),
            },
            {
              title: '流失',
              dataIndex: 'lost',
              key: 'lost',
              width: 80,
              align: 'center',
              render: (val: number) => (
                <span style={{ color: val > 0 ? '#ff4d4f' : '#999' }}>
                  {val > 0 && <ArrowDownOutlined style={{ marginRight: 4 }} />}
                  -{val}
                </span>
              ),
            },
            {
              title: '变化',
              dataIndex: 'change',
              key: 'change',
              width: 100,
              align: 'center',
              sorter: (a: any, b: any) => a.change - b.change,
              defaultSortOrder: 'ascend',
              render: (val: number) => {
                if (val > 0) {
                  return (
                    <Tag color="success" icon={<ArrowUpOutlined />}>
                      +{val}
                    </Tag>
                  );
                } else if (val < 0) {
                  return (
                    <Tag color="error" icon={<ArrowDownOutlined />}>
                      {val}
                    </Tag>
                  );
                } else {
                  return (
                    <Tag color="default" icon={<MinusOutlined />}>
                      0
                    </Tag>
                  );
                }
              },
            },
            {
              title: '变化率',
              dataIndex: 'changeRate',
              key: 'changeRate',
              width: 100,
              align: 'center',
              render: (val: number) => {
                const color = val > 0 ? '#52c41a' : val < 0 ? '#ff4d4f' : '#999';
                return (
                  <span style={{ color, fontWeight: val !== 0 ? 'bold' : 'normal' }}>
                    {val > 0 ? '+' : ''}{val}%
                  </span>
                );
              },
            },
            {
              title: '班级类型',
              key: 'type',
              width: 100,
              align: 'center',
              render: (_: any, record: any) => {
                const type = record.level || record.courseType || '普通';
                let color = 'default';
                if (type.includes('幼儿')) color = 'blue';
                else if (type.includes('精英')) color = 'purple';
                else if (type.includes('体验')) color = 'orange';
                return <Tag color={color}>{type}</Tag>;
              },
            },
          ]}
          dataSource={filteredClassChanges}
          rowKey="id"
          pagination={{ 
            pageSize: 10,
            showTotal: (total) => `共 ${total} 个班级`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
          }}
          scroll={{ x: 1000 }}
          bordered
          size="middle"
          rowClassName={(record) => record.change < 0 ? 'ant-table-row-warning' : ''}
        />
      </Card>
    </div>
  );
};

export default ConsumptionAndRevenue;
