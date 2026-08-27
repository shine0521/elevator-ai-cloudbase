// 整改工单列表 → H5 (Vue3 global build)
// GET /api/mobile/work-orders?status=  支持 status 筛选
// 状态 tab：全部 | 待整改 | 整改中 | 待验收 | 已关闭
// Vue 模板安全：逻辑全部在 computed / methods，模板内无 && || 裸& > <
window.Pages = window.Pages || {};
window.Pages.work_order = {
  template: `
  <div class="page wo">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <template v-else>
      <div class="tabs-bar">
        <span v-for="t in tabs" :key="t.key" class="tab-item" :class="tabClass(t.key)" @click="onTab(t.key)">{{ t.label }}</span>
      </div>

      <div class="list-wrap">
        <div v-for="item in filteredList" :key="item.id" class="list-item card" @click="goDetail(item.id)">
          <div class="wo-top">
            <span class="wo-no">{{ orderNo(item) }}</span>
            <span class="status-badge" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
          </div>
          <div class="wo-hazard muted">{{ hazardDesc(item) }}</div>
          <div class="wo-device">
            <span class="wo-dev-name">{{ deviceName(item) }}</span>
            <span v-if="showRisk(item)" class="risk-badge" :class="riskClass(item)">{{ riskLabel(item) }}</span>
          </div>
          <div v-if="showDeadline(item)" class="wo-deadline">
            <span class="wo-dl-label">整改期限</span>
            <span class="wo-dl-value">{{ deadlineText(item) }}</span>
          </div>
          <div class="wo-time muted">{{ timeText(item) }}</div>
        </div>
        <div v-if="showEmpty" class="empty-state"><span class="muted">暂无工单</span></div>
      </div>
    </template>

  </div>
  `,
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
    filteredList: function () {
      if (this.activeStatus === 'all') return this.list;
      var s = this.activeStatus;
      return this.list.filter(function (x) { return x.status === s; });
    },
    showEmpty: function () {
      return this.filteredList.length === 0;
    }
  },
  mounted: function () {
    this.load();
  },
  methods: {
    load: async function () {
      this.loading = true;
      try {
        var d = await api.get('/api/mobile/work-orders', { page: 1, size: 200 });
        this.list = (d && d.data) ? d.data : (Array.isArray(d) ? d : []);
      } catch (e) {
        utils.toast((e && e.message) || '加载失败');
        this.list = [];
      } finally {
        this.loading = false;
      }
    },
    onTab: function (k) { this.activeStatus = k; },
    tabClass: function (k) { return this.activeStatus === k ? 'active' : ''; },
    goDetail: function (id) { utils.go('/work_order_detail?id=' + id); },

    orderNo: function (item) { return item.order_no || ('工单 #' + item.id); },

    hazardDesc: function (item) {
      var t = item.hazard_description || item.hazardDescription || item.description || '';
      t = String(t);
      if (!t) return '（无关联隐患描述）';
      return t.length > 40 ? t.slice(0, 40) + '…' : t;
    },

    deviceName: function (item) {
      return item.device_name || item.deviceName || item.device_code || item.deviceCode || '设备未知';
    },

    showRisk: function (item) {
      return !!(item.risk_level || item.riskLevel || item.risk);
    },
    riskLevel: function (item) {
      var lv = String(item.risk_level || item.riskLevel || item.risk || '').toLowerCase();
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
      var m = { critical: 'risk-critical', major: 'risk-major', general: 'risk-general', low: 'risk-low' };
      return m[this.riskLevel(item)] || 'risk-low';
    },

    statusLabel: function (s) {
      var m = { pending: '待整改', rectifying: '整改中', verifying: '待验收', closed: '已关闭' };
      return m[s] || s || '';
    },
    statusClass: function (s) {
      var m = { pending: 'tag-warn', rectifying: 'tag-info', verifying: 'tag-primary', closed: 'tag-gray' };
      return m[s] || 'tag-gray';
    },

    showDeadline: function (item) { return !!(item.deadline || item.deadline_at); },
    deadlineText: function (item) { return utils.formatDate(item.deadline || item.deadline_at); },

    timeText: function (item) { return utils.formatDateTime(item.created_at || item.createdAt); }
  }
};
