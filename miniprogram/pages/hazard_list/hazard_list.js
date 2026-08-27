// M-08 隐患排查列表
const req = require('../../utils/request.js');
Page({
  data: {
    loading: true,
    stats: { all: 0, pending: 0, rectifying: 0, verifying: 0, closed: 0 },
    list: [],
    activeTab: 'all'
  },
  onLoad() { this.load(); },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load(() => wx.stopPullDownRefresh()); },
  load(cb) {
    req.get('/api/mobile/hazards?page=1&limit=200').then(d => {
      const arr = d.data || d || [];
      this.setData({
        stats: {
          all:        arr.length,
          pending:    arr.filter(x => x.status === 'pending').length,
          rectifying: arr.filter(x => x.status === 'rectifying').length,
          verifying:  arr.filter(x => x.status === 'verifying').length,
          closed:     arr.filter(x => x.status === 'closed').length
        },
        list: arr,
        loading: false
      });
      if (cb) cb();
    }).catch(() => {
      this.setData({ loading: false });
      if (cb) cb();
    });
  },
  switchTab(e) { this.setData({ activeTab: e.currentTarget.dataset.tab }); },
  filteredList() {
    const tab = this.data.activeTab;
    const map = { all: null, pending: 'pending', rectifying: 'rectifying', verifying: 'verifying', closed: 'closed' };
    const target = map[tab];
    return target ? this.data.list.filter(x => x.status === target) : this.data.list;
  },
  goForm() { wx.navigateTo({ url: '/pages/hazard_form/hazard_form' }); },
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/hazard_form/hazard_form?id=${id}&mode=view` });
  },
  riskLevel(item) {
    return (item.riskLevel || item.risk_level || item.risk || '').toLowerCase();
  },
  riskLabel(level) {
    const m = { critical: '重大', major: '较大', general: '一般', low: '低' };
    return m[level] || level || '未知';
  },
  riskIcon(level) {
    const m = { critical: '🔴', major: '🟠', general: '🟡', low: '🟢' };
    return m[level] || '⚪';
  },
  statusLabel(status) {
    const m = { pending: '待整改', rectifying: '整改中', verifying: '待验收', closed: '已关闭' };
    return m[status] || status || '';
  },
  statusClass(status) {
    const m = { pending: 'tag-warn', rectifying: 'tag-info', verifying: 'tag-primary', closed: 'tag-gray' };
    return m[status] || 'tag-gray';
  }
});
