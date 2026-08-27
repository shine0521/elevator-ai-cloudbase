// pages/check.js — 检查聚合入口（日管控 / 周排查 / 隐患）
// 三个 tab 独立请求对应 API，切换 tab / 状态筛选时重新加载
// 所有逻辑收敛到 computed / methods，模板中不含 && || > < 等运算符
(function () {
  // 状态“进行中 / 已完成”分桶所需的后端状态集合
  var ONGOING = ['pending', 'ongoing', 'submitted', 'rectifying', 'verifying'];
  var COMPLETED = ['reviewed', 'closed', 'approved'];

  window.Pages = window.Pages || {};
  window.Pages.check = {
    template: [
      '<div class="check-page">',

        // === Tab 切换 ===
        '<div class="check-tabs">',
          '<div v-for="t in tabs" v-bind:key="t.key" v-bind:class="tabClass(t.key)" v-on:click="switchTab(t.key)">{{t.label}}</div>',
        '</div>',

        // === 状态筛选（全部 / 进行中 / 已完成） ===
        '<div class="check-tabs" style="margin-bottom:10px;">',
          '<div v-for="s in statusOptions" v-bind:key="s.value" v-bind:class="statusTagClass(s.value)" v-on:click="onStatusChange(s.value)">{{s.label}}</div>',
        '</div>',

        // === 加载态 ===
        '<div v-if="showLoading" class="loading-row"><div class="spinner"></div>加载中...</div>',

        // === 空状态 ===
        '<div v-if="showEmpty" class="empty-state">',
          '<div class="empty-icon">📋</div>',
          '<div class="empty-title">暂无数据</div>',
          '<div class="empty-sub">切换标签或调整筛选条件试试</div>',
        '</div>',

        // === 列表 ===
        '<div class="list" v-if="showList">',
          '<div v-for="item in activeList" v-bind:key="item.id" class="list-item" v-on:click="itemClick(item)">',
            '<div class="li-body" v-if="isCheckItem">',
              '<div class="li-title">{{checkTitle(item)}}</div>',
              '<div class="li-sub">{{checkSub(item)}}</div>',
            '</div>',
            '<div class="li-body" v-else-if="isHazardItem">',
              '<div class="li-title">{{hazardTitle(item)}}</div>',
              '<div class="li-sub">{{hazardSub(item)}}</div>',
            '</div>',
            '<div class="li-extra">',
              '<span v-if="isHazardItem" class="badge" v-bind:style="riskBadgeStyle(item)">{{riskLabel(item)}}</span>',
              '<span class="badge" v-bind:class="statusClass(item.status)">{{statusLabel(item.status)}}</span>',
            '</div>',
            '<div class="li-arrow">›</div>',
          '</div>',
        '</div>',

      '</div>'
    ].join(''),

    data: function () {
      return {
        activeTab: 'daily', // 'daily' | 'weekly' | 'hazard'
        dailyList: [], weeklyList: [], hazardList: [],
        dailyLoading: false, weeklyLoading: false, hazardLoading: false,
        dailyStatus: 'all', weeklyStatus: 'all', hazardStatus: 'all',
        tabs: [
          { key: 'daily', label: '日管控' },
          { key: 'weekly', label: '周排查' },
          { key: 'hazard', label: '隐患' }
        ],
        statusOptions: [
          { value: 'all', label: '全部' },
          { value: 'ongoing', label: '进行中' },
          { value: 'completed', label: '已完成' }
        ]
      };
    },

    computed: {
      // 当前 tab 对应的列表
      activeList: function () {
        if (this.activeTab === 'daily') return this.dailyList;
        if (this.activeTab === 'weekly') return this.weeklyList;
        return this.hazardList;
      },
      // 当前 tab 对应的加载标志
      activeLoading: function () {
        if (this.activeTab === 'daily') return this.dailyLoading;
        if (this.activeTab === 'weekly') return this.weeklyLoading;
        return this.hazardLoading;
      },
      // 当前 tab 对应的状态筛选（读写代理）
      activeStatus: {
        get: function () {
          if (this.activeTab === 'daily') return this.dailyStatus;
          if (this.activeTab === 'weekly') return this.weeklyStatus;
          return this.hazardStatus;
        },
        set: function (v) {
          if (this.activeTab === 'daily') this.dailyStatus = v;
          else if (this.activeTab === 'weekly') this.weeklyStatus = v;
          else this.hazardStatus = v;
        }
      },
      // 当前 tab 对应的 API 参数
      activeParams: function () {
        return { page: 1, size: 50 };
      },

      // 当前是否为检查类（日管控 / 周排查）
      isCheckItem: function () {
        return this.activeTab !== 'hazard';
      },
      // 当前是否为隐患
      isHazardItem: function () {
        return this.activeTab === 'hazard';
      },

      // 视图态
      showLoading: function () {
        return this.activeLoading && this.activeList.length === 0;
      },
      showEmpty: function () {
        return !this.activeLoading && this.activeList.length === 0;
      },
      showList: function () {
        return this.activeList.length > 0;
      }
    },

    mounted: function () {
      var q = this.query || {};
      if (q.type === 'weekly') this.activeTab = 'weekly';
      else if (q.type === 'hazard') this.activeTab = 'hazard';
      this.load();
      window.__ptrFn = this.load.bind(this);
    },

    beforeUnmount: function () {
      window.__ptrFn = null;
    },

    methods: {
      // 加载当前 tab 数据
      load: function () {
        var self = this;
        var tab = this.activeTab;
        var path = this.getApiPath();
        var params = this.activeParams;

        if (tab === 'daily') { self.dailyList = []; self.dailyLoading = true; }
        else if (tab === 'weekly') { self.weeklyList = []; self.weeklyLoading = true; }
        else { self.hazardList = []; self.hazardLoading = true; }

        return api.get(path, params)
          .then(function (d) {
            var arr = (d && d.data) || [];
            if (tab === 'daily') self.dailyList = arr;
            else if (tab === 'weekly') self.weeklyList = arr;
            else self.hazardList = arr;
          })
          .catch(function () { utils.toast('加载失败'); })
          .finally(function () {
            if (tab === 'daily') self.dailyLoading = false;
            else if (tab === 'weekly') self.weeklyLoading = false;
            else self.hazardLoading = false;
          });
      },

      switchTab: function (tab) {
        if (this.activeTab === tab) return;
        this.activeTab = tab;
        this.load();
      },

      onStatusChange: function (status) {
        this.activeStatus = status;
        this.load();
      },

      // 根据 tab 返回 API 路径
      getApiPath: function () {
        if (this.activeTab === 'daily') return '/api/mobile/inspections';
        if (this.activeTab === 'weekly') return '/api/mobile/weekly';
        return '/api/mobile/hazards';
      },

      goForm: function (id) {
        utils.go('/daily_form?id=' + id);
      },

      goDetail: function (id) {
        utils.go('/daily_detail?id=' + id);
      },

      // 列表项点击：根据当前 tab 跳转对应页面
      itemClick: function (item) {
        var id = item.id;
        if (this.activeTab === 'daily') this.goDetail(id);
        else if (this.activeTab === 'weekly') utils.go('/weekly_form?id=' + id);
        else utils.go('/hazard_form?id=' + id + '&mode=view');
      },

      // === 渲染辅助 ===
      tabClass: function (key) {
        return { 'check-tab': true, 'active': this.activeTab === key };
      },
      statusTagClass: function (value) {
        return { 'check-tab': true, 'active': this.activeStatus === value };
      },

      checkTitle: function (item) {
        return item.device_name || item.inspection_no || ('记录 #' + item.id);
      },
      checkSub: function (item) {
        var parts = [];
        if (item.device_code) parts.push(item.device_code);
        if (item.check_date) parts.push(item.check_date);
        if (item.location) parts.push(item.location);
        if (item.inspector_name) parts.push(item.inspector_name);
        return parts.join(' | ');
      },
      hazardTitle: function (item) {
        var s = item.hazard_desc || item.hazard_type || item.device_name || ('隐患 #' + item.id);
        if (s.length > 24) s = s.substring(0, 24) + '…';
        return s;
      },
      hazardSub: function (item) {
        var parts = [];
        if (item.find_time) parts.push(utils.formatTime(item.find_time));
        else if (item.created_at) parts.push(utils.formatTime(item.created_at));
        if (item.location) parts.push(item.location);
        return parts.join(' | ');
      },

      riskLabel: function (item) {
        return utils.levelLabel(item.risk_level);
      },
      riskBadgeStyle: function (item) {
        return { background: utils.levelColor(item.risk_level), color: '#fff' };
      },

      // 状态 → 中文标签
      statusLabel: function (s) {
        var key = String(s || '').toLowerCase();
        var m = {
          pending: '待检', ongoing: '进行中', submitted: '已提交', reviewed: '已审核',
          rectifying: '整改中', verifying: '待验收', closed: '已关闭'
        };
        return m[key] || s || '';
      },
      // 状态 → 徽章配色类
      statusClass: function (s) {
        var key = String(s || '').toLowerCase();
        var m = {
          pending: 'badge-orange', ongoing: 'badge-blue', submitted: 'badge-blue',
          reviewed: 'badge-green', rectifying: 'badge-blue', verifying: 'badge-orange',
          closed: 'badge-gray'
        };
        return m[key] || 'badge-gray';
      }
    }
  };
})();
