// M-08 隐患排查列表 → H5 (Vue3 global build)
// GET /api/mobile/hazards  |  风险等级彩标 + 统计栏 + 状态筛选
window.Pages = window.Pages || {};
window.Pages.hazard = {
  template: `
  <div class="page haz">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <template v-else>
      <!-- 统计栏（同时作为状态筛选） -->
      <div class="stats-bar">
        <div class="stat-item" :class="{active:activeTab==='all'}" @click="activeTab='all'">
          <div class="stat-num">{{stats.all}}</div><div class="stat-label">全部</div>
        </div>
        <div class="stat-item" :class="{active:activeTab==='pending'}" @click="activeTab='pending'">
          <div class="stat-num warn">{{stats.pending}}</div><div class="stat-label">待整改</div>
        </div>
        <div class="stat-item" :class="{active:activeTab==='rectifying'}" @click="activeTab='rectifying'">
          <div class="stat-num info">{{stats.rectifying}}</div><div class="stat-label">整改中</div>
        </div>
        <div class="stat-item" :class="{active:activeTab==='verifying'}" @click="activeTab='verifying'">
          <div class="stat-num primary">{{stats.verifying}}</div><div class="stat-label">待验收</div>
        </div>
        <div class="stat-item" :class="{active:activeTab==='closed'}" @click="activeTab='closed'">
          <div class="stat-num muted">{{stats.closed}}</div><div class="stat-label">已关闭</div>
        </div>
      </div>

      <div class="list-wrap">
        <div v-for="item in filteredList" :key="item.id" class="list-item card" @click="goDetail(item.id)">
          <div class="item-main">
            <div class="item-title">{{item.hazardType||item.hazard_type||item.deviceName||item.device_name||('隐患 #'+item.id)}}</div>
            <span class="risk-badge" :class="riskClass(item)">{{riskLabel(item)}}</span>
          </div>
          <div class="item-sub muted">{{item.createTime||item.create_time||item.createdAt||item.created_at||''}} · {{statusLabel(item.status)}}</div>
        </div>
        <div v-if="!filteredList.length" class="empty-state"><span class="muted">暂无隐患记录</span></div>
      </div>
    </template>
    <button class="fab" @click="goForm">+</button>

    <style>
      .haz .page, .haz.page { min-height: 100vh; background: var(--bg); padding-bottom: 80px; }
      .haz .stats-bar { display:flex; background:#fff; padding:14px 0; border-bottom:1px solid var(--border); }
      .haz .stat-item { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer; }
      .haz .stat-num { font-size:22px; font-weight:700; color:#333; }
      .haz .stat-num.warn { color:#FF6600; }
      .haz .stat-num.info { color:#1082FF; }
      .haz .stat-num.primary { color:#09B44A; }
      .haz .stat-num.muted { color:#888; }
      .haz .stat-label { font-size:12px; color:#888; }
      .haz .stat-item.active .stat-num { color:#1082FF; }
      .haz .stat-item.active .stat-label { color:#1082FF; }
      .haz .list-wrap { padding:12px; }
      .haz .item-title { font-size:15px; font-weight:600; color:#333; }
      .haz .item-sub { font-size:12px; color:#999; margin-top:6px; }
      /* 风险彩标 */
      .haz .risk-badge { display:inline-block; padding:2px 10px; border-radius:6px; font-size:12px; }
      .haz .risk-critical { background:#FFF1F0; color:#CF1322; }
      .haz .risk-major    { background:#FFF7E6; color:#D46B08; }
      .haz .risk-general  { background:#FFFBE6; color:#7CB305; }
      .haz .risk-low      { background:#F6FFED; color:#389E0D; }
      .haz .muted { color:#999; }
      .haz .empty-state { text-align:center; padding:40px 0; }
    </style>
  </div>
  `,
  data() {
    return {
      loading: true,
      list: [],
      activeTab: 'all',
      stats: { all: 0, pending: 0, rectifying: 0, verifying: 0, closed: 0 }
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
        const d = await api.get('/api/mobile/hazards', { page: 1, size: 200 });
        const arr = d.data || d || [];
        this.list = arr;
        this.stats = {
          all: arr.length,
          pending: arr.filter(x => x.status === 'pending').length,
          rectifying: arr.filter(x => x.status === 'rectifying').length,
          verifying: arr.filter(x => x.status === 'verifying').length,
          closed: arr.filter(x => x.status === 'closed').length
        };
      } catch (e) {
        utils.toast(e.message || '网络错误');
      } finally {
        this.loading = false;
      }
    },
    goForm() { utils.go('/hazard_form'); },
    goDetail(id) { utils.go('/hazard_form?id=' + id + '&mode=view'); },
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
    }
  }
};
