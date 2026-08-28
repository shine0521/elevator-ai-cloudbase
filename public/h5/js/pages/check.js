// pages/check.js — 检查总入口（日管控 / 周排查 / 月调度 三大类状态卡 + 快捷新建 + 最近记录）
// 状态卡：GET stats（每日检查统计），列表：GET inspections/weekly/monthly 各自取前 3 条
// 快捷新建按钮 → /daily_form / /weekly_form / /monthly_form
// 记录列表：三个 segment tab（日/周/月），各取列表前 N 条
(function () {
  window.Pages = window.Pages || {};

  window.Pages.check = {
    name: 'check',
    props: ['query'],

    data: function () {
      return {
        loading: true,
        dailyStats: null,
        weeklyStats: null,
        monthlyStats: null,
        dailyList: [],
        weeklyList: [],
        monthlyList: [],
        tab: 'daily', // 'daily' | 'weekly' | 'monthly'
        tabs: [
          { key: 'daily',   label: '日管控' },
          { key: 'weekly',  label: '周排查' },
          { key: 'monthly', label: '月调度' }
        ]
      };
    },

    computed: {
      isDaily:   function () { return this.tab === 'daily'; },
      isWeekly:  function () { return this.tab === 'weekly'; },
      isMonthly: function () { return this.tab === 'monthly'; },

      activeList: function () {
        if (this.tab === 'weekly')  return this.weeklyList;
        if (this.tab === 'monthly') return this.monthlyList;
        return this.dailyList;
      },

      showLoading: function () { return this.loading; },
      showEmpty:   function () { return !this.loading && this.activeList.length === 0; },
      showList:    function () { return !this.loading && this.activeList.length > 0; },

      // 日管控状态数
      dTotal:   function () { return this.dailyStats ? this.dailyStats.total : 0; },
      dToday:   function () { return this.dailyStats ? this.dailyStats.todayCount : 0; },
      dPending: function () { return this.dailyStats ? (this.dailyStats.byStatus && this.dailyStats.byStatus.pending || 0) : 0; },
      dOngoing: function () { return this.dailyStats ? (this.dailyStats.byStatus && this.dailyStats.byStatus.ongoing || 0) : 0; },

      // 周排查状态数
      wTotal:   function () { return this.weeklyStats ? this.weeklyStats.total : 0; },
      wPending: function () { return this.weeklyStats ? (this.weeklyStats.pending || 0) : 0; },
      wOngoing: function () { return this.weeklyStats ? (this.weeklyStats.ongoing || 0) : 0; },

      // 月调度状态数
      mTotal:    function () { return this.monthlyStats ? this.monthlyStats.total : 0; },
      mCompleted: function () { return this.monthlyStats ? (this.monthlyStats.completed || 0) : 0; }
    },

    mounted: function () { this.load(); },

    methods: {
      load: function () {
        var self = this;
        self.loading = true;
        Promise.all([
          api.getInspectionStats()
            .then(function (d) { self.dailyStats = d.data || d; })
            .catch(function () { self.dailyStats = null; }),
          api.getWeeklyStats()
            .then(function (d) { self.weeklyStats = d.data || d; })
            .catch(function () { self.weeklyStats = null; }),
          api.getMonthlyStats()
            .then(function (d) { self.monthlyStats = d.data || d; })
            .catch(function () { self.monthlyStats = null; }),
          api.getInspections({ page: 1, pageSize: 5 })
            .then(function (d) { self.dailyList = (d && d.data) || []; })
            .catch(function () { self.dailyList = []; }),
          api.getWeekly({ page: 1, pageSize: 5 })
            .then(function (d) { self.weeklyList = (d && d.data) || []; })
            .catch(function () { self.weeklyList = []; }),
          api.getMonthly({ page: 1, pageSize: 5 })
            .then(function (d) { self.monthlyList = (d && d.data) || []; })
            .catch(function () { self.monthlyList = []; })
        ]).then(function () { self.loading = false; })
          .catch(function () { self.loading = false; });
      },

      switchTab: function (key) {
        if (this.tab === key) return;
        this.tab = key;
      },

      tabClass: function (key) { return { 'seg-btn': true, on: this.tab === key }; },

      itemKey: function (item, i) {
        return item && item.id != null ? String(item.id) : ('row_' + i);
      },

      // 列表标题
      itemTitle: function (item) {
        if (this.isMonthly) {
          return item.dispatch_month || item.dispatch_no || ('月调度 #' + item.id);
        }
        if (this.isWeekly) {
          return (item.week_no ? '第' + item.week_no + '周' : item.inspection_no) || ('周排查 #' + item.id);
        }
        return item.device_name || item.inspection_no || ('日管控 #' + item.id);
      },

      // 列表副标题
      itemSub: function (item) {
        var p = [];
        if (this.isMonthly) {
          if (item.host_name) p.push('主持: ' + item.host_name);
        } else {
          if (item.device_code) p.push(item.device_code);
          if (item.inspector_name) p.push(item.inspector_name);
        }
        if (item.check_date) p.push(item.check_date);
        else if (item.created_at) p.push(item.created_at);
        return p.join(' · ');
      },

      // 行点击
      itemClick: function (item) {
        if (this.isMonthly) {
          utils.go('/monthly_form?id=' + item.id);
        } else if (this.isWeekly) {
          utils.go('/weekly_form?id=' + item.id);
        } else {
          utils.go('/daily_detail?id=' + item.id);
        }
      },

      statusText: function (s) { return utils.statusLabel(s || ''); },
      statusStyle: function (s) {
        return { background: utils.statusColor(s || ''), color: '#fff' };
      },

      goDaily:   function () { utils.go('/daily_form'); },
      goWeekly:  function () { utils.go('/weekly_form'); },
      goMonthly: function () { utils.go('/monthly_form'); },

      // 最近记录 → 对应列表
      goDailyList:   function () { utils.go('/daily'); },
      goWeeklyList:  function () { utils.go('/weekly'); },
      goMonthlyList: function () { utils.go('/monthly'); }
    },

    template: [
      '<div class="page">',

        // ===== 三大状态卡 =====
        '<div class="stats">',

          // 日管控状态卡
          '<div class="stat" style="cursor:default">',
            '<div class="si b-p">🛡</div>',
            '<div>',
              '<div class="sv" style="color:var(--primary)">{{dToday}}</div>',
              '<div class="sl">今日检查</div>',
            '</div>',
          '</div>',
          '<div class="stat" style="cursor:default">',
            '<div class="si b-w">⏳</div>',
            '<div>',
              '<div class="sv" style="color:var(--warning)">{{dPending}}</div>',
              '<div class="sl">待检</div>',
            '</div>',
          '</div>',

          // 周排查状态卡
          '<div class="stat" style="cursor:default">',
            '<div class="si b-s">📅</div>',
            '<div>',
              '<div class="sv" style="color:var(--success)">{{wTotal}}</div>',
              '<div class="sl">周排查总数</div>',
            '</div>',
          '</div>',
          '<div class="stat" style="cursor:default">',
            '<div class="si b-i">📋</div>',
            '<div>',
              '<div class="sv">{{wPending}}</div>',
              '<div class="sl">待完成</div>',
            '</div>',
          '</div>',

          // 月调度状态卡
          '<div class="stat" style="cursor:default">',
            '<div class="si b-p">📆</div>',
            '<div>',
              '<div class="sv" style="color:var(--primary)">{{mTotal}}</div>',
              '<div class="sl">月调度总数</div>',
            '</div>',
          '</div>',
          '<div class="stat" style="cursor:default">',
            '<div class="si b-s">✅</div>',
            '<div>',
              '<div class="sv" style="color:var(--success)">{{mCompleted}}</div>',
              '<div class="sl">已完成</div>',
            '</div>',
          '</div>',

        '</div>',

        // ===== 快捷新建按钮 =====
        '<div style="display:flex;gap:10px;padding:0 0 12px">',
          '<button class="btn-primary" style="flex:1;padding:10px;font-size:13px" @click="goDaily">🏠 日管控</button>',
          '<button class="btn-primary" style="flex:1;padding:10px;font-size:13px" @click="goWeekly">📅 周排查</button>',
          '<button class="btn-primary" style="flex:1;padding:10px;font-size:13px" @click="goMonthly">📆 月调度</button>',
        '</div>',

        // ===== Tab 切换 =====
        '<div class="seg">',
          '<button v-for="t in tabs" :key="t.key" :class="tabClass(t.key)" @click="switchTab(t.key)">{{t.label}}</button>',
        '</div>',

        // ===== 加载态 =====
        '<div v-if="showLoading" style="text-align:center;padding:40px 0">',
          '<div style="font-size:28px">⏳</div>',
          '<div style="color:var(--text-3);margin-top:8px">加载中...</div>',
        '</div>',

        // ===== 空状态 =====
        '<div v-else-if="showEmpty" style="text-align:center;padding:40px 0">',
          '<div style="font-size:48px">📋</div>',
          '<div style="margin-top:10px;font-size:15px">暂无记录</div>',
          '<div style="color:var(--text-3);margin-top:4px;font-size:13px">点击上方按钮新建检查</div>',
        '</div>',

        // ===== 记录列表 =====
        '<div v-else class="list">',
          '<div v-for="(item,i) in activeList" :key="itemKey(item,i)" class="list-item" @click="itemClick(item)">',
            '<div class="li-body">',
              '<div class="li-title">{{itemTitle(item)}}</div>',
              '<div class="li-sub">{{itemSub(item)}}</div>',
            '</div>',
            '<div class="li-extra">',
              '<span class="tag" :style="statusStyle(item.status)">{{statusText(item.status)}}</span>',
            '</div>',
            '<div class="li-arrow">‹</div>',
          '</div>',
        '</div>',

        // ===== 查看更多 =====
        '<div v-if="showList" style="text-align:center;padding:10px 0 20px">',
          '<button class="btn-ghost btn-sm" @click="isDaily ? goDailyList() : (isWeekly ? goWeeklyList() : goMonthlyList())">查看更多 ‹</button>',
        '</div>',

      '</div>'
    ].join('')
  };
})();
