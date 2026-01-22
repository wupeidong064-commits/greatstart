import { useState, useEffect } from 'react';
import { Table, Button, Space, message, Modal, Form, Input, Select, DatePicker, Tag, InputNumber, Radio, Collapse } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PhoneOutlined, CheckCircleOutlined, UserAddOutlined, ImportOutlined } from '@ant-design/icons';
import memfireDB from '../services/memfireDB';
import dayjs from 'dayjs';

const { Option } = Select;
const { RangePicker } = DatePicker;

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
  assigneeId?: string;
  assigneeName?: string;
}

const ExperienceSchedule = () => {
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
  const [conversionStats, setConversionStats] = useState<any[]>([]);
  const [statsDateRange, setStatsDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [unconvertedModalVisible, setUnconvertedModalVisible] = useState(false);
  const [unconvertedData, setUnconvertedData] = useState<any[]>([]);
  const [unconvertedLoading, setUnconvertedLoading] = useState(false);
  
  // 新增：来源类型和鱼池线索
  const [sourceType, setSourceType] = useState<'new' | 'lead'>('new');
  const [leadsList, setLeadsList] = useState<LeadInfo[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    fetchClasses();
    fetchStaffList();
    fetchLeadsList();
  }, [pagination.current, pagination.pageSize, teacherFilter, assigneeFilter]);

  useEffect(() => {
    fetchTeacherStats();
  }, [teacherFilter, assigneeFilter, statsDateRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await memfireDB.experienceLessons.list({
        page: pagination.current,
        pageSize: pagination.pageSize,
        teachingTeacherId: teacherFilter || undefined,
        assigneeId: assigneeFilter || undefined,
      });
      setData(result.data || []);
      setPagination(prev => ({
        ...prev,
        total: result.pagination.total,
      }));
    } catch (error: any) {
      console.error('获取体验课列表失败:', error);
      message.error(error.message || '获取体验课列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const classList = await memfireDB.classes.listAll();
      setClasses(classList || []);
    } catch (error) {
      console.error('获取班级列表失败:', error);
    }
  };

  const fetchStaffList = async () => {
    try {
      const users = await memfireDB.users.listTeachers();
      setStaffList(users || []);
    } catch (error) {
      console.error('获取工作人员列表失败:', error);
    }
  };

  const fetchTeacherStats = async () => {
    try {
      const stats = await memfireDB.experienceLessons.teacherConversionStats({
        teachingTeacherId: teacherFilter || undefined,
        assigneeId: assigneeFilter || undefined,
        startDate: statsDateRange?.[0] ? statsDateRange[0].format('YYYY-MM-DD') : undefined,
        endDate: statsDateRange?.[1] ? statsDateRange[1].format('YYYY-MM-DD') : undefined,
      });
      setConversionStats(stats);
    } catch (error: any) {
      console.error('获取教练成单率失败:', error);
    }
  };

  const handleStatsDateChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setStatsDateRange(dates);
  };

  // 获取鱼池线索列表
  const fetchLeadsList = async () => {
    try {
      const result = await memfireDB.leads.list({ pageSize: 100 });
      setLeadsList(result.data || []);
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
          await memfireDB.experienceLessons.delete(id);
          message.success('删除成功');
          fetchData();
        } catch (error: any) {
          message.error(error.message || '删除失败');
        }
      },
    });
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await memfireDB.experienceLessons.updateStatus(id, status);
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
        await memfireDB.experienceLessons.update(editingRecord.id, submitData);
        message.success('更新成功');
      } else {
        await memfireDB.experienceLessons.create(submitData);
        message.success('创建成功');
        
        // 如果是从鱼池导入，删除对应的鱼池线索
        if (sourceType === 'lead' && selectedLeadId) {
          try {
            await memfireDB.leads.delete(selectedLeadId);
            message.success('已从鱼池移除该线索');
            fetchLeadsList(); // 刷新鱼池列表
          } catch (e) {
            console.warn('删除鱼池线索失败:', e);
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

  const handleUnconvertedFollowUp = async () => {
    setUnconvertedModalVisible(true);
    setUnconvertedLoading(true);
    try {
      const result = await memfireDB.experienceLessons.listUnconverted({ pageSize: 50 });
      setUnconvertedData(result.data || []);
    } catch (error: any) {
      message.error(error.message || '获取未成单列表失败');
    } finally {
      setUnconvertedLoading(false);
    }
  };

  const handleTableChange = (newPagination: any) => {
    setPagination({
      ...pagination,
      current: newPagination.current,
      pageSize: newPagination.pageSize,
    });
  };

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
        const sourceMap: Record<string, { text: string; color: string }> = {
          telemarketing: { text: '电销', color: 'blue' },
          groundPromotion: { text: '地推', color: 'green' },
          referral: { text: '转介绍', color: 'purple' },
          walkIn: { text: '上门', color: 'orange' },
        };
        const sourceInfo = sourceMap[source] || { text: source || '-', color: 'default' };
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
          completed: { text: '已完成', color: 'green' },
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
                icon={<CheckCircleOutlined />}
                onClick={() => handleStatusChange(record.id, 'converted')}
              >
                成单
              </Button>
              <Button 
                type="link" 
                size="small"
                onClick={() => handleStatusChange(record.id, 'unconverted')}
              >
                未成单
              </Button>
            </>
          )}
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const unconvertedColumns = [
    { title: '学员姓名', dataIndex: 'studentName', key: 'studentName', width: 100 },
    { title: '联系方式', dataIndex: 'contact', key: 'contact', width: 130 },
    { title: '体验班级', dataIndex: 'className', key: 'className', width: 120 },
    { 
      title: '上课日期', 
      dataIndex: 'scheduleDate', 
      key: 'scheduleDate', 
      width: 110,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-',
    },
    { title: '负责人', dataIndex: 'assigneeName', key: 'assigneeName', width: 100 },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: any) => (
        <Space>
          <Button 
            type="link" 
            size="small"
            icon={<CheckCircleOutlined />}
            onClick={() => {
              handleStatusChange(record.id, 'converted');
              setUnconvertedModalVisible(false);
            }}
          >
            转成单
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>体验课表</h1>
        <Space>
          <Select
            placeholder="筛选上课教练"
            allowClear
            style={{ width: 180 }}
            value={teacherFilter}
            onChange={(value) => setTeacherFilter(value)}
          >
            {staffList.map(teacher => (
              <Option key={teacher.id} value={teacher.id}>
                {teacher.name}
              </Option>
            ))}
          </Select>
          <Select
            placeholder="筛选负责人"
            allowClear
            style={{ width: 180 }}
            value={assigneeFilter}
            onChange={(value) => setAssigneeFilter(value)}
          >
            {staffList.map(person => (
              <Option key={person.id} value={person.id}>
                {person.name}
              </Option>
            ))}
          </Select>
          <Button icon={<PhoneOutlined />} onClick={handleUnconvertedFollowUp}>
            未成单回访
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增体验课
          </Button>
          <RangePicker
            value={statsDateRange}
            onChange={handleStatsDateChange}
            format="YYYY-MM-DD"
            allowClear
          />
        </Space>
      </div>

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
      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        rowKey="id"
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
                <Option value="telemarketing">电销</Option>
                <Option value="groundPromotion">地推</Option>
                <Option value="referral">转介绍</Option>
                <Option value="walkIn">上门</Option>
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

          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select placeholder="请选择状态">
              <Option value="pending">待上课</Option>
              <Option value="cancelled">已取消</Option>
              <Option value="converted">已成单</Option>
              <Option value="unconverted">未成单</Option>
            </Select>
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 未成单回访 Modal */}
      <Modal
        title="未成单回访列表"
        open={unconvertedModalVisible}
        onCancel={() => setUnconvertedModalVisible(false)}
        footer={null}
        width={800}
      >
        <Table
          columns={unconvertedColumns}
          dataSource={unconvertedData}
          loading={unconvertedLoading}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Modal>
    </div>
  );
};

export default ExperienceSchedule;
