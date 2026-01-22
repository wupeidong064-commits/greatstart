import { Card, Table, Button, Space, Tag, message } from 'antd';
import { PlusOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import api from '../services/api';

const ExpensesAndReports = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);

  useEffect(() => {
    // TODO: 实现支出与报表数据获取
    message.info('支出与报表功能开发中...');
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h1>支出与报表</h1>
        <Space>
          <Button icon={<PlusOutlined />}>新增支出</Button>
          <Button icon={<FileExcelOutlined />}>导出报表</Button>
        </Space>
      </div>
      <Card>
        <p>此功能正在开发中，将用于管理支出记录和生成财务报表。</p>
      </Card>
    </div>
  );
};

export default ExpensesAndReports;

