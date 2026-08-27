// home.js — 特安助 H5 工作台
// 依据 H5_REWRITE_CONTRACT.md 重写：api.getDashboard() 渲染待办统计 + 预警 + 快捷入口
// 铁律：v-model 仅用于 input；模板内无裸 && || < >；禁止 SVG；根节点 .page
window.Pages = window.Pages || {};

window.Pages.home = {
  name: 'home',
  props: ['query'],

  data: function () {
    return {
      loading: true,
      todo: { inspections: 0, weekly: 0, hazards: 0, approvals: 0, workOrders: 0 },
      warning: { open: 0, urgentCritical: 0 },
      today: ''
    };
  },

  computed: {
    user: function () { return Store.getUser() || {}; },

    userName: function () {
      var u = this.user;
      return u.name || u.email || '用户';
    },

    avatarText: function () {
      var n = this.userName;
      return n ? String(n).charAt(0) : '?';
    },

    roleLabel: function () {
      var u = this.user;
      var r = u.role || (Array.isArray(u.roles) ? u.roles[0] : '');
      var map = { admin: '管理员', auditor: '审核员', operator: '操作员', user: '普通用户' };
      return map[String(r).toLowerCase()] || r || '';
    },

    // 今日日期展示（优先取后台 today，否则本地生成）
    todayText: function () {
      if (this.today) return this.today;
      var d = new Date();
      var w = ['日', '一', '二', '三', '四', '五', '六'];
      return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + ' 周' + w[d.getDay()];
    },

    todoInspections: function () { return this.todo.inspections || 0; },
    todoWeekly: function () { return this.todo.weekly || 0; },
    todoHazards: function () { return this.todo.hazards || 0; },
    todoApprovals: function () { return this.todo.approvals || 0; },
    todoWorkOrders: function () { return this.todo.workOrders || 0; },
    urgentCritical: function () { return this.warning.urgentCritical || 0; },
    warnOpen: function () { return this.warning.open || 0; },

    // 紧急/重大预警是否存在（不放裸 > 到模板）
    hasUrgent: function () { return this.urgentCritical > 0; }
  },

  methods: {
    go: function (p) { utils.go(p); },
    load: function () { this.fetchDashboard(); },

    fetchDashboard: async function () {
      var self = this;
      self.loading = true;
      try {
        var res = await api.getDashboard();
        if (res && typeof res === 'object') {
          if (res.todo) self.todo = Object.assign(self.todo, res.todo);
          if (res.warning) self.warning = Object.assign(self.warning, res.warning);
          if (res.today) self.today = res.today;
        }
      } catch (e) {
        // api 层已统一 toast
      } finally {
        self.loading = false;
      }
    },

    // 数字为 0 时置灰 class（不放裸 === 到模板）
    numClass: function (n) { return n > 0 ? '' : 'zero'; }
  },

  mounted: function () { this.load(); },

  template: `
<div class="page">
  <div v-if="loading" class="card">
    <div class="skeleton" style="width:60%;"></div>
    <div class="skeleton" style="width:90%;"></div>
    <div class="skeleton" style="width:80%;"></div>
  </div>

  <template v-else>
    <!-- 用户欢迎卡 -->
    <div class="user-card">
      <div class="uc-avatar">{{ avatarText }}</div>
      <div>
        <div class="uc-name">{{ userName }}</div>
        <div class="uc-role" v-if="roleLabel">{{ roleLabel }}</div>
        <div class="uc-date">{{ todayText }}</div>
      </div>
    </div>

    <!-- 紧急预警横幅 -->
    <div class="warn-banner" v-if="hasUrgent">
      <span class="wb-icon">⚠️</span>
      <span>您有 <b>{{ urgentCritical }}</b> 项紧急/重大预警待处理</span>
    </div>

    <!-- 待办统计 -->
    <div class="block-title">待办统计</div>
    <div class="card">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        <div class="todo-card" @click="go('/daily_form')">
          <div style="font-size:20px;margin-bottom:6px;">📋</div>
          <div class="tc-num" :class="numClass(todoInspections)">{{ todoInspections }}</div>
          <div class="tc-label">日管控</div>
        </div>
        <div class="todo-card" @click="go('/weekly')">
          <div style="font-size:20px;margin-bottom:6px;">📆</div>
          <div class="tc-num" :class="numClass(todoWeekly)">{{ todoWeekly }}</div>
          <div class="tc-label">周排查</div>
        </div>
        <div class="todo-card" @click="go('/hazard')">
          <div style="font-size:20px;margin-bottom:6px;">⚠️</div>
          <div class="tc-num" :class="numClass(todoHazards)">{{ todoHazards }}</div>
          <div class="tc-label">隐患</div>
        </div>
        <div class="todo-card" @click="go('/approval')">
          <div style="font-size:20px;margin-bottom:6px;">✅</div>
          <div class="tc-num" :class="numClass(todoApprovals)">{{ todoApprovals }}</div>
          <div class="tc-label">审批</div>
        </div>
        <div class="todo-card" @click="go('/work_order')">
          <div style="font-size:20px;margin-bottom:6px;">🛠️</div>
          <div class="tc-num" :class="numClass(todoWorkOrders)">{{ todoWorkOrders }}</div>
          <div class="tc-label">工单</div>
        </div>
      </div>
    </div>

    <!-- 预警概览 -->
    <div class="block-title">预警概览</div>
    <div class="card">
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
        <div class="todo-card">
          <div style="font-size:20px;margin-bottom:6px;">🔔</div>
          <div class="tc-num" :class="numClass(warnOpen)">{{ warnOpen }}</div>
          <div class="tc-label">预警总数</div>
        </div>
        <div class="todo-card">
          <div style="font-size:20px;margin-bottom:6px;">🚨</div>
          <div class="tc-num" :class="numClass(urgentCritical)">{{ urgentCritical }}</div>
          <div class="tc-label">紧急/重大</div>
        </div>
      </div>
    </div>

    <!-- 快捷入口 -->
    <div class="block-title">快捷入口</div>
    <div class="quick-grid">
      <div class="quick-item" @click="go('/daily_form')">
        <div class="qi-icon">📋</div>
        <div class="qi-label">日管控</div>
      </div>
      <div class="quick-item" @click="go('/weekly')">
        <div class="qi-icon">📆</div>
        <div class="qi-label">周排查</div>
      </div>
      <div class="quick-item" @click="go('/hazard')">
        <div class="qi-icon">⚠️</div>
        <div class="qi-label">隐患</div>
      </div>
      <div class="quick-item" @click="go('/emergency_form')">
        <div class="qi-icon">🚨</div>
        <div class="qi-label">应急</div>
      </div>
      <div class="quick-item" @click="go('/approval')">
        <div class="qi-icon">✅</div>
        <div class="qi-label">审批</div>
      </div>
      <div class="quick-item" @click="go('/device_scan')">
        <div class="qi-icon">🔍</div>
        <div class="qi-label">设备</div>
      </div>
    </div>
  </template>
</div>
`
};
