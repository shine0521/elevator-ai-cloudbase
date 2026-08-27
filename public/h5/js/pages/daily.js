// pages/daily.js — 日管控列表 M-03（转换自 elevator-mini/pages/daily）
// 调 GET /api/mobile/inspections?type=daily&status=，状态筛选 + 卡片 + FAB 新建
window.Pages = window.Pages || {};
window.Pages.daily = {
  template: `
  <style>
  .tag-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .tab-tag { background: #f5f6fa; color: var(--text); cursor: pointer; padding: 5px 12px; border-radius: 14px; }
  .tab-tag.tag-on { background: var(--primary); color: #fff; }
  </style>
  <div class="page">
    <!-- 状态筛选 -->
    <div class="card" style="padding:8px 10px">
      <div class="tag-row">
        <span
          v-for="t in statusTabs" :key="t.value"
          class="tag tab-tag" :class="status === t.value ? 'tag-on' : ''"
          @click="setStatus(t.value)"
        >{{t.label}}</span>
      </div>
    </div>

    <div v-if="loading" class="loading-row"><span class="muted">加载中...</span></div>
    <div v-else-if="list.length===0" class="empty-state"><span class="muted">暂无日管控检查</span></div>

    <div v-else class="list-wrap">
      <div v-for="item in list" :key="item.id" class="list-item card" @click="goForm(item.id)">
        <div class="item-main">
          <div class="item-title">{{item.device_name || item.inspection_no || '记录 #' + item.id}}</div>
          <span class="status-badge" :style="{background: statusColor(item.status)}">{{item.status || '进行中'}}</span>
        </div>
        <div class="item-sub">
          <span>{{item.check_date || item.inspection_date || item.create_time || ''}}</span>
          <span v-if="item.location"> | {{item.location}}</span>
          <span v-if="item.inspector_name"> | {{item.inspector_name}}</span>
        </div>
      </div>
    </div>

    <!-- 新建 FAB -->
    <button class="fab" @click="goForm()">＋</button>
  </div>
  `,
  data() {
    return {
      list: [],
      loading: true,
      status: '',
      statusTabs: [
        { label: '全部', value: '' },
        { label: '待检查', value: 'pending' },
        { label: '进行中', value: 'ongoing' },
        { label: '已提交', value: 'submitted' },
        { label: '已复核', value: 'reviewed' }
      ]
    };
  },
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const d = await api.get('/api/mobile/inspections', { type: 'daily', status: this.status || '', page: 1, size: 50 });
        this.list = d.data || d || [];
      } catch (e) {
        if (!this._gone) utils.toast(e.message || '网络错误');
      } finally {
        if (!this._gone) this.loading = false;
      }
    },
    setStatus(s) {
      if (this.status === s) return;
      this.status = s;
      this.load();
    },
    statusColor(s) {
      const m = {
        PENDING: '#FF8C00', ONGOING: '#1082FF', SUBMITTED: '#52C41A',
        REVIEWED: '#1082FF', IN_PROGRESS: '#1082FF', APPROVED: '#52C41A', REJECTED: '#F5222D'
      };
      return m[String(s || '').toUpperCase()] || '#999';
    },
    goForm(id) {
      utils.go('/daily_form' + (id ? '?id=' + id : ''));
    }
  },
  unmounted() { this._gone = true; }
};
