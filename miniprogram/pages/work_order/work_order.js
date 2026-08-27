// M-10 隐患整改工单列表
const req = require('../../utils/request.js');
Page({
  data: {
    loading: true,
    list: [],
    activeTab: 'all',
    tabs: [
      { key: 'all',       label: '全部' },
      { key: 'pending',   label: '待整改' },
      { key: 'rectifying',label: '整改中' },
      { key: 'verifying', label: '待验收' },
      { key: 'closed',    label: '已关闭' }
    ]
  },
  onLoad() { this.load(); },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load(() => wx.stopPullDownRefresh()); },
  load(cb) {
    req.get('/api/mobile/work-orders?page=1&limit=200').then(d => {
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
  goDetail(e) {
    wx.navigateTo({ url: `/pages/work_order_detail/work_order_detail?id=${e.currentTarget.dataset.id}` });
  },
  riskIcon(level) {
    const m = { critical: '🔴', major: '🟠', general: '🟡', low: '🟢' };
    return m[(level || '').toLowerCase()] || '⚪';
  },
  riskLabel(level) {
    const m = { critical: '重大', major: '较大', general: '一般', low: '低' };
    return m[(level || '').toLowerCase()] || '未知';
  },
  statusLabel(status) {
    const m = { pending: '待整改', rectifying: '整改中', verifying: '待验收', closed: '已关闭' };
    return m[status] || status || '';
  },
  statusClass(status) {
    const m = { pending: 'tag-warn', rectifying: 'tag-info', verifying: 'tag-primary', closed: 'tag-gray' };
    return m[status] || 'tag-gray';
  },
  progressStep(status) {
    const map = { pending: 0, rectifying: 1, verifying: 2, closed: 3 };
    return map[status] ?? 0;
  }
});
