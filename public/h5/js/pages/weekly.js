// pages/weekly.js — 周排查列表
// GET /api/mobile/weekly → {data:[...]}，按 status 客户端筛选（all/pending/ongoing/completed）
// 状态统一走 utils.statusLabel / utils.statusColor
// 点击项 → /weekly_form?id=（weekly_form 支持查看/继续填报）
(function () {
  window.Pages = window.Pages || {};

  window.Pages.weekly = {
    name: 'weekly',
    props: ['query'],

    data: function () {
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
        if (this.activeStatus === 'all') return this.list;
        var s = this.activeStatus;
        var self = this;
        return this.list.filter(function (x) {
          return String(x.status || '').toLowerCase() === s;
        });
      },
      showLoading: function () { return this.loading && this.list.length === 0; },
      showEmpty: function () { return !this.loading && this.filteredList.length === 0; }
    },

    mounted: function () { this.load(); },

    methods: {
      load: function () {
        var self = this;
        self.loading = true;
        api.getWeekly({ page: 1, pageSize: 50 })
          .then(function (d) { self.list = (d && d.data) || []; })
          .catch(function () { if (!self._gone) utils.toast('加载失败'); })
          .finally(function () { if (!self._gone) self.loading = false; });
      },

      setStatus: function (key) {
        if (this.activeStatus === key) return;
        this.activeStatus = key;
      },
      tabClass: function (key) { return { active: this.activeStatus === key }; },

      // 列表行 key（避免模板里写 ||）
      itemKey: function (item, i) {
        return (item && item.id != null) ? String(item.id) : ('row_' + i);
      },

      weekText: function (item) { return item.week_no || item.weekNo || '周排查'; },
      deviceText: function (item) {
        var name = item.device_name || '未关联设备';
        var code = item.device_code || '';
        return code ? (name + '（' + code + '）') : name;
      },
      inspectorText: function (item) { return item.inspector_name || '—'; },
      dateText: function (item) {
        return item.inspection_date || item.check_date || item.created_at || '';
      },

      statusText: function (s) { return utils.statusLabel(s); },
      statusStyle: function (s) {
        return { background: utils.statusColor(s), color: '#fff' };
      },

      goForm: function (id) {
        utils.go('/weekly_form' + (id ? ('?id=' + id) : ''));
      }
    },

    unmounted: function () { this._gone = true; },

    template: [
      '<div class="page">',

        // === 状态筛选 ===
        '<div class="check-tabs" style="margin-bottom:10px">',
          '<div v-for="t in statusOptions" v-bind:key="t.key" class="check-tab" v-bind:class="tabClass(t.key)" v-on:click="setStatus(t.key)">{{t.label}}</div>',
        '</div>',

        // === 加载态 ===
        '<div v-if="showLoading" class="empty-state"><div class="empty-title">加载中...</div></div>',

        // === 空状态 ===
        '<div v-else-if="showEmpty" class="empty-state">',
          '<div class="empty-icon">🗓️</div>',
          '<div class="empty-title">暂无周排查</div>',
          '<div class="empty-sub">点击右下角按钮新建周排查</div>',
        '</div>',

        // === 列表 ===
        '<div v-else class="list">',
          '<div v-for="(item, i) in filteredList" v-bind:key="itemKey(item, i)" class="list-item card" v-on:click="goForm(item.id)">',
            '<div class="li-body">',
              '<div class="li-title">{{weekText(item)}}</div>',
              '<div class="li-sub">{{deviceText(item)}}</div>',
              '<div class="li-sub">{{inspectorText(item)}} · {{dateText(item)}}</div>',
            '</div>',
            '<div class="li-extra">',
              '<span class="badge" v-bind:style="statusStyle(item.status)">{{statusText(item.status)}}</span>',
            '</div>',
            '<div class="li-arrow">›</div>',
          '</div>',
        '</div>',

        // === 新建 FAB ===
        '<button class="fab-pill" v-on:click="goForm()"><span style="font-size:18px">＋</span> 新建周排查</button>',

      '</div>'
    ].join('')
  };
})();
