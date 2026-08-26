const app = getApp();
const req = require('../../utils/request.js');
Page({
  data: { user: null },
  onShow() { this.setData({ user: app.globalData.user }); },
  logout() {
    app.logout();
    wx.reLaunch({ url: '/pages/login/login' });
  }
});
