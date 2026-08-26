App({
  globalData: {
    // 生产环境正式域名（需先完成：①ICP 备案 ②CloudBase 自定义域名绑定 ③DNS CNAME ④微信服务器域名白名单）
    baseURL: 'https://api.teanzhu.top',
    // 开发联调备用（CloudBase 测试域名，仅开发者工具勾选「不校验合法域名」时可用）：
    // baseURL: 'https://elevator-ai-278112-4-1450481727.sh.run.tcloudbase.com',
    token: '',
    user: null
  },
  onLaunch() {
    this.globalData.token = wx.getStorageSync('token') || '';
    this.globalData.user = wx.getStorageSync('user') || null;
  },
  setAuth(token, user) {
    this.globalData.token = token;
    this.globalData.user = user;
    wx.setStorageSync('token', token);
    wx.setStorageSync('user', user);
  },
  logout() {
    this.globalData.token = '';
    this.globalData.user = null;
    wx.removeStorageSync('token');
    wx.removeStorageSync('user');
  }
});
