// M-10b 工单详情
const req = require('../../utils/request.js');
const native = require('../../utils/native.js');
Page({
  data: {
    loading: true,
    id: '',
    detail: null,
    rectifyDesc: '',
    rectifyPhotos: [],
    verifyDesc: '',
    verifyPhotos: [],
    verifyPass: null,
    actioning: false
  },
  onLoad(q) {
    if (!q.id) { wx.navigateBack(); return; }
    this.setData({ id: q.id });
    this.load(q.id);
  },
  load(id) {
    req.get(`/api/mobile/work-orders/${id}`).then(d => {
      this.setData({ detail: d.data || d, loading: false });
    }).catch(() => this.setData({ loading: false }));
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
    const m = { pending: '待整改', rectifying: '整改中', verifying: '待验收', closed: '已关闭', completed: '已完成' };
    return m[status] || status || '';
  },
  statusClass(status) {
    const m = { pending: 'tag-warn', rectifying: 'tag-info', verifying: 'tag-primary', closed: 'tag-gray' };
    return m[status] || 'tag-gray';
  },
  canRectify() { return !!(this.data.detail && this.data.detail.status === 'pending'); },
  canVerify()  { return !!(this.data.detail && this.data.detail.status === 'verifying'); },
  onRectifyDescInput(e) { this.setData({ rectifyDesc: e.detail.value }); },
  async onRectifyTakePhoto() {
    try {
      const photos = await native.chooseImage(6);
      this.setData({ rectifyPhotos: [...this.data.rectifyPhotos, ...photos].slice(0, 6) });
    } catch { wx.showToast({ title: '取消', icon: 'none' }); }
  },
  onRectifyRemovePhoto(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    const photos = [...this.data.rectifyPhotos];
    photos.splice(idx, 1);
    this.setData({ rectifyPhotos: photos });
  },
  async onSubmitRectify() {
    if (this.data.actioning) return;
    if (!this.data.rectifyDesc) return wx.showToast({ title: '请填写整改描述', icon: 'none' });
    this.setData({ actioning: true });
    wx.showLoading({ title: '提交中...' });
    try {
      await req.post(`/api/mobile/work-orders/${this.data.id}/rectify`, {
        rectifyDescription: this.data.rectifyDesc,
        rectifyPhotos: this.data.rectifyPhotos
      });
      wx.hideLoading();
      wx.showToast({ title: '整改提交成功', icon: 'success' });
      setTimeout(() => {
        this.load(this.data.id);
        this.setData({ actioning: false, rectifyDesc: '', rectifyPhotos: [] });
      }, 1500);
    } catch {
      wx.hideLoading();
      this.setData({ actioning: false });
      wx.showToast({ title: '提交失败', icon: 'none' });
    }
  },
  onVerifyDescInput(e) { this.setData({ verifyDesc: e.detail.value }); },
  onVerifyPass()  { this.setData({ verifyPass: true }); },
  onVerifyReject(){ this.setData({ verifyPass: false }); },
  async onVerifyTakePhoto() {
    try {
      const photos = await native.chooseImage(6);
      this.setData({ verifyPhotos: [...this.data.verifyPhotos, ...photos].slice(0, 6) });
    } catch { wx.showToast({ title: '取消', icon: 'none' }); }
  },
  onVerifyRemovePhoto(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    const photos = [...this.data.verifyPhotos];
    photos.splice(idx, 1);
    this.setData({ verifyPhotos: photos });
  },
  async onSubmitVerify() {
    if (this.data.actioning) return;
    if (this.data.verifyPass === null) return wx.showToast({ title: '请选择验收结论', icon: 'none' });
    if (!this.data.verifyDesc) return wx.showToast({ title: '请填写验收意见', icon: 'none' });
    this.setData({ actioning: true });
    wx.showLoading({ title: '提交中...' });
    try {
      await req.post(`/api/mobile/work-orders/${this.data.id}/verify`, {
        pass: this.data.verifyPass,
        verifyDescription: this.data.verifyDesc,
        verifyPhotos: this.data.verifyPhotos
      });
      wx.hideLoading();
      wx.showToast({ title: '验收提交成功', icon: 'success' });
      setTimeout(() => {
        this.load(this.data.id);
        this.setData({ actioning: false, verifyDesc: '', verifyPhotos: [], verifyPass: null });
      }, 1500);
    } catch {
      wx.hideLoading();
      this.setData({ actioning: false });
      wx.showToast({ title: '提交失败', icon: 'none' });
    }
  }
});
