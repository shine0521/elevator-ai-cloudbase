// pages/check/check.js — 检查列表（按 type 路由到不同模块）
const app = getApp();
const req = require('../../utils/request.js');

const TYPE_MAP = {
  daily:     { path: '/api/mobile/inspections', title: '日管控检查' },
  weekly:    { path: '/api/mobile/weekly',     title: '周排查' },
  hazard:    { path: '/api/mobile/hazards',      title: '隐患排查' },
  device:    { path: '/api/mobile/devices/scan', title: '设备查询' },
  approve:   { path: '/api/mobile/approvals',    title: '审批待办' },
  monthly:   { path: '/api/mobile/monthly',     title: '月调度' },
  record:    { path: '/api/mobile/inspections',  title: '检查记录' }
};

const STATUS_COLORS = {
  PENDING:   '#FF8C00',
  IN_PROGRESS:'#1082FF',
  APPROVED:  '#52C41A',
  REJECTED:  '#F5222D',
  OPEN:      '#FAAD14',
  CLOSED:    '#BFBFBF',
  RISK_HIGH: '#F5222D',
  RISK_MED:  '#FAAD14',
  RISK_LOW:  '#52C41A'
};

Page({
  data: {
    type: 'daily',
    title: '日管控检查',
    list: [],
    loading: true,
    loadingMore: false,
    page: 1,
    hasMore: false
  },

  onLoad(q) {
    const type = q.type || 'daily';
    const cfg = TYPE_MAP[type] || TYPE_MAP.daily;
    this.setData({ type, title: cfg.title });
    wx.setNavigationBarTitle({ title: cfg.title });
    this.load(true);
  },

  onPullDownRefresh() {
    this.load(true);
  },

  onReachBottom() {
    if (this.data.hasMore) this.load(false, this.data.page + 1);
  },

  load(refresh = true, page = 1) {
    const { type } = this.data;
    if (refresh) page = 1;

    this.setData({ loading: refresh, loadingMore: !refresh, page });

    let path;
    if (type === 'record') {
      // 记录查询同时拉日管控+周排查
      Promise.all([
        req.get('/api/mobile/inspections', { page, size: 20 }),
        req.get('/api/mobile/weekly', { page, size: 20 })
      ]).then(([d, w]) => {
        const daily = (d.data || []).map(i => ({ ...i, _source: 'daily' }));
        const weekly = (w.data || []).map(i => ({ ...i, _source: 'weekly' }));
        this.setData({
          list: refresh ? [...daily, ...weekly] : [...this.data.list, ...daily, ...weekly],
          loading: false, loadingMore: false,
          hasMore: daily.length + weekly.length >= 20
        });
        wx.stopPullDownRefresh();
      }).catch(() => {
        this.setData({ loading: false, loadingMore: false });
        wx.stopPullDownRefresh();
      });
      return;
    }

    path = TYPE_MAP[type]?.path || '/api/mobile/inspections';
    req.get(path, { page, size: 20 }).then(d => {
      const raw = d.data || d || [];
      this.setData({
        list: refresh ? raw : [...this.data.list, ...raw],
        loading: false, loadingMore: false,
        hasMore: (d.data && d.data.length >= 20) || (Array.isArray(d) && d.length >= 20)
      });
      wx.stopPullDownRefresh();
    }).catch(() => {
      this.setData({ loading: false, loadingMore: false });
      wx.stopPullDownRefresh();
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // 状态颜色
  statusColor(status) {
    return STATUS_COLORS[status] || '#999';
  },

  // 行标签（设备名/单号/标题）
  rowLabel(item) {
    return item.device_name
      || item.inspection_no
      || item.event_no
      || item.order_no
      || item.hazard_type
      || item.month_no
      || item.title
      || '记录';
  },

  // 状态文字
  statusText(item) {
    return item.status || item.inspection_status || item.risk_level || '';
  },

  // 跳转详情
  goDetail(e) {
    const { item, type } = e.currentTarget.dataset;
    const id = item.id || item.inspection_id || item.record_id;

    const jumpMap = {
      daily:   `/pages/daily_form/daily_form?id=${id}`,
      weekly:  `/pages/weekly_form/weekly_form?id=${id}`,
      hazard:  `/pages/hazard_form/hazard_form?id=${id}`,
      approve: `/pages/approval_detail/approval_detail?id=${id}`,
      monthly: `/pages/check/check?id=${id}`
    };
    const url = jumpMap[type];
    if (url) {
      wx.navigateTo({ url });
    } else {
      wx.showToast({ title: '该类型暂不支持', icon: 'none' });
    }
  }
});
