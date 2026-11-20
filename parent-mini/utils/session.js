const KEY = 'greatstart-parent-session';
function get() {
  const value = wx.getStorageSync(KEY);
  return value && value.user && value.user.role === 'parent' && typeof value.token === 'string' ? value : null;
}
function clear() { wx.removeStorageSync(KEY); }
function save(token, user) {
  if (!token || !user || user.role !== 'parent') throw new Error('此小程序仅供家长账号使用');
  wx.setStorageSync(KEY, { token, user: { id: user.id, name: user.name, role: user.role } });
}
module.exports = { get, save, clear };
