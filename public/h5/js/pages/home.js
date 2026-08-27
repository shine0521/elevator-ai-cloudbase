// pages/home.js — 工作台 M-02（转换自 elevator-mini/pages/workbench）
// 调 GET /api/mobile/dashboard 展示待办统计；8宫格入口统一跳转 /check?type=
window.Pages = window.Pages || {};
window.Pages.home = {
  template: `
  <div class="page">
    <!-- 统计卡片 -->
    <div class="card">
      <div class="stat-row">
        <div class="stat"><div class="stat-num">{{todo.inspections || 0}}</div><div class="stat-label">日管控</div></div>
        <div class="stat"><div class="stat-num">{{todo.weekly || 0}}</div><div class="stat-label">周排查</div></div>
        <div class="stat"><div class="stat-num">{{todo.hazards || 0}}</div><div class="stat-label">隐患</div></div>
      </div>
      <div class="stat-row">
        <div class="stat"><div class="stat-num">{{todo.approvals || 0}}</div><div class="stat-label">待审批</div></div>
        <div class="stat"><div class="stat-num">{{todo.workOrders || 0}}</div><div class="stat-label">待整改</div></div>
        <div class="stat"><div class="stat-num">{{warning.open || 0}}</div><div class="stat-label">预警</div></div>
      </div>
    </div>

    <!-- 紧急预警提示 -->
    <div class="card" v-if="(warning.urgentCritical || 0) > 0">
      <span class="tag tag-red">紧急预警 {{warning.urgentCritical}} 条</span>
    </div>

    <!-- 8宫格入口 -->
    <div class="card">
      <div class="grid">
        <div class="grid-item" v-for="g in grids" :key="g.key" @click="goGrid(g.key)">
          <div style="font-size:22px">{{g.icon}}</div>
          <div style="margin-top:4px">{{g.label}}</div>
        </div>
      </div>
    </div>
  </div>
  `,
  data() {
    return {
      todo: {},
      warning: {},
      grids: [
        { key: 'daily', label: '日管控', icon: '📋' },
        { key: 'weekly', label: '周排查', icon: '🗓️' },
        { key: 'hazard', label: '隐患排查', icon: '⚠️' },
        { key: 'device', label: '设备查询', icon: '🔍' },
        { key: 'emergency', label: '应急报告', icon: '🚨' },
        { key: 'approve', label: '审批待办', icon: '✅' },
        { key: 'monthly', label: '月调度', icon: '📊' },
        { key: 'record', label: '检查记录', icon: '📖' }
      ]
    };
  },
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      try {
        const d = await api.get('/api/mobile/dashboard');
        if (d && d.success) {
          this.todo = d.todo || {};
          this.warning = d.warning || {};
        }
      } catch (e) { /* 仪表盘失败静默，保留空统计 */ }
    },
    goGrid(key) {
      utils.go('/check?type=' + key);
    }
  }
};
