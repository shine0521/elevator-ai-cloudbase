const app = getApp();
const req = require('../../utils/request.js');
Page({
  data: { mode: 'wechat', email: '', password: '', wechatTip: '' },
  onLoad() {
    if (app.globalData.token) { wx.reLaunch({ url: '/pages/workbench/workbench' }); }
  },
  switchMode(e) { this.setData({ mode: e.currentTarget.dataset.mode }); },
  onEmail(e) { this.setData({ email: e.detail.value }); },
  onPwd(e) { this.setData({ password: e.detail.value }); },
  wechatLogin() {
    wx.login({
      success: r => {
        req.post('/api/mobile/auth/wechat', { code: r.code })
          .then(d => {
            if (d.success) {
              app.setAuth(d.token, d.user);
              wx.reLaunch({ url: '/pages/workbench/workbench' });
            } else if (d.code === 'NOT_CONFIGURED') {
              this.setData({ mode: 'account', wechatTip: '微信登录未配置，请使用账号密码登录' });
            } else {
              wx.showToast({ title: d.error || '登录失败', icon: 'none' });
            }
          })
          .catch(() => this.setData({ mode: 'account', wechatTip: '微信登录失败，请使用账号密码' }));
      },
      fail: () => this.setData({ mode: 'account' })
    });
  },
  accountLogin() {
    if (!this.data.email || !this.data.password) {
      wx.showToast({ title: '请输入账号密码', icon: 'none' }); return;
    }
    req.post('/api/login', { email: this.data.email, password: this.data.password })
      .then(d => {
        if (d.success) {
          app.setAuth(d.token, d.user);
          wx.reLaunch({ url: '/pages/workbench/workbench' });
        } else {
          wx.showToast({ title: d.error || '登录失败', icon: 'none' });
        }
      })
      .catch(() => wx.showToast({ title: '网络错误', icon: 'none' }));
  }
});
