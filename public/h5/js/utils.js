// utils.js — 工具层：路由 / UI 提示 / 扫码 / 选图 / 定位 / 格式化
window.utils = {

  // Hash 路由跳转
  go: function (path) { location.hash = '#' + path; },

  // 轻提示（1.5s）
  toast: function (msg, duration) {
    duration = duration || 1500;
    if (typeof window.__toastMsg === 'function') { window.__toastMsg(msg, duration); return; }
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.75);color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:9999;max-width:80%;text-align:center;line-height:1.5;pointer-events:none;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, duration);
  },

  // 确认框（返回 Promise<boolean>）
  confirm: function (msg) {
    return new Promise(function (resolve) {
      try { resolve(window.confirm(msg)); } catch (e) { resolve(false); }
    });
  },

  // H5 扫码降级：弹出输入框
  scanCode: function () {
    return new Promise(function (resolve, reject) {
      var code = window.prompt('\u8bf7\u626b\u63cf\u6216\u8f93\u5165\u8bbe\u5907\u4e8c\u7ef4\u7801 / \u7f16\u53f7\uff1a');
      if (code === null) { reject(new Error('cancelled')); return; }
      if (!code.trim()) { reject(new Error('empty')); return; }
      resolve(code.trim());
    });
  },

  // 选图（H5：file input → objectURL 列表）
  chooseImage: function (max) {
    max = max || 6;
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      if (max > 1) input.multiple = true;
      input.onchange = function () {
        var files = Array.prototype.slice.call(input.files || []).slice(0, max);
        resolve(files.map(function (f) { return URL.createObjectURL(f); }));
      };
      input.click();
    });
  },

  // HTML5 定位
  getLocation: function () {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) { reject(new Error('\u4e0d\u652f\u6301\u5b9a\u4f4d')); return; }
      navigator.geolocation.getCurrentPosition(
        function (p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
        function (e) { reject(e); },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  },

  // 时间格式化：2026-08-27T19:30:00 → 08-27 19:30
  formatTime: function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  },

  // 日期格式化：2026-08-27 → 08月27日
  formatDate: function (dateStr) {
    if (!dateStr) return '';
    var s = String(dateStr).substring(0, 10);
    var parts = s.split('-');
    if (parts.length !== 3) return s;
    return parts[1] + '\u6708' + parts[2] + '\u65e5';
  },

  // 完整时间：2026-08-27T19:30:00 → 2026-08-27 19:30
  formatDateTime: function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  },

  // 隐患风险等级 → 颜色
  levelColor: function (level) {
    var m = {
      critical: 'var(--red)',
      major: 'var(--orange)',
      general: '#d48806',
      low: 'var(--green)'
    };
    return m[String(level || '').toLowerCase()] || 'var(--muted)';
  },

  // 隐患风险等级 → 标签文字
  levelLabel: function (level) {
    var m = {
      critical: '\u91cd\u5927',
      major: '\u8f83\u5927',
      general: '\u4e00\u822c',
      low: '\u4f4e'
    };
    return m[String(level || '').toLowerCase()] || String(level || '');
  },

  // 状态 → 颜色
  statusColor: function (status) {
    var s = String(status || '').toUpperCase();
    var m = {
      PENDING: 'var(--orange)',
      ONGOING: 'var(--primary)',
      SUBMITTED: 'var(--green)',
      REVIEWED: 'var(--primary)',
      APPROVED: 'var(--green)',
      REJECTED: 'var(--red)',
      OPEN: 'var(--orange)',
      CLOSED: 'var(--muted)',
      COMPLETED: 'var(--green)',
      RECTIFYING: 'var(--orange)',
      VERIFYING: 'var(--primary)',
      DRAFT: 'var(--muted)',
      PUBLISHED: 'var(--green)',
      RESPONDING: 'var(--red)',
      PROCESSING: 'var(--orange)',
      RECOVERING: 'var(--primary)',
      CANCELLED: 'var(--muted)'
    };
    return m[s] || 'var(--muted)';
  },

  // 状态 → 标签文字
  statusLabel: function (status) {
    var s = String(status || '').toUpperCase();
    var m = {
      PENDING: '\u5f85\u5904\u7406',
      ONGOING: '\u8fdb\u884c\u4e2d',
      SUBMITTED: '\u5df2\u63d0\u4ea4',
      REVIEWED: '\u5df2\u590d\u6838',
      APPROVED: '\u5df2\u901a\u8fc7',
      REJECTED: '\u5df2\u9a9b\u56de',
      OPEN: '\u672a\u6574\u6539',
      CLOSED: '\u5df2\u5173\u95ed',
      COMPLETED: '\u5df2\u5b8c\u6210',
      RECTIFYING: '\u6574\u6539\u4e2d',
      VERIFYING: '\u5f85\u6838\u9a8c',
      DRAFT: '\u8349\u7a3f',
      PUBLISHED: '\u5df2\u53d1\u5e03',
      RESPONDING: '\u54cd\u5e94\u4e2d',
      PROCESSING: '\u5904\u7f6e\u4e2d',
      RECOVERING: '\u6062\u590d\u4e2d',
      CANCELLED: '\u5df2\u53d6\u6d88'
    };
    return m[s] || String(status || '\u5f85\u5904\u7406');
  },

  // 复制文本
  copy: function (text) {
    text = String(text || '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {});
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;left:-9999px;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    if (ta.parentNode) ta.parentNode.removeChild(ta);
  },

  // 手机号脱敏
  phoneify: function (text) {
    text = String(text || '');
    if (text.length === 11) return text.substring(0, 3) + '****' + text.substring(7);
    if (text.length > 7) return text.substring(0, 3) + '****' + text.substring(text.length - 4);
    return text;
  },

  // 从 location.search 读取参数（扫码场景）
  getQuery: function (key) {
    var sp = new URLSearchParams(location.search || '');
    return sp.get(key);
  }
};
