import { useState, useEffect } from 'react';
import { Table, Card, Tag, message, DatePicker, Space, Button, Progress, Select, Switch } from 'antd';
import { UserOutlined, SearchOutlined, ReloadOutlined, WarningOutlined, DownloadOutlined } from '@ant-design/icons';
import { memfireDB } from '../services/memfireDB';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const ContinuousLeaveStudents = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);
  const [selectedTeacher, setSelectedTeacher] = useState<string | undefined>(undefined);
  const [continuousAbsentOnly, setContinuousAbsentOnly] = useState(false);

  // 获取教练员列表
  const fetchTeachers = async () => {
    try {
      const data = await memfireDB.users.listTeachers();
      setTeachers(data || []);
    } catch (error: any) {
      console.error('获取教练员列表失败:', error);
    }
  };

  useEffect(() => {
    fetchTeachers();
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 构建查询参数
      const params: any = {
        threshold: 60, // 出勤率低于60%的学员
        continuousAbsentOnly,
      };
      
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].startOf('day').toISOString();
        params.endDate = dateRange[1].endOf('day').toISOString();
      }

      if (selectedTeacher) {
        params.teacherId = selectedTeacher;
      }

      // 使用 MemFire 获取低出勤学员数据
      const data = await memfireDB.attendances.getLowAttendanceStudents(params);
      setStudents(data || []);
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
    setTimeout(() => fetchData(), 0);
  };

  // 获取时间范围描述
  const getDateRangeText = () => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return '全部时间';
    return `${dateRange[0].format('YYYY-MM-DD')} 至 ${dateRange[1].format('YYYY-MM-DD')}`;
  };

  // 导出低出勤学员数据
  const handleExport = () => {
    try {
      message.loading('正在导出数据...', 0);
      
      if (students.length === 0) {
        message.destroy();
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
      
      message.destroy();
      message.success(`成功导出 ${students.length} 位学员的数据`);
    } catch (error: any) {
      console.error('导出失败:', error);
      message.destroy();
      message.error('导出失败: ' + (error.message || '未知错误'));
    }
  };

  const columns = [
    {
      title: '学员姓名',
      dataIndex: 'studentName',
      key: 'studentName',
      render: (text: string) => (
        <span>
          <UserOutlined style={{ marginRight: 8 }} />
          {text}
        </span>
      ),
    },
    {
      title: '所属班级',
      dataIndex: 'className',
      key: 'className',
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
      title: '负责教练员',
      dataIndex: ['teacher', 'name'],
      key: 'teacher',
      render: (name: string) => name || '-',
    },
    {
      title: '应出勤',
      dataIndex: 'scheduleCount',
      key: 'scheduleCount',
      align: 'center' as const,
      render: (count: number) => `${count} 次`,
    },
    {
      title: '实际出勤',
      dataIndex: 'presentCount',
      key: 'presentCount',
      align: 'center' as const,
      render: (count: number, record: any) => (
        <Tag color="green" style={{ fontSize: '14px', padding: '4px 12px' }}>
          {count} / {record.scheduleCount}
        </Tag>
      ),
    },
    {
      title: '缺勤次数',
      dataIndex: 'absentCount',
      key: 'absentCount',
      align: 'center' as const,
      render: (count: number) => (
        <Tag color="red" style={{ fontSize: '14px', padding: '4px 12px' }}>
          {count} 次
        </Tag>
      ),
    },
    {
      title: '连续缺勤',
      dataIndex: 'continuousAbsentCount',
      key: 'continuousAbsentCount',
      align: 'center' as const,
      sorter: (a: any, b: any) => a.continuousAbsentCount - b.continuousAbsentCount,
      render: (count: number, record: any) => (
        <Space>
          <span style={{ 
            color: record.isContinuousAbsent ? '#ff4d4f' : '#666',
            fontWeight: record.isContinuousAbsent ? 'bold' : 'normal'
          }}>
            {count} 次
          </span>
          {record.isContinuousAbsent && (
            <Tag color="error" icon={<WarningOutlined />}>≥2周</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '出勤率',
      dataIndex: 'attendanceRate',
      key: 'attendanceRate',
      align: 'center' as const,
      sorter: (a: any, b: any) => a.attendanceRate - b.attendanceRate,
      render: (rate: number) => (
        <>
          <Progress
            percent={rate}
            status={rate < 30 ? 'exception' : rate < 50 ? 'active' : 'normal'}
            size="small"
            style={{ width: 100, display: 'inline-block', marginRight: 8 }}
          />
          <Tag
            color={rate >= 50 ? 'orange' : rate >= 30 ? 'volcano' : 'red'}
            style={{ fontSize: '14px', padding: '4px 12px' }}
          >
            {rate}%
          </Tag>
        </>
      ),
    },
    {
      title: '联系电话',
      dataIndex: 'phone',
      key: 'phone',
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
                style={{ width: 180 }}
                placeholder="全部教练"
                allowClear
                value={selectedTeacher}
                onChange={(value) => setSelectedTeacher(value)}
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                }
              >
                {teachers.map((teacher) => (
                  <Select.Option key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </Select.Option>
                ))}
              </Select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <WarningOutlined style={{ marginRight: 4, color: continuousAbsentOnly ? '#ff4d4f' : '#999' }} />
              <span style={{ marginRight: 8 }}>连续请假≥2周：</span>
              <Switch
                checked={continuousAbsentOnly}
                onChange={(checked) => setContinuousAbsentOnly(checked)}
                checkedChildren="开"
                unCheckedChildren="关"
              />
            </div>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
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
        </div>

        {/* 统计信息 */}
        <div style={{ marginBottom: 16, color: '#666' }}>
          <span>查询时间范围：{getDateRangeText()}</span>
          {selectedTeacher && (
            <span style={{ marginLeft: 16 }}>
              筛选教练：<Tag color="blue">{teachers.find(t => t.id === selectedTeacher)?.name || '-'}</Tag>
            </span>
          )}
          <span style={{ marginLeft: 16 }}>
            筛选条件：出勤率低于 <Tag color="red">60%</Tag> 的学员
          </span>
          {continuousAbsentOnly && (
            <span style={{ marginLeft: 16 }}>
              <Tag color="error" icon={<WarningOutlined />}>仅显示连续请假≥2周的学员</Tag>
            </span>
          )}
        </div>

        <Table
          columns={columns}
          dataSource={students}
          loading={loading}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 位低出勤学员`,
          }}
        />
      </Card>
    </div>
  );
};

export default ContinuousLeaveStudents;
