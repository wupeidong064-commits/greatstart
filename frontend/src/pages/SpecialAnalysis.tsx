import { Card, message } from 'antd';
import { useState, useEffect } from 'react';
import api from '../services/api';

const SpecialAnalysis = () => {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // TODO: 实现专项分析数据获取
    message.info('专项分析功能开发中...');
  }, []);

  return (
    <div>
      <h1>专项分析</h1>
      <Card>
        <p>此功能正在开发中，将用于进行专项数据分析和报告。</p>
      </Card>
    </div>
  );
};

export default SpecialAnalysis;

