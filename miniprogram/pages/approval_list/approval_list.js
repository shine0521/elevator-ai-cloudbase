// pages/approval_list/approval_list.js — M-15 审批待办
const req = require('../../utils/request.js');

const STATUS_COLORS = {
  PENDING:   '#FF8C00',
  APPROVED:  '#52C41A',
  REJECTED:  '#F5222D'
};

const BIZ_TYPE_LABELS = {
  inspection: '日管控检查',
  daily:     '日管控检查',
  weekly:    '周排查',
  hazard:    '隐患排查',
  emergency: '应急事件',
  work_order:'工单',
  monthly:   '月调度'
};

Page({
  data: {
    tab: 'pending',   // pending | done
    pendingList: [],
    doneList: [],
    loading: true
  },

  onLoad() { this.load(); },

  onShow() { this.load(); },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true });
    Promise.all([
      req.get('/api/mobile/approvals'),
      req.get('/api/mobile/approvals?status=APPROVED')
    ]).then(([pending, done]) => {
      this.setData({
        pendingList: pending.data || pending || [],
        doneList: (done.data || done || []).filter(i => i.status !== 'PENDING'),
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

  statusColor(s) { return STATUS_COLORS[s] || '#999'; },

  bizLabel(type) { return BIZ_TYPE_LABELS[type] || type || '审批'; },

  // 跳审批详情
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/approval_detail/approval_detail?id=${id}` });
  }
});
