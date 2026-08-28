// pages/daily.js — 日管控列表 M-05
// GET /api/mobile/inspections?status&q → {data:[...], total}
// 状态 tag：pending/ongoing/submitted/reviewed
// 点击项 → /daily_detail?id=
(function () {
  window.Pages = window.Pages || {};

  window.Pages.daily = {
    name: 'daily',
    props: ['query'],

    data: function () {
      return {
        loading: true,
        list: [],
        total: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
        status: '',
        keyword: '',
        statusOptions: [
          { key: '',        label: '全部' },
          { key: 'pending',  label: '待检' },
          { key: 'ongoing',  label: '进行中' },
          { key: 'submitted', label: '已提交' },
          { key: 'reviewed', label: '已复核' }
        ]
      };
    },

    computed: {
      showLoading: function () { return this.loading && this.list.length === 0; },
      showEmpty:   function () { return !this.loading && this.list.length === 0; },
      showList:    function () { return !this.loading && this.list.length > 0; },
      hasTotal:    function () { return this.total > 0; },
      canLoadMore: function () { return this.showList && this.hasMore; },

      showError:   function () { return this.error && this.list.length === 0; },

      statusTagClass: function () {
        var s = this.status;
        if (s === 'pending')  return 'tag-pending';
        if (s === 'ongoing')  return 'tag-info';
        if (s === 'submitted') return 'tag-ok';
        if (s === 'reviewed') return 'tag-completed';
        return 'tag-draft';
      }
    },

    mounted: function () { this.load(); },

    methods: {
      load: function () {
        var self = this;
        self.loading = true;
        self.error = false;
        api.getInspections({
          page: self.page,
          pageSize: self.pageSize,
          status: self.status,
          q: self.keyword
        }).then(function (d) {
          var data = d && d.data ? d.data : (Array.isArray(d) ? d : []);
          if (self.page === 1) {
            self.list = data;
          } else {
            self.list = self.list.concat(data);
          }
          self.total = d && d.total != null ? d.total : data.length;
          self.hasMore = self.list.length < self.total;
          self.loading = false;
        }).catch(function () {
          self.error = true;
          self.loading = false;
        });
      },

      loadMore: function () {
        if (this.loading || !this.hasMore) return;
        this.page++;
        this.load();
      },

      setStatus: function (key) {
        if (this.status === key) return;
        this.status = key;
        this.page = 1;
        this.list = [];
        this.load();
      },

      search: function () {
        this.page = 1;
        this.list = [];
        this.load();
      },

      clearKeyword: function () {
        this.keyword = '';
        this.search();
      },

      tabClass: function (key) { return { 'seg-btn': true, on: this.status === key }; },

      itemKey: function (item, i) {
        return item && item.id != null ? String(item.id) : ('row_' + i);
      },

      itemTitle: function (item) {
        return item.device_name || item.inspection_no || ('日管控 #' + item.id);
      },

      itemSub: function (item) {
        var p = [];
        if (item.device_code) p.push(item.device_code);
        if (item.location) p.push(item.location);
        if (item.check_date) p.push(item.check_date);
        return p.join(' · ');
      },

      itemExtra: function (item) {
        if (item.total_items > 0) {
          return item.passed_items + '/' + item.total_items + ' 通过';
        }
        return '';
      },

      statusText: function (s) { return utils.statusLabel(s || ''); },
      statusStyle: function (s) {
        return { background: utils.statusColor(s || ''), color: '#fff' };
      },

      itemTagClass: function (item) {
        var s = item.status;
        if (s === 'pending')   return 'tag-pending';
        if (s === 'ongoing')   return 'tag-info';
        if (s === 'submitted') return 'tag-ok';
        if (s === 'reviewed')  return 'tag-completed';
        return 'tag-draft';
      },

      itemClick: function (item) {
        utils.go('/daily_detail?id=' + item.id);
      },

      goForm: function () {
        utils.go('/daily_form');
      },

      goCheck: function () {
        utils.go('/check');
      }
    },

    template: [
      '<div class="page">',

        // ===== 顶部搜索 =====
        '<div class="search-bar">',
          '<input v-model="keyword" placeholder="搜索设备名称 / 编号 / 检查人" @keyup.enter="search">',
          '<button class="btn-primary" style="width:auto;padding:0 14px;flex:none" @click="search">🔍</button>',
        '</div>',

        // ===== 状态筛选 =====
        '<div class="seg">',
          '<button v-for="t in statusOptions" :key="t.key" :class="tabClass(t.key)" @click="setStatus(t.key)">{{t.label}}</button>',
        '</div>',

        // ===== 统计条 =====
        '<div v-if="hasTotal" style="font-size:12px;color:var(--text-3);padding:0 0 8px">',
          '共 {{total}} 条记录',
        '</div>',

        // ===== 加载态 =====
        '<div v-if="showLoading" style="text-align:center;padding:60px 0">',
          '<div style="font-size:36px">⏳</div>',
          '<div style="color:var(--text-3);margin-top:10px">加载中...</div>',
        '</div>',

        // ===== 错误态 =====
        '<div v-else-if="showError" style="text-align:center;padding:60px 0">',
          '<div style="font-size:36px">⚠️</div>',
          '<div style="margin-top:10px">加载失败</div>',
          '<button class="btn-ghost btn-sm" style="margin-top:12px;width:auto;display:inline-block;padding:8px 20px" @click="load">重试</button>',
        '</div>',

        // ===== 空状态 =====
        '<div v-else-if="showEmpty" style="text-align:center;padding:60px 0">',
          '<div style="font-size:48px">📋</div>',
          '<div style="margin-top:10px;font-size:15px">暂无日管控记录</div>',
          '<div style="color:var(--text-3);margin-top:4px;font-size:13px">点击右下角按钮新建检查</div>',
        '</div>',

        // ===== 列表 =====
        '<div v-else class="list">',
          '<div v-for="(item,i) in list" :key="itemKey(item,i)" class="list-item" @click="itemClick(item)">',
            '<div class="li-body">',
              '<div class="li-title">{{itemTitle(item)}}</div>',
              '<div class="li-sub">{{itemSub(item)}}</div>',
            '</div>',
            '<div class="li-extra">',
              '<div v-if="itemExtra(item)" class="li-sub" style="margin:0">{{itemExtra(item)}}</div>',
              '<span class="tag" :style="statusStyle(item.status)">{{statusText(item.status)}}</span>',
            '</div>',
            '<div class="li-arrow">‹</div>',
          '</div>',
        '</div>',

        // ===== 加载更多 =====
        '<div v-if="canLoadMore" style="text-align:center;padding:14px 0 80px">',
          '<button class="btn-ghost btn-sm" style="width:auto;display:inline-block;padding:8px 24px" @click="loadMore">',
            '{{loading ? "加载中..." : "加载更多"}}',
          '</button>',
        '</div>',

        // ===== 底部留白 =====
        '<div v-if="!hasMore" style="height:80px"></div>',

        // ===== 新建 FAB =====
        '<button class="fab" @click="goForm" title="新建日管控">+</button>',

      '</div>'
    ].join('')
  };
})();
