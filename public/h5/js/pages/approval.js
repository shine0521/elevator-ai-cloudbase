// M-15 审批待办
window.Pages = window.Pages || {};
window.Pages.approval = {
  template: `
<div class="page">
  <!-- Tab 切换 -->
  <div class="tab-bar card">
    <div :class="['tab', tab==='pending'?'active':'']" @click="tab='pending'">
      待审批 <text v-if="pendingList.length>0" class="badge-tiny">{{pendingList.length}}</text>
    </div>
    <div :class="['tab', tab==='done'?'active':'']" @click="tab='done'">已审批</div>
  </div>
  
  <!-- 待审批列表 -->
  <div v-if="tab==='pending'">
    <div v-if="loading" class="empty-state"><text class="muted">加载中...</text></div>
    <div v-else-if="pendingList.length===0" class="empty-state"><text class="muted">暂无待审批项</text></div>
    <div v-else class="list-wrap">
      <div v-for="item in pendingList" :key="item.id"
        class="list-item card"
        @click="goDetail(item.id)">
        <div class="item-main">
          <div class="item-title">{{item.biz_title || item.title || bizLabel(item.biz_type)}}</div>
          <div class="status-badge" :style="{background:statusColor(item.status),color:'#fff'}">待审批</div>
        </div>
        <div class="item-sub muted">
          <text>{{bizLabel(item.biz_type)}}</text>
          <text v-if="item.current_node"> | {{item.current_node}}</text>
          <text v-if="item.applicant_name || item.applicant"> | 申请人：{{item.applicant_name || item.applicant}}</text>
        </div>
        <div class="item-sub muted">
          <text v-if="item.create_time || item.created_at">{{item.create_time || item.created_at}}</text>
        </div>
      </div>
    </div>
  </div>
  
  <!-- 已审批列表 -->
  <div v-if="tab==='done'">
    <div v-if="loading" class="empty-state"><text class="muted">加载中...</text></div>
    <div v-else-if="doneList.length===0" class="empty-state"><text class="muted">暂无已审批记录</text></div>
    <div v-else class="list-wrap">
      <div v-for="item in doneList" :key="item.id"
        class="list-item card"
        @click="goDetail(item.id)">
        <div class="item-main">
          <div class="item-title">{{item.biz_title || item.title || bizLabel(item.biz_type)}}</div>
          <div class="status-badge" :style="{background:statusColor(item.status),color:'#fff'}">
            {{item.status==='APPROVED'?'已批准':'已驳回'}}
          </div>
        </div>
        <div class="item-sub muted">
          <text>{{bizLabel(item.biz_type)}}</text>
          <text v-if="item.decided_by || item.approver"> | 审批人：{{item.decided_by || item.approver}}</text>
        </div>
        <div class="item-sub muted">
          <text v-if="item.decided_at || item.update_time">{{item.decided_at || item.update_time}}</text>
        </div>
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
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const pending = await api.get('/api/mobile/approvals');
        const done = await api.get('/api/mobile/approvals?status=APPROVED');
        this.pendingList = pending.data || pending || [];
        this.doneList = (done.data || done || []).filter(i => i.status !== 'PENDING');
        this.loading = false;
      } catch (e) {
        this.loading = false;
        utils.toast('网络错误');
      }
    },
    statusColor(s) {
      const STATUS_COLORS = {
        PENDING: '#FF8C00',
        APPROVED: '#52C41A',
        REJECTED: '#F5222D'
      };
      return STATUS_COLORS[s] || '#999';
    },
    bizLabel(type) {
      const BIZ_TYPE_LABELS = {
        inspection: '日管控检查',
        daily: '日管控检查',
        weekly: '周排查',
        hazard: '隐患排查',
        emergency: '应急事件',
        work_order: '工单',
        monthly: '月调度'
      };
      return BIZ_TYPE_LABELS[type] || type || '审批';
    },
    goDetail(id) {
      utils.go('/approval_detail?id=' + id);
    }
  }
};
