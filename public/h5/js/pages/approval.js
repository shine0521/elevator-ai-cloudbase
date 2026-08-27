// 审批待办
window.Pages = window.Pages || {};
window.Pages.approval = {
  template: `
<div class="page">
  <div class="tab-bar card flex" style="gap:0;">
    <div :class="['tab', tab==='pending' ? 'active' : '']" :style="{fontSize:'14px',flex:'1',padding:'10px 0'}" @click="switchTab('pending')">
      待审批 <span v-if="hasPending" class="badge-orange">{{pendingList.length}}</span>
    </div>
    <div :class="['tab', tab==='done' ? 'active' : '']" :style="{fontSize:'14px',flex:'1',padding:'10px 0'}" @click="switchTab('done')">已审批</div>
  </div>

  <div v-if="tab==='pending'">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <div v-else-if="pendingEmpty" class="empty-state"><span class="muted">暂无待审批事项</span></div>
    <div v-else>
      <div v-for="item in pendingList" :key="item.id" class="list-item card" @click="goDetail(item.id)">
        <div class="item-main">
          <div class="item-title ellipsis">{{bizTitle(item)}}</div>
          <span class="status-badge" :style="{background: statusColor(item.current_node_status), color:'#fff'}">{{statusLabel(item.current_node_status)}}</span>
        </div>
        <div class="item-sub muted">{{bizLabel(item.biz_type)}}<span v-if="hasNode(item)"> · {{item.current_node}}</span></div>
        <div class="item-sub muted">申请人：{{applicant(item)}} · {{createdAt(item)}}</div>
      </div>
    </div>
  </div>

  <div v-else>
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <div v-else-if="doneEmpty" class="empty-state"><span class="muted">暂无已审批记录</span></div>
    <div v-else>
      <div v-for="item in doneList" :key="item.id" class="list-item card" @click="goDetail(item.id)">
        <div class="item-main">
          <div class="item-title ellipsis">{{bizTitle(item)}}</div>
          <span class="status-badge" :style="{background: statusColor(item.status), color:'#fff'}">{{decisionLabel(item.status)}}</span>
        </div>
        <div class="item-sub muted">{{bizLabel(item.biz_type)}}<span v-if="hasNode(item)"> · {{item.current_node}}</span></div>
        <div class="item-sub muted">审批人：{{approver(item)}} · {{decidedAt(item)}}</div>
      </div>
    </div>
  </div>
</div>
`,
  data() {
    return {
      tab: 'pending',
      pendingList: [],
      doneList: [],
      loading: true
    };
  },
  computed: {
    hasPending: function () {
      return this.pendingList.length > 0;
    },
    pendingEmpty: function () {
      return this.pendingList.length === 0;
    },
    doneEmpty: function () {
      return this.doneList.length === 0;
    }
  },
  mounted() {
    this.load();
  },
  methods: {
    switchTab: function (tab) {
      if (this.tab === tab) return;
      this.tab = tab;
      this.load();
    },
    load: async function () {
      this.loading = true;
      try {
        if (this.tab === 'pending') {
          var d = await api.get('/api/mobile/approvals');
          this.pendingList = d.data || d || [];
        } else {
          var d1 = await api.get('/api/mobile/approvals', { status: 'APPROVED' });
          var d2 = await api.get('/api/mobile/approvals', { status: 'REJECTED' });
          this.doneList = [(d1.data || d1 || []), (d2.data || d2 || [])].flat();
        }
      } catch (e) {
        utils.toast('加载失败');
      } finally {
        this.loading = false;
      }
    },
    bizTitle: function (item) {
      return item.biz_title || item.title || '';
    },
    applicant: function (item) {
      return item.applicant_name || item.applicant || '';
    },
    createdAt: function (item) {
      return item.created_at || item.create_time || '';
    },
    hasNode: function (item) {
      return !!item.current_node;
    },
    approver: function (item) {
      return item.approver_name || item.decided_by || item.approver || '';
    },
    decidedAt: function (item) {
      return item.decided_at || item.update_time || '';
    },
    bizLabel: function (type) {
      var m = {
        inspection: '日管控', daily: '日管控', weekly: '周排查',
        hazard: '隐患上报', emergency: '应急事件',
        work_order: '整改工单', monthly: '月调度'
      };
      return m[type] || type || '审批';
    },
    statusColor: function (s) {
      var m = { PENDING: '#FF8C00', APPROVED: '#52C41A', REJECTED: '#F5222D', FORWARDED: '#1677FF' };
      return m[String(s || '').toUpperCase()] || '#999';
    },
    statusLabel: function (s) {
      var m = { PENDING: '待审批', APPROVED: '已批准', REJECTED: '已驳回', FORWARDED: '已转审' };
      return m[String(s || '').toUpperCase()] || '待审批';
    },
    decisionLabel: function (s) {
      var m = { APPROVED: '批准', REJECTED: '驳回' };
      return m[String(s || '').toUpperCase()] || '已处理';
    },
    goDetail: function (id) {
      utils.go('/approval_detail?id=' + id);
    }
  }
};
