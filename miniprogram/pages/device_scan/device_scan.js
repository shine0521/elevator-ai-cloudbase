// pages/device_scan/device_scan.js — M-11 设备扫码
const native = require('../../utils/native.js');
const req = require('../../utils/request.js');

Page({
  data: {
    history: []
  },

  onLoad() {
    // 加载扫码历史（可从本地缓存取）
    const h = wx.getStorageSync('scan_history') || [];
    this.setData({ history: h });
  },

  // 触发扫码
  async doScan() {
    try {
      wx.showLoading({ title: '扫码中...' });
      const result = await native.scanCode();
      wx.hideLoading();

      const code = result.trim();
      if (!code) {
        wx.showToast({ title: '扫码内容为空', icon: 'none' });
        return;
      }

      wx.showLoading({ title: '查询设备...' });
      req.get(`/api/mobile/devices/scan?code=${encodeURIComponent(code)}`).then(d => {
        wx.hideLoading();
        const device = d.data || d;
        if (device && device.id) {
          // 保存到历史
          const h = [device, ...this.data.history.filter(i => i.id !== device.id)].slice(0, 20);
          this.setData({ history: h });
          wx.setStorageSync('scan_history', h);
          wx.navigateTo({ url: `../device_detail/device_detail?id=${device.id}` });
        } else {
          wx.showToast({ title: '设备不存在', icon: 'none' });
        }
      }).catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误', icon: 'none' });
      });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '扫码失败', icon: 'none' });
    }
  },

  // 从历史记录打开
  goHistory(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `../device_detail/device_detail?id=${id}` });
  },

  // 清除历史
  clearHistory() {
    this.setData({ history: [] });
    wx.removeStorageSync('scan_history');
    wx.showToast({ title: '已清除', icon: 'success' });
  }
});
