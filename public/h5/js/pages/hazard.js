// 隐患排查列表 → H5（Vue3 global build，按契约 v2 重写）
// GET /api/mobile/hazards?status&riskLevel  api.getHazards({status,riskLevel})
// 列表用 .list/.list-item；risk_level 用 tag（low→tag-low / general→tag-general / major→tag-major / critical→tag-critical）
// 状态 tag（pending→tag-pending / rectifying→tag-info / verifying→tag-warning / closed→tag-ok）
// 点进 /hazard_detail?id=
window.Pages = window.Pages || {};
window.Pages.hazard = {
  name: 'hazard',
  props: ['query'],
  data: function () {
    return {
      loading: true,
      error: '',
      list: [],
      activeRisk: 'all',
      activeStatus: 'all',
      riskTabs: [
        { key: 'all', label: '全部' },
        { key: 'critical', label: '重大' },
        { key: 'major', label: '较大' },
        { key: 'general', label: '一般' },
        { key: 'low', label: '低' }
      ],
      statusTabs: [
        { key: 'all', label: '全部' },
        { key: 'pending', label: '待整改' },
        { key: 'rectifying', label: '整改中' },
        { key: 'verifying', label: '待验收' },
        { key: 'closed', label: '已关闭' }
      ]
    };
  },
  computed: {
    emptyList: function () { return this.list.length === 0; }
  },
  methods: {
    load: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      var params = {};
      if (self.activeStatus !== 'all') params.status = self.activeStatus;
      if (self.activeRisk !== 'all') params.riskLevel = self.activeRisk;
      api.getHazards(params).then(function (d) {
        var arr = d && d.data;
        self.list = Array.isArray(arr) ? arr : (Array.isArray(d) ? d : []);
      }).catch(function (e) {
        self.error = (e && e.message) ? e.message : '网络错误，请重试';
        self.list = [];
      }).then(function () {
        self.loading = false;
      });
    },
    onRisk: function (key) { this.activeRisk = key; this.load(); },
    onStatus: function (key) { this.activeStatus = key; this.load(); },
    isRiskOn: function (key) { return this.activeRisk === key; },
    isStatusOn: function (key) { return this.activeStatus === key; },
    goForm: function () { utils.go('/hazard_form'); },
    goDetail: function (id) { utils.go('/hazard_detail?id=' + id); },
    riskTagClass: function (level) {
      var m = { critical: 'tag-critical', major: 'tag-major', general: 'tag-general', low: 'tag-low' };
      return m[String(level || '').toLowerCase()] || 'tag-low';
    },
    riskLabel: function (level) {
      var m = { critical: '重大', major: '较大', general: '一般', low: '低' };
      return m[String(level || '').toLowerCase()] || String(level || '');
    },
    statusTagClass: function (status) {
      var m = { pending: 'tag-pending', rectifying: 'tag-info', verifying: 'tag-warning', closed: 'tag-ok' };
      return m[String(status || '')] || 'tag-pending';
    },
    statusLabel: function (status) {
      var m = { pending: '待整改', rectifying: '整改中', verifying: '待验收', closed: '已关闭' };
      return m[String(status || '')] || '待处理';
    },
    deviceLine: function (item) {
      var line = item.device_name || item.deviceName || '未知设备';
      var loc = item.location || item.device_location || item.deviceLocation;
      if (loc) line = line + ' · ' + loc;
      return line;
    },
    codeLine: function (item) {
      var parts = [];
      if (item.device_code || item.deviceCode) parts.push(item.device_code || item.deviceCode);
      if (item.hazard_no || item.hazardNo) parts.push(item.hazard_no || item.hazardNo);
      return parts.join(' · ');
    },
    hazardTypeLabel: function (item) { return item.hazard_type || item.hazardType || ''; },
    findTime: function (item) {
      var t = item.find_time || item.findTime || item.created_at || item.createdAt || '';
      return t ? utils.formatTime(t) : '';
    }
  },
  mounted: function () { this.load(); },
  template: `
  <div class="page">
    <div v-if="loading" class="loading-wrap"><span class="spinner"></span><span>加载中...</span></div>
    <div v-else-if="error" class="error-wrap">
      <div class="em-ic">⚠️</div>
      <div class="em-tip">{{ error }}</div>
      <button class="btn btn-o er-btn" @click="load">重试</button>
    </div>
    <template v-else>
      <div class="seg">
        <button v-for="t in riskTabs" :key="t.key" :class="isRiskOn(t.key) ? 'on' : ''" @click="onRisk(t.key)">{{ t.label }}</button>
      </div>
      <div class="seg">
        <button v-for="s in statusTabs" :key="s.key" :class="isStatusOn(s.key) ? 'on' : ''" @click="onStatus(s.key)">{{ s.label }}</button>
      </div>

      <div class="list">
        <div v-for="(item, i) in list" :key="item.id || i" class="list-item" @click="goDetail(item.id)">
          <div class="li-icon">⚠️</div>
          <div class="li-body">
            <div class="li-title">{{ deviceLine(item) }}</div>
            <div class="li-sub">{{ codeLine(item) }}<span v-if="hazardTypeLabel(item)"> · {{ hazardTypeLabel(item) }}</span></div>
            <div class="li-sub">
              <span class="tag" :class="statusTagClass(item.status)">{{ statusLabel(item.status) }}</span>
              <span v-if="findTime(item)" class="muted"> · {{ findTime(item) }}</span>
            </div>
          </div>
          <div class="li-extra" style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
            <span class="tag" :class="riskTagClass(item.risk_level)">{{ riskLabel(item.risk_level) }}</span>
          </div>
        </div>
        <div v-if="emptyList" class="empty-wrap"><div class="em-ic">📋</div><div class="em-tip">暂无隐患记录</div></div>
      </div>
    </template>
    <button class="fab" @click="goForm">＋</button>
  </div>
  `
};
