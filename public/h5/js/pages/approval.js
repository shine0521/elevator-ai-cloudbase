// 审批待办列表
window.Pages = window.Pages || {};
window.Pages.approval = {
  name: 'approval',
  props: ['query'],
  template: `
<div class="page">
  <div class="filter-bar" style="margin-bottom:10px;">
    <div :class="['check-tab', isPendingTab ? 'check-tab-on' : '']" @click="switchTab('pending')">
      待审批 <span v-if="hasPending" class="badge badge-orange">{{pendingCount}}</span>
    </div>
    <div :class="['check-tab', isAllTab ? 'check-tab-on' : '']" @click="switchTab('all')">
      全部
    </div>
  </div>

  <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
  <div v-else-if="listEmpty" class="empty-state"><span class="muted">暂无审批记录</span></div>
  <div v-else>
    <div v-for="(item, i) in list" :key="item.id || i" class="device-card" @click="goDetail(item.id)">
      <div class="flex-between" style="margin-bottom:6px;">
        <span class="dev-name ellipsis" style="flex:1;">{{bizTitle(item)}}</span>
        <span class="badge" :style="{background: statusBg(item.status), color:'#fff'}">{{statusText(item.status)}}</span>
      </div>
      <div class="dev-sub">
        {{bizLabel(item.business_type)}}
        <span v-if="hasNode(item)"> · {{nodeName(item)}}</span>
      </div>
      <div class="dev-sub">{{createdAt(item)}}</div>
    </div>
  </div>
</div>
`,
  data: function () {
    return {
      tab: 'pending',
      list: [],
      loading: true
    };
  },
  computed: {
    isPendingTab: function () { return this.tab === 'pending'; },
    isAllTab: function () { return this.tab === 'all'; },
    hasPending: function () { return this.pendingCount > 0; },
    pendingCount: function () {
      return this.list.filter(function (item) { return item.status === 'PENDING'; }).length;
    },
    listEmpty: function () { return this.list.length === 0; }
  },
  mounted: function () { this.load(); },
  methods: {
    switchTab: function (tab) {
      if (this.tab === tab) return;
      this.tab = tab;
      this.load();
    },
    load: function () {
      var self = this;
      self.loading = true;
      var params = {};
      if (self.tab === 'pending') params.status = 'PENDING';
      api.getApprovals(params).then(function (d) {
        self.list = d.data || d || [];
      }).catch(function () {
        utils.toast('加载失败');
      }).finally(function () {
        self.loading = false;
      });
    },
    bizTitle: function (item) {
      return item.business_title || item.title || '审批单';
    },
    bizLabel: function (type) {
      var m = {
        daily_inspection: '日管控',
        weekly_inspection: '周排查',
        hazard: '隐患上报',
        emergency: '应急事件',
        work_order: '整改工单',
        monthly: '月调度'
      };
      return m[type] || type || '审批';
    },
    hasNode: function (item) { return !!(item.node_name || item.current_node); },
    nodeName: function (item) { return item.node_name || item.current_node || ''; },
    createdAt: function (item) {
      return utils.formatDateTime(item.created_at || item.create_time || '');
    },
    statusBg: function (s) {
      var m = {
        PENDING: 'var(--orange)',
        APPROVED: 'var(--green)',
        REJECTED: 'var(--red)',
        FORWARDED: 'var(--primary)'
      };
      return m[String(s || '').toUpperCase()] || 'var(--muted)';
    },
    statusText: function (s) {
      var m = {
        PENDING: '待审批',
        APPROVED: '已批准',
        REJECTED: '已驳回',
        FORWARDED: '已转审'
      };
      return m[String(s || '').toUpperCase()] || (s || '待审批');
    },
    goDetail: function (id) { utils.go('/approval_detail?id=' + id); }
  }
};
