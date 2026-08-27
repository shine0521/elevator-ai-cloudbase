// pages/daily/daily.js — 日管控检查列表
const req = require('../../utils/request.js');
Page({
  data: { list: [], loading: true },
  onLoad() { this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  load() {
    this.setData({ loading: true });
    req.get('/api/mobile/inspections').then(d => {
      this.setData({ list: d.data || d || [], loading: false });
      wx.stopPullDownRefresh();
    }).catch(() => { this.setData({ loading: false }); wx.stopPullDownRefresh(); });
  },
  goForm(e) {
    wx.navigateTo({ url: `/pages/daily_form/daily_form?id=${e.currentTarget.dataset.id}` });
  }
});
