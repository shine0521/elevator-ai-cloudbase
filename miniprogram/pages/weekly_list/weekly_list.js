// M-05 周排查列表
const req = require('../../utils/request.js');
Page({
  data: {
    loading: true,
    list: [],
    activeTab: 'all',
    tabs: [
      { key: 'all',      label: '全部' },
      { key: 'pending',  label: '待执行' },
      { key: 'ongoing',  label: '执行中' },
      { key: 'completed',label: '已完成' }
    ]
  },
  onLoad() { this.load(); },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load(() => wx.stopPullDownRefresh()); },
  load(cb) {
    req.get('/api/mobile/weekly').then(d => {
      const arr = d.data || d || [];
      this.setData({ list: arr, loading: false });
      if (cb) cb();
    }).catch(() => { this.setData({ loading: false }); if (cb) cb(); });
  },
  switchTab(e) { this.setData({ activeTab: e.currentTarget.dataset.tab }); },
  filteredList() {
    const tab = this.data.activeTab;
    if (tab === 'all') return this.data.list;
    return this.data.list.filter(x => x.status === tab);
  },
  goForm(e) {
    const id = e.currentTarget ? e.currentTarget.dataset.id : null;
    if (id) {
      wx.navigateTo({ url: `/pages/weekly_form/weekly_form?id=${id}` });
    } else {
      wx.navigateTo({ url: '/pages/weekly_form/weekly_form' });
    }
  },
  statusLabel(status) {
    const m = { pending: '待执行', ongoing: '执行中', completed: '已完成' };
    return m[status] || status || '';
  },
  statusClass(status) {
    const m = { pending: 'tag-warn', ongoing: 'tag-info', completed: 'tag-gray' };
    return m[status] || 'tag-gray';
  }
});
