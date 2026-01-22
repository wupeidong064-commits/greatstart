import { useState } from 'react';
import { Form, Input, Button, Card, message, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { memfireAuth } from '../services/memfireAuth';
import { useAuthStore } from '../store/authStore';

const Login = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      const data = await memfireAuth.signIn(values.email, values.password);

      if (!data.session || !data.user) {
        message.error('登录失败：未获取到会话信息');
        return;
      }

      const token = data.session.access_token;

      // 从 Profile 中补充信息（如果有）
      const profile = await memfireAuth.getCurrentUser();

      // 确保从数据库获取最新的用户信息，包括organizationId
      let finalOrganizationId = profile?.organizationId;
      let finalCampusId = profile?.campusId;
      
      // 如果profile中没有organizationId，尝试从users表直接查询
      if (!finalOrganizationId && data.user.id) {
        try {
          const { memfire } = await import('../lib/memfire');
          if (memfire) {
            const { data: userData, error: userError } = await memfire
              .from('users')
              .select('*')
              .eq('id', data.user.id)
              .single();
            
            if (userError) {
              console.error('从users表获取机构信息失败:', userError);
            } else if (userData) {
              // 尝试不同的列名格式（处理大小写和下划线问题）
              finalOrganizationId = userData.organizationId || userData.organizationid || userData.organization_id || undefined;
              finalCampusId = userData.campusId || userData.campusid || userData.campus_id || undefined;
              
              if (finalOrganizationId) {
                console.log('登录时成功获取机构ID:', finalOrganizationId);
              } else {
                console.warn('用户数据中没有找到机构ID，用户数据:', userData);
              }
            }
          }
        } catch (e) {
          console.error('从users表获取机构信息异常:', e);
        }
      }

      setAuth(token, {
        id: data.user.id,
        email: data.user.email || values.email,
        name: (profile && profile.name) || data.user.user_metadata?.name || '',
        role: (profile && profile.role) || 'user',
        organizationId: finalOrganizationId,
        campusId: finalCampusId,
      });

      message.success('登录成功');
      navigate('/operation/consumption');
    } catch (error: any) {
      console.error('登录错误详情:', error);
      const errorMessage = error.message || '登录失败，请稍后重试';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Card
        title="智能课务系统"
        style={{ width: 400 }}
        headStyle={{ textAlign: 'center', fontSize: '24px', fontWeight: 'bold' }}
      >
        <Form
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          size="large"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="邮箱"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
            />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Typography.Text type="secondary" style={{ float: 'right' }}>
              还没有账号？ <Link to="/register">去注册</Link>
            </Typography.Text>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Login;

