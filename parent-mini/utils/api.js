const config = require('../config');
const session = require('./session');
function baseUrl() {
  const base = String(config.apiBaseUrl || '').replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/?#]+(?:\/[^\s?#]*)?$/.test(base) || /[?#@]/.test(base)) throw new Error('请先配置真实 HTTPS 后端地址，并在微信后台登记 request 合法域名');
  return base;
}
function request(path, options) {
  const opts = options || {};
  return new Promise((resolve, reject) => {
    let base; try { base = baseUrl(); } catch (e) { reject(e); return; }
    const auth = session.get();
    if (!opts.public && !auth) { reject(new Error('请先使用家长账号登录')); return; }
    const token = auth ? auth.token : null;
    wx.request({ url: base + path, method: opts.method || 'GET', data: opts.data || {}, timeout: 15000,
      header: { 'content-type': 'application/json', ...(!opts.public ? { Authorization: 'Bearer ' + token } : {}) },
      success(response) {
        if (!opts.public && (!session.get() || session.get().token !== token)) { reject(new Error('登录状态已变化，请重新加载')); return; }
        if (response.statusCode === 401 && !opts.public) { session.clear(); wx.reLaunch({ url: '/pages/login/login' }); reject(new Error('登录已过期，请重新登录')); return; }
        const payload = response.data;
        if (response.statusCode < 200 || response.statusCode >= 300 || !payload || payload.success !== true) { const message = payload && (payload.message || payload.error && payload.error.message); const error = new Error(typeof message === 'string' ? message : '请求失败，请稍后重试'); error.statusCode = response.statusCode; reject(error); return; }
        resolve(payload);
      }, fail() { reject(new Error('网络连接失败，请检查网络和服务地址后重试')); }
    });
  });
}
module.exports = { request, baseUrl };
