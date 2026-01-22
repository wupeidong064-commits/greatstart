import { useState, useEffect } from 'react';
import { Table, Input, Space, Tag, message, Button, Select, Modal, Form, InputNumber, DatePicker, Tabs, Popconfirm } from 'antd';
import { SearchOutlined, FileExcelOutlined, CheckCircleOutlined, CloseCircleOutlined, UserOutlined } from '@ant-design/icons';
import memfireDB from '../services/memfireDB';
import dayjs from 'dayjs';

const { Option } = Select;
const { RangePicker } = DatePicker;

interface StaffUser {
  id: string;
  name: string;
}

interface ClassInfo {
  id: string;
  name: string;
  code?: string;
  teacher?: { id: string; name: string };
}

const RenewalStudents = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  
  // 教练列表
  const [teacherList, setTeacherList] = useState<StaffUser[]>([]);
  const [classList, setClassList] = useState<ClassInfo[]>([]);
  const [renewalDateRange, setRenewalDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  
  // 续费弹窗
  const [renewalModalVisible, setRenewalModalVisible] = useState(false);
  const [renewingStudent, setRenewingStudent] = useState<any>(null);
  const [renewalForm] = Form.useForm();

  // 不续费弹窗
  const [noRenewalModalVisible, setNoRenewalModalVisible] = useState(false);
  const [noRenewalForm] = Form.useForm();

  // 当前 Tab
  const [activeTab, setActiveTab] = useState<string>('pending');
  
  // 不续费学员列表
  const [noRenewalStudents, setNoRenewalStudents] = useState<any[]>([]);
  const [noRenewalLoading, setNoRenewalLoading] = useState(false);
  const [noRenewalPagination, setNoRenewalPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  useEffect(() => {
    fetchTeacherList();
    fetchClassList();
    // 初始化时同时获取两个标签的数据，确保数量正确显示
    fetchRenewalStudents();
    fetchNoRenewalStudents();
  }, []);

  useEffect(() => {
    if (activeTab === 'pending') {
    fetchRenewalStudents();
    } else {
      fetchNoRenewalStudents();
    }
  }, [pagination.current, pagination.pageSize, searchText, selectedTeacher, activeTab, noRenewalPagination.current, renewalDateRange]);

  const fetchTeacherList = async () => {
    try {
      const users = await memfireDB.users.listTeachers();
      setTeacherList(users || []);
    } catch (error) {
      console.error('获取教练列表失败:', error);
    }
  };

  const fetchClassList = async () => {
    try {
      const classes = await memfireDB.classes.listAll();
      setClassList(classes || []);
    } catch (error) {
      console.error('获取班级列表失败:', error);
    }
  };

  const fetchRenewalStudents = async () => {
    setLoading(true);
    try {
      const result = await memfireDB.students.listForRenewal({
          page: pagination.current,
          pageSize: pagination.pageSize,
        search: searchText,
        teacherId: selectedTeacher || undefined,
        maxRemainingLessons: 10,
        excludeNoRenewal: true, // 排除已标记不续费的
        renewalStartDate: renewalDateRange?.[0] ? renewalDateRange[0].format('YYYY-MM-DD') : undefined,
        renewalEndDate: renewalDateRange?.[1] ? renewalDateRange[1].format('YYYY-MM-DD') : undefined,
      });
      
      setStudents(result.data || []);
      setPagination(prev => ({
        ...prev,
        total: result.pagination?.total || 0,
      }));
    } catch (error: any) {
      console.error('获取续费学员列表失败:', error);
      message.error(error.message || '获取续费学员列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchNoRenewalStudents = async () => {
    setNoRenewalLoading(true);
    try {
      const result = await memfireDB.students.listNoRenewal({
        page: noRenewalPagination.current,
        pageSize: noRenewalPagination.pageSize,
        search: searchText,
      });
      
      let filteredData = result.data || [];
      if (selectedTeacher) {
        filteredData = filteredData.filter((student: any) => student.teacherId === selectedTeacher);
      }

      setNoRenewalStudents(filteredData);
      setNoRenewalPagination(prev => ({
        ...prev,
        total: selectedTeacher ? filteredData.length : result.pagination?.total || 0,
      }));
    } catch (error: any) {
      console.error('获取不续费学员列表失败:', error);
    } finally {
      setNoRenewalLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchText(value);
    setPagination({ ...pagination, current: 1 });
    setNoRenewalPagination({ ...noRenewalPagination, current: 1 });
  };

  const handleTeacherFilter = (teacherId: string | null) => {
    setSelectedTeacher(teacherId);
    setPagination({ ...pagination, current: 1 });
  };

  const handleRenewalDateChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setRenewalDateRange(dates);
    setPagination({ ...pagination, current: 1 });
  };

  // 打开续费弹窗
  const handleRenewal = (student: any) => {
    setRenewingStudent(student);
    renewalForm.resetFields();
    renewalForm.setFieldsValue({
      studentName: student.name,
      contact: student.phone || student.parentPhone,
      conversionDate: dayjs(),
      paymentStatus: 'paid',
    });
    setRenewalModalVisible(true);
  };

  // 打开不续费弹窗
  const handleNoRenewal = (student: any) => {
    setRenewingStudent(student);
    noRenewalForm.resetFields();
    setNoRenewalModalVisible(true);
  };

  // 提交续费
  const handleRenewalSubmit = async (values: any) => {
    try {
      const selectedClass = classList.find(c => c.id === values.classId);
      const selectedSales = teacherList.find(t => t.id === values.salesId);

      const conversionData = {
        studentName: renewingStudent.name,
        age: renewingStudent.age || null,
        gender: renewingStudent.gender || null,
        contact: renewingStudent.phone || renewingStudent.parentPhone || '未填写',
        parentName: renewingStudent.parentName || null,
        classId: values.classId || null,
        className: selectedClass?.name || null,
        totalLessons: values.totalLessons,
        price: values.price,
        paymentMethod: values.paymentMethod || null,
        paymentStatus: values.paymentStatus || 'paid',
        salesId: values.salesId || null,
        salesName: selectedSales?.name || null,
        conversionDate: values.conversionDate ? values.conversionDate.format('YYYY-MM-DD') : null,
        notes: `续费 - ${values.notes || ''}`,
        existingStudentId: renewingStudent.id,
      };

      await memfireDB.conversions.createRenewal(conversionData);
      
      const newRemainingLessons = (renewingStudent.remainingLessons || 0) + (values.totalLessons || 0);
      await memfireDB.students.update(renewingStudent.id, {
        remainingLessons: newRemainingLessons,
      });

      message.success(`续费成功！${renewingStudent.name} 新增 ${values.totalLessons} 课时`);
      setRenewalModalVisible(false);
      fetchRenewalStudents();
    } catch (error: any) {
      console.error('续费失败:', error);
      message.error(error.message || '续费失败');
    }
  };

  // 提交不续费
  const handleNoRenewalSubmit = async (values: any) => {
    try {
      await memfireDB.students.update(renewingStudent.id, {
        renewalStatus: 'no_renewal',
        noRenewalReason: values.reason,
        noRenewalDate: new Date().toISOString(),
      });

      message.success(`已标记 ${renewingStudent.name} 为不续费`);
      setNoRenewalModalVisible(false);
      fetchRenewalStudents();
    } catch (error: any) {
      console.error('标记不续费失败:', error);
      message.error(error.message || '标记不续费失败');
    }
  };

  // 恢复为待续费
  const handleRestoreRenewal = async (student: any) => {
    try {
      await memfireDB.students.update(student.id, {
        renewalStatus: null,
        noRenewalReason: null,
        noRenewalDate: null,
      });
      
      message.success(`已将 ${student.name} 恢复为待续费`);
      fetchNoRenewalStudents();
    } catch (error: any) {
      message.error('操作失败');
    }
  };

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
      fixed: 'left' as const,
    },
    {
      title: '电话',
      dataIndex: 'parentPhone',
      key: 'parentPhone',
      width: 120,
      render: (parentPhone: string, record: any) => parentPhone || record.phone || '-',
    },
    {
      title: '剩余课时',
      dataIndex: 'remainingLessons',
      key: 'remainingLessons',
      width: 90,
      render: (remaining: number) => {
        const color = remaining <= 3 ? 'red' : remaining <= 5 ? 'orange' : 'blue';
        return <Tag color={color}>{remaining || 0} 节</Tag>;
      },
      sorter: (a: any, b: any) => (a.remainingLessons || 0) - (b.remainingLessons || 0),
    },
    {
      title: '总购课数',
      dataIndex: 'totalLessonsPurchased',
      key: 'totalLessonsPurchased',
      width: 90,
      render: (purchased: number) => {
        return <Tag color="green">{purchased || 0} 节</Tag>;
      },
    },
    {
      title: '续费次数',
      dataIndex: 'renewalCount',
      key: 'renewalCount',
      width: 80,
      render: (count: number) => {
        return count ? <Tag color="purple">{count} 次</Tag> : <Tag>首次</Tag>;
      },
    },
    {
      title: '上次续费',
      key: 'lastRenewal',
      width: 120,
      render: (_: any, record: any) => {
        const price = record.lastRenewalPrice;
        const lessons = record.lastRenewalLessons;
        if (price && lessons) {
          return <span style={{ color: '#1890ff' }}>{price}/{lessons}</span>;
        }
        return '-';
      },
    },
    {
      title: '负责教练',
      key: 'teacher',
      width: 100,
      render: (_: any, record: any) => {
        const activeEnrollment = record.enrollments?.find((e: any) => e.status === 'active');
        const teacherName = activeEnrollment?.class?.teacher?.name;
        return teacherName || '-';
      },
    },
    {
      title: '备注',
      dataIndex: 'notes',
      key: 'notes',
      width: 150,
      ellipsis: true,
      render: (notes: string) => notes || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          active: 'green',
          inactive: 'orange',
          graduated: 'blue',
        };
        const textMap: Record<string, string> = {
          active: '活跃',
          inactive: '非活跃',
          graduated: '已毕业',
        };
        return <Tag color={colorMap[status] || 'default'}>{textMap[status] || status}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button 
            type="primary" 
            size="small" 
            icon={<CheckCircleOutlined />}
            onClick={() => handleRenewal(record)}
          >
            续费
          </Button>
          <Button 
            size="small" 
            danger
            icon={<CloseCircleOutlined />}
            onClick={() => handleNoRenewal(record)}
          >
            不续
          </Button>
        </Space>
      ),
    },
  ];

  const noRenewalColumns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
    },
    {
      title: '类型',
      dataIndex: 'status',
      key: 'type',
      width: 90,
      render: (_: any, record: any) => {
        if (record.status === 'graduated') {
          return <Tag color="blue">已毕业</Tag>;
        }
        return <Tag color="orange">不续费</Tag>;
      },
    },
    {
      title: '电话',
      dataIndex: 'parentPhone',
      key: 'parentPhone',
      width: 120,
      render: (parentPhone: string, record: any) => parentPhone || record.phone || '-',
    },
    {
      title: '剩余课时',
      dataIndex: 'remainingLessons',
      key: 'remainingLessons',
      width: 90,
      render: (remaining: number) => <Tag color="default">{remaining || 0} 节</Tag>,
    },
    {
      title: '原因/备注',
      dataIndex: 'noRenewalReason',
      key: 'noRenewalReason',
      width: 200,
      render: (_: any, record: any) => {
        if (record.status === 'graduated') {
          return <span style={{ color: '#1890ff' }}>学员已毕业</span>;
        }
        return record.noRenewalReason || '-';
      },
    },
    {
      title: '标记时间',
      dataIndex: 'noRenewalDate',
      key: 'noRenewalDate',
      width: 120,
      render: (date: string, record: any) => {
        const displayDate = date || record.updatedAt;
        return displayDate ? dayjs(displayDate).format('YYYY-MM-DD') : '-';
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: any) => (
        record.status !== 'graduated' ? (
          <Popconfirm
            title="确定要恢复为待续费吗？"
            onConfirm={() => handleRestoreRenewal(record)}
          >
            <Button type="link" size="small">
              恢复
            </Button>
          </Popconfirm>
        ) : (
          <span style={{ color: '#999' }}>-</span>
        )
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>续费管理</h2>
        <Space>
          <Select
            placeholder="按教练筛选"
            allowClear
            style={{ width: 150 }}
            value={selectedTeacher}
            onChange={handleTeacherFilter}
          >
            {teacherList.map(teacher => (
              <Option key={teacher.id} value={teacher.id}>{teacher.name}</Option>
            ))}
          </Select>
          <Input.Search
            placeholder="搜索姓名、电话"
            allowClear
            style={{ width: 200 }}
            prefix={<SearchOutlined />}
            onSearch={handleSearch}
            onChange={(e) => {
              if (!e.target.value) handleSearch('');
            }}
          />
          <RangePicker
            value={renewalDateRange}
            onChange={handleRenewalDateChange}
            format="YYYY-MM-DD"
            allowClear
            placeholder={['续费开始', '续费结束']}
          />
          <Button icon={<FileExcelOutlined />} disabled>
            导出
          </Button>
        </Space>
      </div>

      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab}
        items={[
          {
            key: 'pending',
            label: (
              <span>
                <UserOutlined /> 待续费学员 ({pagination.total})
              </span>
            ),
            children: (
              <>
                <div style={{ marginBottom: 16, padding: '8px 16px', background: '#fff7e6', borderRadius: 4, border: '1px solid #ffd591' }}>
                  <span style={{ color: '#d46b08' }}>
                    📢 以下学员剩余课时不足10节，请及时跟进续费！
                  </span>
      </div>
      <Table
        columns={columns}
        dataSource={students}
        loading={loading}
        rowKey="id"
        pagination={{
          ...pagination,
          showSizeChanger: true,
                    showTotal: (total) => `共 ${total} 位学员需要续费`,
          onChange: (page, pageSize) => {
            setPagination({ ...pagination, current: page, pageSize });
          },
        }}
                  scroll={{ x: 1100 }}
                />
              </>
            ),
          },
          {
            key: 'no_renewal',
            label: (
              <span>
                <CloseCircleOutlined /> 不续费学员 ({noRenewalPagination.total})
              </span>
            ),
            children: (
              <>
                <div style={{ marginBottom: 16, padding: '8px 16px', background: '#f5f5f5', borderRadius: 4 }}>
                  <span style={{ color: '#666' }}>
                    以下学员已标记为不续费，如需恢复可点击"恢复"按钮
                  </span>
                </div>
                <Table
                  columns={noRenewalColumns}
                  dataSource={noRenewalStudents}
                  loading={noRenewalLoading}
                  rowKey="id"
                  pagination={{
                    ...noRenewalPagination,
                    showSizeChanger: true,
                    showTotal: (total) => `共 ${total} 位学员`,
                    onChange: (page, pageSize) => {
                      setNoRenewalPagination({ ...noRenewalPagination, current: page, pageSize });
                    },
                  }}
                  scroll={{ x: 800 }}
                />
              </>
            ),
          },
        ]}
      />

      {/* 续费弹窗 */}
      <Modal
        title={`学员续费 - ${renewingStudent?.name || ''}`}
        open={renewalModalVisible}
        onCancel={() => setRenewalModalVisible(false)}
        onOk={() => renewalForm.submit()}
        width={500}
      >
        <Form form={renewalForm} onFinish={handleRenewalSubmit} layout="vertical">
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
            <div>学员：<strong>{renewingStudent?.name}</strong></div>
            <div>当前剩余课时：<Tag color="orange">{renewingStudent?.remainingLessons || 0} 节</Tag></div>
            {renewingStudent?.lastRenewalPrice && (
              <div>上次续费：<span style={{ color: '#1890ff' }}>{renewingStudent.lastRenewalPrice}/{renewingStudent.lastRenewalLessons}</span></div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="totalLessons" label="续费课时数" rules={[{ required: true, message: '请输入课时数' }]}>
              <InputNumber min={1} placeholder="课时数" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="price" label="续费金额" rules={[{ required: true, message: '请输入金额' }]}>
              <InputNumber min={0} precision={2} prefix="¥" placeholder="金额" style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="paymentMethod" label="支付方式">
              <Select placeholder="请选择" allowClear>
                <Option value="cash">现金</Option>
                <Option value="wechat">微信</Option>
                <Option value="alipay">支付宝</Option>
                <Option value="card">银行卡</Option>
                <Option value="transfer">转账</Option>
              </Select>
            </Form.Item>
            <Form.Item name="paymentStatus" label="支付状态" rules={[{ required: true }]}>
              <Select placeholder="请选择">
                <Option value="paid">已付款</Option>
                <Option value="pending">待付款</Option>
                <Option value="partial">部分付款</Option>
              </Select>
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="classId" label="续费班级">
              <Select placeholder="请选择班级" allowClear showSearch optionFilterProp="children">
                {classList.map((cls) => (
                  <Option key={cls.id} value={cls.id}>{cls.name}</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="salesId" label="跟进人">
              <Select placeholder="请选择" allowClear showSearch optionFilterProp="children">
                {teacherList.map((staff) => (
                  <Option key={staff.id} value={staff.id}>{staff.name}</Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Form.Item name="conversionDate" label="续费日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="备注信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 不续费弹窗 */}
      <Modal
        title={`标记不续费 - ${renewingStudent?.name || ''}`}
        open={noRenewalModalVisible}
        onCancel={() => setNoRenewalModalVisible(false)}
        onOk={() => noRenewalForm.submit()}
        width={400}
      >
        <Form form={noRenewalForm} onFinish={handleNoRenewalSubmit} layout="vertical">
          <div style={{ marginBottom: 16, padding: 12, background: '#fff2f0', borderRadius: 4, border: '1px solid #ffccc7' }}>
            <div>学员：<strong>{renewingStudent?.name}</strong></div>
            <div>剩余课时：<Tag color="orange">{renewingStudent?.remainingLessons || 0} 节</Tag></div>
          </div>

          <Form.Item 
            name="reason" 
            label="不续费原因" 
            rules={[{ required: true, message: '请选择或填写原因' }]}
          >
            <Select placeholder="请选择原因" allowClear>
              <Option value="价格原因">价格原因</Option>
              <Option value="时间冲突">时间冲突</Option>
              <Option value="搬家/距离远">搬家/距离远</Option>
              <Option value="孩子不想学">孩子不想学</Option>
              <Option value="转其他机构">转其他机构</Option>
              <Option value="课程已学完">课程已学完</Option>
              <Option value="其他原因">其他原因</Option>
            </Select>
          </Form.Item>

          <Form.Item name="remark" label="补充说明">
            <Input.TextArea rows={2} placeholder="可补充详细原因" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RenewalStudents;
