// pages/check.js — 检查聚合入口（日管控 / 周排查 / 隐患）
// 三个 tab 各自调用对应 API：api.getInspections / api.getWeekly / api.getHazards
// 全部逻辑收敛到 computed / methods，模板中不含 && || < > 等运算符（铁律三）
// 点击：日管控→/daily_detail?id= ，周排查→toast（无独立路由，按契约允许），隐患→/hazard_detail?id=
(function () {
  window.Pages = window.Pages || {};

  window.Pages.check = {
    name: 'check',
    props: ['query'],

    data: function () {
      return {
        activeTab: 'daily', // 'daily' | 'weekly' | 'hazard'
        loading: true,
        dailyList: [],
        weeklyList: [],
        hazardList: [],
        tabs: [
          { key: 'daily', label: '日管控' },
          { key: 'weekly', label: '周排查' },
          { key: 'hazard', label: '隐患' }
        ]
      };
    },

    computed: {
      // 当前 tab 是否为隐患（用于风险标签渲染）
      isHazardTab: function () { return this.activeTab === 'hazard'; },
      isDailyTab: function () { return this.activeTab === 'daily'; },
      isWeeklyTab: function () { return this.activeTab === 'weekly'; },

      // 当前 tab 对应的列表
      activeList: function () {
        if (this.activeTab === 'daily') return this.dailyList;
        if (this.activeTab === 'weekly') return this.weeklyList;
        return this.hazardList;
      },

      // 视图态
      showLoading: function () { return this.loading && this.activeList.length === 0; },
      showEmpty: function () { return !this.loading && this.activeList.length === 0; },
      showList: function () { return !this.loading && this.activeList.length > 0; }
    },

    mounted: function () { this.load(); },

    methods: {
      // 加载三个列表（并行），切换 tab 时无需重复请求
      load: function () {
        var self = this;
        self.loading = true;
        Promise.all([
          api.getInspections({ page: 1, pageSize: 50 })
            .then(function (d) { self.dailyList = (d && d.data) || []; })
            .catch(function () { self.dailyList = []; }),
          api.getWeekly({ page: 1, pageSize: 50 })
            .then(function (d) { self.weeklyList = (d && d.data) || []; })
            .catch(function () { self.weeklyList = []; }),
          api.getHazards({ page: 1, pageSize: 50 })
            .then(function (d) { self.hazardList = (d && d.data) || []; })
            .catch(function () { self.hazardList = []; })
        ]).then(function () { self.loading = false; })
          .catch(function () { self.loading = false; });
      },

      switchTab: function (key) {
        if (this.activeTab === key) return;
        this.activeTab = key;
      },

      // tab 高亮
      tabClass: function (key) {
        return { active: this.activeTab === key };
      },

      // 列表行 key（避免在模板里写 ||）
      itemKey: function (item, i) {
        return (item && item.id != null) ? String(item.id) : ('row_' + i);
      },

      // 列表标题：隐患显示描述/类型，其余显示设备名
      listTitle: function (item) {
        if (this.isHazardTab) {
          var s = item.hazard_desc || item.hazard_type || item.device_name || ('隐患 #' + item.id);
          return s.length > 24 ? s.substring(0, 24) + '…' : s;
        }
        return item.device_name || item.inspection_no || ('记录 #' + item.id);
      },

      // 列表副标题
      listSub: function (item) {
        var p = [];
        if (this.isHazardTab) {
          if (item.find_time) p.push(utils.formatTime(item.find_time));
          else if (item.created_at) p.push(utils.formatTime(item.created_at));
          if (item.location) p.push(item.location);
        } else {
          if (item.device_code) p.push(item.device_code);
          var dt = item.check_date || item.created_at || '';
          if (dt) p.push(dt);
          if (item.inspector_name) p.push(item.inspector_name);
        }
        return p.join(' | ');
      },

      // 行点击：按 tab 跳转
      itemClick: function (item) {
        if (this.isDailyTab) utils.go('/daily_detail?id=' + item.id);
        else if (this.isWeeklyTab) utils.toast('周排查详情请在 PC 端工作台查看');
        else utils.go('/hazard_detail?id=' + item.id);
      },

      // 状态（统一走 utils）
      statusText: function (s) { return utils.statusLabel(s); },
      statusStyle: function (s) {
        return { background: utils.statusColor(s), color: '#fff' };
      },

      // 风险（仅隐患）
      riskText: function (item) { return utils.levelLabel(item.risk_level); },
      riskStyle: function (item) {
        return { background: utils.levelColor(item.risk_level), color: '#fff' };
      }
    },

    template: [
      '<div class="page">',

        // === Tab 切换 ===
        '<div class="check-tabs">',
          '<div v-for="t in tabs" v-bind:key="t.key" class="check-tab" v-bind:class="tabClass(t.key)" v-on:click="switchTab(t.key)">{{t.label}}</div>',
        '</div>',

        // === 加载态 ===
        '<div v-if="showLoading" class="empty-state">',
          '<div class="empty-icon">⏳</div>',
          '<div class="empty-title">加载中...</div>',
        '</div>',

        // === 空状态 ===
        '<div v-else-if="showEmpty" class="empty-state">',
          '<div class="empty-icon">📋</div>',
          '<div class="empty-title">暂无数据</div>',
          '<div class="empty-sub">切换标签或调整条件试试</div>',
        '</div>',

        // === 列表 ===
        '<div v-else class="list">',
          '<div v-for="(item, i) in activeList" v-bind:key="itemKey(item, i)" class="list-item" v-on:click="itemClick(item)">',
            '<div class="li-body">',
              '<div class="li-title">{{listTitle(item)}}</div>',
              '<div class="li-sub">{{listSub(item)}}</div>',
            '</div>',
            '<div class="li-extra">',
              '<span v-if="isHazardTab" class="badge" v-bind:style="riskStyle(item)">{{riskText(item)}}</span>',
              '<span class="badge" v-bind:style="statusStyle(item.status)">{{statusText(item.status)}}</span>',
            '</div>',
            '<div class="li-arrow">›</div>',
          '</div>',
        '</div>',

      '</div>'
    ].join('')
  };
})();
