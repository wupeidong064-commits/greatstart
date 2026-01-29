import { Card, Form, Input, Button, message, Tabs, Alert, Space } from 'antd';
import { LockOutlined, MailOutlined, SafetyOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { memfireAuth } from '../services/memfireAuth';
import { useNavigate } from 'react-router-dom';

const ChangePassword = () => {
  const [loading, setLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  // 方式1：使用原密码修改
  const handleChangePassword = async (values: any) => {
    setLoading(true);
    try {
      const result = await memfireAuth.changePassword(values.oldPassword, values.newPassword);
      if (result.success) {
        message.success('密码修改成功，请重新登录');
        // 登出用户
        await memfireAuth.logout();
        navigate('/login');
      } else {
        message.error(result.error || '密码修改失败');
      }
    } catch (error: any) {
      message.error(error.message || '密码修改失败');
    } finally {
      setLoading(false);
    }
  };

  // 方式2：忘记密码，通过邮箱验证
  const handleSendVerifyCode = async () => {
    const email = resetForm.getFieldValue('email');
    if (!email) {
      message.warning('请输入邮箱地址');
      return;
    }

    setVerifyLoading(true);
    try {
      // MemFire Auth 发送重置密码邮件
      const result = await memfireAuth.resetPassword(email);
      if (result.success || result.data) {
        message.success('验证邮件已发送，请查收邮件并按照提示操作');
        setEmailVerified(true);
      } else {
        message.error(result.error || '发送验证邮件失败');
      }
    } catch (error: any) {
      message.error(error.message || '发送验证邮件失败');
    } finally {
      setVerifyLoading(false);
    }
  };

  // 完成邮箱重置
  const handleCompleteReset = async () => {
    message.info('请通过邮件中的链接完成密码重置');
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ textAlign: 'center', marginBottom: 32 }}>修改密码</h1>

      <Card>
        <Tabs
          items={[
            {
              key: 'with-old-password',
              label: (
                <span>
                  <LockOutlined />
                  原密码修改
                </span>
              ),
              children: (
                <>
                  <Alert
                    message="使用原密码修改"
                    description="如果您记得当前密码，可以直接使用原密码进行修改。"
                    type="info"
                    showIcon
                    style={{ marginBottom: 24 }}
                  />
                  <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleChangePassword}
                    autoComplete="off"
                  >
                    <Form.Item
                      label="原密码"
                      name="oldPassword"
                      rules={[
                        { required: true, message: '请输入原密码' },
                      ]}
                    >
                      <Input.Password
                        prefix={<LockOutlined />}
                        placeholder="请输入原密码"
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item
                      label="新密码"
                      name="newPassword"
                      rules={[
                        { required: true, message: '请输入新密码' },
                        { min: 6, message: '密码长度至少6位' },
                      ]}
                    >
                      <Input.Password
                        prefix={<LockOutlined />}
                        placeholder="请输入新密码（至少6位）"
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item
                      label="确认新密码"
                      name="confirmPassword"
                      dependencies={['newPassword']}
                      rules={[
                        { required: true, message: '请确认新密码' },
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
                      <Input.Password
                        prefix={<LockOutlined />}
                        placeholder="请再次输入新密码"
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item>
                      <Button
                        type="primary"
                        htmlType="submit"
                        loading={loading}
                        size="large"
                        block
                      >
                        修改密码
                      </Button>
                    </Form.Item>
                  </Form>
                </>
              ),
            },
            {
              key: 'forgot-password',
              label: (
                <span>
                  <MailOutlined />
                  忘记密码
                </span>
              ),
              children: (
                <>
                  <Alert
                    message="忘记密码"
                    description="如果您忘记了密码，可以通过邮箱验证身份后重置密码。我们将发送一封包含重置链接的邮件到您的邮箱。"
                    type="warning"
                    showIcon
                    style={{ marginBottom: 24 }}
                  />

                  {!emailVerified ? (
                    <Form
                      form={resetForm}
                      layout="vertical"
                      autoComplete="off"
                    >
                      <Form.Item
                        label="邮箱地址"
                        name="email"
                        initialValue={user?.email}
                        rules={[
                          { required: true, message: '请输入邮箱地址' },
                          { type: 'email', message: '请输入有效的邮箱地址' },
                        ]}
                      >
                        <Input
                          prefix={<MailOutlined />}
                          placeholder="请输入您的邮箱地址"
                          size="large"
                        />
                      </Form.Item>

                      <Form.Item>
                        <Button
                          type="primary"
                          onClick={handleSendVerifyCode}
                          loading={verifyLoading}
                          size="large"
                          block
                          icon={<MailOutlined />}
                        >
                          发送验证邮件
                        </Button>
                      </Form.Item>

                      <div style={{ marginTop: 16, textAlign: 'center', color: '#999', fontSize: 14 }}>
                        <SafetyOutlined style={{ marginRight: 8 }} />
                        验证邮件将在24小时内有效
                      </div>
                    </Form>
                  ) : (
                    <Space direction="vertical" style={{ width: '100%' }} size={16}>
                      <Alert
                        message="邮件已发送"
                        description={`我们已向 ${resetForm.getFieldValue('email')} 发送了密码重置邮件。请查收邮件并点击邮件中的链接完成密码重置。`}
                        type="success"
                        showIcon
                      />

                      <Button
                        type="primary"
                        onClick={handleCompleteReset}
                        size="large"
                        block
                      >
                        我已收到邮件
                      </Button>

                      <Button
                        onClick={() => {
                          setEmailVerified(false);
                          resetForm.resetFields();
                        }}
                        size="large"
                        block
                      >
                        重新发送邮件
                      </Button>
                    </Space>
                  )}
                </>
              ),
            },
          ]}
        />
      </Card>

      <div style={{ marginTop: 24, textAlign: 'center', color: '#999', fontSize: 14 }}>
        <Space>
          <span>如果遇到问题，请联系系统管理员</span>
        </Space>
      </div>
    </div>
  );
};

export default ChangePassword;
