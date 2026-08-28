// 整改工单列表 → H5（Vue3 全局构建，按契约 v2 重写）
// GET /api/mobile/work-orders?status  api.getWorkOrders({status})
// .list 列表；status tag（pending→tag-pending / rectifying→tag-info / verifying→tag-warning / closed→tag-ok）
// risk_level tag（low→tag-low / general→tag-general / major→tag-major / critical→tag-critical）
// 点进 /work_order_detail?id=
// 铁律：v-model 仅限 input/select/textarea；模板无裸 && || < >；禁止 SVG；根 <div class="page">
window.Pages = window.Pages || {};
window.Pages.work_order = {
  name: 'work_order',
  props: ['query'],
  data: function () {
    return {
      loading: true,
      error: '',
      list: [],
      activeStatus: 'all',
      tabs: [
        { key: 'all', label: '全部' },
        { key: 'pending', label: '待整改' },
        { key: 'rectifying', label: '整改中' },
        { key: 'verifying', label: '待验收' },
        { key: 'closed', label: '已关闭' }
      ]
    };
  },
  computed: {
    showEmpty: function () { return this.list.length === 0; }
  },
  methods: {
    load: function () {
      var self = this;
      self.loading = true;
      self.error = '';
      var params = {};
      if (self.activeStatus !== 'all') params.status = self.activeStatus;
      return api.getWorkOrders(params).then(function (d) {
        self.list = (d && d.data) ? d.data : (Array.isArray(d) ? d : []);
      }).catch(function (e) {
        self.error = (e && e.message) ? e.message : '加载失败';
        self.list = [];
      }).then(function () {
        self.loading = false;
      });
    },
    onTab: function (k) {
      if (this.activeStatus === k) return;
      this.activeStatus = k;
      this.load();
    },
    tabClass: function (k) { return this.activeStatus === k ? 'on' : ''; },
    goDetail: function (id) { utils.go('/work_order_detail?id=' + id); },
    orderNo: function (item) { return item.order_no || ('工单 #' + item.id); },
    hazardDesc: function (item) {
      var t = item.hazard_desc || item.hazard_description || item.description || '';
      return String(t) || '（无隐患描述）';
    },
    deviceName: function (item) {
      return item.device_name || item.device_code || '设备未知';
    },
    riskLevel: function (item) {
      var lv = String(item.risk_level || item.risk || '').toLowerCase();
      if (lv === 'high') lv = 'critical';
      if (lv === 'medium' || lv === 'mid') lv = 'major';
      if (['critical', 'major', 'general', 'low'].indexOf(lv) < 0) lv = 'low';
      return lv;
    },
    riskTagClass: function (item) {
      var m = { critical: 'tag-critical', major: 'tag-major', general: 'tag-general', low: 'tag-low' };
      return m[this.riskLevel(item)] || 'tag-low';
    },
    riskLabel: function (item) {
      var m = { critical: '重大', major: '较大', general: '一般', low: '低' };
      return m[this.riskLevel(item)] || '低';
    },
    statusTagClass: function (s) {
      var m = { pending: 'tag-pending', rectifying: 'tag-info', verifying: 'tag-warning', closed: 'tag-ok' };
      return m[String(s || '')] || 'tag-pending';
    },
    statusLabel: function (s) {
      var m = { pending: '待整改', rectifying: '整改中', verifying: '待验收', closed: '已关闭' };
      return m[String(s || '')] || '待处理';
    },
    ownerName: function (item) { return item.rectify_by_name || item.rectify_owner_name || ''; },
    timeText: function (item) { return utils.formatDateTime(item.created_at || item.createdAt); }
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
        <button v-for="t in tabs" :key="t.key" :class="tabClass(t.key)" @click="onTab(t.key)">{{ t.label }}</button>
      </div>
      <div class="list">
        <div v-for="(item, i) in list" :key="item.id || i" class="list-item" @click="goDetail(item.id)">
          <div class="li-icon">🔧</div>
          <div class="li-body">
            <div class="li-title">{{ orderNo(item) }}</div>
            <div class="li-sub">{{ deviceName(item) }}</div>
            <div class="li-sub">{{ hazardDesc(item) }}</div>
          </div>
          <div class="li-extra" style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
            <span class="tag" :class="statusTagClass(item.status)">{{ statusLabel(item.status) }}</span>
            <span class="tag" :class="riskTagClass(item)">{{ riskLabel(item) }}</span>
          </div>
        </div>
        <div v-if="showEmpty" class="empty-wrap"><div class="em-ic">📝</div><div class="em-tip">暂无工单</div></div>
      </div>
    </template>
  </div>
  `
};
