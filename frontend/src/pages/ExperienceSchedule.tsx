import { useState, useEffect } from 'react';
import { Table, Button, Space, message, Modal, Form, Input, Select, DatePicker, Tag, InputNumber, Radio, Collapse, Segmented, Alert } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserAddOutlined, ImportOutlined, CheckCircleOutlined, ReloadOutlined, ClockCircleOutlined, UserDeleteOutlined, FileExcelOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../services/api';
import { dataService } from '../services/dataService';
import { getDataScopeFilter, normalizeRole } from '../utils/dataFilter';
import { useAuthStore } from '../store/authStore';
import dayjs from 'dayjs';
import ImportModal from '../components/ImportModal';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { Search } = Input;

// 统一的来源选项（与鱼池表保持一致）
const SOURCE_OPTIONS = [
  { value: 'meituan', label: '美团', color: 'yellow' },
  { value: 'groundPromotion', label: '地推', color: 'green' },
  { value: 'telemarketing', label: '电销', color: 'blue' },
  { value: 'walkIn', label: '上门', color: 'orange' },
  { value: 'referral', label: '转介绍', color: 'purple' },
  { value: 'crossIndustry', label: '异业', color: 'cyan' },
];

// 来源映射（用于兼容旧数据）
const SOURCE_MAP: Record<string, { text: string; color: string }> = {};
SOURCE_OPTIONS.forEach(opt => {
  SOURCE_MAP[opt.value] = { text: opt.label, color: opt.color };
});

interface StaffUser {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

interface ClassInfo {
  id: string;
  name: string;
  code?: string;
  teacher?: { id: string; name: string };
}

interface LeadInfo {
  id: string;
  customerName: string;
  age?: number;
  contact: string;
  source?: string;
  assigneeId?: string;
  assigneeName?: string;
}

// 筛选模式类型
type FilterMode = 'all' | 'pendingConfirm' | 'unconverted';

const ExperienceSchedule = () => {
  // 获取当前用户和权限
  const user = useAuthStore((state) => state.user);
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;
  const canManageAll = normalizedRole === 'admin' || normalizedRole === 'manager';

  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [form] = Form.useForm();
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [teacherFilter, setTeacherFilter] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [studentNameSearch, setStudentNameSearch] = useState<string>('');
  const [conversionStats, setConversionStats] = useState<any[]>([]);
  const [statsDateRange, setStatsDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  // 筛选模式：all-全部, pendingConfirm-待上课确认, unconverted-未成单回访
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  // 新增：来源类型和鱼池线索
  const [sourceType, setSourceType] = useState<'new' | 'lead'>('new');
  const [leadsList, setLeadsList] = useState<LeadInfo[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // 批量导入相关状态
  const [batchImportModalVisible, setBatchImportModalVisible] = useState(false);

  // 批量选择相关状态
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchStatusModalVisible, setBatchStatusModalVisible] = useState(false);
  const [batchStatusForm] = Form.useForm();

  useEffect(() => {
    fetchData();
    fetchClasses();
    fetchStaffList();
    fetchLeadsList();
  }, [pagination.current, pagination.pageSize, teacherFilter, assigneeFilter, filterMode, studentNameSearch]);

  useEffect(() => {
    fetchTeacherStats();
  }, [teacherFilter, assigneeFilter, statsDateRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 应用数据过滤：teacher 角色只看自己负责的体验课
      const filter = getDataScopeFilter('experiences');

      // 根据筛选模式设置状态过滤
      let statusParam: string | undefined;
      let unconvertedOnly = false;

      if (filterMode === 'pendingConfirm') {
        // 待上课确认：包含待上课、未到场、已取消（待上课邀约的）
        statusParam = 'pending,no-show,cancelled';
      } else if (filterMode === 'unconverted') {
        // 未成单回访：到场后未成单
        statusParam = 'completed';
        unconvertedOnly = true;
      }

      const response = await api.get('/experience-lessons', {
        params: {
          page: pagination.current,
          pageSize: pagination.pageSize,
          teachingTeacherId: teacherFilter || undefined,
          assigneeId: assigneeFilter || filter.assigneeId || undefined,
          status: statusParam || undefined,
          unconvertedOnly,
          studentName: studentNameSearch || undefined,
        }
      });
      setData(response.data || []);
      if (response.pagination && response.pagination.total !== undefined) {
        setPagination(prev => ({
          ...prev,
          total: response.pagination!.total || 0,
        }));
      }
    } catch (error: any) {
      console.error('获取体验课列表失败:', error);
      message.error(error.message || '获取体验课列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const data = await dataService.getClasses();
      setClasses(data);
    } catch (error) {
      console.error('获取班级列表失败:', error);
    }
  };

  const fetchStaffList = async () => {
    try {
      const data = await dataService.getTeachers();
      setStaffList(data);
    } catch (error) {
      console.error('获取工作人员列表失败:', error);
    }
  };

  const fetchTeacherStats = async () => {
    try {
      const response = await api.get('/experience-lessons/stats', {
        params: {
          teachingTeacherId: teacherFilter || undefined,
          assigneeId: assigneeFilter || undefined,
          startDate: statsDateRange?.[0] ? statsDateRange[0].format('YYYY-MM-DD') : undefined,
          endDate: statsDateRange?.[1] ? statsDateRange[1].format('YYYY-MM-DD') : undefined,
        }
      });
      setConversionStats(response.data || []);
    } catch (error: any) {
      console.error('获取教练成单率失败:', error);
    }
  };

  const handleStatsDateChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setStatsDateRange(dates);
  };

  // 获取鱼池线索列表（使用缓存）
  const fetchLeadsList = async () => {
    try {
      const data = await dataService.getLeads();
      setLeadsList(data);
    } catch (error) {
      console.error('获取鱼池线索失败:', error);
    }
  };

  const handleAdd = () => {
    setEditingRecord(null);
    setSourceType('new');
    setSelectedLeadId(null);
    form.resetFields();
    form.setFieldsValue({ status: 'pending' });
    // 非管理人员默认分配给自己
    if (!canManageAll && user?.id) {
      form.setFieldsValue({ assigneeId: user.id });
    }
    setModalVisible(true);
  };

  // 选择鱼池线索时，自动填充表单
  const handleLeadSelect = (leadId: string) => {
    setSelectedLeadId(leadId);
    const lead = leadsList.find(l => l.id === leadId);
    if (lead) {
      form.setFieldsValue({
        studentName: lead.customerName,
        age: lead.age,
        contact: lead.contact,
        source: lead.source,
        assigneeId: lead.assigneeId,
      });
    }
  };

  const handleClassSelect = (classId: string) => {
    // 根据选择的班级自动填充教练
    const selectedClass = classes.find(c => c.id === classId);
    if (selectedClass && selectedClass.teacher?.id) {
      form.setFieldsValue({
        teachingTeacherId: selectedClass.teacher.id,
      });
    } else {
      form.setFieldsValue({
        teachingTeacherId: undefined,
      });
    }
  };

  const handleEdit = (record: any) => {
    setEditingRecord(record);
    form.setFieldsValue({
      ...record,
      scheduleDate: record.scheduleDate ? dayjs(record.scheduleDate) : null,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该体验课记录吗？',
      onOk: async () => {
        try {
          await api.delete(`/experience-lessons/${id}`);
          message.success('删除成功');
          fetchData();
        } catch (error: any) {
          message.error(error.message || '删除失败');
        }
      },
    });
  };

  // 批量删除体验课
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的记录');
      return;
    }

    Modal.confirm({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 条记录吗？此操作不可恢复。`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          let successCount = 0;
          let failCount = 0;

          for (const id of selectedRowKeys) {
            try {
              await api.delete(`/experience-lessons/${id}`);
              successCount++;
            } catch {
              failCount++;
            }
          }

          if (failCount === 0) {
            message.success(`成功删除 ${successCount} 条记录`);
          } else {
            message.warning(`成功删除 ${successCount} 条，失败 ${failCount} 条`);
          }

          setSelectedRowKeys([]);
          fetchData();
        } catch (error: any) {
          console.error('批量删除失败:', error);
          message.error(error.message || '批量删除失败');
        }
      },
    });
  };

  // 批量更新状态
  const handleBatchStatusUpdate = async (values: any) => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要更新的记录');
      return;
    }

    try {
      let successCount = 0;
      let failCount = 0;

      for (const id of selectedRowKeys) {
        try {
          await api.put(`/experience-lessons/${id}/status`, { status: values.status });
          successCount++;
        } catch {
          failCount++;
        }
      }

      if (failCount === 0) {
        message.success(`成功更新 ${successCount} 条记录`);
      } else {
        message.warning(`成功更新 ${successCount} 条，失败 ${failCount} 条`);
      }

      setSelectedRowKeys([]);
      setBatchStatusModalVisible(false);
      batchStatusForm.resetFields();
      fetchData();
    } catch (error: any) {
      console.error('批量更新失败:', error);
      message.error(error.message || '批量更新失败');
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await api.put(`/experience-lessons/${id}/status`, { status });
      message.success('状态更新成功');
      fetchData();
    } catch (error: any) {
      message.error(error.message || '状态更新失败');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      // 获取选中的班级和教练信息
      const selectedClass = classes.find(c => c.id === values.classId);
      const selectedTeacher = staffList.find(s => s.id === values.teachingTeacherId);
      const selectedAssignee = staffList.find(s => s.id === values.assigneeId);

      const submitData = {
        studentName: values.studentName,
        age: values.age || undefined,
        contact: values.contact,
        source: values.source || undefined, // 来源
        leadId: sourceType === 'lead' && selectedLeadId ? selectedLeadId : undefined, // 记录来源线索ID
        classId: values.classId || undefined,
        className: selectedClass?.name || undefined,
        scheduleDate: values.scheduleDate ? values.scheduleDate.format('YYYY-MM-DD') : '',
        startTime: undefined, // 不再使用时间段
        endTime: undefined, // 不再使用时间段
        teachingTeacherId: values.teachingTeacherId || undefined,
        teachingTeacherName: selectedTeacher?.name || undefined,
        assigneeId: values.assigneeId || undefined,
        assigneeName: selectedAssignee?.name || undefined,
        status: values.status || 'pending',
        notes: values.notes || undefined,
      };

      if (editingRecord) {
        await api.put(`/experience-lessons/${editingRecord.id}`, submitData);
        message.success('更新成功');
      } else {
        await api.post('/experience-lessons', submitData);
        message.success('创建成功');

        // 注意：不删除鱼池线索，保留以便统计添加数
        // 鱼池记录会保留，用于现金流总结中的"添加数"统计
        if (sourceType === 'lead' && selectedLeadId) {
          // 可选：更新鱼池线索的最近联系时间，表示已处理
          try {
            await api.put(`/leads/${selectedLeadId}/contact`);
            fetchLeadsList(); // 刷新鱼池列表
          } catch (e) {
            console.warn('更新鱼池线索失败:', e);
          }
        }
      }
      setModalVisible(false);
      setSelectedLeadId(null);
      form.resetFields();
      fetchData();
    } catch (error: any) {
      console.error('提交失败:', error);
      message.error(error.message || '操作失败');
    }
  };

  const handleTableChange = (newPagination: any) => {
    setPagination({
      ...pagination,
      current: newPagination.current,
      pageSize: newPagination.pageSize,
    });
  };

  const handleResetFilters = () => {
    setTeacherFilter(null);
    setAssigneeFilter(null);
    setFilterMode('all');
    setStudentNameSearch('');
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleSearch = (value: string) => {
    setStudentNameSearch(value);
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  // 获取当前筛选模式的统计信息（保留供将来使用）
  const _getFilterStats = () => {
    const stats = {
      pendingConfirm: 0,
      unconverted: 0,
    };
    // 这些统计可以从后端获取，这里暂时返回空
    return stats;
  };
  void _getFilterStats; // 避免未使用警告

  const columns = [
    {
      title: '学员姓名',
      dataIndex: 'studentName',
      key: 'studentName',
      width: 100,
    },
    {
      title: '年龄',
      dataIndex: 'age',
      key: 'age',
      width: 60,
      render: (age: number) => age || '-',
    },
    {
      title: '联系方式',
      dataIndex: 'contact',
      key: 'contact',
      width: 130,
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 90,
      render: (source: string) => {
        const sourceInfo = SOURCE_MAP[source] || { text: source || '-', color: 'default' };
        return <Tag color={sourceInfo.color}>{sourceInfo.text}</Tag>;
      },
    },
    {
      title: '体验班级',
      dataIndex: 'className',
      key: 'className',
      width: 120,
      render: (text: string) => text || '-',
    },
    {
      title: '上课日期',
      dataIndex: 'scheduleDate',
      key: 'scheduleDate',
      width: 110,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-',
    },
    {
      title: '上课时间',
      key: 'timeRange',
      width: 110,
      render: (_: any, record: any) => {
        if (record.startTime && record.endTime) {
          return `${record.startTime}-${record.endTime}`;
        }
        return '-';
      },
    },
    {
      title: '上课教练',
      dataIndex: 'teachingTeacherName',
      key: 'teachingTeacherName',
      width: 100,
      render: (text: string) => text || '-',
    },
    {
      title: '负责人',
      dataIndex: 'assigneeName',
      key: 'assigneeName',
      width: 100,
      render: (text: string) => text || <span style={{ color: '#999' }}>未分配</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          pending: { text: '待上课', color: 'orange' },
          completed: { text: '到场', color: 'green' },
          'no-show': { text: '未到场', color: 'red' },
          noshow: { text: '未到场', color: 'red' },
          cancelled: { text: '已取消', color: 'red' },
          converted: { text: '已成单', color: 'blue' },
          unconverted: { text: '未成单', color: 'default' },
        };
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size="small">
          {record.status === 'pending' && (
            <>
              <Button
                type="link"
                size="small"
                onClick={() => handleStatusChange(record.id, 'completed')}
              >
                到场
              </Button>
            </>
          )}
          {record.status === 'converted' ? (
            // 已成单状态：锁定记录，不允许编辑和删除
            <span style={{ color: '#999', fontSize: '12px' }}>
              已锁定（已成单记录不可修改）
            </span>
          ) : (
            // 其他状态：正常显示编辑和删除按钮
            <>
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
                编辑
              </Button>
              <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>
                删除
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  // 根据筛选模式获取表格标题
  const getTableTitle = () => {
    switch (filterMode) {
      case 'pendingConfirm':
        return '待上课确认列表（包含待上课、未到场等状态）';
      case 'unconverted':
        return '未成单回访列表（到场后未成单的客户）';
      default:
        return null;
    }
  };

  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>体验课表</h1>

      {/* 筛选区域 */}
      <div style={{ marginBottom: 16, padding: '16px', background: '#fafafa', borderRadius: '8px' }}>
        {/* 快捷筛选按钮 */}
        <div style={{ marginBottom: 12 }}>
          <span style={{ marginRight: 12, fontWeight: 500 }}>快捷筛选：</span>
          <Segmented
            value={filterMode}
            onChange={(value) => {
              setFilterMode(value as FilterMode);
              setPagination(prev => ({ ...prev, current: 1 }));
            }}
            options={[
              {
                value: 'all',
                label: (
                  <div style={{ padding: '4px 8px' }}>
                    <CheckCircleOutlined style={{ marginRight: 6 }} />
                    全部
                  </div>
                ),
              },
              {
                value: 'pendingConfirm',
                label: (
                  <div style={{ padding: '4px 8px' }}>
                    <ClockCircleOutlined style={{ marginRight: 6 }} />
                    待上课确认
                  </div>
                ),
              },
              {
                value: 'unconverted',
                label: (
                  <div style={{ padding: '4px 8px' }}>
                    <UserDeleteOutlined style={{ marginRight: 6 }} />
                    未成单回访
                  </div>
                ),
              },
            ]}
          />
        </div>

        {/* 详细筛选 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Select
            placeholder="全部教练"
            style={{ width: 140 }}
            value={teacherFilter}
            onChange={(value) => setTeacherFilter(value)}
            allowClear
            showSearch
            optionFilterProp="children"
          >
            {staffList.map(teacher => (
              <Option key={teacher.id} value={teacher.id}>
                {teacher.name}
              </Option>
            ))}
          </Select>
          <Select
            placeholder="全部负责人"
            style={{ width: 140 }}
            value={assigneeFilter}
            onChange={(value) => setAssigneeFilter(value)}
            allowClear
            showSearch
            optionFilterProp="children"
          >
            {staffList.map(person => (
              <Option key={person.id} value={person.id}>
                {person.name}
              </Option>
            ))}
          </Select>
          <Search
            placeholder="搜索学员姓名"
            allowClear
            style={{ width: 180 }}
            value={studentNameSearch}
            onChange={(e) => setStudentNameSearch(e.target.value)}
            onSearch={handleSearch}
            enterButton={<SearchOutlined />}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={handleResetFilters}
            disabled={!teacherFilter && !assigneeFilter && filterMode === 'all' && !studentNameSearch}
          >
            重置筛选
          </Button>
        </div>
      </div>

      {/* 操作按钮区域 */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增体验课
        </Button>
        <Button icon={<FileExcelOutlined />} onClick={() => setBatchImportModalVisible(true)}>
          批量导入
        </Button>
        <RangePicker
          value={statsDateRange}
          onChange={handleStatsDateChange}
          format="YYYY-MM-DD"
          allowClear
          placeholder={['统计开始日期', '统计结束日期']}
        />
      </div>

      {/* 批量操作栏 */}
      {selectedRowKeys.length > 0 && (
        <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f5f5f5', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>已选择 <strong>{selectedRowKeys.length}</strong> 条记录</span>
          <Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button>
          <Button size="small" onClick={() => setBatchStatusModalVisible(true)}>批量更新状态</Button>
          <Button size="small" danger onClick={handleBatchDelete}>批量删除</Button>
        </div>
      )}

      <Collapse ghost style={{ marginBottom: 16 }} defaultActiveKey={[]}>
        <Collapse.Panel header="教练转化率（点击展开）" key="statsPanel">
          <Table
            columns={[
              { title: '教练', dataIndex: 'teacherName', key: 'teacherName' },
              { title: '总体验课', dataIndex: 'total', key: 'total', width: 100 },
              { title: '成单', dataIndex: 'converted', key: 'converted', width: 90 },
              {
                title: '转化率',
                dataIndex: 'conversionRate',
                key: 'conversionRate',
                width: 120,
                render: (rate: number) => `${rate || 0}%`,
              },
            ]}
            dataSource={conversionStats}
            pagination={false}
            size="small"
            rowKey="teacherId"
          />
        </Collapse.Panel>
      </Collapse>

      {/* 数据表格 */}
      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        rowKey="id"
        rowSelection={{
          selectedRowKeys,
          onChange: (newSelectedRowKeys: React.Key[]) => {
            setSelectedRowKeys(newSelectedRowKeys);
          },
          selections: [
            Table.SELECTION_ALL,
            Table.SELECTION_INVERT,
            Table.SELECTION_NONE,
          ],
        }}
        title={getTableTitle}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条记录`,
        }}
        onChange={handleTableChange}
        scroll={{ x: 1200 }}
      />

      {/* 新增/编辑体验课 Modal */}
      <Modal
        title={editingRecord ? '编辑体验课' : '新增体验课'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setSelectedLeadId(null);
          setSourceType('new');
        }}
        onOk={() => form.submit()}
        width={650}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          {/* 来源选择（仅新增时显示） */}
          {!editingRecord && (
            <Form.Item label="学员来源">
              <Radio.Group
                value={sourceType}
                onChange={(e) => {
                  setSourceType(e.target.value);
                  setSelectedLeadId(null);
                  form.resetFields(['studentName', 'age', 'contact', 'assigneeId']);
                }}
              >
                <Radio.Button value="new">
                  <UserAddOutlined /> 新学员
                </Radio.Button>
                <Radio.Button value="lead">
                  <ImportOutlined /> 从鱼池导入
                </Radio.Button>
              </Radio.Group>
            </Form.Item>
          )}

          {/* 从鱼池选择（仅新增且选择鱼池时显示） */}
          {!editingRecord && sourceType === 'lead' && (
            <Form.Item label="选择鱼池线索" required>
              <Select
                placeholder="请选择鱼池中的线索"
                value={selectedLeadId}
                onChange={handleLeadSelect}
                showSearch
                filterOption={(input, option) => {
                  const lead = leadsList.find(l => l.id === option?.value);
                  if (!lead) return false;
                  const searchText = `${lead.customerName} ${lead.contact} ${lead.assigneeName || ''}`.toLowerCase();
                  return searchText.includes(input.toLowerCase());
                }}
              >
                {leadsList.map(lead => (
                  <Option key={lead.id} value={lead.id}>
                    {lead.customerName} - {lead.contact} {lead.assigneeName ? `(${lead.assigneeName})` : ''}
                  </Option>
                ))}
              </Select>
              {leadsList.length === 0 && (
                <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                  鱼池暂无线索，请先在鱼池中添加
                </div>
              )}
            </Form.Item>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="studentName" label="学员姓名" rules={[{ required: true, message: '请输入学员姓名' }]}>
              <Input placeholder="请输入学员姓名" disabled={sourceType === 'lead' && !!selectedLeadId} />
            </Form.Item>
            <Form.Item name="age" label="年龄">
              <InputNumber min={0} max={150} placeholder="年龄" style={{ width: '100%' }} disabled={sourceType === 'lead' && !!selectedLeadId} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="contact" label="联系方式" rules={[{ required: true, message: '请输入联系方式' }]}>
              <Input placeholder="请输入联系方式（手机号）" disabled={sourceType === 'lead' && !!selectedLeadId} />
            </Form.Item>
            <Form.Item name="source" label="来源" rules={[{ required: true, message: '请选择来源' }]}>
              <Select placeholder="请选择来源">
                {SOURCE_OPTIONS.map(opt => (
                  <Option key={opt.value} value={opt.value}>
                    {opt.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="classId" label="体验班级">
              <Select
                placeholder="请选择体验班级"
                allowClear
                showSearch
                optionFilterProp="children"
                onChange={handleClassSelect}
              >
                {classes.map((cls) => (
                  <Option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.code})
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="scheduleDate" label="上课日期" rules={[{ required: true, message: '请选择上课日期' }]}>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="选择日期" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="teachingTeacherId" label="上课教练">
              <Select placeholder="选择班级后自动填充" allowClear showSearch optionFilterProp="children" disabled>
                {staffList.map((staff) => (
                  <Option key={staff.id} value={staff.id}>
                    {staff.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="assigneeId" label="负责人">
              <Select placeholder="请选择负责人" allowClear showSearch optionFilterProp="children">
                {staffList.map((staff) => (
                  <Option key={staff.id} value={staff.id}>
                    {staff.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Form.Item
            name="status"
            label="状态"
            rules={[{ required: true, message: '请选择状态' }]}
            tooltip="注意：'已成单'状态由成单信息表自动设置，无法手动选择"
          >
            <Select placeholder="请选择状态">
              <Option value="pending">待上课</Option>
              <Option value="completed">到场</Option>
              <Option value="cancelled">已取消</Option>
              <Option value="converted" disabled>
                已成单（由成单信息表自动设置）
              </Option>
            </Select>
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量导入 Modal */}
      <ImportModal
        visible={batchImportModalVisible}
        type="experiences"
        onClose={() => setBatchImportModalVisible(false)}
        onSuccess={fetchData}
      />

      {/* 批量更新状态 Modal */}
      <Modal
        title="批量更新状态"
        open={batchStatusModalVisible}
        onCancel={() => {
          setBatchStatusModalVisible(false);
          batchStatusForm.resetFields();
        }}
        onOk={() => batchStatusForm.submit()}
        width={400}
      >
        <Form form={batchStatusForm} onFinish={handleBatchStatusUpdate} layout="vertical">
          <Alert
            message={`确定要更新选中的 ${selectedRowKeys.length} 条记录的状态吗？`}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Form.Item name="status" label="新状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select placeholder="请选择状态">
              <Option value="pending">待上课</Option>
              <Option value="completed">到场</Option>
              <Option value="cancelled">已取消</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ExperienceSchedule;
