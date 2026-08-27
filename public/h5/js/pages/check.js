// pages/check.js — 聚合检查入口 M-03（完全重构版）
// 根据 URL query ?type= 切换日管控/周排查/隐患/月调度/应急/审批 Tab
(function () {
  var TYPE_META = {
    daily:     { label: '日管控', path: '/api/mobile/inspections',   icon: '📋' },
    weekly:    { label: '周排查', path: '/api/mobile/weekly',        icon: '📅' },
    hazard:    { label: '隐患排查', path: '/api/mobile/hazards',     icon: '⚠' },
    monthly:   { label: '月调度', path: '/api/mobile/monthly',      icon: '📊' },
    emergency: { label: '应急', path: '/api/mobile/emergencies',     icon: '🔴' },
    approve:   { label: '审批待办', path: '/api/mobile/approvals',  icon: '✅' }
  };

  function buildUrl(type, item) {
    var id = item.id || item.inspection_id || item.record_id || '';
    var map = {
      daily:     '/daily_form?id=' + id,
      weekly:    '/weekly_form?id=' + id,
      hazard:    '/hazard_form?id=' + id,
      monthly:   '/monthly_form?id=' + id,
      emergency: '/emergency?id=' + id,
      approve:   '/approval_detail?id=' + id
    };
    return map[type] || '';
  }

  function rowLabel(type, item) {
    if (type === 'daily')     return item.device_name || item.inspection_no || item.id;
    if (type === 'weekly')    return item.device_name || item.inspection_no || item.id;
    if (type === 'hazard')    return item.hazard_no || item.hazard_type || item.device_name || item.id;
    if (type === 'monthly')   return item.dispatch_no || item.dispatch_month || item.id;
    if (type === 'emergency') return item.event_no || item.alarm_type || item.id;
    if (type === 'approve')   return item.business_title || item.business_type || item.id;
    return item.device_name || item.inspection_no || item.id;
  }

  function rowSub(type, item) {
    var parts = [];
    if (item.check_date) parts.push(item.check_date);
    if (item.week_no) parts.push('第' + item.week_no + '周');
    if (item.dispatch_month) parts.push(item.dispatch_month);
    if (item.find_time) parts.push(utils.formatTime(item.find_time));
    if (item.created_at) parts.push(utils.formatTime(item.created_at));
    if (item.inspector_name) parts.push(item.inspector_name);
    if (item.finder_name) parts.push(item.finder_name);
    if (item.host_name) parts.push(item.host_name);
    if (item.location || item.device_location) parts.push(item.location || item.device_location);
    if (item.risk_level) parts.push(utils.levelLabel(item.risk_level));
    if (item.trapped_count > 0) parts.push('困人' + item.trapped_count + '人');
    if (item.alarm_type) parts.push(item.alarm_type);
    if (item.node_name) parts.push(item.node_name);
    return parts.slice(0, 3).join(' | ');
  }

  window.Pages = window.Pages || {};
  window.Pages.check = {
    template: [
      '<div class="check-page">',
        '<div class="check-tabs">',
          '<div v-for="(meta, key) in typeMeta" v-bind:key="key" v-bind:class="tabCls(key)" v-on:click="switchType(key)">{{meta.label}}</div>',
        '</div>',
        '<div v-if="hasStats" class="card" style="padding:10px 14px;">',
          '<div class="flex flex-between" style="font-size:12px;color:var(--muted);">',
            '<span v-for="(val, key) in statsDisplay" v-bind:key="key">{{key}}: {{val}}</span>',
          '</div>',
        '</div>',
        '<template v-if="showSkeleton">',
          '<div v-for="i in 4" v-bind:key="i" class="skeleton-card">',
            '<div class="skeleton-line" style="width:60%;"></div>',
            '<div class="skeleton-line" style="width:40%;"></div>',
          '</div>',
        '</template>',
        '<div v-if="showEmpty" class="empty-state">',
          '<div class="empty-icon">{{currentMeta.icon}}</div>',
          '<div class="empty-title">{{currentMeta.label}}</div>',
          '<div class="empty-sub">暂无数据</div>',
        '</div>',
        '<div class="list" v-if="hasItems">',
          '<div v-for="item in list" v-bind:key="item.id" class="list-item" v-on:click="goDetail(item)">',
            '<div class="li-icon" v-bind:style="liIconStyle(item)">{{currentMeta.icon}}</div>',
            '<div class="li-body">',
              '<div class="li-title">{{rowLabel(currentType, item)}}</div>',
              '<div class="li-sub">{{rowSub(currentType, item)}}</div>',
            '</div>',
            '<div class="li-extra">',
              '<span v-if="showStatusBadge(item)" class="badge" v-bind:style="statusBadgeStyle(item)">{{statusText(currentType, item)}}</span>',
              '<span v-if="showLevelBadge(item)" class="badge" v-bind:style="levelBadgeStyle(item)">{{levelLabel(item.risk_level)}}</span>',
            '</div>',
            '<div class="li-arrow">›</div>',
          '</div>',
        '</div>',
        '<div v-if="loadingMore" class="loading-row"><div class="spinner"></div>加载中...</div>',
        '<div v-if="showLoadMoreBtn" class="pagination">',
          '<button class="pg-btn" v-on:click="loadMore">加载更多</button>',
        '</div>',
        '<div v-if="showNoMore" class="loading-row"><span class="muted">-- 没有更多了 --</span></div>',
        '<button v-if="showFab" class="fab" v-on:click="handleFab" title="新建">+</button>',
      '</div>'
    ].join(''),
    data: function () {
      return {
        currentType: 'daily',
        list: [],
        loading: false,
        loadingMore: false,
        hasMore: false,
        stats: null,
        typeMeta: TYPE_META
      };
    },
    computed: {
      currentMeta: function () {
        return TYPE_META[this.currentType] || TYPE_META.daily;
      },
      hasItems: function () {
        return this.list.length > 0;
      },
      showEmpty: function () {
        return !this.loading && this.list.length === 0;
      },
      showSkeleton: function () {
        return this.loading && this.list.length === 0;
      },
      showLoadMoreBtn: function () {
        return this.hasMore && !this.loadingMore && this.list.length > 0;
      },
      showNoMore: function () {
        return !this.hasMore && this.list.length > 0;
      },
      showFab: function () {
        var fabTypes = { daily: 1, weekly: 1, hazard: 1, monthly: 1, emergency: 1 };
        return !!fabTypes[this.currentType];
      },
      hasStats: function () {
        return !!this.stats;
      },
      statsDisplay: function () {
        if (!this.stats) return {};
        var s = this.stats;
        var d = {};
        if (s.total !== undefined) d['总计'] = s.total;
        if (s.pending !== undefined) d['待处理'] = s.pending;
        if (s.ongoing !== undefined) d['进行中'] = s.ongoing;
        if (s.rectifying !== undefined) d['整改中'] = s.rectifying;
        if (s.verifying !== undefined) d['待核验'] = s.verifying;
        if (s.closed !== undefined) d['已关闭'] = s.closed;
        if (s.completed !== undefined) d['已完成'] = s.completed;
        if (s.active !== undefined) d['进行中'] = s.active;
        if (s.todayCount !== undefined) d['今日'] = s.todayCount;
        return d;
      }
    },
    watch: {
      'query.type': {
        immediate: true,
        handler: function (type) {
          if (type && type !== this.currentType) {
            this.switchType(type);
          } else if (!type) {
            this.switchType('daily');
          }
        }
      }
    },
    mounted: function () {
      var self = this;
      window.__ptrFn = function () { return self.load(true); };
      if (!this.query.type) {
        this.switchType('daily');
      }
    },
    unmounted: function () {
      window.__ptrFn = null;
    },
    methods: {
      tabCls: function (key) {
        return { 'check-tab': true, 'active': this.currentType === key };
      },
      switchType: function (type) {
        if (!TYPE_META[type]) type = 'daily';
        this.currentType = type;
        this.list = [];
        this.hasMore = false;
        this.stats = null;
        this.load(true);
        var newHash = '#/check?type=' + type;
        if (location.hash !== newHash) history.replaceState(null, '', newHash);
      },
      load: function (refresh) {
        var self = this;
        if (refresh) self.loading = true;
        self.loadingMore = !refresh;
        return api.get(TYPE_META[self.currentType].path, { page: 1, size: 20 })
          .then(function (d) {
            var arr = d.data || d || [];
            self.list = arr;
            self.hasMore = arr.length >= 20;
          })
          .catch(function () { utils.toast('加载失败'); })
          .finally(function () {
            self.loading = false;
            self.loadingMore = false;
          });
      },
      loadMore: function () {
        var self = this;
        if (self.loadingMore || !self.hasMore) return;
        self.loadingMore = true;
        return api.get(TYPE_META[self.currentType].path, { page: 2, size: 20 })
          .then(function (d) {
            var arr = d.data || d || [];
            self.list = self.list.concat(arr);
            self.hasMore = arr.length >= 20;
          })
          .catch(function () {})
          .finally(function () { self.loadingMore = false; });
      },
      goDetail: function (item) {
        var url = buildUrl(this.currentType, item);
        if (url) utils.go(url);
        else utils.toast('该类型暂不支持');
      },
      handleFab: function () {
        var typeMap = {
          daily:     '/daily_form',
          weekly:    '/weekly_form',
          hazard:    '/hazard_form',
          monthly:   '/monthly_form',
          emergency: '/emergency'
        };
        var url = typeMap[this.currentType];
        if (url) utils.go(url);
      },
      rowLabel: rowLabel,
      rowSub: rowSub,
      showStatusBadge: function (item) {
        return !!this.statusText(this.currentType, item);
      },
      showLevelBadge: function (item) {
        return item && item.risk_level && this.currentType === 'hazard';
      },
      levelColor: function (level) { return utils.levelColor(level); },
      levelLabel: function (level) { return utils.levelLabel(level); },
      statusColor: function (type, item) {
        if (type === 'hazard') return utils.levelColor(item.risk_level);
        return utils.statusColor(item.status);
      },
      statusText: function (type, item) {
        if (type === 'hazard') return utils.levelLabel(item.risk_level);
        return utils.statusLabel(item.status);
      },
      liIconStyle: function (item) {
        var c = utils.levelColor(item && item.risk_level || '');
        return { background: c.replace('var(', 'color-mix(in srgb,').replace(')', ',transparent)') };
      },
      statusBadgeStyle: function (item) {
        var c = this.statusColor(this.currentType, item);
        return { background: c, color: '#fff', fontSize: '11px', padding: '2px 7px', borderRadius: '10px', fontWeight: '600', display: 'inline-block' };
      },
      levelBadgeStyle: function (item) {
        var c = utils.levelColor(item.risk_level);
        return { background: c, color: '#fff', fontSize: '11px', padding: '2px 7px', borderRadius: '10px', fontWeight: '700', display: 'inline-block', marginLeft: '4px' };
      }
    }
  };
})();
