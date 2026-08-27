// pages/message/message.js — 消息中心 M-17
const req = require('../../utils/request.js');

const CAT_ICONS = {
  approval:  '✅',
  warning:   '⚠️',
  workorder: '🔧',
  emergency: '🚨',
  other:     '📢'
};

const CAT_COLORS = {
  approval:  '#1082FF',
  warning:   '#FAAD14',
  workorder: '#52C41A',
  emergency: '#F5222D',
  other:     '#999'
};

Page({
  data: {
    stats: { total: 0, approval: 0, warning: 0, workorder: 0, emergency: 0 },
    list: [],
    loading: true
  },

  onShow() { this.load(); },

  load() {
    this.setData({ loading: true });
    Promise.all([
      req.get('/api/mobile/messages'),
      req.get('/api/mobile/messages/stats')
    ]).then(([msgs, stats]) => {
      this.setData({
        list: msgs.data || msgs || [],
        stats: stats || { total: 0, approval: 0, warning: 0, workorder: 0, emergency: 0 },
        loading: false
      });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  catIcon(cat) { return CAT_ICONS[cat] || CAT_ICONS.other; },
  catColor(cat) { return CAT_COLORS[cat] || CAT_COLORS.other; },

  // 点击消息 → 标记已读
  onTapMsg(e) {
    const id = e.currentTarget.dataset.id;
    const item = e.currentTarget.dataset.item;
    req.post(`/api/mobile/messages/${id}/read`).then(() => {
      // 刷新消息列表
      this.load();
      // 如需跳转详情
      if (item.biz_type && item.biz_id) {
        const routes = {
          inspection: '/pages/daily_form/daily_form',
          weekly:     '/pages/weekly_form/weekly_form',
          hazard:     '/pages/hazard_form/hazard_form',
          approval:   '/pages/approval_detail/approval_detail',
          emergency:  '/pages/emergency_report/emergency_report'
        };
        const base = routes[item.biz_type];
        if (base) wx.navigateTo({ url: `${base}?id=${item.biz_id}` });
      }
    }).catch(() => wx.showToast({ title: '网络错误', icon: 'none' }));
  },

  // 全部已读
  readAll() {
    req.post('/api/mobile/messages/read-all').then(() => {
      wx.showToast({ title: '已全部标记已读', icon: 'success' });
      this.load();
    }).catch(() => wx.showToast({ title: '网络错误', icon: 'none' }));
  },

  // 跳转到各类消息
  goCat(e) {
    const cat = e.currentTarget.dataset.cat;
    if (cat === 'approval') wx.navigateTo({ url: '/pages/approval_list/approval_list' });
    else if (cat === 'emergency') wx.navigateTo({ url: '/pages/emergency_report/emergency_report' });
    else wx.showToast({ title: '该分类暂无可跳转页面', icon: 'none' });
  }
});
