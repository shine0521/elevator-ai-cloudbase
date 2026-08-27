// 设备扫码
window.Pages = window.Pages || {};
window.Pages.device_scan = {
  name: 'device_scan',
  props: ['query'],
  template: `
<div class="page">
  <div class="card" style="text-align:center;padding:32px 20px;margin-bottom:12px;" @click="doScan">
    <div style="font-size:64px;margin-bottom:12px;">📷</div>
    <div style="font-size:16px;font-weight:600;margin-bottom:6px;">扫码查询设备</div>
    <div class="muted" style="font-size:13px;">点击按钮或长按扫一扫</div>
  </div>

  <div v-if="scanning" class="empty-state"><span class="muted">识别中...</span></div>
  <div v-if="scanError" class="empty-state" style="color:var(--danger);">{{scanError}}</div>

  <div v-if="hasHistory">
    <div class="block-title">最近扫码</div>
    <div v-for="(item, i) in history" :key="item.id || i" class="device-card" @click="goHistory(item.id)">
      <div class="flex-between" style="margin-bottom:4px;">
        <span class="dev-name ellipsis" style="flex:1;">{{item.device_name || '设备'}}</span>
        <span class="badge" :style="{background: statusBg(item.status), color:'#fff'}">{{statusText(item.status)}}</span>
      </div>
      <div class="dev-sub" v-if="item.location">{{item.location}}</div>
    </div>
    <div style="text-align:center;padding:10px 0;">
      <span class="muted" style="font-size:13px;cursor:pointer;" @click="clearHistory">清除记录</span>
    </div>
  </div>
</div>
`,
  data: function () {
    return {
      history: [],
      scanning: false,
      scanError: ''
    };
  },
  computed: {
    hasHistory: function () { return this.history.length > 0; }
  },
  mounted: function () {
    try {
      this.history = JSON.parse(localStorage.getItem('scan_history') || '[]');
    } catch (e) {
      this.history = [];
    }
  },
  methods: {
    doScan: function () {
      var self = this;
      self.scanError = '';
      self.scanning = true;
      utils.scanCode().then(function (code) {
        return api.scanDevice(code);
      }).then(function (d) {
        var device = d.data || d;
        if (!device || !device.id) {
          self.scanError = '未找到该设备';
          return;
        }
        // 保存到历史
        var hist = self.history.filter(function (it) { return it.id !== device.id; });
        hist.unshift({ id: device.id, device_name: device.device_name, location: device.location, status: device.status });
        self.history = hist.slice(0, 20);
        try { localStorage.setItem('scan_history', JSON.stringify(self.history)); } catch (e) {}
        utils.go('/device_detail?id=' + device.id);
      }).catch(function (err) {
        if (err && err.message === 'cancelled') return;
        if (err && err.message === 'empty') { self.scanError = '扫码内容为空'; return; }
        self.scanError = '扫码失败，设备不存在或网络异常';
      }).finally(function () {
        self.scanning = false;
      });
    },
    goHistory: function (id) { utils.go('/device_detail?id=' + id); },
    clearHistory: function () {
      this.history = [];
      try { localStorage.removeItem('scan_history'); } catch (e) {}
      utils.toast('已清除');
    },
    statusBg: function (s) {
      return utils.statusColor(s);
    },
    statusText: function (s) {
      return utils.statusLabel(s);
    }
  }
};
