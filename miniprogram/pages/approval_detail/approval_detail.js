// pages/approval_detail/approval_detail.js — M-16 审批处理
const req = require('../../utils/request.js');

const NODE_STATUS_COLORS = {
  PENDING:   '#FF8C00',
  APPROVED:  '#52C41A',
  REJECTED:  '#F5222D',
  FORWARDED: '#1082FF',
  SKIPPED:   '#BFBFBF'
};

const NODE_ICONS = {
  PENDING:   '⏳',
  APPROVED:  '✅',
  REJECTED:  '❌',
  FORWARDED: '↪️',
  SKIPPED:   '⏭️'
};

Page({
  data: {
    id: null,
    approval: null,
    loading: true,
    comment: '',
    aiComparisonSummary: '',
    aiConfidence: 0.8,
    forwardEmail: '',
    submitting: false,
    showForward: false
  },

  onLoad(q) {
    const id = q.id;
    this.setData({ id });
    this.load(id);
  },

  load(id) {
    this.setData({ loading: true });
    req.get(`/api/mobile/approvals/${id}`).then(d => {
      const approval = d.data || d;
      this.setData({ approval, loading: false });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // 节点状态图标
  nodeIcon(status) { return NODE_ICONS[status] || '⬜'; },
  nodeColor(status) { return NODE_STATUS_COLORS[status] || '#999'; },

  // 判断当前用户是否在当前节点
  canApprove() {
    const a = this.data.approval;
    if (!a) return false;
    return a.current_node_status === 'PENDING';
  },

  // 意见输入
  bindComment(e) { this.setData({ comment: e.detail.value }); },

  // AI 对比摘要（模拟填写）
  bindSummary(e) { this.setData({ aiComparisonSummary: e.detail.value }); },

  // AI 置信度
  bindConfidence(e) { this.setData({ aiConfidence: parseFloat(e.detail.value) / 100 }); },

  // 转审邮箱
  bindForwardEmail(e) { this.setData({ forwardEmail: e.detail.value }); },

  toggleForward() { this.setData({ showForward: !this.data.showForward }); },

  // 批准
  doApprove() {
    if (this.data.submitting) return;
    wx.showModal({
      title: '确认批准',
      content: '确定批准该申请？',
      success: res => {
        if (!res.confirm) return;
        this.setData({ submitting: true });
        const payload = {
          comment: this.data.comment
        };
        // 如果有 AI 对比数据也一并传入
        if (this.data.aiComparisonSummary) {
          payload.aiComparisonSummary = this.data.aiComparisonSummary;
          payload.aiConfidence = this.data.aiConfidence;
        }
        req.post(`/api/mobile/approvals/${this.data.id}/approve`, payload).then(() => {
          this.setData({ submitting: false });
          wx.showToast({ title: '已批准', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 1200);
        }).catch(() => {
          this.setData({ submitting: false });
          wx.showToast({ title: '网络错误', icon: 'none' });
        });
      }
    });
  },

  // 驳回
  doReject() {
    if (!this.data.comment || this.data.comment.trim().length < 10) {
      wx.showToast({ title: '驳回意见至少10个字', icon: 'none' }); return;
    }
    wx.showModal({
      title: '确认驳回',
      content: '确定驳回该申请？',
      success: res => {
        if (!res.confirm) return;
        this.setData({ submitting: true });
        req.post(`/api/mobile/approvals/${this.data.id}/reject`, { comment: this.data.comment }).then(() => {
          this.setData({ submitting: false });
          wx.showToast({ title: '已驳回', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 1200);
        }).catch(() => {
          this.setData({ submitting: false });
          wx.showToast({ title: '网络错误', icon: 'none' });
        });
      }
    });
  },

  // 转审
  doForward() {
    const email = this.data.forwardEmail.trim();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      wx.showToast({ title: '请输入正确的邮箱', icon: 'none' }); return;
    }
    this.setData({ submitting: true });
    req.post(`/api/mobile/approvals/${this.data.id}/forward`, { forwardTo: email }).then(() => {
      this.setData({ submitting: false, showForward: false });
      wx.showToast({ title: '已转审', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1200);
    }).catch(() => {
      this.setData({ submitting: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  }
});
