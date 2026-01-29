import { useState, useEffect } from 'react';
import { Table, Button, Space, message, Modal, Form, Input, Select, DatePicker, Tag, InputNumber, Radio, Card, Statistic, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserAddOutlined, ImportOutlined, FilterOutlined, PlusCircleOutlined } from '@ant-design/icons';
import memfireDB from '../services/memfireDB';
import { getDataScopeFilter, normalizeRole } from '../utils/dataFilter';
import { useAuthStore } from '../store/authStore';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;
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
}

interface ExperienceLesson {
  id: string;
  studentName: string;
  age?: number;
  contact: string;
  className?: string;
  classId?: string;
  assigneeId?: string;
  assigneeName?: string;
  status: string;
}

const OrderInfo = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [form] = Form.useForm();
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [renewalModalVisible, setRenewalModalVisible] = useState(false);
  const [renewalForm] = Form.useForm();
  const [renewalStudents, setRenewalStudents] = useState<any[]>([]);
  const [selectedRenewalStudent, setSelectedRenewalStudent] = useState<any>(null);
  const [studentFilterOptions, setStudentFilterOptions] = useState<{ label: string; value: string }[]>([]);
  const [selectedStudentFilter, setSelectedStudentFilter] = useState<string | null>(null);
  
  // 来源类型和体验课列表
  const [sourceType, setSourceType] = useState<'new' | 'experience'>('new');
  const [experienceLessons, setExperienceLessons] = useState<ExperienceLesson[]>([]);
  const [selectedExperienceId, setSelectedExperienceId] = useState<string | null>(null);
  
  // 筛选条件
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [quickFilter, setQuickFilter] = useState<string>('all');
  
  // 统计数据
  const [stats, setStats] = useState({ totalCount: 0, totalAmount: 0 });

  // 获取当前用户和权限
  const user = useAuthStore((state) => state.user);
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;

  // 权限检查：教练角色只能创建，不能编辑/删除
  const canEdit = normalizedRole === 'admin' || normalizedRole === 'manager';
  const canDelete = normalizedRole === 'admin' || normalizedRole === 'manager';
  const canCreate = normalizedRole === 'admin' || normalizedRole === 'manager' || normalizedRole === 'coach';

  useEffect(() => {
    fetchData();
    fetchClasses();
    fetchStaffList();
    fetchExperienceLessons();
  }, [pagination.current, pagination.pageSize, dateRange, selectedStudentFilter]);

  useEffect(() => {
    fetchStudentOptions();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = {
        page: pagination.current,
        pageSize: pagination.pageSize,
        studentId: selectedStudentFilter || undefined,
      };
      
      // 添加日期筛选
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }
      
      // 应用数据过滤：teacher 角色只看自己的销售数据
      const filter = getDataScopeFilter('sales');
      Object.assign(params, filter);
      
      const result = await memfireDB.conversions.list(params);
      setData(result.data || []);
      setPagination(prev => ({
        ...prev,
        total: result.pagination.total,
      }));
      
      // 计算统计数据
      const totalAmount = (result.data || []).reduce((sum: number, item: any) => sum + (item.price || 0), 0);
      setStats({
        totalCount: result.pagination.total,
        totalAmount,
      });
    } catch (error: any) {
      console.error('获取成单列表失败:', error);
      message.error(error.message || '获取成单列表失败');
    } finally {
      setLoading(false);
    }
  };
  
  // 快捷筛选
  const handleQuickFilter = (filter: string) => {
    setQuickFilter(filter);
    const today = dayjs();
    
    switch (filter) {
      case 'week':
        // 近一周
        setDateRange([today.subtract(7, 'day'), today]);
        break;
      case 'month':
        // 本月
        setDateRange([today.startOf('month'), today]);
        break;
      case 'lastMonth':
        // 上月
        const lastMonth = today.subtract(1, 'month');
        setDateRange([lastMonth.startOf('month'), lastMonth.endOf('month')]);
        break;
      case 'all':
      default:
        setDateRange(null);
        break;
    }
    // 重置分页
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleStudentFilterChange = (value: string | null) => {
    setSelectedStudentFilter(value);
    setPagination(prev => ({ ...prev, current: 1 }));
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

  // 获取已完成的体验课（可转化的）
  const fetchExperienceLessons = async () => {
    try {
    const result = await memfireDB.experienceLessons.list({ 
      pageSize: 100,
      excludeConverted: true,
    });
      setExperienceLessons(result.data || []);
    } catch (error) {
      console.error('获取体验课列表失败:', error);
    }
  };

  const fetchStudentOptions = async () => {
    try {
      const students = await memfireDB.students.listAll();
      const options = (students || []).map((student: any) => ({
        label: `${student.name}${student.phone || student.parentPhone ? ` (${student.phone || student.parentPhone})` : ''}`,
        value: student.id,
      }));
      setStudentFilterOptions(options);
    } catch (error) {
      console.error('获取学员筛选列表失败:', error);
    }
  };

  const fetchRenewalCandidates = async () => {
    try {
      const students = await memfireDB.students.listAll();
      setRenewalStudents(students || []);
    } catch (error) {
      console.error('获取续费学员列表失败:', error);
    }
  };

  const handleAdd = () => {
    setEditingRecord(null);
    setSourceType('new');
    setSelectedExperienceId(null);
    form.resetFields();
    form.setFieldsValue({ 
      paymentStatus: 'paid',
      conversionDate: dayjs(),
    });
    setModalVisible(true);
  };

  const handleOpenRenewalModal = () => {
    renewalForm.resetFields();
    setSelectedRenewalStudent(null);
    renewalForm.setFieldsValue({
      paymentStatus: 'paid',
      conversionDate: dayjs(),
    });
    setRenewalModalVisible(true);
    fetchRenewalCandidates();
  };

  const handleRenewalStudentChange = (studentId: string) => {
    const student = renewalStudents.find(s => s.id === studentId);
    setSelectedRenewalStudent(student);
  };

  const handleRenewalSubmit = async (values: any) => {
    if (!selectedRenewalStudent) {
      message.error('请选择续费学员');
      return;
    }
    try {
      // 获取学员当前的活跃报名记录（原班级）
      const activeEnrollment = selectedRenewalStudent.enrollments?.find((e: any) => e.status === 'active');
      const originalClassId = activeEnrollment?.classId;
      const originalClass = activeEnrollment?.class;
      const originalTeacherId = originalClass?.teacher?.id;
      const originalTeacherName = originalClass?.teacher?.name;

      // 确定实际的班级ID和班级信息
      let finalClassId = values.classId || originalClassId; // 未填班级则使用原班级
      let finalClassName = null;
      let finalTeacherId = originalTeacherId; // 默认使用原班级教练

      if (values.classId) {
        // 如果填了新班级，获取新班级信息
        const selectedClass = classes.find(c => c.id === values.classId);
        finalClassName = selectedClass?.name || null;
        finalTeacherId = selectedClass?.teacher?.id || originalTeacherId;
      } else {
        // 未填班级，使用原班级信息
        finalClassName = originalClass?.name || null;
      }

      // 确定salesId和salesName的逻辑
      let finalSalesId = null;
      let finalSalesName = null;

      if (values.salesId) {
        // 填入了跟进人 → 算跟进人业绩
        const selectedSales = staffList.find(s => s.id === values.salesId);
        finalSalesId = values.salesId;
        finalSalesName = selectedSales?.name || null;
      } else {
        // 未填跟进人，使用班级负责教练
        if (values.classId) {
          // 填入了班级但未填跟进人 → 算新班级负责教练员业绩
          const selectedClass = classes.find(c => c.id === values.classId);
          finalSalesId = selectedClass?.teacher?.id || originalTeacherId;
          finalSalesName = selectedClass?.teacher?.name || originalTeacherName;
        } else {
          // 未填班级也未填跟进人 → 算原班级负责教练员业绩
          finalSalesId = originalTeacherId;
          finalSalesName = originalTeacherName;
        }
      }

      const addition = values.totalLessons || 0;
      const newRemaining = (selectedRenewalStudent.remainingLessons || 0) + addition;

      const conversionData = {
        studentName: selectedRenewalStudent.name,
        age: selectedRenewalStudent.age || null,
        gender: selectedRenewalStudent.gender || null,
        contact: selectedRenewalStudent.phone || selectedRenewalStudent.parentPhone || '',
        parentName: selectedRenewalStudent.parentName || null,
        classId: finalClassId || null,
        className: finalClassName,
        courseType: '续费',
        totalLessons: addition || null,
        price: values.price || null,
        paymentMethod: values.paymentMethod || null,
        paymentStatus: values.paymentStatus || 'paid',
        salesId: finalSalesId || null,
        salesName: finalSalesName || null,
        conversionDate: values.conversionDate ? values.conversionDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        notes: values.notes ? `续费 - ${values.notes}` : '续费',
        existingStudentId: selectedRenewalStudent.id,
      };

      await memfireDB.conversions.createRenewal(conversionData);
      await memfireDB.students.update(selectedRenewalStudent.id, {
        remainingLessons: newRemaining,
      });

      message.success(`续费记录已创建，${selectedRenewalStudent.name} 剩余 ${newRemaining} 节`);
      setRenewalModalVisible(false);
      setSelectedRenewalStudent(null);
      fetchData();
    } catch (error: any) {
      console.error('续费失败:', error);
      message.error(error.message || '续费失败');
    }
  };

  // 选择体验课时，自动填充表单
  const handleExperienceSelect = (expId: string) => {
    setSelectedExperienceId(expId);
    const exp = experienceLessons.find(e => e.id === expId);
    if (exp) {
      form.setFieldsValue({
        studentName: exp.studentName,
        age: exp.age,
        contact: exp.contact,
        classId: exp.classId,
        salesId: exp.assigneeId,
      });
    }
  };

  const handleEdit = (record: any) => {
    setEditingRecord(record);
    setSourceType('new'); // 编辑时不显示来源选择
    form.setFieldsValue({
      ...record,
      conversionDate: record.conversionDate ? dayjs(record.conversionDate) : null,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该成单记录吗？注意：关联的学员记录不会被删除。',
      onOk: async () => {
        try {
          await memfireDB.conversions.delete(id);
          message.success('删除成功');
          fetchData();
        } catch (error: any) {
          message.error(error.message || '删除失败');
        }
      },
    });
  };

  const handleSubmit = async (values: any) => {
    try {
      const selectedClass = classes.find(c => c.id === values.classId);
      const selectedSales = staffList.find(s => s.id === values.salesId);

      const submitData = {
        studentName: values.studentName,
        age: values.age || null,
        gender: values.gender || null,
        contact: values.contact,
        parentName: values.parentName || null,
        address: values.address || null,
        classId: values.classId || null,
        className: selectedClass?.name || null,
        courseType: values.courseType || null,
        totalLessons: values.totalLessons || null,
        price: values.price || null,
        paymentMethod: values.paymentMethod || null,
        paymentStatus: values.paymentStatus || 'paid',
        salesId: values.salesId || null,
        salesName: selectedSales?.name || null,
        conversionDate: values.conversionDate ? values.conversionDate.format('YYYY-MM-DD') : null,
        notes: values.notes || null,
        experienceLessonId: sourceType === 'experience' ? selectedExperienceId : null,
      };

      if (editingRecord) {
        await memfireDB.conversions.update(editingRecord.id, submitData);
        message.success('更新成功');
      } else {
        // 创建成单记录，同时创建学员
        const result = await memfireDB.conversions.createWithStudent(submitData);
        message.success(`成单成功！已创建学员：${result.student?.name || values.studentName}`);
        
        // 如果是从体验课转化，更新体验课状态为已成单
        if (sourceType === 'experience' && selectedExperienceId) {
          try {
            await memfireDB.experienceLessons.update(selectedExperienceId, { 
              status: 'converted',
              convertedStudentId: result.student?.id,
              convertedAt: new Date().toISOString(),
            });
            fetchExperienceLessons(); // 刷新体验课列表
          } catch (e) {
            console.warn('更新体验课状态失败:', e);
          }
        }
      }
      
      setModalVisible(false);
      setSelectedExperienceId(null);
      form.resetFields();
      fetchData();
    } catch (error: any) {
      console.error('提交失败:', error);
      message.error(error.message || '操作失败');
    }
  };

  const handleTableChange = (paginationConfig: any) => {
    setPagination({
      ...pagination,
      current: paginationConfig.current,
      pageSize: paginationConfig.pageSize,
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
      title: '报名班级',
      dataIndex: 'className',
      key: 'className',
      width: 120,
      render: (text: string) => text || '-',
    },
    {
      title: '课时数',
      dataIndex: 'totalLessons',
      key: 'totalLessons',
      width: 80,
      render: (num: number) => num ? `${num}节` : '-',
    },
    {
      title: '成交金额',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (price: number) => price ? `¥${price.toFixed(2)}` : '-',
    },
    {
      title: '支付状态',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      width: 90,
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          paid: { text: '已付款', color: 'green' },
          pending: { text: '待付款', color: 'orange' },
          partial: { text: '部分付款', color: 'blue' },
        };
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '销售',
      dataIndex: 'salesName',
      key: 'salesName',
      width: 80,
      render: (text: string) => text || <span style={{ color: '#999' }}>-</span>,
    },
    {
      title: '成单日期',
      dataIndex: 'conversionDate',
      key: 'conversionDate',
      width: 110,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-',
    },
    {
      title: '来源',
      dataIndex: 'experienceLessonId',
      key: 'source',
      width: 120,
      render: (_: string, record: any) => {
        return record.courseType === '续费' ? (
          <Tag color="purple">续费</Tag>
        ) : (
          <Tag color="green">新报名</Tag>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size="small">
          {canEdit && (
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            >
              编辑
            </Button>
          )}
          {canDelete && (
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record.id)}
            >
              删除
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>成单信息表</h2>
        <Space>
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新增成单
            </Button>
          )}
          {canCreate && (
            <Button type="default" icon={<PlusCircleOutlined />} onClick={handleOpenRenewalModal}>
              新增续费
            </Button>
          )}
        </Space>
      </div>

      {/* 筛选区域 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <Space wrap>
            <span><FilterOutlined /> 快捷筛选：</span>
            <Radio.Group value={quickFilter} onChange={(e) => handleQuickFilter(e.target.value)}>
              <Radio.Button value="all">全部</Radio.Button>
              <Radio.Button value="week">近一周</Radio.Button>
              <Radio.Button value="month">本月</Radio.Button>
              <Radio.Button value="lastMonth">上月</Radio.Button>
            </Radio.Group>
            <RangePicker 
              value={dateRange}
              onChange={(dates) => {
                setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null);
                setQuickFilter('custom');
                setPagination(prev => ({ ...prev, current: 1 }));
              }}
              format="YYYY-MM-DD"
              placeholder={['开始日期', '结束日期']}
            />
          <Select
            placeholder="筛选学员"
            allowClear
            style={{ width: 220 }}
            showSearch
            options={studentFilterOptions}
            value={selectedStudentFilter}
            onChange={(value) => handleStudentFilterChange(value)}
            optionFilterProp="label"
          />
          </Space>
          
          {/* 统计信息 */}
          <Row gutter={24}>
            <Col>
              <Statistic 
                title="成单数量" 
                value={stats.totalCount} 
                suffix="单"
                valueStyle={{ fontSize: 18 }}
              />
            </Col>
            <Col>
              <Statistic 
                title="成交总额" 
                value={stats.totalAmount} 
                precision={2}
                prefix="¥"
                valueStyle={{ fontSize: 18, color: '#3f8600' }}
              />
            </Col>
          </Row>
        </div>
      </Card>

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

      <Modal
        title="新增续费"
        open={renewalModalVisible}
        onCancel={() => {
          setRenewalModalVisible(false);
          setSelectedRenewalStudent(null);
        }}
        onOk={() => renewalForm.submit()}
        width={600}
      >
        <Form form={renewalForm} onFinish={handleRenewalSubmit} layout="vertical">
          <Form.Item
            name="studentId"
            label="续费学员"
            rules={[{ required: true, message: '请选择续费学员' }]}
          >
            <Select
              placeholder="请选择续费学员"
              options={renewalStudents.map((student) => ({
                label: `${student.name} - ${student.phone || student.parentPhone || '无电话'}（剩余 ${student.remainingLessons || 0} 节）`,
                value: student.id,
              }))}
              showSearch
              optionFilterProp="label"
              onChange={handleRenewalStudentChange}
            />
          </Form.Item>
          {selectedRenewalStudent && (
            <Form.Item label="当前剩余课时">
              <Tag color="blue">{selectedRenewalStudent.remainingLessons || 0} 节</Tag>
            </Form.Item>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="classId" label="续费班级">
              <Select placeholder="请选择班级（不填则保持原班级）" allowClear showSearch optionFilterProp="children">
                {classes.map((cls) => (
                  <Option key={cls.id} value={cls.id}>
                    {cls.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="totalLessons" label="续费课时" rules={[{ required: true, message: '请输入课时数' }]}>
              <InputNumber min={1} placeholder="课时数" style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="price" label="续费金额" rules={[{ required: true, message: '请输入金额' }]}>
              <InputNumber min={0} precision={2} prefix="¥" placeholder="金额" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="paymentMethod" label="支付方式">
              <Select placeholder="请选择" allowClear>
                <Option value="cash">现金</Option>
                <Option value="wechat">微信</Option>
                <Option value="alipay">支付宝</Option>
                <Option value="card">银行卡</Option>
                <Option value="transfer">转账</Option>
              </Select>
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="paymentStatus" label="支付状态" rules={[{ required: true }]}>
              <Select placeholder="请选择">
                <Option value="paid">已付款</Option>
                <Option value="pending">待付款</Option>
                <Option value="partial">部分付款</Option>
              </Select>
            </Form.Item>
            <Form.Item
              name="salesId"
              label="跟进人"
            >
              <Select placeholder="请选择（不填则算班级教练）" allowClear showSearch optionFilterProp="children">
                {staffList.map((staff) => (
                  <Option key={staff.id} value={staff.id}>
                    {staff.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <div style={{ 
            marginBottom: 16, 
            padding: 8, 
            background: '#e6f7ff', 
            border: '1px solid #91d5ff', 
            borderRadius: 4,
            fontSize: 12,
            color: '#666'
          }}>
            <div><strong>💡 业绩归属说明：</strong></div>
            <div>• 填写跟进人 → 业绩算跟进人</div>
            <div>• 填写班级但不填跟进人 → 业绩算该班级教练</div>
            <div>• 都不填 → 业绩算原班级教练</div>
          </div>

          <Form.Item name="conversionDate" label="续费日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <TextArea rows={2} placeholder="例如：转介绍/续费" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新增/编辑成单 Modal */}
      <Modal
        title={editingRecord ? '编辑成单信息' : '新增成单'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setSelectedExperienceId(null);
          setSourceType('new');
        }}
        onOk={() => form.submit()}
        width={700}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          {/* 来源选择（仅新增时显示） */}
          {!editingRecord && (
            <Form.Item label="成单来源">
              <Radio.Group 
                value={sourceType} 
                onChange={(e) => {
                  setSourceType(e.target.value);
                  setSelectedExperienceId(null);
                  form.resetFields(['studentName', 'age', 'contact', 'classId', 'salesId']);
                  form.setFieldsValue({ paymentStatus: 'paid', conversionDate: dayjs() });
                }}
              >
                <Radio.Button value="new">
                  <UserAddOutlined /> 直接成单
                </Radio.Button>
                <Radio.Button value="experience">
                  <ImportOutlined /> 从体验课转化
                </Radio.Button>
              </Radio.Group>
            </Form.Item>
          )}

          {/* 从体验课选择（仅新增且选择体验课时显示） */}
          {!editingRecord && sourceType === 'experience' && (
            <Form.Item label="选择体验课" required>
            <Select
              placeholder="请选择体验课"
                value={selectedExperienceId}
                onChange={handleExperienceSelect}
                showSearch
                filterOption={(input, option) => {
                  const exp = experienceLessons.find(e => e.id === option?.value);
                  if (!exp) return false;
                  const searchText = `${exp.studentName} ${exp.contact} ${exp.className || ''}`.toLowerCase();
                  return searchText.includes(input.toLowerCase());
                }}
              >
                {experienceLessons.map(exp => (
                  <Option key={exp.id} value={exp.id}>
                    {exp.studentName} - {exp.contact} {exp.className ? `(${exp.className})` : ''}
                  </Option>
                ))}
              </Select>
              {experienceLessons.length === 0 && (
                <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                  暂无可转化的体验课
                </div>
              )}
            </Form.Item>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="studentName" label="学员姓名" rules={[{ required: true, message: '请输入学员姓名' }]}>
              <Input placeholder="请输入学员姓名" disabled={sourceType === 'experience' && !!selectedExperienceId} />
            </Form.Item>
            <Form.Item name="age" label="年龄" rules={[{ required: true, message: '请输入年龄' }]}>
              <InputNumber min={0} max={150} placeholder="年龄" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="gender" label="性别">
              <Select placeholder="请选择" allowClear>
                <Option value="male">男</Option>
                <Option value="female">女</Option>
              </Select>
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="contact" label="联系方式" rules={[{ required: true, message: '请输入联系方式' }]}>
              <Input placeholder="请输入联系方式" disabled={sourceType === 'experience' && !!selectedExperienceId} />
            </Form.Item>
            <Form.Item name="parentName" label="家长姓名">
              <Input placeholder="请输入家长姓名" />
            </Form.Item>
          </div>

          <Form.Item name="address" label="地址">
            <Input placeholder="请输入地址" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="classId" label="报名班级">
              <Select placeholder="请选择班级" allowClear showSearch optionFilterProp="children">
                {classes.map((cls) => (
                  <Option key={cls.id} value={cls.id}>
                    {cls.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="courseType" label="课程类型">
              <Input placeholder="如：游泳初级班" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="totalLessons" label="购买课时" rules={[{ required: true, message: '请输入购买课时' }]}>
              <InputNumber min={1} placeholder="课时数" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="price" label="成交金额" rules={[{ required: true, message: '请输入成交金额' }]}>
              <InputNumber min={0} precision={2} prefix="¥" placeholder="金额" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="paymentMethod" label="支付方式">
              <Select placeholder="请选择" allowClear>
                <Option value="cash">现金</Option>
                <Option value="wechat">微信</Option>
                <Option value="alipay">支付宝</Option>
                <Option value="card">银行卡</Option>
                <Option value="transfer">转账</Option>
              </Select>
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="paymentStatus" label="支付状态" rules={[{ required: true }]}>
              <Select placeholder="请选择">
                <Option value="paid">已付款</Option>
                <Option value="pending">待付款</Option>
                <Option value="partial">部分付款</Option>
              </Select>
            </Form.Item>
            <Form.Item name="salesId" label="销售/跟进人">
              <Select placeholder="请选择" allowClear showSearch optionFilterProp="children">
                {staffList.map((staff) => (
                  <Option key={staff.id} value={staff.id}>
                    {staff.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="conversionDate" label="成单日期" rules={[{ required: true, message: '请选择成单日期' }]}>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </div>

          <Form.Item name="notes" label="备注">
            <TextArea rows={2} placeholder="备注信息" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default OrderInfo;
