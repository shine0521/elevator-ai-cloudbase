const app = getApp();
const req = require('../../utils/request.js');
Page({
  data: {
    todo: {}, warning: {},
    grids: [
      { key: 'daily', label: '日管控' }, { key: 'weekly', label: '周排查' },
      { key: 'hazard', label: '隐患排查' }, { key: 'device', label: '设备查询' },
      { key: 'emergency', label: '应急报告' }, { key: 'approve', label: '审批待办' },
      { key: 'monthly', label: '月调度' }, { key: 'record', label: '检查记录' }
    ]
  },
  onShow() { this.load(); },
  load() {
    req.get('/api/mobile/dashboard').then(d => {
      if (d.success) this.setData({ todo: d.todo, warning: d.warning });
    }).catch(() => {});
  },
  goGrid(e) {
    const map = {
      daily: '/pages/check/check?type=daily', weekly: '/pages/check/check?type=weekly',
      hazard: '/pages/check/check?type=hazard', device: '/pages/check/check?type=device',
      emergency: '/pages/check/check?type=emergency', approve: '/pages/check/check?type=approve',
      monthly: '/pages/check/check?type=monthly', record: '/pages/check/check?type=record'
    };
    wx.navigateTo({ url: map[e.currentTarget.dataset.key] });
  }
});
