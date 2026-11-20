const api = require('../../utils/api');
const session = require('../../utils/session');
Page({
  data: { identity: '', password: '', error: '', busy: false },
  onShow() { if (session.get()) wx.reLaunch({ url: '/pages/home/home' }); },
  onIdentity(e) { this.setData({ identity: e.detail.value }); },
  onPassword(e) { this.setData({ password: e.detail.value }); },
  async submit() {
    if (this.data.busy) return;
    const identity = this.data.identity.trim(), password = this.data.password;
    if (!identity || !password) { this.setData({ error: '请填写账号与密码' }); return; }
    const phone = /^1[3-9]\d{9}$/.test(identity);
    if (!phone && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity)) { this.setData({ error: '请输入有效手机号或邮箱' }); return; }
    this.setData({ busy: true, error: '' });
    try {
      const result = await api.request(phone ? '/auth/login-phone' : '/auth/login', { public: true, method: 'POST', data: { [phone ? 'phone' : 'email']: identity, password } });
      session.save(result.data && result.data.token, result.data && result.data.user);
      this.setData({ password: '' }); wx.reLaunch({ url: '/pages/home/home' });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ busy: false }); }
  }
});
