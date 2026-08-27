// pages/record.js — 检查记录 M-20（完全重构版）
// 支持 4 种记录类型 + 时间范围筛选 + 上拉加载更多
(function () {
  var TYPE_OPTS = [
    { key: 'all',     label: '全部',    api: null },
    { key: 'daily',   label: '日管控', api: 'getInspections' },
    { key: 'weekly',  label: '周排查',  api: 'getWeekly' },
    { key: 'monthly', label: '月调度',  api: 'getMonthly' },
    { key: 'hazard',  label: '隐患排查', api: 'getHazards' }
  ];

  var RANGE_OPTS = [
    { key: '7',   label: '最近7天' },
    { key: '30',  label: '最近30天' },
    { key: 'all', label: '全部' }
  ];

  function makeListItem(raw, type) {
    return Object.assign({ _recordType: type }, raw);
  }

  function rowLabel(item) {
    return item.device_name
      || item.inspection_no
      || item.event_no
      || item.hazard_no
      || item.dispatch_no
      || item.hazard_type
      || item.id;
  }

  function rowSub(item) {
    var parts = [];
    var date = item.check_date || item.find_time || item.week_no || item.dispatch_month || item.created_at;
    if (date) parts.push(utils.formatTime(date) || date);
    if (item.inspector_name) parts.push(item.inspector_name);
    if (item.finder_name) parts.push(item.finder_name);
    if (item.host_name) parts.push(item.host_name);
    if (item.location || item.device_location) parts.push(item.location || item.device_location);
    return parts.slice(0, 2).join(' | ');
  }

  function sourceLabel(type) {
    var m = { daily: '日管控', weekly: '周排查', monthly: '月调度', hazard: '隐患' };
    return m[type] || type;
  }

  function sourceColor(type) {
    var m = { daily: '#1677ff', weekly: '#52c41a', monthly: '#722ed1', hazard: '#fa8c16' };
    return m[type] || '#999';
  }

  function sourceIcon(type) {
    var m = { daily: '📋', weekly: '📅', monthly: '📊', hazard: '⚠' };
    return m[type] || '◎';
  }

  function detailUrl(item) {
    var type = item._recordType;
    var id = item.id || item.inspection_id || item.record_id || '';
    var map = {
      daily:   '/daily_form?id=' + id,
      weekly:  '/weekly_form?id=' + id,
      monthly: '/monthly_form?id=' + id,
      hazard:  '/hazard_form?id=' + id
    };
    return map[type] || '';
  }

  window.Pages = window.Pages || {};
  window.Pages.record = {
    template: [
      '<div class="record-page">',
        '<div class="card" style="padding:10px 14px;">',
          '<div class="flex flex-between" style="align-items:center;margin-bottom:8px;">',
            '<span class="filter-label">记录类型</span>',
            '<div class="flex gap4">',
              '<button v-for="t in typeOpts" v-bind:key="t.key" v-on:click="setType(t.key)"',
                      ' class="btn-sm" v-bind:class="curType===t.key?\'\':\'outline\'">{{t.label}}</button>',
            '</div>',
          '</div>',
          '<div class="flex flex-between" style="align-items:center;">',
            '<span class="filter-label">时间范围</span>',
            '<div class="flex gap4">',
              '<button v-for="r in rangeOpts" v-bind:key="r.key" v-on:click="setRange(r.key)"',
                      ' class="btn-sm" v-bind:class="curRange===r.key?\'\':\'outline\'">{{r.label}}</button>',
            '</div>',
          '</div>',
        '</div>',
        '<template v-if="showSkeleton">',
          '<div v-for="i in 4" v-bind:key="i" class="skeleton-card">',
            '<div class="skeleton-line" style="width:50%;"></div>',
            '<div class="skeleton-line" style="width:35%;"></div>',
          '</div>',
        '</template>',
        '<div v-if="showEmpty" class="empty-state">',
          '<div class="empty-icon">📖</div>',
          '<div class="empty-title">暂无检查记录</div>',
          '<div class="empty-sub">选择时间范围或类型后重试</div>',
        '</div>',
        '<div class="list" v-if="hasItems">',
          '<div v-for="item in list" v-bind:key="item.id + item._recordType" class="list-item" v-on:click="goDetail(item)">',
            '<div class="li-icon" v-if="item._recordType" v-bind:style="liIconStyle(item._recordType)">{{sourceIcon(item._recordType)}}</div>',
            '<div class="li-body">',
              '<div class="li-title">{{rowLabel(item)}}</div>',
              '<div class="li-sub">{{rowSub(item)}}</div>',
            '</div>',
            '<div class="li-extra">',
              '<span v-if="item._recordType" class="badge" v-bind:style="sourceBadgeStyle(item._recordType)">{{sourceLabel(item._recordType)}}</span>',
              '<span v-if="showLevelBadge(item)" class="badge" v-bind:style="levelBadgeStyle(item.risk_level)">{{levelLabel(item.risk_level)}}</span>',
              '<span v-if="showStatusBadge(item)" class="badge" v-bind:style="statusBadgeStyle(item.status)">{{statusLabel(item.status)}}</span>',
            '</div>',
            '<div class="li-arrow">›</div>',
          '</div>',
        '</div>',
        '<div v-if="loadingMore" class="loading-row"><div class="spinner"></div>加载中...</div>',
        '<div v-if="showLoadMoreBtn" class="pagination">',
          '<button class="pg-btn" v-on:click="loadMore">加载更多</button>',
        '</div>',
        '<div v-if="showNoMore" class="loading-row"><span class="muted">-- 没有更多了 --</span></div>',
      '</div>'
    ].join(''),
    data: function () {
      return {
        curType: 'all',
        curRange: '30',
        list: [],
        loading: false,
        loadingMore: false,
        hasMore: false,
        page: 1,
        typeOpts: TYPE_OPTS,
        rangeOpts: RANGE_OPTS
      };
    },
    computed: {
      hasItems: function () { return this.list.length > 0; },
      showEmpty: function () { return !this.loading && this.list.length === 0; },
      showSkeleton: function () { return this.loading && this.list.length === 0; },
      showLoadMoreBtn: function () { return this.hasMore && !this.loadingMore && this.list.length > 0; },
      showNoMore: function () { return !this.hasMore && this.list.length > 0; }
    },
    mounted: function () {
      var self = this;
      window.__ptrFn = function () { return self.load(true); };
      this.load(true);
    },
    unmounted: function () {
      window.__ptrFn = null;
    },
    methods: {
      setType: function (key) {
        this.curType = key;
        this.load(true);
      },
      setRange: function (key) {
        this.curRange = key;
        this.load(true);
      },
      load: function (refresh) {
        var self = this;
        if (refresh) { self.loading = true; self.page = 1; }
        self.loadingMore = !refresh;
        var apiType = self.curType === 'all' ? null : self.curType;
        var days = self.curRange === 'all' ? null : parseInt(self.curRange, 10);
        var cutoff = days ? new Date(Date.now() - days * 86400000).toISOString().slice(0, 10) : null;
        var pageNum = refresh ? 1 : (self.page + 1);
        var params = { page: pageNum, size: 20 };

        function fetchOne(typeKey, apiMethod) {
          return api[apiMethod](params).then(function (d) {
            var arr = d.data || d || [];
            return arr.filter(function (item) {
              if (!cutoff) return true;
              var dateField = item.check_date || item.find_time || item.created_at || item.week_no || item.dispatch_month || '';
              var ds = String(dateField).substring(0, 10);
              return !ds || ds >= cutoff;
            }).map(function (item) { return makeListItem(item, typeKey); });
          });
        }

        var promises = [];
        if (!apiType || apiType === 'daily')   promises.push(fetchOne('daily',   'getInspections'));
        if (!apiType || apiType === 'weekly')  promises.push(fetchOne('weekly',  'getWeekly'));
        if (!apiType || apiType === 'monthly') promises.push(fetchOne('monthly', 'getMonthly'));
        if (!apiType || apiType === 'hazard')  promises.push(fetchOne('hazard',  'getHazards'));

        return Promise.all(promises)
          .then(function (results) {
            var flat = [];
            results.forEach(function (r) { flat = flat.concat(r); });
            flat.sort(function (a, b) {
              var da = a.check_date || a.find_time || a.created_at || '';
              var db = b.check_date || b.find_time || b.created_at || '';
              return db.localeCompare(da);
            });
            if (refresh) {
              self.list = flat;
            } else {
              self.list = self.list.concat(flat);
            }
            self.page = pageNum;
            self.hasMore = flat.length >= 20;
          })
          .catch(function () { utils.toast('加载失败'); })
          .finally(function () {
            self.loading = false;
            self.loadingMore = false;
          });
      },
      loadMore: function () {
        this.page = this.page + 1;
        this.load(false);
      },
      goDetail: function (item) {
        var url = detailUrl(item);
        if (url) utils.go(url);
        else utils.toast('该类型暂不支持');
      },
      rowLabel: rowLabel,
      rowSub: rowSub,
      sourceLabel: sourceLabel,
      sourceColor: sourceColor,
      sourceIcon: sourceIcon,
      showLevelBadge: function (item) { return item && item.risk_level && item._recordType === 'hazard'; },
      showStatusBadge: function (item) { return item && item.status && item._recordType !== 'hazard'; },
      levelColor: function (level) { return utils.levelColor(level); },
      levelLabel: function (level) { return utils.levelLabel(level); },
      statusColor: function (s) { return utils.statusColor(s); },
      statusLabel: function (s) { return utils.statusLabel(s); },
      liIconStyle: function (type) {
        var c = sourceColor(type);
        return { background: c + '22', color: c };
      },
      sourceBadgeStyle: function (type) {
        return { background: sourceColor(type), color: '#fff' };
      },
      levelBadgeStyle: function (level) {
        var c = utils.levelColor(level);
        return { background: c, color: '#fff', marginLeft: '4px' };
      },
      statusBadgeStyle: function (status) {
        var c = utils.statusColor(status);
        return { background: c, color: '#fff', marginLeft: '4px' };
      }
    }
  };
})();
