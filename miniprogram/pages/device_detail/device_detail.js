// pages/device_detail/device_detail.js — M-12 设备详情
const req = require('../../utils/request.js');

const RISK_COLORS = {
  HIGH:   '#F5222D',
  MEDIUM: '#FAAD14',
  LOW:    '#52C41A',
  高风险: '#F5222D',
  中风险: '#FAAD14',
  低风险: '#52C41A'
};

const STATUS_COLORS = {
  ONLINE:  '#52C41A',
  OFFLINE: '#BFBFBF',
  FAULT:   '#F5222D'
};

Page({
  data: {
    id: null,
    device: null,
    tab: 'inspection',
    inspections: [],
    warnings: [],
    docs: [],
    loading: true
  },

  onLoad(q) {
    const id = q.id || q.device_id;
    this.setData({ id });
    this.loadDevice(id);
  },

  loadDevice(id) {
    this.setData({ loading: true });
    req.get(`/api/mobile/devices/${id}/detail`).then(d => {
      const device = d.data || d;
      this.setData({
        device,
        inspections: device.inspections || device.daily_records || [],
        warnings: device.warnings || device.alarms || [],
        docs: device.documents || device.docs || [],
        loading: false
      });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  riskColor(level) {
    return RISK_COLORS[level] || '#999';
  },

  statusColor(status) {
    return STATUS_COLORS[status] || '#999';
  },

  // 跳转检查记录详情
  goInspection(e) {
    const item = e.currentTarget.dataset.item;
    const id = item.id || item.inspection_id;
    if (item._source === 'weekly') {
      wx.navigateTo({ url: `/pages/weekly_form/weekly_form?id=${id}` });
    } else {
      wx.navigateTo({ url: `/pages/daily_form/daily_form?id=${id}` });
    }
  },

  // 跳转预警详情
  goWarning(e) {
    wx.showToast({ title: '预警详情开发中', icon: 'none' });
  }
});
