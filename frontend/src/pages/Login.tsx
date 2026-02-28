import { useState } from 'react';
import { Form, Input, Button, Card, message, Typography, Tabs, Modal } from 'antd';
import { UserOutlined, LockOutlined, MobileOutlined, SafetyOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import { useAuthStore } from '../store/authStore';

// 账号登录表单
interface AccountLoginForm {
  account: string; // 可以是邮箱或手机号
  password: string;
}

// 验证码登录表单
interface OtpLoginForm {
  phone: string;
  otpCode: string;
}

// 处理登录成功后的跳转
const handleLoginSuccess = (
  token: string,
  user: any,
  setAuth: any,
  navigate: any
) => {
  // 设置认证状态
  setAuth(token, {
    id: user.id,
    email: user.email || '',
    phone: user.phone || '',
    name: user.name || '',
    role: user.role,
    organizationId: user.organizationId,
    campusId: user.campusId,
  });

  message.success('登录成功');

  // 根据角色跳转到不同页面
  if (user.role === 'admin') {
    navigate('/organizations'); // 系统管理员跳转到机构管理
  } else if (user.role === 'parent') {
    navigate('/student/schedules'); // 学员跳转到我的课表
  } else {
    navigate('/operation/consumption'); // 其他角色跳转到运营数据
  }
};

// 账号登录组件
const AccountLogin = ({ loading, setLoading, setAuth, navigate }: any) => {
  const onFinish = async (values: AccountLoginForm) => {
    setLoading(true);
    try {
      const { account, password } = values;
      // 判断是邮箱还是手机号
      const isEmail = account.includes('@');

      let response;
      if (isEmail) {
        // 邮箱登录
        response = await authService.login({ email: account, password });
      } else {
        // 手机号登录
        response = await authService.loginByPhone({ phone: account, password });
      }

      if (!response.success || !response.data) {
        message.error(response.message || '登录失败');
        return;
      }

      const { token, user } = response.data;
      handleLoginSuccess(token, user, setAuth, navigate);
    } catch (error: any) {
      console.error('登录错误详情:', error);
      const errorMessage = error.response?.data?.message || error.message || '登录失败，请稍后重试';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form
      name="account-login"
      onFinish={onFinish}
      autoComplete="off"
      size="large"
    >
      <Form.Item
        name="account"
        rules={[{ required: true, message: '请输入邮箱或手机号' }]}
      >
        <Input
          prefix={<UserOutlined />}
          placeholder="邮箱或手机号"
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
    </Form>
  );
};

// 验证码登录组件
const OtpLogin = ({ loading, setLoading, setAuth, navigate }: any) => {
  const [countdown, setCountdown] = useState(0);
  const [form] = Form.useForm();

  // 发送验证码
  const sendOtp = async () => {
    try {
      const phone = form.getFieldValue('phone');
      if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        message.error('请输入有效的手机号');
        return;
      }

      const response = await authService.sendOtp({ phone });
      if (response.success) {
        message.success('验证码已发送');
        // 开始倒计时
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

  const onFinish = async (values: OtpLoginForm) => {
    setLoading(true);
    try {
      const response = await authService.verifyOtp({
        phone: values.phone,
        token: values.otpCode,
      });

      if (!response.success || !response.data) {
        message.error(response.message || '登录失败');
        return;
      }

      const { token, user } = response.data;
      handleLoginSuccess(token, user, setAuth, navigate);
    } catch (error: any) {
      console.error('验证码登录错误:', error);
      const errorMessage = error.response?.data?.message || error.message || '登录失败，请稍后重试';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form
      form={form}
      name="otp-login"
      onFinish={onFinish}
      autoComplete="off"
      size="large"
    >
      <Form.Item
        name="phone"
        rules={[
          { required: true, message: '请输入手机号' },
          { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号' },
        ]}
      >
        <Input
          prefix={<MobileOutlined />}
          placeholder="手机号"
        />
      </Form.Item>

      <Form.Item
        name="otpCode"
        rules={[{ required: true, message: '请输入验证码' }]}
      >
        <Input
          prefix={<SafetyOutlined />}
          placeholder="验证码"
          addonAfter={
            <Button
              type="link"
              size="small"
              disabled={countdown > 0}
              onClick={sendOtp}
              style={{ padding: 0, height: 'auto' }}
            >
              {countdown > 0 ? `${countdown}秒后重发` : '获取验证码'}
            </Button>
          }
        />
      </Form.Item>

      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          登录
        </Button>
      </Form.Item>
    </Form>
  );
};

const Login = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotForm] = Form.useForm();
  const [countdown, setCountdown] = useState(0);
  const [resetLoading, setResetLoading] = useState(false);

  const tabItems = [
    {
      key: 'account',
      label: '账号登录',
      children: (
        <AccountLogin
          loading={loading}
          setLoading={setLoading}
          setAuth={setAuth}
          navigate={navigate}
        />
      ),
    },
    {
      key: 'otp',
      label: '验证码登录',
      children: (
        <OtpLogin
          loading={loading}
          setLoading={setLoading}
          setAuth={setAuth}
          navigate={navigate}
        />
      ),
    },
  ];

  // 发送重置密码验证码
  const sendResetOtp = async () => {
    try {
      const phone = forgotForm.getFieldValue('phone');
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

  // 重置密码
  const handleResetPassword = async (values: any) => {
    setResetLoading(true);
    try {
      const response = await authService.resetPassword({
        phone: values.phone,
        token: values.otpCode,
        newPassword: values.newPassword,
      });

      if (response.success) {
        message.success('密码重置成功，请使用新密码登录');
        setForgotModalVisible(false);
        forgotForm.resetFields();
      } else {
        message.error(response.message || '重置失败');
      }
    } catch (error: any) {
      console.error('重置密码错误:', error);
      message.error(error.response?.data?.message || '重置失败');
    } finally {
      setResetLoading(false);
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
        styles={{ header: { textAlign: 'center', fontSize: '24px', fontWeight: 'bold' } }}
      >
        <Tabs defaultActiveKey="account" items={tabItems} centered />

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <Typography.Link onClick={() => setForgotModalVisible(true)}>
            忘记密码？
          </Typography.Link>
          <Typography.Text type="secondary">
            还没有账号？ <Link to="/register">去注册</Link>
          </Typography.Text>
        </div>
      </Card>

      {/* 忘记密码弹窗 */}
      <Modal
        title="重置密码"
        open={forgotModalVisible}
        onCancel={() => {
          setForgotModalVisible(false);
          forgotForm.resetFields();
        }}
        footer={null}
        width={400}
      >
        <Form
          form={forgotForm}
          onFinish={handleResetPassword}
          layout="vertical"
        >
          <Form.Item
            name="phone"
            label="手机号"
            rules={[
              { required: true, message: '请输入手机号' },
              { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号' },
            ]}
          >
            <Input prefix={<MobileOutlined />} placeholder="请输入手机号" />
          </Form.Item>

          <Form.Item
            name="otpCode"
            label="验证码"
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
                  onClick={sendResetOtp}
                  style={{ padding: 0, height: 'auto' }}
                >
                  {countdown > 0 ? `${countdown}秒后重发` : '获取验证码'}
                </Button>
              }
            />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6位' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入新密码" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="确认密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请再次输入新密码" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={resetLoading}>
              重置密码
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Login;
