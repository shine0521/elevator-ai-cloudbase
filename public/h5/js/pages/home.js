// home.js — 电梯安全管理 AI 系统 H5 工作台
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md 重写
// 铁律：v-model 仅用于 input；模板内无裸 && || < >；禁止 SVG（用 emoji）；根节点 .page
window.Pages = window.Pages || {};

window.Pages.home = {
  name: 'home',
  props: ['query'],

  data: function () {
    return {
      loading: true,
      error: null,
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

    todayText: function () {
      if (this.today) return this.today;
      var d = new Date();
      var w = ['日', '一', '二', '三', '四', '五', '六'];
      return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + ' 周' + w[d.getDay()];
    },

    // 5 个待办数量
    nInspections: function () { return this.todo.inspections || 0; },
    nWeekly: function () { return this.todo.weekly || 0; },
    nHazards: function () { return this.todo.hazards || 0; },
    nApprovals: function () { return this.todo.approvals || 0; },
    nWorkOrders: function () { return this.todo.workOrders || 0; },
    // 预警数量
    nWarnOpen: function () { return this.warning.open || 0; },
    nUrgentCritical: function () { return this.warning.urgentCritical || 0; },

    // 紧急/重大预警是否存在
    hasUrgent: function () { return this.nUrgentCritical > 0; }
  },

  methods: {
    go: function (p) { utils.go(p); },

    load: function () {
      var self = this;
      self.loading = true;
      self.error = null;
      api.getDashboard().then(function (res) {
        if (res && typeof res === 'object') {
          if (res.todo) self.todo = Object.assign({}, self.todo, res.todo);
          if (res.warning) self.warning = Object.assign({}, self.warning, res.warning);
          if (res.today) self.today = res.today;
        }
      }).catch(function () {
        self.error = '加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    numClass: function (n) { return n > 0 ? '' : 'zero'; }
  },

  mounted: function () { this.load(); },

  template: '\
<div class="page">\
  <!-- 加载态 -->\
  <div v-if="loading" class="loading-wrap">\
    <div class="spinner"></div>\
    <div>加载中...</div>\
  </div>\
  <!-- 错误态 -->\
  <div v-else-if="error" class="error-wrap">\
    <div>⚠️</div>\
    <div>{{ error }}</div>\
    <button class="btn-primary" style="margin-top:14px;width:auto;padding:9px 20px;" @click="load">重 试</button>\
  </div>\
  <!-- 正常态 -->\
  <template v-else>\
    <!-- 顶部欢迎卡 -->\
    <div class="card" style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">\
      <div class="avatar" style="width:48px;height:48px;font-size:20px;flex-shrink:0;">{{ avatarText }}</div>\
      <div style="flex:1;min-width:0;">\
        <div style="font-size:16px;font-weight:600;">{{ userName }}</div>\
        <div style="font-size:12px;color:var(--text-3);margin-top:2px;">{{ roleLabel }}</div>\
      </div>\
      <div style="text-align:right;flex-shrink:0;">\
        <div style="font-size:12px;color:var(--text-3);">📅</div>\
        <div style="font-size:12px;color:var(--text-3);margin-top:2px;">{{ todayText }}</div>\
      </div>\
    </div>\
    <!-- 紧急预警横幅 -->\
    <div v-if="hasUrgent" class="card" style="background:#fef0f0;border:1px solid #fbc4c4;display:flex;align-items:center;gap:10px;margin-bottom:12px;">\
      <span style="font-size:20px;">🚨</span>\
      <span style="flex:1;font-size:13px;color:var(--danger);">\
        您有 <b>{{ nUrgentCritical }}</b> 项紧急/重大预警待处理\
      </span>\
    </div>\
    <!-- 待办统计（5项 + 预警2项）-->\
    <div class="card-title" style="font-size:15px;font-weight:600;margin-bottom:10px;">待办统计</div>\
    <div class="stats" style="margin-bottom:12px;">\
      <div class="stat" @click="go(\'/daily_form\')">\
        <div class="si b-p">📋</div>\
        <div style="flex:1;min-width:0;">\
          <div class="sv" :class="numClass(nInspections)">{{ nInspections }}</div>\
          <div class="sl">日管控</div>\
        </div>\
      </div>\
      <div class="stat" @click="go(\'/weekly\')">\
        <div class="si b-p">📆</div>\
        <div style="flex:1;min-width:0;">\
          <div class="sv" :class="numClass(nWeekly)">{{ nWeekly }}</div>\
          <div class="sl">周排查</div>\
        </div>\
      </div>\
      <div class="stat" @click="go(\'/hazard\')">\
        <div class="si b-w">⚠️</div>\
        <div style="flex:1;min-width:0;">\
          <div class="sv" :class="numClass(nHazards)">{{ nHazards }}</div>\
          <div class="sl">隐患</div>\
        </div>\
      </div>\
      <div class="stat" @click="go(\'/approval\')">\
        <div class="si b-s">✅</div>\
        <div style="flex:1;min-width:0;">\
          <div class="sv" :class="numClass(nApprovals)">{{ nApprovals }}</div>\
          <div class="sl">审批</div>\
        </div>\
      </div>\
      <div class="stat" @click="go(\'/work_order\')">\
        <div class="si b-d">🛠️</div>\
        <div style="flex:1;min-width:0;">\
          <div class="sv" :class="numClass(nWorkOrders)">{{ nWorkOrders }}</div>\
          <div class="sl">工单</div>\
        </div>\
      </div>\
      <div class="stat">\
        <div class="si b-i">🔔</div>\
        <div style="flex:1;min-width:0;">\
          <div class="sv" :class="numClass(nWarnOpen)">{{ nWarnOpen }}</div>\
          <div class="sl">预警总数</div>\
        </div>\
      </div>\
    </div>\
    <!-- 快捷入口 -->\
    <div class="card-title" style="font-size:15px;font-weight:600;margin-bottom:10px;">快捷入口</div>\
    <div class="grid-q">\
      <div class="quick-card" @click="go(\'/daily_form\')">\
        <div class="qc-ic">📋</div>\
        <div class="qc-t">日管控</div>\
      </div>\
      <div class="quick-card" @click="go(\'/weekly\')">\
        <div class="qc-ic">📆</div>\
        <div class="qc-t">周排查</div>\
      </div>\
      <div class="quick-card" @click="go(\'/monthly\')">\
        <div class="qc-ic">📝</div>\
        <div class="qc-t">月调度</div>\
      </div>\
      <div class="quick-card" @click="go(\'/hazard\')">\
        <div class="qc-ic">⚠️</div>\
        <div class="qc-t">隐患</div>\
      </div>\
      <div class="quick-card" @click="go(\'/work_order\')">\
        <div class="qc-ic">🛠️</div>\
        <div class="qc-t">工单</div>\
      </div>\
      <div class="quick-card" @click="go(\'/emergency_form\')">\
        <div class="qc-ic">🚨</div>\
        <div class="qc-t">应急</div>\
      </div>\
      <div class="quick-card" @click="go(\'/approval\')">\
        <div class="qc-ic">✅</div>\
        <div class="qc-t">审批</div>\
      </div>\
      <div class="quick-card" @click="go(\'/device_scan\')">\
        <div class="qc-ic">🔍</div>\
        <div class="qc-t">设备扫码</div>\
      </div>\
      <div class="quick-card" @click="go(\'/discriminate_history\')">\
        <div class="qc-ic">🧠</div>\
        <div class="qc-t">AI判别</div>\
      </div>\
    </div>\
  </template>\
</div>'
};
