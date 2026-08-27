// pages/weekly.js — 周排查列表 M-05
// GET /api/mobile/weekly → {data:[...], total}，客户端 status 筛选（all/pending/ongoing/completed）
window.Pages = window.Pages || {};
window.Pages.weekly = {
  template: `

  <div class="page">
    <!-- 状态筛选 -->
    <div class="card wk-filter">
      <div v-for="t in statusOptions" :key="t.key"
        class="wk-tab" :class="tabClass(t.key)"
        @click="setStatus(t.key)">{{t.label}}</div>
    </div>

    <div v-if="loading" class="loading-row"><span class="muted">加载中...</span></div>
    <div v-else-if="list.length === 0" class="empty-state">
      <div class="empty-title">暂无周排查</div>
      <div class="empty-sub">点击右下角按钮新建周排查</div>
    </div>

    <div v-else class="list-wrap">
      <div v-for="item in filteredList" :key="item.id"
        class="list-item card" @click="goForm(item.id)">
        <div class="item-main">
          <div class="item-title">{{weekText(item)}}</div>
          <span class="status-badge" :style="statusStyle(item)">{{statusLabel(item.status)}}</span>
        </div>
        <div class="item-sub">{{deviceText(item)}}</div>
        <div class="wk-meta">
          <span class="wk-meta-i">检查人：{{inspectorText(item)}}</span>
          <span class="wk-meta-i">{{dateText(item)}}</span>
        </div>
        <div class="wk-progress">
          <div class="wk-progress-head">
            <span class="muted">通过进度</span>
            <span class="wk-progress-num">{{progressText(item)}}</span>
          </div>
          <div class="wk-bar"><div class="wk-bar-fill" :style="progressStyle(item)"></div></div>
        </div>
      </div>
    </div>

    <!-- 新建 FAB -->
    <button class="fab-pill" @click="goForm()"><span style="font-size:18px">＋</span> 新建周排查</button>
  </div>
  `,
  data() {
    return {
      loading: true,
      list: [],
      activeStatus: 'all',
      statusOptions: [
        { key: 'all', label: '全部' },
        { key: 'pending', label: '待检' },
        { key: 'ongoing', label: '进行中' },
        { key: 'completed', label: '已完成' }
      ]
    };
  },
  computed: {
    filteredList: function () {
      var self = this;
      if (this.activeStatus === 'all') return this.list;
      return this.list.filter(function (x) {
        return String(x.status || '').toLowerCase() === self.activeStatus;
      });
    }
  },
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      try {
        const d = await api.get('/api/mobile/weekly');
        this.list = d.data || d || [];
        this.loading = false;
      } catch (e) {
        if (!this._gone) utils.toast((e && e.message) || '网络错误');
        this.loading = false;
      }
    },
    setStatus(key) {
      if (this.activeStatus === key) return;
      this.activeStatus = key;
    },
    tabClass(key) {
      return this.activeStatus === key ? 'on' : '';
    },
    statusLabel(s) {
      const m = { pending: '待检', ongoing: '进行中', completed: '已完成' };
      return m[String(s || '').toLowerCase()] || (s || '待检');
    },
    statusColor(s) {
      const m = { pending: '#fa8c16', ongoing: '#1677ff', completed: '#52c41a' };
      return m[String(s || '').toLowerCase()] || '#999';
    },
    statusStyle(item) {
      return { background: this.statusColor(item.status) };
    },
    weekText(item) {
      return item.week_no || item.weekNo || '周排查';
    },
    deviceText(item) {
      const name = item.device_name || '未关联设备';
      const code = item.device_code || '';
      return code ? (name + '（' + code + '）') : name;
    },
    inspectorText(item) {
      return item.inspector_name || '—';
    },
    dateText(item) {
      return item.inspection_date || item.check_date || item.date || item.create_time || '';
    },
    isPass(it) {
      const r = it.compare_result || it.compareResult || it.result;
      if (r === 'pass' || r === 'PASS') return true;
      if (it.pass === true) return true;
      return false;
    },
    passCount(item) {
      if (item.pass_count != null) return item.pass_count;
      const items = item.items || [];
      let n = 0;
      for (let i = 0; i < items.length; i++) {
        if (this.isPass(items[i])) n++;
      }
      return n;
    },
    totalCount(item) {
      if (item.total_count != null) return item.total_count;
      return (item.items || []).length;
    },
    progressText(item) {
      return this.passCount(item) + ' / ' + this.totalCount(item);
    },
    progressStyle(item) {
      const total = this.totalCount(item);
      const pct = total > 0 ? Math.round((this.passCount(item) / total) * 100) : 0;
      return { width: pct + '%' };
    },
    goForm(id) {
      if (id) utils.go('/weekly_form?id=' + id);
      else utils.go('/weekly_form');
    }
  },
  unmounted() { this._gone = true; }
};
