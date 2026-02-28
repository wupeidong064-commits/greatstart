import { useState, useEffect, useCallback } from 'react';
import { Table, Card, Tag, Statistic, Row, Col, message, Progress, Alert, Button, Spin, Select, Space } from 'antd';
import { UserOutlined, CheckCircleOutlined, WarningOutlined, DownloadOutlined, TeamOutlined, ClockCircleOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../services/api';
import { dataService, Teacher } from '../services/dataService';
import dayjs from 'dayjs';

const HONEYMOON_DAYS = 30;

const HoneymoonAttendance = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<string | undefined>(undefined);
  const [stats, setStats] = useState<any>({
    total: 0,
    avgAttendanceRate: 0,
    highAttendance: 0,
    lowAttendance: 0,
  });

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
    // 初始不自动加载
  }, [fetchTeachers]);

  const fetchData = async () => {
    setLoading(true);
    setHasSearched(true);
    try {
      const params: any = {};
      if (selectedTeacher) {
        params.teacherId = selectedTeacher;
      }

      // 使用正确的 API 路径
      const response = await api.get('/attendances/honeymoon', { params });
      const result = response.data || {};

      let studentsList = result.students || [];

      // 如果有教练筛选，前端过滤（因为后端可能不支持此参数）
      if (selectedTeacher) {
        studentsList = studentsList.filter((s: any) => s.teacher?.id === selectedTeacher);
      }

      setStudents(studentsList);

      // 重新计算统计
      const newStats = {
        total: studentsList.length,
        avgAttendanceRate: studentsList.length > 0
          ? Math.round(studentsList.reduce((sum: number, s: any) => sum + s.attendanceRate, 0) / studentsList.length)
          : 0,
        highAttendance: studentsList.filter((s: any) => s.attendanceRate >= 80).length,
        lowAttendance: studentsList.filter((s: any) => s.attendanceRate < 60).length,
      };
      setStats(newStats);
    } catch (error: any) {
      console.error('获取蜜月期客户出勤失败:', error);
      setStudents([]);
      setStats({ total: 0, avgAttendanceRate: 0, highAttendance: 0, lowAttendance: 0 });
      message.error(error.message || '获取蜜月期客户出勤失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedTeacher(undefined);
    setStudents([]);
    setHasSearched(false);
    setStats({ total: 0, avgAttendanceRate: 0, highAttendance: 0, lowAttendance: 0 });
  };

  // 根据出勤率获取颜色
  const getAttendanceColor = (rate: number) => {
    if (rate >= 80) return 'green';
    if (rate >= 60) return 'orange';
    return 'red';
  };

  // 根据剩余天数获取标签颜色
  const getDaysRemainingTag = (daysRemaining: number) => {
    if (daysRemaining <= 7) return { color: 'red', text: '即将结束' };
    if (daysRemaining <= 14) return { color: 'orange', text: '过半' };
    return { color: 'blue', text: '蜜月期' };
  };

  // 导出蜜月期客户数据
  const handleExport = () => {
    try {
      if (students.length === 0) {
        message.warning('没有数据可导出');
        return;
      }

      // 构建 CSV 内容
      const headers = ['学员姓名', '所属班级', '班级代码', '负责教练', '报名日期', '已过天数', '剩余天数', '应出勤(次)', '实际出勤(次)', '缺勤次数', '出勤率(%)', '联系电话'];
      const csvContent = [
        headers.join(','),
        ...students.map((student: any) => {
          return [
            `"${student.studentName || '-'}"`,
            `"${student.className || '-'}"`,
            `"${student.classCode || '-'}"`,
            `"${student.teacher?.name || '-'}"`,
            student.enrollmentDate ? dayjs(student.enrollmentDate).format('YYYY-MM-DD') : '-',
            student.daysPassed || 0,
            student.daysRemaining || 0,
            student.expectedAttendance || 0,
            student.actualAttendance || 0,
            student.absentCount || 0,
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

      const dateStr = dayjs().format('YYYYMMDD');
      const teacherSuffix = selectedTeacher ? `_${teachers.find(t => t.id === selectedTeacher)?.name || ''}` : '';

      link.setAttribute('href', url);
      link.setAttribute('download', `蜜月期客户出勤_${dateStr}${teacherSuffix}.csv`);
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

  const columns = [
    {
      title: '学员姓名',
      dataIndex: 'studentName',
      key: 'studentName',
      width: 120,
      render: (text: string, record: any) => (
        <Space>
          <UserOutlined style={{ color: record.attendanceRate < 60 ? '#ff4d4f' : '#1890ff' }} />
          <span style={{ fontWeight: record.attendanceRate < 60 ? 'bold' : 'normal' }}>
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
      key: 'teacher',
      width: 100,
      render: (_: any, record: any) => record.teacher?.name || '-',
    },
    {
      title: '报名日期',
      dataIndex: 'enrollmentDate',
      key: 'enrollmentDate',
      width: 120,
      render: (date: string, record: any) => (
        <Space direction="vertical" size={0}>
          <span>{dayjs(date).format('YYYY-MM-DD')}</span>
          <Tag {...getDaysRemainingTag(record.daysRemaining)} style={{ fontSize: '11px', padding: '0 4px', margin: 0 }}>
            剩{record.daysRemaining}天
          </Tag>
        </Space>
      ),
      sorter: (a: any, b: any) => new Date(a.enrollmentDate).getTime() - new Date(b.enrollmentDate).getTime(),
    },
    {
      title: '应出勤',
      dataIndex: 'expectedAttendance',
      key: 'expectedAttendance',
      width: 90,
      align: 'center' as const,
      render: (count: number) => `${count} 次`,
    },
    {
      title: '实际出勤',
      dataIndex: 'actualAttendance',
      key: 'actualAttendance',
      width: 100,
      align: 'center' as const,
      render: (count: number, record: any) => (
        <Tag color="green" style={{ fontSize: '13px', padding: '2px 8px' }}>
          {count} / {record.expectedAttendance}
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
            size="small"
            status={rate < 60 ? 'exception' : 'normal'}
            style={{ width: 80 }}
            showInfo={false}
          />
          <Tag color={getAttendanceColor(rate)} style={{ fontSize: '13px', padding: '2px 8px' }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ margin: 0 }}>蜜月期客户出勤</h1>
          <Space>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleExport}
              disabled={students.length === 0}
            >
              导出数据
            </Button>
          </Space>
        </div>

        {/* 说明提示 */}
        <Alert
          message="蜜月期客户说明"
          description={
            <span>
              蜜月期客户是指<strong>报名{HONEYMOON_DAYS}天内</strong>的新学员。此页面全面监控新报名学员的出勤情况，
              帮助教练及时跟进新学员的学习状态。学员报名满{HONEYMOON_DAYS}天后将自动从此列表移除。
            </span>
          }
          type="info"
          showIcon
          icon={<ClockCircleOutlined />}
          style={{ marginBottom: 24 }}
        />

        {/* 筛选区域 */}
        <div style={{ marginBottom: 24, padding: '16px', background: '#fafafa', borderRadius: '8px' }}>
          <Space wrap size="middle">
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
            <Button type="primary" icon={<SearchOutlined />} onClick={fetchData} loading={loading}>
              查询
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              重置
            </Button>
          </Space>

          {/* 汇总统计 */}
          {hasSearched && !loading && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e8e8e8' }}>
              <Space size={24}>
                <span style={{ color: '#666' }}>
                  <TeamOutlined style={{ marginRight: 4 }} />
                  蜜月期学员：<b style={{ color: '#1890ff', fontSize: 16 }}>{stats.total}</b> 人
                </span>
                <span style={{ color: '#666' }}>
                  <CheckCircleOutlined style={{ marginRight: 4, color: '#52c41a' }} />
                  高出勤(≥80%)：<b style={{ color: '#52c41a', fontSize: 16 }}>{stats.highAttendance}</b> 人
                </span>
                <span style={{ color: '#666' }}>
                  <WarningOutlined style={{ marginRight: 4, color: '#ff4d4f' }} />
                  低出勤(&lt;60%)：<b style={{ color: '#ff4d4f', fontSize: 16 }}>{stats.lowAttendance}</b> 人
                </span>
                <span style={{ color: '#666' }}>
                  平均出勤率：<b style={{ color: stats.avgAttendanceRate >= 60 ? '#52c41a' : '#faad14', fontSize: 16 }}>{stats.avgAttendanceRate}</b>%
                </span>
              </Space>
            </div>
          )}
        </div>

        {/* 统计卡片 */}
        {hasSearched && !loading && students.length > 0 && (
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Card bordered={false} style={{ background: '#f5f5f5' }}>
                <Statistic
                  title="蜜月期学员"
                  value={stats.total || 0}
                  prefix={<TeamOutlined />}
                  suffix="人"
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card bordered={false} style={{ background: '#e6f7ff' }}>
                <Statistic
                  title="平均出勤率"
                  value={stats.avgAttendanceRate || 0}
                  suffix="%"
                  prefix={<CheckCircleOutlined />}
                  valueStyle={{ color: stats.avgAttendanceRate >= 80 ? '#3f8600' : stats.avgAttendanceRate >= 60 ? '#faad14' : '#cf1322' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card bordered={false} style={{ background: '#f6ffed' }}>
                <Statistic
                  title="高出勤 (≥80%)"
                  value={stats.highAttendance || 0}
                  suffix="人"
                  valueStyle={{ color: '#3f8600' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card bordered={false} style={{ background: '#fff2f0' }}>
                <Statistic
                  title={
                    <span>
                      低出勤 (&lt;60%)
                      {(stats.lowAttendance || 0) > 0 && (
                        <WarningOutlined style={{ marginLeft: 8, color: '#ff4d4f' }} />
                      )}
                    </span>
                  }
                  value={stats.lowAttendance || 0}
                  suffix="人"
                  valueStyle={{ color: '#cf1322' }}
                />
              </Card>
            </Col>
          </Row>
        )}

        {/* 加载状态 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Spin size="large" tip="正在加载数据..." />
          </div>
        ) : !hasSearched ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>
            <SearchOutlined style={{ fontSize: 48, marginBottom: 16 }} />
            <p>点击"查询"按钮获取蜜月期学员数据</p>
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
              showTotal: (total) => `共 ${total} 位蜜月期学员`,
              pageSizeOptions: ['10', '20', '50', '100'],
            }}
            locale={{
              emptyText: '暂无蜜月期学员（报名30天内的新学员）',
            }}
          />
        )}
      </Card>
    </div>
  );
};

export default HoneymoonAttendance;
