// pages/daily_form/daily_form.js — 日管控检查表单
const req = require('../../utils/request.js');
Page({
  data: { id: null, form: {}, loading: true, submitting: false },
  onLoad(q) {
    this.setData({ id: q.id });
    if (q.id) {
      req.get(`/api/mobile/inspections/${q.id}`).then(d => {
        this.setData({ form: d.data || d, loading: false });
      }).catch(() => this.setData({ loading: false }));
    } else {
      this.setData({ loading: false });
    }
  },
  submit() {
    this.setData({ submitting: true });
    const method = this.data.id ? 'put' : 'post';
    const path = this.data.id ? `/api/mobile/inspections/${this.data.id}` : '/api/mobile/inspections';
    req[method](path, this.data.form).then(() => {
      this.setData({ submitting: false });
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1200);
    }).catch(() => { this.setData({ submitting: false }); wx.showToast({ title: '网络错误', icon: 'none' }); });
  }
});
