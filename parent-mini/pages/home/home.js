const api = require('../../utils/api');
const session = require('../../utils/session');
const format = require('../../utils/format');
Page({
  data: { parentName: '', students: [], selectedIndex: 0, child: null, loading: false, error: '', tab: 'schedules', schedules: [], logs: [], notifications: [], schedulesState: '', logsState: '', notificationsState: '', schedulesError: '', logsError: '', notificationsError: '', schedulePage: 0, hasMore: false, logsPage: 0, notificationsPage: 0, logsHasMore: false, notificationsHasMore: false },
  onLoad() { this.generation = 0; },
  onShow() { const auth = session.get(); if (!auth) { wx.reLaunch({ url: '/pages/login/login' }); return; } this.setData({ parentName: auth.user.name || '家长' }); return this.loadStudents(); },
  onUnload() { this.generation += 1; },
  async onPullDownRefresh() { try { await this.loadStudents(); } finally { wx.stopPullDownRefresh(); } },
  async loadStudents() {
    const generation = ++this.generation;
    const previous = this.data.child && this.data.child.id;
    this.setData({ loading: true, error: '' });
    try {
      const result = await api.request('/parent/students');
      if (generation !== this.generation) return;
      if (!Array.isArray(result.data)) throw new Error('孩子信息格式异常，请联系机构');
      const students = result.data.filter(row => row && typeof row.id === 'string').map(row => ({ ...row, remainingText: format.balance(row.remainingLessons), purchasedText: format.balance(row.purchasedLessons), consumedText: format.balance(row.consumedLessons) }));
      const index = Math.max(0, students.findIndex(row => row.id === previous));
      this.setData({ students, selectedIndex: index, child: students[index] || null, loading: false });
      if (students.length) await this.loadChild();
      else this.setData({ schedules: [], logs: [], notifications: [] });
    } catch (error) { if (generation === this.generation) this.setData({ error: error.message, child: null, students: [], schedules: [], logs: [], notifications: [] }); }
    finally { if (generation === this.generation) this.setData({ loading: false }); }
  },
  changeChild(e) { const index = Number(e.detail.value); if (!this.data.students[index]) return; this.setData({ selectedIndex: index, child: this.data.students[index] }); return this.loadChild(); },
  changeTab(e) { if (['schedules', 'logs', 'notifications'].includes(e.currentTarget.dataset.tab)) this.setData({ tab: e.currentTarget.dataset.tab }); },
  loadChild() {
    const generation = ++this.generation;
    this.scheduleFrom = new Date().toISOString();
    this.setData({ schedules: [], logs: [], notifications: [], schedulePage: 0, hasMore: false, logsPage: 0, notificationsPage: 0, logsHasMore: false, notificationsHasMore: false, schedulesError: '', logsError: '', notificationsError: '' });
    return Promise.all(['schedules', 'logs', 'notifications'].map(section => this.loadSection(section, generation, 1)));
  },
  async loadSection(section, generation, page) {
    if (!this.data.child) return;
    const studentId = this.data.child.id;
    const paths = { schedules: '/parent/schedules/', logs: '/parent/lesson-logs/', notifications: '/parent/notifications/' };
    if (!paths[section]) return;
    this.setData({ [section + 'State']: 'loading', [section + 'Error']: '' });
    const current = () => generation === this.generation && this.data.child && this.data.child.id === studentId;
    try {
      const result = await api.request(paths[section] + encodeURIComponent(studentId), { data: { page: page || 1, pageSize: 20, ...(section === 'schedules' ? { startDate: this.scheduleFrom || new Date().toISOString(), endDate: new Date(Date.now() + 45 * 86400000).toISOString() } : {}) } });
      if (!current()) return;
      if (!Array.isArray(result.data)) throw new Error('返回数据格式异常，请重试');
      const rows = result.data.map(section === 'logs' ? format.log : section === 'schedules' ? format.schedule : row => ({ ...row, time: format.time(row.occurredAt) }));
      const updates = { [section]: page > 1 ? this.data[section].concat(rows) : rows, [section + 'State']: 'ready' };
      updates[section === 'schedules' ? 'schedulePage' : section + 'Page'] = page || 1;
      updates[section === 'schedules' ? 'hasMore' : section + 'HasMore'] = !!(result.pagination && result.pagination.page < result.pagination.totalPages);
      this.setData(updates);
    } catch (error) { if (current()) this.setData({ [section + 'State']: 'error', [section + 'Error']: error.message }); }
  },
  retryStudents() { return this.loadStudents(); },
  retrySection(e) { return this.loadSection(e.currentTarget.dataset.section, this.generation, 1); },
  moreSchedules() { if (this.data.hasMore && this.data.schedulesState !== 'loading') return this.loadSection('schedules', this.generation, this.data.schedulePage + 1); },
  moreRecords(e) { const section = e.currentTarget.dataset.section; if (['logs','notifications'].includes(section) && this.data[section + 'HasMore'] && this.data[section + 'State'] !== 'loading') return this.loadSection(section, this.generation, this.data[section + 'Page'] + 1); },
  logout() { wx.showModal({ title: '退出登录', content: '确认退出当前家长账号？', success: result => { if (result.confirm) { this.generation += 1; session.clear(); this.setData({ child: null, students: [], schedules: [], logs: [], notifications: [] }); wx.reLaunch({ url: '/pages/login/login' }); } } }); }
});
