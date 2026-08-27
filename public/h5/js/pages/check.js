// pages/check.js — 检查聚合列表 M（转换自 elevator-mini/pages/check）
// 按 type 路由 API：daily→/api/mobile/inspections, weekly→/api/mobile/weekly,
//   hazard→/api/mobile/hazards, approve→/api/mobile/approvals,
//   device→扫码查设备(/api/mobile/devices/scan), record→合并 inspections+weekly+hazards
window.Pages = window.Pages || {};
window.Pages.check = {
  template: `
  <div class="page">
    <!-- device 类型：扫码入口 -->
    <div v-if="deviceMode" class="card center">
      <div style="font-size:44px;margin-top:8px">📷</div>
      <p class="muted">扫码查询设备档案与检查记录</p>
      <button class="btn-primary" @click="scanDevice">扫码查设备</button>
      <p class="muted" style="font-size:12px">H5 无原生扫码，将弹出输入框，请粘贴/输入设备编号</p>
    </div>

    <!-- 列表类型 -->
    <template v-else>
      <div v-if="loading" class="loading-row"><span class="muted">加载中...</span></div>
      <div v-else-if="list.length===0" class="empty-state"><span class="muted">暂无数据</span></div>
      <div v-else class="list-wrap">
        <div v-for="item in list" :key="item.id" class="list-item card" @click="goDetail(item)">
          <div class="item-main">
            <div class="item-title">{{rowLabel(item)}}</div>
            <span class="status-badge" :style="{background: statusColor(statusText(item))}">{{statusText(item) || '—'}}</span>
          </div>
          <div class="item-sub">
            <span v-if="item.create_time">{{item.create_time}}</span>
            <span v-else-if="item.created_at">{{item.created_at}}</span>
            <span v-if="item.inspection_date"> | {{item.inspection_date}}</span>
            <span v-if="item.inspector_name"> | {{item.inspector_name}}</span>
            <span v-if="item.location || item.device_location"> | {{item.location || item.device_location}}</span>
            <span v-if="item.risk_level"> | 风险：{{item.risk_level}}</span>
          </div>
        </div>
        <div v-if="loadingMore" class="loading-more"><span class="muted">加载中...</span></div>
        <div v-else-if="showMore()" class="loading-more">
          <button class="btn-ghost" @click="loadMore">加载更多</button>
        </div>
        <div v-else-if="noMore()" class="loading-more"><span class="muted">— 没有更多了 —</span></div>
      </div>
    </template>
  </div>
  `,
  data() {
    return {
      type: 'daily',
      title: '日管控检查',
      deviceMode: false,
      list: [],
      loading: true,
      loadingMore: false,
      page: 1,
      hasMore: false
    };
  },
  mounted() {
    this.setup();
  },
  watch: {
    // 同页路由 /check?type=a → /check?type=b 时组件不重建，需监听 query
    'query.type'(nv) {
      if (nv !== this.type) this.setup();
    }
  },
  methods: {
    setup() {
      const type = this.query.type || 'daily';
      const cfg = TYPE_MAP[type] || TYPE_MAP.daily;
      this.type = type;
      this.title = cfg.title;
      this.deviceMode = type === 'device';
      this.list = [];
      this.page = 1;
      this.hasMore = false;
      if (this.deviceMode) { this.loading = false; return; }
      this.load(true);
    },
    async load(refresh, page) {
      refresh = refresh !== false;
      page = page || 1;
      if (refresh) page = 1;
      this.loading = refresh;
      this.loadingMore = !refresh;
      this.page = page;

      try {
        if (this.type === 'record') {
          // 记录：合并日管控 + 周排查 + 隐患
          const params = { page: page, size: 20 };
          const [d, w, h] = await Promise.all([
            api.get('/api/mobile/inspections', params),
            api.get('/api/mobile/weekly', params),
            api.get('/api/mobile/hazards', params)
          ]);
          const daily = (d.data || d || []).map(i => Object.assign({}, i, { _source: 'daily' }));
          const weekly = (w.data || w || []).map(i => Object.assign({}, i, { _source: 'weekly' }));
          const hazards = (h.data || h || []).map(i => Object.assign({}, i, { _source: 'hazard' }));
          const merged = daily.concat(weekly, hazards);
          this.list = refresh ? merged : this.list.concat(merged);
          this.hasMore = merged.length >= 20;
        } else {
          const cfg = TYPE_MAP[this.type] || TYPE_MAP.daily;
          const d = await api.get(cfg.path, { page: page, size: 20 });
          const raw = d.data || d || [];
          this.list = refresh ? raw : this.list.concat(raw);
          this.hasMore = (d.data && d.data.length >= 20) || (Array.isArray(d) && d.length >= 20);
        }
      } catch (e) {
        if (!this._gone) utils.toast(e.message || '网络错误');
      } finally {
        if (!this._gone) { this.loading = false; this.loadingMore = false; }
      }
    },
    loadMore() {
      if (this.hasMore && !this.loadingMore) this.load(false, this.page + 1);
    },
    showMore() {
      return this.hasMore && this.list.length > 0;
    },
    noMore() {
      return !this.hasMore && this.list.length > 0;
    },
    // 设备查询：扫码/输入编号 → 设备详情
    async scanDevice() {
      try {
        const code = await utils.scanCode();
        const d = await api.get('/api/mobile/devices/scan', { code: code });
        utils.go('/device_detail?id=' + d.id);
      } catch (e) {
        if (e && e.message !== 'cancelled') utils.toast((e && e.message) || '未找到设备');
      }
    },
    statusColor(s) {
      return STATUS_COLORS[String(s || '').toUpperCase()] || '#999';
    },
    rowLabel(item) {
      return item.device_name
        || item.inspection_no
        || item.event_no
        || item.order_no
        || item.hazard_type
        || item.month_no
        || item.title
        || ('记录 #' + (item.id || ''));
    },
    statusText(item) {
      return item.status || item.inspection_status || item.risk_level || '';
    },
    goDetail(item) {
      const id = item.id || item.inspection_id || item.record_id;
      const src = item._source || this.type;
      const map = {
        daily: '/daily_form?id=' + id,
        weekly: '/weekly_form?id=' + id,
        hazard: '/hazard_form?id=' + id,
        approve: '/approval_detail?id=' + id,
        device: '/device_detail?id=' + id
      };
      const url = map[src];
      if (url) utils.go(url);
      else utils.toast('该类型暂不支持');
    }
  },
  unmounted() { this._gone = true; }
};

const TYPE_MAP = {
  daily:   { path: '/api/mobile/inspections',   title: '日管控检查' },
  weekly:  { path: '/api/mobile/weekly',        title: '周排查' },
  hazard:  { path: '/api/mobile/hazards',       title: '隐患排查' },
  device:  { path: '/api/mobile/devices/scan',  title: '设备查询' },
  approve: { path: '/api/mobile/approvals',     title: '审批待办' },
  monthly: { path: '/api/mobile/monthly',       title: '月调度' },
  record:  { path: '/api/mobile/inspections',   title: '检查记录' }
};

const STATUS_COLORS = {
  PENDING:    '#FF8C00',
  IN_PROGRESS: '#1082FF',
  APPROVED:   '#52C41A',
  REJECTED:   '#F5222D',
  OPEN:       '#FAAD14',
  CLOSED:     '#BFBFBF',
  RISK_HIGH:  '#F5222D',
  RISK_MED:   '#FAAD14',
  RISK_LOW:   '#52C41A',
  ONGOING:    '#1082FF',
  SUBMITTED:  '#52C41A',
  REVIEWED:   '#1082FF',
  COMPLETED:  '#52C41A',
  RECTIFYING: '#FAAD14',
  VERIFYING:  '#1082FF'
};
