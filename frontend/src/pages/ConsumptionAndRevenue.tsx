import { Card, Row, Col, Statistic, Table, message, DatePicker, Space, Tag, Switch, Progress, Button, Modal, Form, InputNumber } from 'antd';
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
  DownloadOutlined,
} from '@ant-design/icons';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { normalizeRole } from '../utils/dataFilter';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const ConsumptionAndRevenue = () => {
  const [loading, setLoading] = useState(false);
  const [classChangesLoading, setClassChangesLoading] = useState(false);
  const [maxClassesModalVisible, setMaxClassesModalVisible] = useState(false);
  const [maxClassesForm] = Form.useForm();
  const [maxClasses, setMaxClasses] = useState(0); // 最大开班数
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);

  // 权限检查
  const user = useAuthStore((state) => state.user);
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;
  const canManageSettings = normalizedRole === 'admin' || normalizedRole === 'manager';
  const [statistics, setStatistics] = useState({
    totalAttendance: 0,       // 实际划课数（出勤人次）
    totalAttendanceCount: 0,  // 应划课数（理想出勤人次）
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
  const [, setLostStudents] = useState<any[]>([]);
  const [showDecreasedOnly, setShowDecreasedOnly] = useState(false);
  useState(false); // lostStudentsModalVisible - 保留供将来使用

  useEffect(() => {
    fetchStatistics();
    fetchClassChanges();
    fetchMaxClasses();
  }, [dateRange]);

  // 当 maxClasses 或 statistics.classCount 变化时重新计算场地使用率
  useEffect(() => {
    const classCount = statistics.classCount;
    console.log('📊 场地使用率计算:', { maxClasses, classCount });
    if (maxClasses > 0 && classCount > 0) {
      const rate = Math.round((classCount / maxClasses) * 100 * 10) / 10;
      console.log('✅ 计算结果:', rate + '%');
      // 使用 setTimeout 确保在 fetchStatistics 的 setStatistics 之后执行
      setTimeout(() => {
        setStatistics(prev => {
          // 只有当前值与计算值不同时才更新
          if (prev.venueUtilizationRate !== rate) {
            return { ...prev, venueUtilizationRate: rate };
          }
          return prev;
        });
      }, 0);
    } else {
      console.log('⚠️ 条件不满足，设为 0');
    }
  }, [maxClasses, statistics.classCount]);

  const fetchStatistics = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].startOf('day').toISOString();
        params.endDate = dateRange[1].endOf('day').toISOString();
      }

      const response = await api.get('/consumption/statistics', { params });
      const stats = response.data || {};
      // 场地使用率由 useEffect 根据 maxClasses 和 classCount 计算，这里不设置
      setStatistics(prev => ({
        ...stats,
        venueUtilizationRate: prev.venueUtilizationRate, // 保留之前计算的值
      }));
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

      console.log('[班级学员变化] 请求参数:', params);
      const response = await api.get('/consumption/class-student-changes', { params });
      console.log('[班级学员变化] API响应:', response);
      // axios拦截器返回response.data，后端sendSuccess包装在data字段中
      const result = response?.data || response || {};
      console.log('[班级学员变化] 班级数量:', result.classes?.length);
      setClassChanges(result.classes || []);
      setClassChangeStats(result.stats || {
        totalClasses: 0,
        decreasedClasses: 0,
        increasedClasses: 0,
        unchangedClasses: 0,
        totalLost: 0,
        totalNewAdded: 0,
        netChange: 0,
      });
      setLostStudents(result.lostStudents || []);
    } catch (error: any) {
      console.error('[班级学员变化] 获取失败:', error?.message || error);
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
      setLostStudents([]);
    } finally {
      setClassChangesLoading(false);
    }
  };

  // 获取最大开班数配置
  const fetchMaxClasses = async () => {
    try {
      console.log('🔍 正在获取最大开班数配置...');
      const response = await api.get('/settings/maxClasses');
      console.log('✅ 获取到响应:', response);
      // response 已经是 {success, data} 格式（axios 拦截器返回 response.data）
      const config = response.data || response;
      console.log('📦 config:', config);
      if (config && config.value) {
        const value = Number(config.value);
        console.log('🎯 设置 maxClasses:', value);
        setMaxClasses(value);
      } else {
        console.log('⚠️ 未找到配置，使用默认值 0');
        setMaxClasses(0);
      }
    } catch (error: any) {
      console.error('❌ 获取最大开班数配置失败:', error);
      // 如果获取失败，使用默认值
      setMaxClasses(0);
    }
  };

  // 打开设置最大开班数弹窗
  const handleOpenMaxClassesModal = () => {
    maxClassesForm.setFieldsValue({ maxClasses });
    setMaxClassesModalVisible(true);
  };

  // 保存最大开班数
  const handleSaveMaxClasses = async (values: any) => {
    try {
      console.log('💾 正在保存最大开班数:', values.maxClasses);
      await api.put('/settings/maxClasses', { value: values.maxClasses.toString() });
      console.log('✅ 保存成功');
      setMaxClasses(values.maxClasses);
      message.success('最大开班数设置成功');
      setMaxClassesModalVisible(false);
      // 重新获取统计数据以更新场地使用率
      fetchStatistics();
    } catch (error: any) {
      console.error('❌ 保存最大开班数失败:', error);
      message.error(error.message || '保存失败，请检查数据库是否已创建settings表');
    }
  };

  // 导出班级学员变化数据
  const handleExportClassChanges = () => {
    try {
      message.loading('正在导出数据...', 0);
      
      // 获取要导出的数据（根据筛选条件）
      const dataToExport = filteredClassChanges;
      
      if (dataToExport.length === 0) {
        message.destroy();
        message.warning('没有数据可导出');
        return;
      }

      // 构建 CSV 内容
      const headers = ['班级名称', '班级代码', '负责教练', '班级类型', '当前人数', '班级容量', '满班率(%)', '上期人数', '新增', '流失', '变化', '变化率(%)'];
      const csvContent = [
        headers.join(','),
        ...dataToExport.map((record: any) => {
          const type = record.level || record.courseType || '普通';
          return [
            `"${record.name || '-'}"`,
            `"${record.code || '-'}"`,
            `"${record.teacherName || '未分配'}"`,
            `"${type}"`,
            record.currentStudents || 0,
            record.maxStudents || 0,
            record.fullnessRate || 0,
            record.previousStudents || 0,
            record.newAdded || 0,
            record.lost || 0,
            record.change || 0,
            record.changeRate || 0,
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
      const filterSuffix = showDecreasedOnly ? '_人数减少' : '';
      
      link.setAttribute('href', url);
      link.setAttribute('download', `班级学员变化_${dateStr}${filterSuffix}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      message.destroy();
      message.success(`成功导出 ${dataToExport.length} 个班级的数据`);
    } catch (error: any) {
      console.error('导出失败:', error);
      message.destroy();
      message.error('导出失败: ' + (error.message || '未知错误'));
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
            onChange={(dates) => handleDateRangeChange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
            format="YYYY-MM-DD"
            allowClear
            presets={[
              { label: '本周', value: [dayjs().startOf('week'), dayjs().endOf('week')] },
              { label: '本月', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
              { label: '上月', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
              { label: '本季度', value: [dayjs().startOf('quarter' as any), dayjs().endOf('quarter' as any)] },
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
              title="实际划课数"
              value={statistics.totalAttendance}
              prefix={<CheckCircleOutlined style={{ color: '#1890ff' }} />}
              suffix="人次"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading} hoverable>
            <Statistic
              title="应划课数"
              value={statistics.totalAttendanceCount}
              prefix={<CalendarOutlined style={{ color: '#722ed1' }} />}
              suffix="人次"
              valueStyle={{ color: '#722ed1' }}
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
          <Card 
            loading={loading}
            hoverable={canManageSettings}
            onClick={canManageSettings ? handleOpenMaxClassesModal : undefined}
            style={canManageSettings ? { cursor: 'pointer' } : undefined}
          >
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
            <div style={{ marginTop: 8, fontSize: 12, color: '#999', textAlign: 'center' }}>
              {statistics.classCount} / {maxClasses || '未设置'}
            </div>
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
              title: '实际划课数',
              dataIndex: 'totalAttendance',
              key: 'totalAttendance',
              align: 'center',
              render: (val: number) => `${val} 人次`,
            },
            {
              title: '应划课数',
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
            基本盘变化分析
            <span style={{ fontSize: 12, color: '#999', marginLeft: 16, fontWeight: 'normal' }}>
              本期变化 = 新增 + 召回 - 不续费 - 流失（停卡）
            </span>
          </span>
        } 
        style={{ marginTop: 24 }}
      >
        <Table
          loading={loading}
          columns={[
            {
              title: '当前基本盘',
              dataIndex: 'baseCount',
              key: 'baseCount',
              align: 'center',
              render: (val: number) => (
                <span style={{ 
                  color: '#1890ff', 
                  fontWeight: 'bold',
                  fontSize: 16
                }}>
                  {val} 人
                </span>
              ),
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
              title: '= 本期净变化',
              key: 'netChange',
              align: 'center',
              render: (_: any, record: any) => {
                const change = (record.newRecruits || 0) + (record.recalled || 0) - (record.nonRenewals || 0) - (record.deletedRoster || 0);
                return (
                  <span style={{ 
                    color: change >= 0 ? '#52c41a' : '#ff4d4f', 
                    fontWeight: 'bold',
                    fontSize: 15
                  }}>
                    {change >= 0 ? '+' : ''}{change} 人
                  </span>
                );
              },
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
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={handleExportClassChanges}
                disabled={filteredClassChanges.length === 0}
              >
                导出表格
              </Button>
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

      {/* 设置最大开班数弹窗 */}
      <Modal
        title="设置最大开班数"
        open={maxClassesModalVisible}
        onCancel={() => setMaxClassesModalVisible(false)}
        onOk={() => maxClassesForm.submit()}
        width={500}
      >
        <div style={{ marginBottom: 16, padding: 12, background: '#f0f5ff', borderRadius: 8 }}>
          <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
            💡 <strong>说明：</strong>
          </div>
          <div style={{ fontSize: 13, color: '#666', lineHeight: '1.6' }}>
            • 场地使用率 = 已开班数 / 最大开班数<br />
            • 已开班数：当前活跃的班级总数（{statistics.classCount} 个）<br />
            • 最大开班数：场地能够容纳的最大班级数量<br />
            • 设置后将用于计算场地使用率指标
          </div>
        </div>
        
        <Form 
          form={maxClassesForm} 
          onFinish={handleSaveMaxClasses} 
          layout="vertical"
        >
          <Form.Item 
            name="maxClasses" 
            label="最大开班数" 
            rules={[
              { required: true, message: '请输入最大开班数' },
              { type: 'number', min: 1, message: '最大开班数必须大于 0' }
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              placeholder="请输入场地最大开班数"
              min={1}
              step={1}
              precision={0}
              addonAfter="个班级"
            />
          </Form.Item>
          
          <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.maxClasses !== currentValues.maxClasses}>
            {({ getFieldValue }) => {
              const maxClassesValue = getFieldValue('maxClasses');
              const utilizationRate = maxClassesValue > 0 
                ? Math.round((statistics.classCount / maxClassesValue) * 100) 
                : 0;
              
              return (
                <div style={{ 
                  marginTop: 16, 
                  padding: 12, 
                  background: '#fffbe6', 
                  borderRadius: 8, 
                  border: '1px solid #ffe58f' 
                }}>
                  <div style={{ fontSize: 13, color: '#666' }}>
                    当前已开班数：<strong style={{ color: '#1890ff' }}>{statistics.classCount}</strong> 个<br />
                    设置后场地使用率：<strong style={{ 
                      color: utilizationRate >= 70 ? '#52c41a' : 
                             utilizationRate >= 50 ? '#faad14' : '#ff4d4f' 
                    }}>
                      {maxClassesValue > 0 ? `${utilizationRate}%` : '-'}
                    </strong>
                  </div>
                </div>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ConsumptionAndRevenue;
