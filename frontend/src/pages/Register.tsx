import { useState } from 'react';
import { Form, Input, Button, Card, message, Typography } from 'antd';
import { UserOutlined, LockOutlined, MobileOutlined, SafetyOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';

const Register = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [form] = Form.useForm();

  // 发送验证码
  const sendSmsCode = async () => {
    try {
      const phone = form.getFieldValue('phone');
      if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        message.error('请输入有效的手机号');
        return;
      }

      const response = await authService.sendOtp({ phone });
      if (response.success) {
        message.success('验证码已发送');
        setCountdown(60);
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        message.error(response.message || '发送失败');
      }
    } catch (error: any) {
      console.error('发送验证码错误:', error);
      message.error(error.response?.data?.message || '发送失败');
    }
  };

  const onFinish = async (values: { phone: string; password: string; confirmPassword: string; name: string; smsCode: string }) => {
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const response = await authService.registerByPhone({
        phone: values.phone,
        password: values.password,
        name: values.name,
        smsCode: values.smsCode,
      });

      if (response.success) {
        message.success('注册成功，请登录');
        navigate('/login');
      } else {
        message.error(response.message || '注册失败');
      }
    } catch (error: any) {
      console.error('注册错误详情:', error);
      const errorMessage = error.response?.data?.message || error.message || '注册失败，请稍后重试';
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
        title="注册账号"
        style={{ width: 420 }}
        styles={{ header: { textAlign: 'center', fontSize: '24px', fontWeight: 'bold' } }}
      >
        <Form
          form={form}
          name="register"
          onFinish={onFinish}
          autoComplete="off"
          size="large"
          layout="vertical"
        >
          <Form.Item
            label="姓名"
            name="name"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="请输入姓名"
            />
          </Form.Item>

          <Form.Item
            label="手机号"
            name="phone"
            rules={[
              { required: true, message: '请输入手机号' },
              { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号' },
            ]}
          >
            <Input
              prefix={<MobileOutlined />}
              placeholder="请输入手机号"
            />
          </Form.Item>

          <Form.Item
            label="验证码"
            name="smsCode"
            rules={[{ required: true, message: '请输入验证码' }]}
          >
            <Input
              prefix={<SafetyOutlined />}
              placeholder="请输入验证码"
              addonAfter={
                <Button
                  type="link"
                  size="small"
                  disabled={countdown > 0}
                  onClick={sendSmsCode}
                  style={{ padding: 0, height: 'auto' }}
                >
                  {countdown > 0 ? `${countdown}秒后重发` : '获取验证码'}
                </Button>
              }
            />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6位' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入密码"
            />
          </Form.Item>

          <Form.Item
            label="确认密码"
            name="confirmPassword"
            rules={[{ required: true, message: '请再次输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请再次输入密码"
            />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              注册
            </Button>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Typography.Text type="secondary" style={{ float: 'right' }}>
              已有账号？ <Link to="/login">去登录</Link>
            </Typography.Text>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Register;
