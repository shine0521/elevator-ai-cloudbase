// 现场能力 + UI 工具（替代小程序 wx.* API）
window.utils = {
  toast(msg) { if (window.__toast) window.__toast(msg); },
  confirm(msg) { return window.confirm(msg); },
  alert(msg) { window.alert(msg); },
  // 扫码：H5 无原生扫码，用输入代替（后续可接微信 js-sdk / 摄像头识别）
  async scanCode() {
    const code = window.prompt('请扫描或输入设备二维码 / 编号：');
    if (code === null) throw new Error('cancelled');
    return code.trim();
  },
  // 拍照/选图：input file 返回 objectURL 列表
  chooseImage(max) {
    max = max || 6;
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = max > 1;
      input.onchange = function() {
        const files = Array.prototype.slice.call(input.files || []).slice(0, max);
        resolve(files.map(function(f) { return URL.createObjectURL(f); }));
      };
      input.click();
    });
  },
  // 定位：HTML5 Geolocation
  getLocation() {
    return new Promise(function(resolve, reject) {
      if (!navigator.geolocation) return reject(new Error('不支持定位'));
      navigator.geolocation.getCurrentPosition(
        function(p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
        function(e) { reject(e); },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  },
  fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    const p = function(n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  },
  // hash 路由跳转
  go(path) { location.hash = '#' + path; }
};
