import { useState, useEffect, useMemo } from 'react';
import { Table, Card, Tag, Progress, message, DatePicker, Select, Space, Button, Switch, InputNumber } from 'antd';
import { TeamOutlined, SearchOutlined, ReloadOutlined, DownloadOutlined, FilterOutlined } from '@ant-design/icons';
import api from '../services/api';
import { dataService, Teacher } from '../services/dataService';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

const { RangePicker } = DatePicker;

const ClassAttendance = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().subtract(7, 'day'),
    dayjs(),
  ]);
  const [selectedTeacher, setSelectedTeacher] = useState<string | undefined>(undefined);
  const [showLowAttendanceOnly, setShowLowAttendanceOnly] = useState(false);
  const [lowAttendanceThreshold, setLowAttendanceThreshold] = useState<number | null>(70);

  // 获取教练员列表（使用缓存）
  const fetchTeachers = async () => {
    try {
      const data = await dataService.getTeachers();
      setTeachers(data);
    } catch (error: any) {
      console.error('获取教练员列表失败:', error);
    }
  };

  useEffect(() => {
    fetchTeachers();
    fetchClassAttendance();
  }, []);

  const fetchClassAttendance = async () => {
    setLoading(true);
    try {
      // 构建查询参数
      const params: any = {};

      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].startOf('day').toISOString();
        params.endDate = dateRange[1].endOf('day').toISOString();
      }

      if (selectedTeacher) {
        params.teacherId = selectedTeacher;
      }

      // 使用 API 获取班级出勤统计
      const response = await api.get('/attendances/class-attendance-stats', { params });
      setClasses(response.data || []);
    } catch (error: any) {
      console.error('获取班级出勤信息失败:', error);
      message.error(error.message || '获取班级出勤信息失败');
      setClasses([]);
    } finally {
      setLoading(false);
    }
  };

  // 处理查询
  const handleSearch = () => {
    fetchClassAttendance();
  };

  // 重置筛选
  const handleReset = () => {
    setDateRange([dayjs().subtract(7, 'day'), dayjs()]);
    setSelectedTeacher(undefined);
    setShowLowAttendanceOnly(false);
    setLowAttendanceThreshold(70);
    // 重置后自动查询
    setTimeout(() => fetchClassAttendance(), 0);
  };

  // 根据筛选条件过滤班级数据
  const filteredClasses = useMemo(() => {
    if (!showLowAttendanceOnly) {
      return classes;
    }
    const threshold = lowAttendanceThreshold ?? 70;
    return classes.filter(cls => cls.attendanceRate < threshold);
  }, [classes, showLowAttendanceOnly, lowAttendanceThreshold]);

  const columns = [
    {
      title: '班级名称',
      dataIndex: 'className',
      key: 'className',
      render: (text: string, record: any) => (
        <span>
          <TeamOutlined style={{ marginRight: 8 }} />
          {text}
          <span style={{ color: '#999', marginLeft: 8, fontSize: '12px' }}>
            ({record.classCode})
          </span>
        </span>
      ),
    },
    {
      title: '班级水平',
      dataIndex: 'level',
      key: 'level',
      render: (level: string) => level || '-',
    },
    {
      title: '负责教练',
      dataIndex: ['teacher', 'name'],
      key: 'teacher',
      render: (name: string) => name || '-',
    },
    {
      title: '班级总人数',
      dataIndex: 'totalStudents',
      key: 'totalStudents',
      align: 'center' as const,
      render: (count: number) => `${count} 人`,
    },
    {
      title: '排课次数',
      dataIndex: 'scheduleCount',
      key: 'scheduleCount',
      align: 'center' as const,
      render: (count: number) => `${count} 次`,
    },
    {
      title: '出勤人次',
      dataIndex: 'actualAttendance',
      key: 'actualAttendance',
      align: 'center' as const,
      render: (count: number, record: any) => (
        <Tag color="blue" style={{ fontSize: '14px', padding: '4px 12px' }}>
          {count} / {record.expectedAttendance}
        </Tag>
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
            status={rate < 50 ? 'exception' : rate < 70 ? 'active' : 'success'}
            size="small"
            style={{ width: 120, display: 'inline-block', marginRight: 8 }}
          />
          <Tag
            color={rate >= 80 ? 'green' : rate >= 60 ? 'orange' : 'red'}
            style={{ fontSize: '14px', padding: '4px 12px' }}
          >
            {rate}%
          </Tag>
        </>
      ),
    },
  ];

  // 获取时间范围描述
  const getDateRangeText = () => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return '全部时间';
    return `${dateRange[0].format('YYYY-MM-DD')} 至 ${dateRange[1].format('YYYY-MM-DD')}`;
  };

  // 导出为 Excel
  const handleExport = () => {
    try {
      if (!filteredClasses || filteredClasses.length === 0) {
        message.warning('暂无数据可导出');
        return;
      }

      // 准备导出数据
      const exportData = filteredClasses.map((item, index) => ({
        '序号': index + 1,
        '班级名称': item.className,
        '班级代码': item.classCode,
        '班级水平': item.level || '-',
        '负责教练': item.teacher?.name || '-',
        '班级总人数': item.totalStudents,
        '排课次数': item.scheduleCount,
        '应出勤人次': item.expectedAttendance,
        '实际出勤人次': item.actualAttendance,
        '出勤率': `${item.attendanceRate}%`,
      }));

      // 创建工作簿
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '班级出勤统计');

      // 设置列宽
      const colWidths = [
        { wch: 6 },  // 序号
        { wch: 20 }, // 班级名称
        { wch: 15 }, // 班级代码
        { wch: 12 }, // 班级水平
        { wch: 12 }, // 负责教练
        { wch: 12 }, // 班级总人数
        { wch: 12 }, // 排课次数
        { wch: 14 }, // 应出勤人次
        { wch: 14 }, // 实际出勤人次
        { wch: 10 }, // 出勤率
      ];
      worksheet['!cols'] = colWidths;

      // 生成文件名
      const dateRangeStr = dateRange && dateRange[0] && dateRange[1]
        ? `${dateRange[0].format('YYYYMMDD')}-${dateRange[1].format('YYYYMMDD')}`
        : dayjs().format('YYYYMMDD');
      const teacherStr = selectedTeacher
        ? `_${teachers.find(t => t.id === selectedTeacher)?.name || '未知教练'}`
        : '';
      const lowAttendanceStr = showLowAttendanceOnly
        ? `_低出勤(<${lowAttendanceThreshold ?? 70}%)`
        : '';
      const fileName = `班级出勤统计_${dateRangeStr}${teacherStr}${lowAttendanceStr}.xlsx`;

      // 导出文件
      XLSX.writeFile(workbook, fileName);
      message.success('导出成功');
    } catch (error: any) {
      console.error('导出失败:', error);
      message.error(error.message || '导出失败');
    }
  };

  return (
    <div>
      <Card>
        <h1 style={{ marginBottom: 16 }}>班级出勤</h1>

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
              <Switch
                checked={showLowAttendanceOnly}
                onChange={setShowLowAttendanceOnly}
                checkedChildren="低出勤"
                unCheckedChildren="全部"
              />
              {showLowAttendanceOnly && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  出勤率 &lt;
                  <InputNumber
                    min={0}
                    max={100}
                    value={lowAttendanceThreshold}
                    onChange={setLowAttendanceThreshold}
                    style={{ width: 70 }}
                    size="small"
                    controls={false}
                  />
                  %
                </span>
              )}
            </div>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              查询
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              重置
            </Button>
            <Button
              type="default"
              icon={<DownloadOutlined />}
              onClick={handleExport}
              disabled={!filteredClasses || filteredClasses.length === 0}
            >
              导出Excel
            </Button>
          </Space>
        </div>

        {/* 统计信息 */}
        <div style={{ marginBottom: 16, color: '#666' }}>
          <span>查询时间范围：{getDateRangeText()}</span>
          {selectedTeacher && (
            <span style={{ marginLeft: 16 }}>
              筛选教练：{teachers.find(t => t.id === selectedTeacher)?.name || '-'}
            </span>
          )}
          {showLowAttendanceOnly && (
            <span style={{ marginLeft: 16 }}>
              <FilterOutlined style={{ marginRight: 4 }} />
              低出勤筛选：出勤率 &lt; {lowAttendanceThreshold ?? 70}%
            </span>
          )}
        </div>

        <Table
          columns={columns}
          dataSource={filteredClasses}
          loading={loading}
          rowKey="classId"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => showLowAttendanceOnly
              ? `共 ${total} 个低出勤班级（出勤率 < ${lowAttendanceThreshold ?? 70}%）`
              : `共 ${total} 个班级`,
          }}
        />
      </Card>
    </div>
  );
};

export default ClassAttendance;
