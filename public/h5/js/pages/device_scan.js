// M-11 设备扫码
window.Pages = window.Pages || {};
window.Pages.device_scan = {
  template: `
<div class="page">
  <div class="card scan-hero" @click="doScan">
    <div class="scan-icon">📷</div>
    <div class="scan-btn-text">扫码查询设备</div>
    <div class="scan-hint muted">点击按钮或长按扫一扫</div>
  </div>
  
  <!-- 扫码历史 -->
  <div v-if="history.length>0" class="section">
    <div class="section-header">
      <text class="section-title">最近扫码</text>
      <text class="muted" @click="clearHistory">清除</text>
    </div>
    <div v-for="item in history" :key="item.id"
      class="list-item card"
      @click="goHistory(item.id)">
      <div class="item-title">{{item.device_name || item.name || '设备' + item.id}}</div>
      <div class="item-sub muted">{{item.location || item.address || ''}} {{item.status ? '| ' + item.status : ''}}</div>
    </div>
  </div>
</div>
`,
  data() {
    return {
      history: []
    };
  },
  mounted() {
    const h = JSON.parse(localStorage.getItem('scan_history') || '[]');
    this.history = h;
  },
  methods: {
    async doScan() {
      try {
        const result = await utils.scanCode();
        const code = result.trim();
        if (!code) {
          utils.toast('扫码内容为空');
          return;
        }
        const d = await api.get('/api/mobile/devices/scan', { code: code });
        const device = d.data || d;
        if (device && device.id) {
          const h = [device, ...this.history.filter(i => i.id !== device.id)].slice(0, 20);
          this.history = h;
          localStorage.setItem('scan_history', JSON.stringify(h));
          utils.go('/device_detail?id=' + device.id);
        } else {
          utils.toast('设备不存在');
        }
      } catch (e) {
        utils.toast('扫码失败');
      }
    },
    goHistory(id) {
      utils.go('/device_detail?id=' + id);
    },
    clearHistory() {
      this.history = [];
      localStorage.removeItem('scan_history');
      utils.toast('已清除');
    }
  }
};
