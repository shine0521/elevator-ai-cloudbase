// pages/monthly.js — 月调度列表 M-19
// GET /api/mobile/monthly?status&month → {data:[{id,dispatch_no,dispatch_month,host_name,status}]}
// 点击项 → /monthly_form?id=（编辑/查看模式）
// 新建 → /monthly_form（无 id）
(function () {
  window.Pages = window.Pages || {};

  window.Pages.monthly = {
    name: 'monthly',
    props: ['query'],

    data: function () {
      return {
        loading: true,
        error: false,
        list: [],
        total: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
        status: '',
        statusOptions: [
          { key: '',          label: '全部' },
          { key: 'draft',     label: '草稿' },
          { key: 'completed', label: '已完成' }
        ]
      };
    },

    computed: {
      showLoading: function () { return this.loading && this.list.length === 0; },
      showEmpty:   function () { return !this.loading && this.list.length === 0; },
      showList:    function () { return !this.loading && this.list.length > 0; },
      showError:   function () { return this.error && this.list.length === 0; },
      hasTotal:    function () { return this.total > 0; },
      canLoadMore: function () { return this.showList && this.hasMore; }
    },

    mounted: function () { this.load(); },

    methods: {
      load: function () {
        var self = this;
        self.loading = true;
        self.error = false;
        api.getMonthly({
          page: self.page,
          pageSize: self.pageSize,
          status: self.status
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

      tabClass: function (key) { return { 'seg-btn': true, on: this.status === key }; },

      itemKey: function (item, i) {
        return item && item.id != null ? String(item.id) : ('row_' + i);
      },

      itemTitle: function (item) {
        return item.dispatch_month || item.dispatch_no || ('月调度 #' + item.id);
      },

      topicsText: function (item) {
        var t = item.topics;
        if (Array.isArray(t) && t.length) return t.join('、');
        if (typeof t === 'string' && t.trim()) {
          try { t = JSON.parse(t); if (Array.isArray(t)) return t.join('、'); } catch (e) {}
          return t.trim();
        }
        return '';
      },

      itemSub: function (item) {
        var p = [];
        if (item.host_name) p.push('主持: ' + item.host_name);
        var topics = this.topicsText(item);
        if (topics) p.push(topics);
        return p.join(' · ');
      },

      itemSub2: function (item) {
        return item.created_at || '';
      },

      statusText: function (s) {
        var m = { draft: '草稿', completed: '已完成' };
        return m[String(s || '').toLowerCase()] || utils.statusLabel(s || '');
      },

      statusStyle: function (s) {
        var col = s === 'completed' ? utils.statusColor('COMPLETED') :
                  s === 'draft'     ? utils.statusColor('DRAFT') :
                  utils.statusColor(s || '');
        return { background: col, color: '#fff' };
      },

      itemTagClass: function (item) {
        var s = item.status;
        if (s === 'completed') return 'tag-completed';
        if (s === 'draft')     return 'tag-draft';
        return 'tag-pending';
      },

      isCompleted: function (item) {
        return String(item.status || '').toLowerCase() === 'completed';
      },

      itemClick: function (item) {
        utils.go('/monthly_form?id=' + item.id);
      },

      goForm: function () { utils.go('/monthly_form'); },
      goCheck: function () { utils.go('/check'); }
    },

    unmounted: function () { this._gone = true; },

    template: [
      '<div class="page">',
        '<div class="seg">',
          '<button v-for="t in statusOptions" :key="t.key" :class="tabClass(t.key)" @click="setStatus(t.key)">{{t.label}}</button>',
        '</div>',
        '<div v-if="hasTotal" style="font-size:12px;color:var(--text-3);padding:0 0 8px">共 {{total}} 条记录</div>',
        '<div v-if="showLoading" style="text-align:center;padding:60px 0"><div style="font-size:36px">⏳</div><div style="color:var(--text-3);margin-top:10px">加载中...</div></div>',
        '<div v-else-if="showError" style="text-align:center;padding:60px 0"><div style="font-size:36px">⚠️</div><div style="margin-top:10px">加载失败</div><button class="btn-ghost btn-sm" style="margin-top:12px;width:auto;display:inline-block;padding:8px 20px" @click="load">重试</button></div>',
        '<div v-else-if="showEmpty" style="text-align:center;padding:60px 0"><div style="font-size:48px">📆</div><div style="margin-top:10px;font-size:15px">暂无月调度记录</div><div style="color:var(--text-3);margin-top:4px;font-size:13px">点击右下角按钮新建月调度</div></div>',
        '<div v-else class="list">',
          '<div v-for="(item,i) in list" :key="itemKey(item,i)" class="list-item" @click="itemClick(item)">',
            '<div class="li-body">',
              '<div class="li-title">{{itemTitle(item)}}</div>',
              '<div class="li-sub" v-if="itemSub(item)">{{itemSub(item)}}</div>',
              '<div class="li-sub" v-if="itemSub2(item)">{{itemSub2(item)}}</div>',
            '</div>',
            '<div class="li-extra"><span class="tag" :style="statusStyle(item.status)">{{statusText(item.status)}}</span></div>',
            '<div class="li-arrow">›</div>',
          '</div>',
        '</div>',
        '<div v-if="canLoadMore" style="text-align:center;padding:14px 0 80px"><button class="btn-ghost btn-sm" style="width:auto;display:inline-block;padding:8px 24px" @click="loadMore">{{loading ? "加载中..." : "加载更多"}}</button></div>',
        '<div v-if="!hasMore" style="height:80px"></div>',
        '<button class="fab" @click="goForm" title="新建月调度">+</button>',
      '</div>'
    ].join('')
  };
})();
