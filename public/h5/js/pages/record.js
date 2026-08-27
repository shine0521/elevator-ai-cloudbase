// pages/record.js — 检查记录查询 M-20（转换自 elevator-mini/pages/inspection_record）
// 日期范围 + 类型筛选，聚合 inspections(daily) + weekly + hazards
window.Pages = window.Pages || {};
window.Pages.record = {
  template: `
  <style>
  .filter-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; font-size: 14px; }
  .filter-label { color: var(--muted); font-size: 13px; }
  .filter-val { display: flex; align-items: center; gap: 6px; }
  .filter-val select, .filter-val input { border: 1px solid var(--border); border-radius: 8px; padding: 8px; font-size: 14px; background: #fff; color: var(--text); }
  .source-tag { color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 10px; white-space: nowrap; flex: 0 0 auto; }
  .item-main .item-title { flex: 1; margin: 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .loading-more { text-align: center; padding: 12px 0; }
  .loading-more .btn-ghost { width: auto; padding: 8px 24px; }
  </style>
  <div class="page">
    <!-- 筛选区 -->
    <div class="filter-bar card">
      <div class="filter-row">
        <span class="filter-label">记录类型</span>
        <span class="filter-val">
          <select v-model.number="typeIndex" @change="load(true)">
            <option v-for="(o, i) in typeOpts" :key="o" :value="i">{{o}}</option>
          </select>
        </span>
      </div>
      <div class="filter-row">
        <span class="filter-label">开始日期</span>
        <span class="filter-val">
          <input type="date" v-model="startDate" @change="load(true)">
        </span>
      </div>
      <div class="filter-row">
        <span class="filter-label">结束日期</span>
        <span class="filter-val">
          <input type="date" v-model="endDate" @change="load(true)">
        </span>
      </div>
    </div>

    <!-- 加载态 -->
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <div v-else-if="list.length===0" class="empty-state"><span class="muted">暂无记录</span></div>

    <!-- 记录列表 -->
    <div v-else class="list-wrap">
      <div v-for="item in list" :key="item.id" class="list-item card" @click="goDetail(item)">
        <div class="item-main">
          <span class="source-tag" :style="{background: sourceColor(item._source)}">{{sourceLabel(item._source)}}</span>
          <span class="item-title">{{rowLabel(item)}}</span>
          <span class="status-badge" :style="{background: statusColor(item.status)}">{{item.status || item.result || '进行中'}}</span>
        </div>
        <div class="item-sub muted">
          <span v-if="item.inspection_date">{{item.inspection_date}}</span>
          <span v-else-if="item.create_time">{{item.create_time}}</span>
          <span v-if="item.inspector_name"> | {{item.inspector_name}}</span>
          <span v-if="item.location || item.device_location"> | {{item.location || item.device_location}}</span>
        </div>
      </div>

      <!-- 加载更多 -->
      <div v-if="loadingMore" class="loading-more"><span class="muted">加载中...</span></div>
      <div v-else-if="showMore()" class="loading-more">
        <button class="btn-ghost" @click="loadMore">加载更多</button>
      </div>
      <div v-else-if="noMore()" class="loading-more"><span class="muted">— 没有更多了 —</span></div>
    </div>
  </div>
  `,
  data() {
    return {
      typeIndex: 0,
      typeOpts: ['全部', '日管控', '周排查', '隐患'],
      startDate: '',
      endDate: '',
      list: [],
      loading: true,
      loadingMore: false,
      page: 1,
      hasMore: false
    };
  },
  mounted() {
    const now = new Date();
    this.startDate = fmtDate(new Date(now.getTime() - 30 * 86400000));
    this.endDate = fmtDate(now);
    this.load(true);
  },
  methods: {
    async load(refresh, page) {
      refresh = refresh !== false;
      page = page || 1;
      if (refresh) page = 1;
      this.loading = refresh;
      this.loadingMore = !refresh;
      this.page = page;

      const typeMap = ['all', 'daily', 'weekly', 'hazard'];
      const apiType = typeMap[this.typeIndex] || 'all';
      const params = { page: page, size: 20 };

      const fetchers = [];
      if (apiType === 'all' || apiType === 'daily') {
        fetchers.push(api.get('/api/mobile/inspections', params).then(d =>
          (d.data || d || []).map(i => Object.assign({}, i, { _source: 'daily' }))
        ));
      }
      if (apiType === 'all' || apiType === 'weekly') {
        fetchers.push(api.get('/api/mobile/weekly', params).then(d =>
          (d.data || d || []).map(i => Object.assign({}, i, { _source: 'weekly' }))
        ));
      }
      if (apiType === 'all' || apiType === 'hazard') {
        fetchers.push(api.get('/api/mobile/hazards', params).then(d =>
          (d.data || d || []).map(i => Object.assign({}, i, { _source: 'hazard' }))
        ));
      }

      try {
        const results = await Promise.all(fetchers);
        let flat = [];
        results.forEach(r => { flat = flat.concat(r); });
        // 客户端日期过滤
        if (this.startDate || this.endDate) {
          flat = flat.filter(item => {
            const d = item.inspection_date || item.create_time || item.created_at || item.find_time || '';
            if (!d) return true;
            const ds = String(d).substring(0, 10);
            if (this.startDate && ds < this.startDate) return false;
            if (this.endDate && ds > this.endDate) return false;
            return true;
          });
        }
        this.list = refresh ? flat : this.list.concat(flat);
        this.hasMore = flat.length >= 20;
      } catch (e) {
        if (!this._gone) utils.toast((e && e.message) || '网络错误');
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
    sourceColor(src) {
      const m = { daily: '#1082FF', weekly: '#52C41A', hazard: '#FAAD14' };
      return m[src] || '#999';
    },
    statusColor(s) {
      const m = {
        PENDING: '#FF8C00', APPROVED: '#52C41A', REJECTED: '#F5222D',
        IN_PROGRESS: '#1082FF', OPEN: '#FAAD14', CLOSED: '#BFBFBF',
        ONGOING: '#1082FF', SUBMITTED: '#52C41A', REVIEWED: '#1082FF',
        COMPLETED: '#52C41A', RECTIFYING: '#FAAD14', VERIFYING: '#1082FF'
      };
      return m[String(s || '').toUpperCase()] || '#999';
    },
    sourceLabel(src) {
      return src === 'daily' ? '日管控' : src === 'weekly' ? '周排查' : src === 'hazard' ? '隐患' : '记录';
    },
    rowLabel(item) {
      return item.device_name
        || item.inspection_no
        || item.event_no
        || item.hazard_type
        || item.inspection_date
        || ('记录 #' + (item.id || ''));
    },
    goDetail(item) {
      const id = item.id || item.inspection_id || item.record_id;
      const src = item._source;
      const map = {
        daily: '/daily_form?id=' + id,
        weekly: '/weekly_form?id=' + id,
        hazard: '/hazard_form?id=' + id
      };
      const url = map[src];
      if (url) utils.go(url);
      else utils.toast('该类型暂不支持');
    }
  },
  unmounted() { this._gone = true; }
};

function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
