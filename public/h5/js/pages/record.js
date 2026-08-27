// record.js — 检查记录综合查询
// 依据 H5_REWRITE_CONTRACT.md 重写：
//   合并 日管控(api.getInspections) 与 周排查(api.getWeekly)，按日期降序；
//   支持 设备名 / 记录类型 / 时间范围 筛选；日管控点进 /daily_detail，周排查暂提示。
// 铁律：v-model 仅用于 input/select；模板内无裸 && || < >；禁止 SVG；根节点 .page
window.Pages = window.Pages || {};

window.Pages.record = {
  name: 'record',
  props: ['query'],

  data: function () {
    return {
      loading: false,
      deviceName: '',
      type: 'all',          // all | daily | weekly
      timeRange: 'all',     // all | week | month | quarter
      list: []
    };
  },

  computed: {
    // 空态（不放裸 === 到模板）
    showEmpty: function () { return !this.loading && this.list.length === 0; }
  },

  methods: {
    go: function (p) { utils.go(p); },

    // 主查询：并发拉取日管控 + 周排查 → 合并 → 筛选 → 按日期降序
    load: function () {
      var self = this;
      self.loading = true;

      var calls = [];
      if (self.type === 'all' || self.type === 'daily') {
        calls.push(self.fetchInspections().catch(function () { return []; }));
      }
      if (self.type === 'all' || self.type === 'weekly') {
        calls.push(self.fetchWeekly().catch(function () { return []; }));
      }

      Promise.all(calls).then(function (res) {
        var merged = [];
        res.forEach(function (arr) { merged = merged.concat(arr); });
        merged = self.applyFilter(merged);
        merged.sort(function (a, b) {
          return self.sortKey(b).localeCompare(self.sortKey(a));
        });
        self.list = merged;
      }).catch(function () {
        self.list = [];
      }).finally(function () {
        self.loading = false;
      });
    },

    fetchInspections: function () {
      var self = this;
      var p = { q: self.deviceName || undefined, page: 1, pageSize: 200 };
      return api.getInspections(p).then(function (d) { return self.normalize(d, 'daily'); });
    },

    fetchWeekly: function () {
      var self = this;
      var p = { q: self.deviceName || undefined, page: 1, pageSize: 200 };
      return api.getWeekly(p).then(function (d) { return self.normalize(d, 'weekly'); });
    },

    // 归一化为统一结构（响应可能无 data 包裹：d.data || d || []）
    normalize: function (res, type) {
      var arr = (res && (res.data || res)) || [];
      return arr.map(function (it) {
        return {
          _type: type,
          id: it.id,
          no: it.inspection_no || '',
          device: it.device_name || '',
          code: it.device_code || '',
          week: it.week_no || '',
          location: it.location || '',
          inspector: it.inspector_name || '',
          status: it.status || '',
          date: type === 'daily' ? (it.check_date || '') : (it.created_at || '')
        };
      });
    },

    // 设备名 + 时间范围过滤（逻辑均放 method，模板无裸运算符）
    applyFilter: function (arr) {
      var self = this;
      var kw = (self.deviceName || '').trim().toLowerCase();
      var cutoff = self.cutoffStr();
      return arr.filter(function (it) {
        if (kw) {
          var hay = (it.device + ' ' + it.code + ' ' + it.no).toLowerCase();
          if (hay.indexOf(kw) < 0) return false;
        }
        if (self.timeRange !== 'all') {
          var d = self.sortKey(it);
          if (!d || d < cutoff) return false;
        }
        return true;
      });
    },

    // 时间范围下限（yyyy-mm-dd 字符串，可直接比较）
    cutoffStr: function () {
      if (this.timeRange === 'all') return '';
      var days = this.timeRange === 'week' ? 7 : (this.timeRange === 'month' ? 30 : 90);
      var d = new Date();
      d.setDate(d.getDate() - days);
      var p = function (n) { return String(n).padStart(2, '0'); };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    },

    // 排序/比较键：取 yyyy-mm-dd
    sortKey: function (it) { return String(it.date || '').substring(0, 10); },

    itemKey: function (it) { return (it._type || 'x') + '_' + it.id; },

    rowSub: function (it) {
      var parts = [];
      if (it.no) parts.push(it.no);
      if (it._type === 'weekly' && it.week) parts.push('第' + it.week + '周');
      if (it.location) parts.push(it.location);
      if (it.inspector) parts.push(it.inspector);
      if (it.date) parts.push(it.date.substring(0, 10));
      return parts.join(' · ');
    },

    statusLabel: function (s) {
      var m = {
        pending: '待检', ongoing: '进行中', submitted: '已提交', reviewed: '已审核',
        rectifying: '整改中', verifying: '待验收', closed: '已关闭', open: '未整改'
      };
      return m[String(s || '').toLowerCase()] || s || '待检';
    },

    statusClass: function (s) {
      var m = {
        pending: 'badge-orange', ongoing: 'badge-blue', submitted: 'badge-blue',
        reviewed: 'badge-green', rectifying: 'badge-blue', verifying: 'badge-orange',
        closed: 'badge-gray', open: 'badge-orange'
      };
      return m[String(s || '').toLowerCase()] || 'badge-gray';
    },

    // 点击进入详情：日管控 → /daily_detail；周排查无独立路由 → 提示
    goDetail: function (it) {
      if (it._type === 'daily') utils.go('/daily_detail?id=' + it.id);
      else utils.toast('周排查暂未提供独立详情，可在日管控详情查看');
    }
  },

  mounted: function () { this.load(); },

  template: `
<div class="page">
  <div class="block-title">检查记录</div>

  <!-- 筛选 -->
  <div class="card">
    <div class="field">
      <div class="fi-label">设备名称 / 编号</div>
      <input class="fi-input" type="text" v-model="deviceName" placeholder="输入设备名称或编号" @keyup.enter="load" />
    </div>
    <div class="field">
      <div class="fi-label">记录类型</div>
      <select class="fi-input" v-model="type" @change="load">
        <option value="all">全部</option>
        <option value="daily">日管控</option>
        <option value="weekly">周排查</option>
      </select>
    </div>
    <div class="field">
      <div class="fi-label">时间范围</div>
      <select class="fi-input" v-model="timeRange" @change="load">
        <option value="all">全部</option>
        <option value="week">近一周</option>
        <option value="month">近一月</option>
        <option value="quarter">近三月</option>
      </select>
    </div>
    <button class="btn-primary" @click="load">查 询</button>
  </div>

  <!-- 加载态 -->
  <div v-if="loading" class="card">
    <div class="skeleton" style="width:100%;"></div>
    <div class="skeleton" style="width:80%;"></div>
  </div>

  <!-- 记录列表 -->
  <div v-for="item in list" :key="itemKey(item)" class="card"
       style="display:flex;align-items:center;gap:10px;" @click="goDetail(item)">
    <div style="flex:1;min-width:0;">
      <div class="ellipsis" style="font-size:15px;font-weight:600;color:var(--text);">{{ item.device || '未命名设备' }}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px;">{{ rowSub(item) }}</div>
    </div>
    <span class="badge" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
    <span style="color:var(--muted);font-size:18px;">›</span>
  </div>

  <!-- 空态 -->
  <div v-if="showEmpty" class="empty-state">
    <div class="empty-icon">📭</div>
    <div class="empty-title">没有找到记录</div>
    <div class="empty-sub">调整筛选条件后再试</div>
  </div>
</div>
`
};
