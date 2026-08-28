// 审批列表 - H5 (Vue3 全局构建, 按契约重写)
// 契约 #20: GET /api/mobile/approvals?status → {data:[{id,title,type,business_type,current_node,total_nodes,status,applicant_email,created_at}]}
// 铁律: v-model 仅限 input/select/textarea; 模板禁裸 && || < >; 根 <div class="page">; 三态齐全; 禁 SVG
window.Pages = window.Pages || {};
window.Pages.approval = {
  name: 'approval',
  props: ['query'],
  data: function () {
    return {
      loading: true,
      error: false,
      list: [],
      activeTab: 'pending',
      tabs: [
        { key: 'pending', label: '待审' },
        { key: 'approved', label: '已批' },
        { key: 'rejected', label: '已拒' },
        { key: 'all', label: '全部' }
      ]
    };
  },
  computed: {
    showEmpty: function () {
      return !this.loading && !this.error && this.list.length === 0;
    },
    statusLabelMap: function () {
      return {
        PENDING: '待审批',
        APPROVED: '已批准',
        REJECTED: '已驳回',
        RECALLED: '已撤回',
        CANCELLED: '已取消'
      };
    },
    statusClassMap: function () {
      return {
        PENDING: 'tag-pending',
        APPROVED: 'tag-ok',
        REJECTED: 'tag-ng',
        RECALLED: 'tag-low',
        CANCELLED: 'tag-low'
      };
    },
    bizLabelMap: function () {
      return {
        daily_inspection: '日管控',
        weekly_inspection: '周排查',
        hazard: '隐患上报',
        emergency: '应急事件',
        work_order: '整改工单',
        monthly: '月调度'
      };
    }
  },
  methods: {
    load: function () {
      var self = this;
      self.loading = true;
      self.error = false;
      var params = {};
      if (self.activeTab !== 'all') {
        params.status = self.activeTab.toUpperCase();
      }
      api.get('/api/mobile/approvals', params).then(function (d) {
        self.list = (d && d.data) ? d.data : (Array.isArray(d) ? d : []);
      }).catch(function (e) {
        self.error = true;
        utils.toast((e && e.message) || '加载失败');
      }).then(function () {
        self.loading = false;
      });
    },
    onTab: function (k) {
      if (this.activeTab === k) return;
      this.activeTab = k;
      this.load();
    },
    tabClass: function (k) {
      return this.activeTab === k ? 'active' : '';
    },
    goDetail: function (id) {
      utils.go('/approval_detail?id=' + id);
    },
    bizTitle: function (item) {
      return item.business_title || item.title || '审批单';
    },
    bizLabel: function (type) {
      return this.bizLabelMap[type] || type || '审批';
    },
    statusLabel: function (s) {
      return this.statusLabelMap[s] || s || '';
    },
    statusClass: function (s) {
      return this.statusClassMap[s] || 'tag-low';
    },
    nodeText: function (item) {
      var node = item.current_node;
      var total = item.total_nodes;
      if (!node) return '';
      return '节点 ' + node + (total ? '/' + total : '');
    },
    createdAt: function (item) {
      return utils.formatDateTime(item.created_at);
    },
    applicantText: function (item) {
      return item.applicant_email || item.applicant_name || '';
    }
  },
  mounted: function () {
    this.load();
  },
  template: `
<div class="page">
  <div v-if="loading" class="empty-state">
    <div class="loading-spinner"></div>
    <div class="muted" style="margin-top:12px;">加载中...</div>
  </div>

  <div v-else-if="error" class="empty-state">
    <div class="text-danger">❌ 加载失败</div>
    <button class="btn btn-primary" style="margin-top:16px;" @click="load">重试</button>
  </div>

  <template v-else>
    <div class="seg">
      <span v-for="t in tabs" :key="t.key" class="seg-item" :class="tabClass(t.key)" @click="onTab(t.key)">{{ t.label }}</span>
    </div>

    <div v-if="showEmpty" class="empty-state">
      <div class="muted">⚖️ 暂无审批记录</div>
    </div>

    <div v-else class="list">
      <div v-for="item in list" :key="item.id" class="list-item card" @click="goDetail(item.id)">
        <div class="li-row">
          <span class="li-title">{{ bizTitle(item) }}</span>
          <span class="tag" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
        </div>

        <div class="li-sub text-2">
          <span>{{ bizLabel(item.business_type) }}</span>
          <span v-if="nodeText(item)" style="margin-left:8px;">· {{ nodeText(item) }}</span>
        </div>

        <div v-if="applicantText(item)" class="li-sub muted">
          申请人：{{ applicantText(item) }}
        </div>

        <div class="li-sub muted">{{ createdAt(item) }}</div>
      </div>
    </div>
  </template>
</div>
`
};
