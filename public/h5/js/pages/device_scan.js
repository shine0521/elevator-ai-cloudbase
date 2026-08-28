// 设备扫码查询 → H5（Vue3 global build，按契约 v2 重写）
// GET /api/mobile/devices/scan?code=  →  设备卡片  →  /device_detail?id=
// 铁律：v-model 仅限 input/select/textarea；模板无裸 && || < >；禁止 SVG；根 <div class="page">
window.Pages = window.Pages || {};
window.Pages.device_scan = {
  name: 'device_scan',
  props: ['query'],
  data: function () {
    return {
      loading: false,
      errorMsg: '',
      searchCode: '',
      result: null,
      history: []
    };
  },
  computed: {
    hasResult: function () { return this.result !== null; },
    hasHistory: function () { return this.history.length > 0; },
    canSearch: function () { return this.searchCode.trim().length > 0; },
    // Vue 编译器在 v-if 中遇到 && + ! 组合时报 Cannot read [0]，拆解到 computed
    showHistorySection: function () {
      var hr = this.hasHistory;
      var nr = !this.hasResult;
      var nl = !this.loading;
      var ne = !this.errorMsg;
      return hr && nr && nl && ne;
    },
    showEmptySearch: function () {
      var nr = !this.hasResult;
      var nl = !this.loading;
      var ne = !this.errorMsg;
      var hr = !this.hasHistory;
      return nr && nl && ne && hr;
    },
    // Vue :style 禁用字面量 hex，改用 computed
    statusBgStyle: function () {
      if (!this.result) return {};
      return { background: utils.statusColor(this.result.status), color: 'var(--card)' };
    },
    riskBgStyle: function () {
      if (!this.result || !this.result.risk_level) return {};
      return { background: utils.levelColor(this.result.risk_level), color: 'var(--card)' };
    },
    // 设备卡片类型+位置行（拆解 v-if 中的 && 避免 Vue 编译器失败）
    showTypeDot: function () { var t = this.result; return !!(t && t.device_type && t.location); },
    showTypeLabel: function () { var t = this.result; return !!(t && t.device_type); },
    showLocationLabel: function () { var t = this.result; return !!(t && t.location); },
    showLastInspection: function () {
      var t = this.result;
      return !!(t && (t.last_inspection_date || t.last_inspection));
    }
  },
  methods: {
    load: function () {
      try {
        this.history = JSON.parse(localStorage.getItem('scan_history') || '[]');
      } catch (e) {
        this.history = [];
      }
    },
    doScan: function () {
      var self = this;
      self.errorMsg = '';
      self.result = null;
      utils.scanCode().then(function (code) {
        self.searchCode = code;
        return self.queryByCode(code);
      }).catch(function (err) {
        if (err && err.message === 'cancelled') return;
        if (err && err.message === 'empty') { self.errorMsg = '扫码内容为空'; return; }
        self.errorMsg = '扫码失败，请重试';
      });
    },
    doSearch: function () {
      var self = this;
      var code = self.searchCode.trim();
      if (!code) { self.errorMsg = '请输入设备编号'; return; }
      self.errorMsg = '';
      self.result = null;
      self.queryByCode(code);
    },
    queryByCode: function (code) {
      var self = this;
      self.loading = true;
      return api.scanDevice(code).then(function (d) {
        var dev = d && d.data ? d.data : d;
        if (!dev || !dev.id) {
          self.errorMsg = '未找到该设备';
          return;
        }
        self.result = dev;
        // 保存历史
        var hist = self.history.filter(function (it) { return it.id !== dev.id; });
        hist.unshift({ id: dev.id, device_name: dev.device_name, location: dev.location, status: dev.status });
        self.history = hist.slice(0, 20);
        try { localStorage.setItem('scan_history', JSON.stringify(self.history)); } catch (e) {}
      }).catch(function () {
        self.errorMsg = '设备不存在或网络异常';
      }).then(function () {
        self.loading = false;
      });
    },
    goDetail: function (id) {
      if (id) utils.go('/device_detail?id=' + id);
    },
    goHistoryItem: function (item) {
      if (item && item.id) utils.go('/device_detail?id=' + item.id);
    },
    clearHistory: function () {
      this.history = [];
      try { localStorage.removeItem('scan_history'); } catch (e) {}
      utils.toast('已清除');
    },
    // 展示用辅助方法（模板不裸写运算符）
    deviceStatusLabel: function (s) { return utils.statusLabel(s); },
    deviceRiskLabel: function (l) { return utils.levelLabel(l); },
    lastInspectionFmt: function (item) {
      var d = item.last_inspection_date || item.last_inspection || '';
      return d ? utils.formatDate(d) : '暂无';
    }
  },
  mounted: function () { this.load(); },
  template: `
  <div class="page">
    <!-- 顶部提示卡片 -->
    <div class="card" style="text-align:center;padding:28px 20px;margin-bottom:12px;">
      <div style="font-size:56px;margin-bottom:10px;">📱</div>
      <div style="font-size:15px;font-weight:600;margin-bottom:4px;">设备扫码查询</div>
      <div class="muted" style="font-size:12px;">扫描设备二维码或输入设备编号查询</div>
    </div>

    <!-- 搜索框 + 扫码按钮 -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <input
        v-model="searchCode"
        placeholder="输入设备编号..."
        style="flex:1;height:40px;border:1px solid var(--border);border-radius:8px;padding:0 12px;font-size:14px;outline:none;background:#fff;box-sizing:border-box;"
        @keyup.enter="doSearch"
      >
      <button class="btn-primary" style="padding:0 14px;height:40px;border-radius:8px;font-size:14px;white-space:nowrap;" @click="doSearch">查询</button>
      <button class="btn-primary" style="padding:0 14px;height:40px;border-radius:8px;font-size:14px;white-space:nowrap;background:var(--success);" @click="doScan">📷 扫码</button>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="empty-wrap">
      <div style="width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:12px;"></div>
      <div class="em-tip">查询中...</div>
    </div>

    <!-- 错误提示 -->
    <div v-else-if="errorMsg" class="error-wrap">
      <div style="font-size:44px;margin-bottom:12px;">⚠️</div>
      <div class="em-tip">{{ errorMsg }}</div>
    </div>

    <!-- 设备卡片结果 -->
    <div v-else-if="hasResult" class="card" style="cursor:pointer;" @click="goDetail(result.id)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:16px;font-weight:700;margin-bottom:4px;">{{ result.device_name || '未知设备' }}</div>
          <div class="muted" style="font-size:12px;">{{ result.device_code || '-' }}</div>
        </div>
        <div style="font-size:20px;margin-left:8px;flex-shrink:0;">→</div>
      </div>
      <div class="muted fz12" style="margin-bottom:8px;">
        <span v-if="showTypeLabel">{{ result.device_type }}</span>
        <span v-if="showTypeDot"> · </span>
        <span v-if="showLocationLabel">{{ result.location }}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
        <span class="tag" :style="statusBgStyle">{{ deviceStatusLabel(result.status) }}</span>
        <span v-if="result.risk_level" class="tag" :style="riskBgStyle">{{ deviceRiskLabel(result.risk_level) }}</span>
        <span v-if="showLastInspection" class="muted fz12">上次检验：{{ lastInspectionFmt(result) }}</span>
      </div>
    </div>

    <!-- 最近扫码历史 -->
    <div v-if="showHistorySection">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="font-size:14px;font-weight:600;color:var(--text-2);">最近扫码</div>
        <span class="muted fz12" style="cursor:pointer;" @click.stop="clearHistory">清除</span>
      </div>
      <div class="list">
        <div v-for="(item, i) in history" :key="item.id || i" class="list-item" @click="goHistoryItem(item)">
          <div class="li-icon">📱</div>
          <div class="li-body">
            <div class="li-title">{{ item.device_name || '设备' }}</div>
            <div class="li-sub" v-if="item.location">{{ item.location }}</div>
          </div>
          <span class="tag" :style="{ background: utils.statusColor(item.status), color: 'var(--card)' }">{{ deviceStatusLabel(item.status) }}</span>
          <span class="li-arrow">→</span>
        </div>
      </div>
    </div>

    <!-- 无结果空态（无历史时） -->
    <div v-if="showEmptySearch" class="empty-wrap">
      <div class="em-ic">🔍</div>
      <div class="em-tip">请输入设备编号或点击扫码查询</div>
    </div>

  </div>
  `
};
