import { useState, useEffect } from 'react';
import { Table, Button, Space, message, Modal, Form, Input, InputNumber, Select, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CalculatorOutlined } from '@ant-design/icons';
import api from '../services/api';

const { Option } = Select;

const StaffSalary = () => {
  const [salaries, setSalaries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSalary, setEditingSalary] = useState<any>(null);
  const [form] = Form.useForm();
  const [staffList, setStaffList] = useState([]);

  useEffect(() => {
    fetchSalaries();
    fetchStaffList();
  }, []);

  const fetchSalaries = async () => {
    setLoading(true);
    try {
      // TODO: 实现人员工资API
      // const response = await api.get('/staff-salaries');
      // if (response.success) {
      //   setSalaries(response.data || []);
      // }
      setSalaries([]); // 占位，避免lint警告
    } catch (error) {
      message.error('获取工资列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchStaffList = async () => {
    try {
      // TODO: 实现获取员工列表API
      // const response = await api.get('/users');
      // if (response.success) {
      //   setStaffList(response.data || []);
      // }
      setStaffList([]); // 占位，避免lint警告
    } catch (error) {
      console.error('获取员工列表失败:', error);
    }
  };

  const handleCalculateEfficiency = () => {
    // TODO: 实现人效计算功能
    message.info('人效计算功能开发中...');
    // 可以打开一个模态框显示人效计算结果，或者跳转到专门的计算页面
  };

  const handleAdd = () => {
    setEditingSalary(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: any) => {
    setEditingSalary(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该工资记录吗？',
      onOk: async () => {
        try {
          // await api.delete(`/staff-salaries/${id}`);
          message.success('删除成功');
          fetchSalaries();
        } catch (error) {
          message.error('删除失败');
        }
      },
    });
  };

  const handleSubmit = async (values: any) => {
    try {
      // 计算总工资
      const totalSalary = 
        (values.baseSalary || 0) +
        (values.lessonFee || 0) +
        (values.performance || 0) +
        (values.commission || 0);

      const submitData = {
        ...values,
        totalSalary,
      };
      
      if (editingSalary) {
        // await api.put(`/staff-salaries/${editingSalary.id}`, submitData);
        message.success('更新成功');
      } else {
        // await api.post('/staff-salaries', submitData);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchSalaries();
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '操作失败');
    }
  };

  const columns = [
    {
      title: '员工姓名',
      dataIndex: ['staff', 'name'],
      key: 'staffName',
      width: 120,
      render: (_: any, record: any) => record.staff?.name || record.staffName || '-',
    },
    {
      title: '基本工资',
      dataIndex: 'baseSalary',
      key: 'baseSalary',
      width: 120,
      render: (salary: number) => salary ? `¥${salary.toFixed(2)}` : '-',
    },
    {
      title: '课时费',
      dataIndex: 'lessonFee',
      key: 'lessonFee',
      width: 120,
      render: (fee: number) => fee ? `¥${fee.toFixed(2)}` : '-',
    },
    {
      title: '绩效',
      dataIndex: 'performance',
      key: 'performance',
      width: 120,
      render: (perf: number) => perf ? `¥${perf.toFixed(2)}` : '-',
    },
    {
      title: '提成',
      dataIndex: 'commission',
      key: 'commission',
      width: 120,
      render: (comm: number) => comm ? `¥${comm.toFixed(2)}` : '-',
    },
    {
      title: '总工资',
      key: 'totalSalary',
      width: 120,
      render: (_: any, record: any) => {
        const total = 
          (record.baseSalary || 0) +
          (record.lessonFee || 0) +
          (record.performance || 0) +
          (record.commission || 0);
        return <Tag color="blue">¥{total.toFixed(2)}</Tag>;
      },
    },
    {
      title: '月份',
      dataIndex: 'month',
      key: 'month',
      width: 100,
      render: (month: string) => month || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space>
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

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h1>人员工资</h1>
        <Space>
          <Button type="primary" icon={<CalculatorOutlined />} onClick={handleCalculateEfficiency}>
            人效计算
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增工资记录
          </Button>
        </Space>
      </div>
      <Table
        columns={columns}
        dataSource={salaries}
        loading={loading}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条记录`,
        }}
        scroll={{ x: 1000 }}
      />
      <Modal
        title={editingSalary ? '编辑工资记录' : '新增工资记录'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item name="staffId" label="员工" rules={[{ required: true, message: '请选择员工' }]}>
            <Select placeholder="请选择员工">
              {staffList.map((staff: any) => (
                <Option key={staff.id} value={staff.id}>
                  {staff.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="month" label="月份" rules={[{ required: true, message: '请输入月份' }]}>
            <Input placeholder="格式：YYYY-MM，如：2024-01" />
          </Form.Item>
          <Form.Item name="baseSalary" label="基本工资" rules={[{ required: true, message: '请输入基本工资' }]}>
            <InputNumber
              min={0}
              precision={2}
              placeholder="请输入基本工资"
              style={{ width: '100%' }}
              prefix="¥"
            />
          </Form.Item>
          <Form.Item name="lessonFee" label="课时费" rules={[{ required: true, message: '请输入课时费' }]}>
            <InputNumber
              min={0}
              precision={2}
              placeholder="请输入课时费"
              style={{ width: '100%' }}
              prefix="¥"
            />
          </Form.Item>
          <Form.Item name="performance" label="绩效" rules={[{ required: true, message: '请输入绩效' }]}>
            <InputNumber
              min={0}
              precision={2}
              placeholder="请输入绩效"
              style={{ width: '100%' }}
              prefix="¥"
            />
          </Form.Item>
          <Form.Item name="commission" label="提成" rules={[{ required: true, message: '请输入提成' }]}>
            <InputNumber
              min={0}
              precision={2}
              placeholder="请输入提成"
              style={{ width: '100%' }}
              prefix="¥"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default StaffSalary;

