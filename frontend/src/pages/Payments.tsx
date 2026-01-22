import { Card, Table, Button, Space, Tag, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import api from '../services/api';
import dayjs from 'dayjs';

const Payments = () => {
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const response = await api.get('/payments');
      if (response.success) {
        setPayments(response.data || []);
      }
    } catch (error) {
      message.error('获取收款记录失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '学员',
      dataIndex: ['student', 'name'],
      key: 'studentName',
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => `¥${amount}`,
    },
    {
      title: '缴费类型',
      dataIndex: 'paymentType',
      key: 'paymentType',
      render: (type: string) => {
        const typeMap: Record<string, string> = {
          tuition: '学费',
          material: '材料费',
          other: '其他',
        };
        return typeMap[type] || type;
      },
    },
    {
      title: '缴费方式',
      dataIndex: 'paymentMethod',
      key: 'paymentMethod',
    },
    {
      title: '缴费时间',
      dataIndex: 'paidAt',
      key: 'paidAt',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h1>收款记录</h1>
        <Button type="primary" icon={<PlusOutlined />}>
          新增收款
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={payments}
        loading={loading}
        rowKey="id"
      />
    </div>
  );
};

export default Payments;

