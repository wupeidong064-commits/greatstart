import { useState, useEffect, useCallback } from 'react';
import { Table, Card, Tag, message, DatePicker, Space, Button, Progress, Select, Switch, Spin, Statistic, Row, Col, Alert } from 'antd';
import { UserOutlined, SearchOutlined, ReloadOutlined, WarningOutlined, DownloadOutlined, TeamOutlined, ClockCircleOutlined } from '@ant-design/icons';
import api from '../services/api';
import { dataService, Teacher } from '../services/dataService';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const ContinuousLeaveStudents = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);
  const [selectedTeacher, setSelectedTeacher] = useState<string | undefined>(undefined);
  const [continuousAbsentOnly, setContinuousAbsentOnly] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // 获取教练员列表（使用缓存）
  const fetchTeachers = useCallback(async () => {
    try {
      const data = await dataService.getTeachers();
      setTeachers(data);
    } catch (error: any) {
      console.error('获取教练员列表失败:', error);
    }
  }, []);

  useEffect(() => {
    fetchTeachers();
    // 初始不自动加载，让用户选择时间范围后手动查询
  }, [fetchTeachers]);

  const fetchData = async () => {
    setLoading(true);
    setHasSearched(true);
    try {
      // 构建查询参数
      const params: any = {
        threshold: 60,
        continuousAbsentOnly,
      };

      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].startOf('day').toISOString();
        params.endDate = dateRange[1].endOf('day').toISOString();
      }

      if (selectedTeacher) {
        params.teacherId = selectedTeacher;
      }

      const response = await api.get('/attendances/low-attendance-students', { params });
      const data = response.data || [];
      setStudents(data);

      if (data.length === 0) {
        message.info('没有符合条件的学员');
      }
    } catch (error: any) {
      console.error('获取低出勤学员失败:', error);
      message.error(error.message || '获取低出勤学员失败');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  // 处理查询
  const handleSearch = () => {
    fetchData();
  };

  // 重置筛选
  const handleReset = () => {
    setDateRange([dayjs().subtract(30, 'day'), dayjs()]);
    setSelectedTeacher(undefined);
    setContinuousAbsentOnly(false);
    setStudents([]);
    setHasSearched(false);
  };

  // 获取时间范围描述
  const getDateRangeText = () => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return '全部时间';
    return `${dateRange[0].format('YYYY-MM-DD')} 至 ${dateRange[1].format('YYYY-MM-DD')}`;
  };

  // 导出低出勤学员数据
  const handleExport = () => {
    try {
      if (students.length === 0) {
        message.warning('没有数据可导出');
        return;
      }

      // 构建 CSV 内容
      const headers = ['学员姓名', '所属班级', '班级代码', '负责教练', '应出勤(次)', '实际出勤(次)', '缺勤次数', '连续缺勤(次)', '出勤率(%)', '联系电话'];
      const csvContent = [
        headers.join(','),
        ...students.map((student: any) => {
          return [
            `"${student.studentName || '-'}"`,
            `"${student.className || '-'}"`,
            `"${student.classCode || '-'}"`,
            `"${student.teacher?.name || '-'}"`,
            student.scheduleCount || 0,
            student.presentCount || 0,
            student.absentCount || 0,
            student.continuousAbsentCount || 0,
            student.attendanceRate || 0,
            `"${student.phone || '-'}"`,
          ].join(',');
        })
      ].join('\n');

      // 添加 BOM 以支持中文
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      const dateStr = dateRange && dateRange[0] && dateRange[1]
        ? `${dateRange[0].format('YYYYMMDD')}-${dateRange[1].format('YYYYMMDD')}`
        : dayjs().format('YYYYMMDD');
      const filterSuffix = continuousAbsentOnly ? '_连续请假' : '';
      const teacherSuffix = selectedTeacher ? `_${teachers.find(t => t.id === selectedTeacher)?.name || ''}` : '';

      link.setAttribute('href', url);
      link.setAttribute('download', `低出勤学员_${dateStr}${teacherSuffix}${filterSuffix}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      message.success(`成功导出 ${students.length} 位学员的数据`);
    } catch (error: any) {
      console.error('导出失败:', error);
      message.error('导出失败: ' + (error.message || '未知错误'));
    }
  };

  // 统计数据
  const stats = {
    total: students.length,
    continuousAbsent: students.filter(s => s.isContinuousAbsent).length,
    avgAttendanceRate: students.length > 0
      ? Math.round(students.reduce((sum, s) => sum + s.attendanceRate, 0) / students.length)
      : 0,
  };

  const columns = [
    {
      title: '学员姓名',
      dataIndex: 'studentName',
      key: 'studentName',
      width: 120,
      render: (text: string, record: any) => (
        <Space>
          <UserOutlined style={{ color: record.isContinuousAbsent ? '#ff4d4f' : '#1890ff' }} />
          <span style={{ fontWeight: record.isContinuousAbsent ? 'bold' : 'normal' }}>
            {text}
          </span>
        </Space>
      ),
    },
    {
      title: '所属班级',
      dataIndex: 'className',
      key: 'className',
      width: 180,
      render: (text: string, record: any) => (
        <span>
          {text}
          <span style={{ color: '#999', marginLeft: 8, fontSize: '12px' }}>
            ({record.classCode})
          </span>
        </span>
      ),
    },
    {
      title: '负责教练',
      dataIndex: ['teacher', 'name'],
      key: 'teacher',
      width: 100,
      render: (name: string) => name || '-',
    },
    {
      title: '应出勤',
      dataIndex: 'scheduleCount',
      key: 'scheduleCount',
      width: 90,
      align: 'center' as const,
      render: (count: number) => `${count} 次`,
    },
    {
      title: '实际出勤',
      dataIndex: 'presentCount',
      key: 'presentCount',
      width: 100,
      align: 'center' as const,
      render: (count: number, record: any) => (
        <Tag color="green" style={{ fontSize: '13px', padding: '2px 8px' }}>
          {count} / {record.scheduleCount}
        </Tag>
      ),
    },
    {
      title: '缺勤次数',
      dataIndex: 'absentCount',
      key: 'absentCount',
      width: 90,
      align: 'center' as const,
      render: (count: number) => (
        <Tag color="red" style={{ fontSize: '13px', padding: '2px 8px' }}>
          {count} 次
        </Tag>
      ),
    },
    {
      title: '连续缺勤',
      dataIndex: 'continuousAbsentCount',
      key: 'continuousAbsentCount',
      width: 110,
      align: 'center' as const,
      sorter: (a: any, b: any) => a.continuousAbsentCount - b.continuousAbsentCount,
      render: (count: number, record: any) => (
        <Space size={4}>
          <span style={{
            color: record.isContinuousAbsent ? '#ff4d4f' : '#666',
            fontWeight: record.isContinuousAbsent ? 'bold' : 'normal'
          }}>
            {count} 次
          </span>
          {record.isContinuousAbsent && (
            <Tag color="error" style={{ fontSize: '11px', padding: '0 4px', margin: 0 }}>
              <WarningOutlined /> ≥2
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: '出勤率',
      dataIndex: 'attendanceRate',
      key: 'attendanceRate',
      width: 150,
      align: 'center' as const,
      sorter: (a: any, b: any) => a.attendanceRate - b.attendanceRate,
      render: (rate: number) => (
        <Space size={4}>
          <Progress
            percent={rate}
            status={rate < 30 ? 'exception' : rate < 50 ? 'active' : 'normal'}
            size="small"
            style={{ width: 80 }}
            showInfo={false}
          />
          <Tag
            color={rate >= 50 ? 'orange' : rate >= 30 ? 'volcano' : 'red'}
            style={{ fontSize: '13px', padding: '2px 8px' }}
          >
            {rate}%
          </Tag>
        </Space>
      ),
    },
    {
      title: '联系电话',
      dataIndex: 'phone',
      key: 'phone',
      width: 120,
      render: (phone: string) => phone || '-',
    },
  ];

  return (
    <div>
      <Card>
        <h1 style={{ marginBottom: 16 }}>低出勤学员</h1>

        {/* 筛选区域 */}
        <div style={{ marginBottom: 24, padding: '16px', background: '#fafafa', borderRadius: '8px' }}>
          <Space wrap size="middle">
            <div>
              <span style={{ marginRight: 8 }}>时间范围：</span>
              <RangePicker
                value={dateRange}
                onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                allowClear
                presets={[
                  { label: '最近7天', value: [dayjs().subtract(7, 'day'), dayjs()] },
                  { label: '最近14天', value: [dayjs().subtract(14, 'day'), dayjs()] },
                  { label: '最近30天', value: [dayjs().subtract(30, 'day'), dayjs()] },
                  { label: '本月', value: [dayjs().startOf('month'), dayjs()] },
                  { label: '上月', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
                ]}
              />
            </div>
            <div>
              <span style={{ marginRight: 8 }}>负责教练：</span>
              <Select
                style={{ width: 150 }}
                value={selectedTeacher}
                onChange={(value) => setSelectedTeacher(value)}
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                }
              >
                <Select.Option value={undefined}>全部教练</Select.Option>
                {teachers.map((teacher) => (
                  <Select.Option key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </Select.Option>
                ))}
              </Select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <WarningOutlined style={{ color: continuousAbsentOnly ? '#ff4d4f' : '#999' }} />
              <span>连续请假≥2次：</span>
              <Switch
                checked={continuousAbsentOnly}
                onChange={setContinuousAbsentOnly}
                checkedChildren="开"
                unCheckedChildren="关"
              />
            </div>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={loading}>
              查询
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              重置
            </Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleExport}
              disabled={students.length === 0}
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
            >
              导出数据
            </Button>
          </Space>

          {/* 汇总统计 */}
          {hasSearched && !loading && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e8e8e8' }}>
              <Space size={24}>
                <span style={{ color: '#666' }}>
                  <TeamOutlined style={{ marginRight: 4 }} />
                  低出勤学员：<b style={{ color: '#1890ff', fontSize: 16 }}>{stats.total}</b> 人
                </span>
                <span style={{ color: '#666' }}>
                  <WarningOutlined style={{ marginRight: 4, color: '#ff4d4f' }} />
                  连续请假≥2次：<b style={{ color: '#ff4d4f', fontSize: 16 }}>{stats.continuousAbsent}</b> 人
                </span>
                <span style={{ color: '#666' }}>
                  平均出勤率：<b style={{ color: stats.avgAttendanceRate >= 40 ? '#52c41a' : '#ff4d4f', fontSize: 16 }}>{stats.avgAttendanceRate}</b>%
                </span>
              </Space>
            </div>
          )}
        </div>

        {/* 统计信息 */}
        {hasSearched && (
          <div style={{ marginBottom: 16 }}>
            <Alert
              type="info"
              showIcon
              icon={<ClockCircleOutlined />}
              message={
                <Space split={<span style={{ color: '#d9d9d9' }}>|</span>}>
                  <span>时间范围：{getDateRangeText()}</span>
                  {selectedTeacher && (
                    <span>筛选教练：<Tag color="blue">{teachers.find(t => t.id === selectedTeacher)?.name || '-'}</Tag></span>
                  )}
                  <span>筛选条件：出勤率低于 <Tag color="red">60%</Tag></span>
                  {continuousAbsentOnly && (
                    <span><Tag color="error" icon={<WarningOutlined />}>仅连续请假≥2次</Tag></span>
                  )}
                </Space>
              }
              style={{ marginBottom: 16 }}
            />

            {!loading && students.length > 0 && (
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Card size="small" bordered={false} style={{ background: '#f5f5f5' }}>
                    <Statistic
                      title="低出勤学员"
                      value={stats.total}
                      suffix="人"
                      prefix={<TeamOutlined />}
                      valueStyle={{ color: '#1890ff' }}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" bordered={false} style={{ background: '#fff2f0' }}>
                    <Statistic
                      title="连续请假学员"
                      value={stats.continuousAbsent}
                      suffix="人"
                      prefix={<WarningOutlined />}
                      valueStyle={{ color: '#ff4d4f' }}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" bordered={false} style={{ background: '#f6ffed' }}>
                    <Statistic
                      title="平均出勤率"
                      value={stats.avgAttendanceRate}
                      suffix="%"
                      valueStyle={{ color: stats.avgAttendanceRate >= 40 ? '#52c41a' : '#ff4d4f' }}
                    />
                  </Card>
                </Col>
              </Row>
            )}
          </div>
        )}

        {/* 加载状态 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Spin size="large" tip="正在加载数据..." />
          </div>
        ) : !hasSearched ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>
            <SearchOutlined style={{ fontSize: 48, marginBottom: 16 }} />
            <p>请选择时间范围后点击"查询"按钮</p>
          </div>
        ) : (
          <Table
            columns={columns}
            dataSource={students}
            loading={loading}
            rowKey={(record) => `${record.id}_${record.classId}`}
            scroll={{ x: 1200 }}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 位低出勤学员`,
              pageSizeOptions: ['10', '20', '50', '100'],
            }}
          />
        )}
      </Card>
    </div>
  );
};

export default ContinuousLeaveStudents;
