// pages/profile/profile.js — 个人中心 M-18
const app = getApp();
const req = require('../../utils/request.js');

Page({
  data: {
    user: null,
    unreadCount: 0
  },

  onShow() {
    this.setData({ user: app.globalData.user });
    this.loadUnread();
  },

  loadUnread() {
    req.get('/api/mobile/messages/stats').then(d => {
      this.setData({ unreadCount: d.total || 0 });
    }).catch(() => {});
  },

  goMessage() {
    wx.navigateTo({ url: '/pages/message/message' });
  },

  goApproval() {
    wx.navigateTo({ url: '/pages/approval_list/approval_list' });
  },

  goRecord() {
    wx.navigateTo({ url: '/pages/inspection_record/inspection_record' });
  },

  goSettings() {
    // Web端设置页面
    const base = app.globalData.baseURL.replace('/api', '');
    wx.navigateToMiniProgram({
      appId: 'wxXXXXXXXX', // TODO: 替换为实际 Web 端小程序 appId
      path: '/mobile/settings',
      extraData: { token: app.globalData.token },
      fail() {
        // fallback: 在小程序内打开 web-view
        wx.showToast({ title: '请在 Web 端设置', icon: 'none' });
      }
    });
  },

  logout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: res => {
        if (res.confirm) {
          app.logout();
          wx.reLaunch({ url: '/pages/login/login' });
        }
      }
    });
  }
});
