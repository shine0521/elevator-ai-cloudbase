window.Pages = window.Pages || {};
window.Pages.profile = {
  template: `
<div class="page">
  <!-- 用户信息卡 -->
  <div class="user-card card">
    <div class="avatar-wrap">
      <div class="avatar">{{user ? (user.name ? user.name.charAt(0) : '?') : '?'}}</div>
    </div>
    <div class="user-info">
      <div class="user-name">{{user ? (user.name || '未登录') : '未登录'}}</div>
      <div class="muted">{{user ? (user.role || '未知角色') : ''}}</div>
      <div class="muted">{{user ? (user.email || '') : ''}}</div>
    </div>
  </div>

  <!-- 菜单列表 -->
  <div class="menu-list">
    <div class="menu-item card" @click="goMessage">
      <span class="menu-icon">🔔</span>
      <span class="menu-label">我的消息</span>
      <span class="badge" v-if="unreadCount > 0">{{unreadCount > 99 ? '99+' : unreadCount}}</span>
      <span class="arrow">›</span>
    </div>

    <div class="menu-item card" @click="goApproval">
      <span class="menu-icon">📋</span>
      <span class="menu-label">审批待办</span>
      <span class="arrow">›</span>
    </div>

    <div class="menu-item card" @click="goRecord">
      <span class="menu-icon">📊</span>
      <span class="menu-label">检查记录</span>
      <span class="arrow">›</span>
    </div>

    <div class="menu-item card" @click="goSettings">
      <span class="menu-icon">⚙️</span>
      <span class="menu-label">系统设置</span>
      <span class="arrow">›</span>
    </div>

    <div class="menu-item card">
      <span class="menu-icon">📱</span>
      <span class="menu-label">关于版本</span>
      <span class="muted">v1.0.0</span>
    </div>
  </div>

  <!-- 退出登录 -->
  <div class="logout-wrap">
    <button class="btn-logout" @click="logout">退出登录</button>
  </div>
</div>
  `,
  data() {
    return {
      user: null,
      unreadCount: 0
    };
  },
  mounted() {
    this.user = Store.state.user;
    this.loadUnread();
  },
  methods: {
    async loadUnread() {
      try {
        const d = await api.get('/api/mobile/messages/stats');
        this.unreadCount = d.total || 0;
      } catch (e) { /* silent */ }
    },
    goMessage() { utils.go('/message'); },
    goApproval() { utils.go('/approval'); },
    goRecord() { utils.go('/record'); },
    goSettings() {
      utils.toast('请在网页端设置');
    },
    logout() {
      if (!utils.confirm('确定要退出登录吗？')) return;
      Store.logout();
      utils.go('/login');
    }
  }
};
