import { Table, Button, Space, message, Modal, Form, Input, InputNumber, DatePicker, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import api from '../services/api';
import { dataService } from '../services/dataService';
import { normalizeRole } from '../utils/dataFilter';
import { useAuthStore } from '../store/authStore';
import dayjs from 'dayjs';

interface StaffUser {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

const MarketingPool = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [form] = Form.useForm();
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<string | undefined>(undefined);
  const [searchKeyword, setSearchKeyword] = useState('');

  // 权限检查
  const user = useAuthStore((state) => state.user);
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;
  const canManageAll = normalizedRole === 'admin' || normalizedRole === 'manager';

  useEffect(() => {
    fetchData();
    fetchStaffList();
  }, [pagination.current, pagination.pageSize, selectedAssignee]);

  // 获取工作人员列表（用于负责人选择，使用缓存）
  const fetchStaffList = async () => {
    try {
      const data = await dataService.getTeachers();
      setStaffList(data);
    } catch (error) {
      console.error('获取工作人员列表失败:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // 对于 admin 和 manager，支持按负责人筛选
      const params: any = {
        page: pagination.current,
        pageSize: pagination.pageSize,
      };

      // 非管理人员只能看到自己负责的线索（防止翘单）
      if (!canManageAll && user?.id) {
        params.assigneeId = user.id;
      } else if (selectedAssignee) {
        // 管理人员可以按负责人筛选
        params.assigneeId = selectedAssignee;
      }

      // 如果有搜索关键词，添加搜索条件
      if (searchKeyword) {
        params.search = searchKeyword;
      }

      const response = await api.get('/leads', { params });
      setData(response.data || []);
      if (response.pagination) {
        setPagination({
          ...pagination,
          total: response.pagination.total || 0,
        });
      }
    } catch (error: any) {
      console.error('获取线索列表失败:', error);
      message.error(error.message || '获取线索列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 重置筛选
  const handleResetFilter = () => {
    setSelectedAssignee(undefined);
    setSearchKeyword('');
    setPagination({ ...pagination, current: 1 });
  };

  const handleAdd = () => {
    setEditingRecord(null);
    form.resetFields();
    // 非管理人员默认分配给自己
    if (!canManageAll && user?.id) {
      form.setFieldsValue({ assigneeId: user.id });
    }
    setModalVisible(true);
  };

  const handleEdit = (record: any) => {
    // 非管理人员只能编辑自己负责的线索
    if (!canManageAll && record.assigneeId !== user?.id) {
      message.warning('您只能编辑自己负责的线索');
      return;
    }
    setEditingRecord(record);
    form.setFieldsValue({
      ...record,
      lastContactAt: record.lastContactAt ? dayjs(record.lastContactAt) : undefined,
      assigneeId: record.assigneeId || undefined,
    });
    setModalVisible(true);
  };

  const handleUpdateContactTime = async (id: string) => {
    try {
      await api.put(`/leads/${id}/contact`);
      message.success('已更新最近联系时间');
      fetchData();
    } catch (error: any) {
      message.error(error.message || '更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    // 先获取线索详情，检查权限
    const record = data.find(item => item.id === id);
    if (!canManageAll && record?.assigneeId !== user?.id) {
      message.warning('您只能删除自己负责的线索');
      return;
    }

    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该线索吗？',
      onOk: async () => {
        try {
          await api.delete(`/leads/${id}`);
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
      // 获取选中的负责人信息
      const selectedStaff = staffList.find(s => s.id === values.assigneeId);

      if (editingRecord) {
        // 编辑时包含最近联系时间和负责人
        const submitData = {
          customerName: values.customerName,
          age: values.age || null,
          contact: values.contact,
          notes: values.notes || null,
          lastContactAt: values.lastContactAt ? values.lastContactAt.toISOString() : undefined,
          assigneeId: values.assigneeId || null,
          assigneeName: selectedStaff?.name || null,
        };
        await api.put(`/leads/${editingRecord.id}`, submitData);
        message.success('更新成功');
      } else {
        // 新增时提交：姓名、年龄、联系方式、备注、负责人
        const submitData = {
          customerName: values.customerName,
          age: values.age || null,
          contact: values.contact,
          notes: values.notes || null,
          assigneeId: values.assigneeId || null,
          assigneeName: selectedStaff?.name || null,
        };
        await api.post('/leads', submitData);
        message.success('创建成功');
      }
      setModalVisible(false);
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

  const columns = [
    {
      title: '姓名',
      dataIndex: 'customerName',
      key: 'customerName',
      width: 120,
    },
    {
      title: '年龄',
      dataIndex: 'age',
      key: 'age',
      width: 80,
      render: (age: number) => age || '-',
    },
    {
      title: '联系方式',
      dataIndex: 'contact',
      key: 'contact',
      width: 150,
    },
    {
      title: '负责人',
      dataIndex: 'assigneeName',
      key: 'assigneeName',
      width: 120,
      render: (name: string) => name || <span style={{ color: '#999' }}>未分配</span>,
    },
    {
      title: '添加时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '最近联系时间',
      dataIndex: 'lastContactAt',
      key: 'lastContactAt',
      width: 180,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '备注',
      dataIndex: 'notes',
      key: 'notes',
      ellipsis: true,
      render: (text: string) => text || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleUpdateContactTime(record.id)}>
            更新联系时间
          </Button>
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>营销与销售（鱼池）</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增线索
        </Button>
      </div>

      {/* 筛选栏 */}
      {canManageAll && (
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="筛选负责人"
            allowClear
            showSearch
            optionFilterProp="children"
            style={{ width: 200 }}
            value={selectedAssignee}
            onChange={(value) => {
              setSelectedAssignee(value);
              setPagination({ ...pagination, current: 1 });
            }}
            filterOption={(input, option) =>
              (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
            }
          >
            {staffList.map(staff => (
              <Select.Option key={staff.id} value={staff.id}>
                {staff.name}
              </Select.Option>
            ))}
          </Select>
          <Input
            placeholder="搜索姓名或联系方式"
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: 250 }}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onPressEnter={() => setPagination({ ...pagination, current: 1 })}
          />
          <Button onClick={() => setPagination({ ...pagination, current: 1 })} icon={<SearchOutlined />}>
            搜索
          </Button>
          <Button onClick={handleResetFilter}>
            重置
          </Button>
        </Space>
      )}

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
        scroll={{ x: 1000 }}
      />
      <Modal
        title={editingRecord ? '编辑线索' : '新增线索'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item name="customerName" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item name="age" label="年龄">
            <InputNumber min={0} max={150} placeholder="请输入年龄" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="contact" label="联系方式" rules={[{ required: true, message: '请输入联系方式' }]}>
            <Input placeholder="请输入联系方式（手机号）" />
          </Form.Item>
          {/* 非管理人员不能修改负责人，防止翘单 */}
          {canManageAll ? (
            <Form.Item name="assigneeId" label="负责人">
              <Select
                placeholder="选择负责人"
                allowClear
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                }
              >
                {staffList.map(staff => (
                  <Select.Option key={staff.id} value={staff.id}>
                    {staff.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          ) : (
            <Form.Item name="assigneeId" label="负责人">
              <Select disabled value={user?.id}>
                <Select.Option key={user?.id} value={user?.id}>
                  {user?.name} (自己)
                </Select.Option>
              </Select>
            </Form.Item>
          )}
          {editingRecord && (
            <Form.Item name="lastContactAt" label="最近联系时间">
              <DatePicker 
                showTime
                format="YYYY-MM-DD HH:mm"
                style={{ width: '100%' }} 
                placeholder="选择最近联系时间"
              />
            </Form.Item>
          )}
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={4} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MarketingPool;

