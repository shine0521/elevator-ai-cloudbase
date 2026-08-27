// M-10 整改工单列表 → H5 (Vue3 global build)
// GET /api/mobile/work-orders?status=  |  5 状态 tabs
window.Pages = window.Pages || {};
window.Pages.work_order = {
  template: `
  <div class="page wo">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <template v-else>
      <!-- 状态 tabs -->
      <div class="tabs-bar">
        <span v-for="t in tabs" :key="t.key" class="tab-item" :class="{active:activeTab===t.key}" @click="activeTab=t.key">{{t.label}}</span>
      </div>

      <div class="list-wrap">
        <div v-for="item in filteredList" :key="item.id" class="list-item card" @click="goDetail(item.id)">
          <div class="wo-title">{{item.title||item.order_no||('工单 #'+item.id)}}</div>
          <div class="wo-device">{{item.deviceName||item.device_name||item.deviceCode||'设备未知'}}</div>
          <div class="wo-tags">
            <span class="status-badge" :class="statusClass(item.status)">{{statusLabel(item.status)}}</span>
            <span v-if="item.riskLevel||item.risk_level" class="risk-badge" :class="riskClass(item)">{{riskLabel(item)}}</span>
          </div>
          <!-- 进度时间线 -->
          <div class="timeline">
            <div class="tl-dot" :class="{done:progressStep(item.status)>=0}"></div>
            <div class="tl-line" :class="{done:progressStep(item.status)>=1}"></div>
            <div class="tl-dot" :class="{done:progressStep(item.status)>=1}"></div>
            <div class="tl-line" :class="{done:progressStep(item.status)>=2}"></div>
            <div class="tl-dot" :class="{done:progressStep(item.status)>=2}"></div>
            <div class="tl-line" :class="{done:progressStep(item.status)>=3}"></div>
            <div class="tl-dot" :class="{done:progressStep(item.status)>=3}"></div>
          </div>
          <div class="timeline-labels"><span>待整改</span><span>整改中</span><span>待验收</span><span>已关闭</span></div>
          <div class="item-sub muted" style="margin-top:8px">{{item.createTime||item.create_time||item.createdAt||item.created_at||''}} {{item.assigneeName||item.assignee_name?('| 负责人：'+(item.assigneeName||item.assignee_name)):''}}</div>
        </div>
        <div v-if="!filteredList.length" class="empty-state"><span class="muted">暂无工单</span></div>
      </div>
    </template>

    <style>
      .wo.page { min-height:100vh; background:var(--bg); padding-bottom:20px; }
      .wo .tabs-bar { white-space:nowrap; background:#fff; border-bottom:1px solid var(--border); padding:0 8px; overflow-x:auto; }
      .wo .tab-item { display:inline-block; padding:12px; font-size:14px; color:#888; position:relative; cursor:pointer; }
      .wo .tab-item.active { color:#1082FF; font-weight:600; }
      .wo .tab-item.active::after { content:''; position:absolute; bottom:0; left:50%; transform:translateX(-50%); width:24px; height:3px; background:#1082FF; border-radius:2px; }
      .wo .list-wrap { padding:12px; }
      .wo .wo-title { font-size:15px; font-weight:600; color:#333; margin-bottom:4px; }
      .wo .wo-device { font-size:13px; color:#888; margin-bottom:8px; }
      .wo .wo-tags { display:flex; align-items:center; gap:8px; margin-bottom:12px; }
      .wo .risk-badge { display:inline-block; padding:2px 10px; border-radius:6px; font-size:12px; }
      .wo .risk-critical { background:#FFF1F0; color:#CF1322; }
      .wo .risk-major    { background:#FFF7E6; color:#D46B08; }
      .wo .risk-general  { background:#FFFBE6; color:#7CB305; }
      .wo .risk-low      { background:#F6FFED; color:#389E0D; }
      .wo .tag-warn    { background:#FFF7E6; color:#FF6600; }
      .wo .tag-info    { background:#E6F7FF; color:#1082FF; }
      .wo .tag-primary { background:#F6FFED; color:#09B44A; }
      .wo .tag-gray    { background:#F5F5F5; color:#888; }
      .wo .timeline { display:flex; align-items:center; padding:0 4px; margin-bottom:4px; }
      .wo .tl-dot { width:9px; height:9px; border-radius:50%; background:#ddd; flex-shrink:0; }
      .wo .tl-dot.done { background:#1082FF; }
      .wo .tl-line { flex:1; height:2px; background:#ddd; }
      .wo .tl-line.done { background:#1082FF; }
      .wo .timeline-labels { display:flex; justify-content:space-between; font-size:11px; color:#888; padding:0 1px; }
      .wo .item-sub { font-size:12px; color:#999; }
      .wo .muted { color:#999; }
      .wo .empty-state { text-align:center; padding:40px 0; }
    </style>
  </div>
  `,
  data() {
    return {
      loading: true,
      list: [],
      activeTab: 'all',
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
    filteredList() {
      if (this.activeTab === 'all') return this.list;
      return this.list.filter(x => x.status === this.activeTab);
    }
  },
  mounted() { this.load(); },
  methods: {
    async load() {
      try {
        const d = await api.get('/api/mobile/work-orders', { page: 1, size: 200 });
        this.list = d.data || d || [];
      } catch (e) {
        utils.toast(e.message || '网络错误');
      } finally {
        this.loading = false;
      }
    },
    goDetail(id) { utils.go('/work_order_detail?id=' + id); },
    riskLevel(item) {
      let lv = (item.riskLevel || item.risk_level || item.risk || '').toLowerCase();
      if (lv === 'high') lv = 'critical';
      if (lv === 'medium' || lv === 'mid') lv = 'major';
      if (['critical', 'major', 'general', 'low'].indexOf(lv) < 0) lv = 'low';
      return lv;
    },
    riskLabel(item) {
      const lv = this.riskLevel(item);
      return ({ critical: '重大', major: '较大', general: '一般', low: '低' })[lv] || '低';
    },
    riskClass(item) {
      const lv = this.riskLevel(item);
      return ({ critical: 'risk-critical', major: 'risk-major', general: 'risk-general', low: 'risk-low' })[lv] || 'risk-low';
    },
    statusLabel(s) {
      return ({ pending: '待整改', rectifying: '整改中', verifying: '待验收', closed: '已关闭' })[s] || s || '';
    },
    statusClass(s) {
      return ({ pending: 'tag-warn', rectifying: 'tag-info', verifying: 'tag-primary', closed: 'tag-gray' })[s] || 'tag-gray';
    },
    progressStep(status) {
      const map = { pending: 0, rectifying: 1, verifying: 2, closed: 3 };
      return map[status] != null ? map[status] : 0;
    }
  }
};
