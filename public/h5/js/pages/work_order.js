// 整改工单列表 → H5（Vue3 全局构建，按契约重写）
// 契约 #13：api.getWorkOrders({status})；status 筛选 tab(pending/rectifying/verifying/closed)
// 项显示 order_no / device_name / hazard_desc / risk_level / status；点进 /work_order_detail?id=
// 铁律：v-model 仅限 input/select/textarea；模板无裸 && || < >；禁止 SVG；根 <div class="page">
window.Pages = window.Pages || {};
window.Pages.work_order = {
  name: 'work_order',
  props: ['query'],
  data: function () {
    return {
      loading: true,
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
    showEmpty: function () {
      return this.list.length === 0;
    }
  },
  methods: {
    load: function () {
      var self = this;
      self.loading = true;
      var params = { page: 1, pageSize: 200 };
      if (self.activeStatus !== 'all') params.status = self.activeStatus;
      return api.getWorkOrders(params).then(function (d) {
        self.list = (d && d.data) ? d.data : (Array.isArray(d) ? d : []);
      }).catch(function (e) {
        utils.toast((e && e.message) || '加载失败');
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
    tabClass: function (k) {
      return this.activeStatus === k ? 'active' : '';
    },
    goDetail: function (id) {
      utils.go('/work_order_detail?id=' + id);
    },
    orderNo: function (item) {
      return item.order_no || ('工单 #' + item.id);
    },
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
    riskLabel: function (item) {
      var m = { critical: '重大', major: '较大', general: '一般', low: '低' };
      return m[this.riskLevel(item)] || '低';
    },
    riskClass: function (item) {
      var m = { critical: 'badge-red', major: 'badge-orange', general: 'badge-yellow', low: 'badge-green' };
      return m[this.riskLevel(item)] || 'badge-gray';
    },
    statusLabel: function (s) {
      var m = { pending: '待整改', rectifying: '整改中', verifying: '待验收', closed: '已关闭' };
      return m[s] || s || '';
    },
    statusClass: function (s) {
      var m = { pending: 'badge-orange', rectifying: 'badge-blue', verifying: 'badge-green', closed: 'badge-gray' };
      return m[s] || 'badge-gray';
    },
    timeText: function (item) {
      return utils.formatDateTime(item.created_at || item.createdAt);
    }
  },
  mounted: function () {
    this.load();
  },
  template: `
  <div class="page wo">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <template v-else>
      <div class="tabs-bar">
        <span v-for="t in tabs" :key="t.key" class="tab-item" :class="tabClass(t.key)" @click="onTab(t.key)">{{ t.label }}</span>
      </div>
      <div class="list-wrap">
        <div v-for="item in list" :key="item.id" class="list-item card" @click="goDetail(item.id)">
          <div class="wo-top">
            <span class="wo-no">{{ orderNo(item) }}</span>
            <span class="badge" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
          </div>
          <div class="wo-hazard muted">{{ hazardDesc(item) }}</div>
          <div class="wo-device">
            <span class="wo-dev-name">{{ deviceName(item) }}</span>
            <span class="badge" :class="riskClass(item)">{{ riskLabel(item) }}</span>
          </div>
          <div class="wo-time muted">{{ timeText(item) }}</div>
        </div>
        <div v-if="showEmpty" class="empty-state"><span class="muted">暂无工单</span></div>
      </div>
    </template>
  </div>
  `
};
