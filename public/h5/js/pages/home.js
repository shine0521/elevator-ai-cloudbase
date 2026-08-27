// home.js - 特安助 H5 工作台
// 技术栈：Vue 3 global build（CDN），无构建工具

(function () {
  'use strict';

  var HomePage = {
    template: '<div class="home-page">'
      // 骨架屏
      + '<div v-if="loading" class="skeleton-wrap">'
        + '<div class="skeleton-card"></div>'
        + '<div class="skeleton-card mt-12"></div>'
        + '<div class="skeleton-card mt-12"></div>'
      + '</div>'
      // 主内容
      + '<div v-else class="home-content">'
        // 用户卡片
        + '<div class="user-card">'
          + '<div class="uc-avatar" :style="avatarStyle">{{ userInitial }}</div>'
          + '<div class="uc-info">'
            + '<div class="uc-name-row">'
              + '<span class="uc-name">{{ userName }}</span>'
              + '<span class="uc-role" :class="\'role-\' + userRole">{{ roleLabel }}</span>'
            + '</div>'
            + '<p class="uc-org" v-if="userOrg">{{ userOrg }}</p>'
            + '<p class="uc-date">{{ today }}</p>'
          + '</div>'
        + '</div>'
        // 预警横幅
        + '<div v-if="hasUrgentWarning" class="warn-banner">'
          + '<span class="warn-icon">⚠️</span>'
          + '<span>您有 <strong>{{ urgentCritical }}</strong> 项紧急/重大预警待处理</span>'
        + '</div>'
        // 待办卡片
        + '<div class="todo-section">'
          + '<div class="section-title">待办事项</div>'
          + '<div class="todo-grid">'
            // 日管控
            + '<div class="todo-card" @click="goCheck(\'daily\')">'
              + '<div class="tc-icon tc-icon-blue">📋</div>'
              + '<div class="tc-num" :class="{ zero: todoInspections === 0 }">{{ todoInspections }}</div>'
              + '<div class="tc-label">日管控</div>'
            + '</div>'
            // 周排查
            + '<div class="todo-card" @click="goCheck(\'weekly\')">'
              + '<div class="tc-icon tc-icon-green">📆</div>'
              + '<div class="tc-num" :class="{ zero: todoWeekly === 0 }">{{ todoWeekly }}</div>'
              + '<div class="tc-label">周排查</div>'
            + '</div>'
            // 隐患
            + '<div class="todo-card" @click="goHazard">'
              + '<div class="tc-icon tc-icon-orange">⚠️</div>'
              + '<div class="tc-num" :class="{ zero: todoHazards === 0 }">{{ todoHazards }}</div>'
              + '<div class="tc-label">隐患</div>'
            + '</div>'
            // 审批
            + '<div class="todo-card" @click="goApproval">'
              + '<div class="tc-icon tc-icon-purple">✅</div>'
              + '<div class="tc-num" :class="{ zero: todoApprovals === 0 }">{{ todoApprovals }}</div>'
              + '<div class="tc-label">审批</div>'
            + '</div>'
          + '</div>'
        + '</div>'
        // 今日任务进度
        + '<div v-if="showProgress" class="today-task">'
          + '<div class="tt-header">'
            + '<span class="tt-label">今日任务进度</span>'
            + '<span class="tt-count">{{ progressPercent }}%</span>'
          + '</div>'
          + '<div class="progress">'
            + '<div class="progress-bar" :style="progressWidth"></div>'
          + '</div>'
          + '<p class="tt-sub">已完成 {{ doneCount }} / {{ totalTodo }} 项</p>'
        + '</div>'
        // 快捷入口
        + '<div class="quick-section">'
          + '<div class="section-title">快捷入口</div>'
          + '<div class="quick-grid">'
            + '<div class="quick-item" @click="goCheck(\'daily\')">'
              + '<div class="qi-icon qi-icon-blue">📋</div>'
              + '<span class="qi-label">日管控</span>'
            + '</div>'
            + '<div class="quick-item" @click="goCheck(\'weekly\')">'
              + '<div class="qi-icon qi-icon-green">📆</div>'
              + '<span class="qi-label">周排查</span>'
            + '</div>'
            + '<div class="quick-item" @click="goHazard">'
              + '<div class="qi-icon qi-icon-orange">⚠️</div>'
              + '<span class="qi-label">隐患排查</span>'
            + '</div>'
            + '<div class="quick-item" @click="goEquip">'
              + '<div class="qi-icon qi-icon-gray">🔍</div>'
              + '<span class="qi-label">设备查询</span>'
            + '</div>'
            + '<div class="quick-item" @click="goEmergency">'
              + '<div class="qi-icon qi-icon-red">🚨</div>'
              + '<span class="qi-label">应急报告</span>'
            + '</div>'
            + '<div class="quick-item" @click="goApproval">'
              + '<div class="qi-icon qi-icon-purple">✅</div>'
              + '<span class="qi-label">审批待办</span>'
            + '</div>'
            + '<div class="quick-item" @click="goMonthly">'
              + '<div class="qi-icon qi-icon-teal">📊</div>'
              + '<span class="qi-label">月调度</span>'
            + '</div>'
            + '<div class="quick-item" @click="goRecord">'
              + '<div class="qi-icon qi-icon-blue2">📝</div>'
              + '<span class="qi-label">检查记录</span>'
            + '</div>'
          + '</div>'
        + '</div>'
        // 空状态
        + '<div v-if="isEmpty" class="empty-state">'
          + '<div class="empty-icon">✅</div>'
          + '<p>今日工作已全部完成</p>'
        + '</div>'
      + '</div>'
    + '</div>',

    data: function () {
      return {
        loading: true,
        todo: {
          inspections: 0,
          weekly: 0,
          hazards: 0,
          approvals: 0,
          workOrders: 0
        },
        warning: {
          open: 0,
          urgentCritical: 0
        },
        doneCount: 0  // 后端未提供，取本地估算
      };
    },

    computed: {
      todoInspections: function () {
        return this.todo.inspections || 0;
      },
      todoWeekly: function () {
        return this.todo.weekly || 0;
      },
      todoHazards: function () {
        return this.todo.hazards || 0;
      },
      todoApprovals: function () {
        return this.todo.approvals || 0;
      },
      todoWorkOrders: function () {
        return this.todo.workOrders || 0;
      },
      urgentCritical: function () {
        return this.warning.urgentCritical || 0;
      },
      hasUrgentWarning: function () {
        return this.urgentCritical > 0;
      },
      totalTodo: function () {
        return this.todoInspections + this.todoWeekly;
      },
      progressPercent: function () {
        var total = this.totalTodo;
        if (!total) return 0;
        return Math.round(this.doneCount / total * 100);
      },
      progressWidth: function () {
        return 'width:' + this.progressPercent + '%;';
      },
      showProgress: function () {
        return this.totalTodo > 0;
      },
      user: function () {
        return window.Store.getUser() || {};
      },
      userName: function () {
        var u = this.user;
        return u.name || u.email || '未知用户';
      },
      userInitial: function () {
        return this.userName.charAt(0).toUpperCase();
      },
      avatarStyle: function () {
        var initials = this.userInitial;
        var colors = ['#1677FF', '#52C41A', '#FA8C16', '#FF4D4F', '#722ED1', '#13C2C2'];
        var idx = initials.charCodeAt(0) % colors.length;
        return 'background:' + colors[idx] + ';';
      },
      userRole: function () {
        var u = this.user;
        return u.role || '';
      },
      roleLabel: function () {
        var map = {
          admin: '管理员',
          auditor: '审核员',
          operator: '操作员',
          user: '普通用户'
        };
        return map[this.userRole] || this.userRole;
      },
      userOrg: function () {
        var u = this.user;
        return u.orgName || u.organizationName || '';
      },
      today: function () {
        var d = new Date();
        var weekDays = ['日', '一', '二', '三', '四', '五', '六'];
        return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + weekDays[d.getDay()];
      },
      isEmpty: function () {
        return !this.loading && !this.totalTodo && !this.urgentCritical;
      }
    },

    methods: {
      fetchDashboard: async function () {
        var self = this;
        self.loading = true;
        try {
          var res = await window.api.get('/api/mobile/dashboard');
          if (res && typeof res === 'object') {
            self.todo = res.todo || self.todo;
            self.warning = res.warning || self.warning;
          }
        } catch (err) {
          console.warn('获取工作台数据失败', err);
        } finally {
          self.loading = false;
        }
      },

      goCheck: function (type) {
        window.utils.go('/check?type=' + type);
      },
      goHazard: function () {
        window.utils.go('/hazard');
      },
      goApproval: function () {
        window.utils.go('/approval');
      },
      goEquip: function () {
        window.utils.go('/equipment');
      },
      goEmergency: function () {
        window.utils.go('/emergency');
      },
      goMonthly: function () {
        window.utils.go('/monthly');
      },
      goRecord: function () {
        window.utils.go('/record');
      }
    },

    mounted: function () {
      this.fetchDashboard();
    }
  };

  // 注册到全局 Vue 路由
  if (window.VueRouter) {
    window.VueRouter.definePage('home', HomePage);
  }

  window.HomePage = HomePage;

})();
