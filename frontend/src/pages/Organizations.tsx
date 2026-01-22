import { useState, useEffect } from 'react';
import { Table, Button, message } from 'antd';
import { BankOutlined } from '@ant-design/icons';
import api from '../services/api';

const Organizations = () => {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    setLoading(true);
    try {
      const response = await api.get('/organizations');
      setOrganizations(response.data.data || []);
    } catch (error) {
      message.error('获取机构列表失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: '机构名称', dataIndex: 'name', key: 'name' },
    { title: '机构代码', dataIndex: 'code', key: 'code' },
    { title: '地址', dataIndex: 'address', key: 'address' },
    { title: '电话', dataIndex: 'phone', key: 'phone' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h1>机构管理</h1>
        <Button type="primary" icon={<BankOutlined />}>
          新增机构
        </Button>
      </div>
      <Table columns={columns} dataSource={organizations} loading={loading} rowKey="id" />
    </div>
  );
};

export default Organizations;

