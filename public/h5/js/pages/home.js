// pages/home.js — 工作台 M-02（完全重构版）
// 数据源：GET /api/mobile/dashboard
window.Pages = window.Pages || {};
window.Pages.home = {
  template:
    '<div class="home-page">' +
      '<!-- 用户信息区 -->' +
      '<div class="user-card">' +
        '<div class="uc-avatar">{{userInitial}}</div>' +
        '<div class="uc-name">{{userName}}</div>' +
        '<div>' +
          '<span v-if="userRole" class="uc-role">{{userRole}}</span>' +
        '</div>' +
        '<div v-if="userOrg" class="uc-org">{{userOrg}}</div>' +
        '<div class="uc-date">{{today}}</div>' +
      '</div>' +

      '<!-- 预警横幅 -->' +
      '<div v-if="hasUrgentWarning" class="warn-banner">' +
        '<span class="wb-icon">⚠️</span>' +
        '<span>{{urgentWarningText}}</span>' +
      '</div>' +

      '<!-- 加载骨架屏 -->' +
      '<template v-if="loading">' +
        '<div class="skeleton-card"><div class="skeleton-line" style="width:50%;"></div><div class="skeleton-line"></div><div class="skeleton-line" style="width:70%;"></div></div>' +
        '<div class="skeleton-card"><div class="skeleton-line"></div><div class="skeleton-line w75"></div></div>' +
      '</template>' +

      '<!-- 正式数据 -->' +
      '<template v-else>' +
        '<!-- 待办统计 2x2 -->' +
        '<div class="todo-grid">' +
          '<div class="todo-card" @click="goDaily">' +
            '<div class="tc-num" :class="{zero: todoInspections===0}">{{todoInspections>0?todoInspections:"--"}}</div>' +
            '<div class="tc-label">日管控（待检）</div>' +
          '</div>' +
          '<div class="todo-card" @click="goWeekly">' +
            '<div class="tc-num" :class="{zero: todoWeekly===0}">{{todoWeekly>0?todoWeekly:"--"}}</div>' +
            '<div class="tc-label">周排查（待检）</div>' +
          '</div>' +
          '<div class="todo-card" @click="goHazard">' +
            '<div class="tc-num" :class="{zero: todoHazards===0}">{{todoHazards>0?todoHazards:"--"}}</div>' +
            '<div class="tc-label">隐悲（待整改）</div>' +
          '</div>' +
          '<div class="todo-card" @click="goApproval">' +
            '<div class="tc-num" :class="{zero: todoApprovals===0}">{{todoApprovals>0?todoApprovals:"--"}}</div>' +
            '<div class="tc-label">审批（待处理）</div>' +
          '</div>' +
        '</div>' +

        '<!-- 快捷入口 8宫格 -->' +
        '<div class="card">' +
          '<div class="card-title">快捷入口</div>' +
          '<div class="quick-grid">' +
            '<div class="quick-item" @click="goDaily">' +
              '<div class="qi-icon">📋</div><div class="qi-label">日管控</div>' +
              '<span v-if="badgeInspections>0" class="qi-badge">{{badgeInspections>99?"99+":badgeInspections}}</span>' +
            '</div>' +
            '<div class="quick-item" @click="goWeekly">' +
              '<div class="qi-icon">📅</div><div class="qi-label">周排查</div>' +
              '<span v-if="badgeWeekly>0" class="qi-badge">{{badgeWeekly>99?"99+":badgeWeekly}}</span>' +
            '</div>' +
            '<div class="quick-item" @click="goHazard">' +
              '<div class="qi-icon">⚠</div><div class="qi-label">隐悲排查</div>' +
              '<span v-if="badgeHazards>0" class="qi-badge">{{badgeHazards>99?"99+":badgeHazards}}</span>' +
            '</div>' +
            '<div class="quick-item" @click="goDeviceScan">' +
              '<div class="qi-icon">🔍</div><div class="qi-label">设备查询</div>' +
            '</div>' +
            '<div class="quick-item" @click="goEmergency">' +
              '<div class="qi-icon">🟢</div><div class="qi-label">应急报告</div>' +
              '<span v-if="badgeEmergency>0" class="qi-badge">{{badgeEmergency>99?"99+":badgeEmergency}}</span>' +
            '</div>' +
            '<div class="quick-item" @click="goApproval">' +
              '<div class="qi-icon">✔</div><div class="qi-label">审批待办</div>' +
              '<span v-if="todoApprovals>0" class="qi-badge">{{todoApprovals>99?"99+":todoApprovals}}</span>' +
            '</div>' +
            '<div class="quick-item" @click="goMonthly">' +
              '<div class="qi-icon">📊</div><div class="qi-label">月调度</div>' +
            '</div>' +
            '<div class="quick-item" @click="goRecord">' +
              '<div class="qi-icon">📖</div><div class="qi-label">检查记录</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<!-- 今日任务提示 -->' +
        '<div class="today-task">' +
          '<div class="tt-bar">' +
            '<span class="tt-label">今日检查任务</span>' +
            '<span class="tt-count">{{todayInspectionsCompleted}}/{{todoInspections}}</span>' +
          '</div>' +
          '<div class="progress progress-sm">' +
            '<div class="progress-bar" :style="progressWidth"></div>' +
          '</div>' +
        '</div>' +
      '</template>' +
    '</div>',
  data: function () {
    return {
      loading: true,
      todo: {},
      warning: {},
      today: ''
    };
  },
  computed: {
    user: function () { return Store.getUser() || {}; },
    userName: function () { return this.user.name || this.user.email || '\u672a\u77e5\u7528\u6237'; },
    userInitial: function () {
      var n = this.userName;
      return n ? n.charAt(0).toUpperCase() : '?';
    },
    userRole: function () {
      var u = this.user;
      if (Array.isArray(u.roles) && u.roles.length) return u.roles[0];
      return u.role || '';
    },
    userOrg: function () {
      var u = this.user;
      if (u.orgName) return u.orgName;
      if (u.organization && u.organization.name) return u.organization.name;
      return '';
    },
    todoInspections: function () { return this.todo.inspections || 0; },
    todoWeekly: function () { return this.todo.weekly || 0; },
    todoHazards: function () { return this.todo.hazards || 0; },
    todoApprovals: function () { return this.todo.approvals || 0; },
    todoWorkOrders: function () { return this.todo.workOrders || 0; },
    warningOpen: function () { return this.warning.open || 0; },
    urgentCritical: function () { return this.warning.urgentCritical || 0; },
    hasUrgentWarning: function () { return this.urgentCritical > 0; },
    urgentWarningText: function () {
      return '\u7d27\u6025\u9884\u8b66 ' + this.urgentCritical + ' \u6761';
    },
    badgeInspections: function () { return this.todoInspections; },
    badgeWeekly: function () { return this.todoWeekly; },
    badgeHazards: function () { return this.todoHazards; },
    badgeEmergency: function () { return 0; },
    todayInspectionsCompleted: function () {
      // 后端 dashboard 未返回已完成数，显示总待办-今日新增
      return Math.max(0, (this.todoInspections + this.todoWeekly) - (this.warning.open || 0));
    },
    todayProgress: function () {
      var total = this.todoInspections + this.todoWeekly;
      if (!total) return 100;
      var done = this.todayInspectionsCompleted;
      return Math.min(100, Math.round(done / total * 100));
    },
    progressWidth: function () {
      return 'width:' + this.todayProgress + '%';
    }
  },
  mounted: function () {
    var self = this;
    window.__ptrFn = function () { return self.load(); };
    this.load();
  },
  unmounted: function () {
    window.__ptrFn = null;
  },
  methods: {
    load: function () {
      var self = this;
      self.loading = true;
      var now = new Date();
      self.today = now.getFullYear() + '\u5e74' + (now.getMonth() + 1) + '\u6708' + now.getDate() + '\u65e5';
      return api.getDashboard()
        .then(function (d) {
          if (d && d.success) {
            self.todo = d.todo || {};
            self.warning = d.warning || {};
          }
        })
        .catch(function () {})
        .finally(function () { self.loading = false; });
    },
    goDaily: function () { utils.go('/check?type=daily'); },
    goWeekly: function () { utils.go('/check?type=weekly'); },
    goHazard: function () { utils.go('/check?type=hazard'); },
    goApproval: function () { utils.go('/approval'); },
    goMonthly: function () { utils.go('/monthly'); },
    goEmergency: function () { utils.go('/emergency'); },
    goRecord: function () { utils.go('/record'); },
    goDeviceScan: function () { utils.go('/device_scan'); }
  }
};
