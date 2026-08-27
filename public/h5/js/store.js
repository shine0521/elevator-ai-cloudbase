// store.js — 全局状态管理：token / user / roles / orgId 持久化
// 兼容 roles 数组（新版）与 role 字符串（老格式）
window.Store = {
  state: {
    token: (function () {
      try { return localStorage.getItem('token') || ''; } catch (e) { return ''; }
    })(),
    user: (function () {
      try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) { return null; }
    })(),
    _roles: [],
    _orgId: ''
  },

  // 保存认证信息（登录 / token 刷新时调用）
  setAuth(token, user) {
    user = user || {};
    var roles = [];
    if (Array.isArray(user.roles)) {
      roles = user.roles;
    } else if (typeof user.role === 'string' && user.role) {
      roles = [user.role];
    } else if (typeof user.roles === 'string' && user.roles) {
      roles = [user.roles];
    }
    this.state.token = token || '';
    this.state.user = user;
    this.state._roles = roles;
    this.state._orgId = user.orgId || (user.organization && user.organization.id) || '';
    try {
      localStorage.setItem('token', this.state.token);
      localStorage.setItem('user', JSON.stringify(user));
    } catch (e) {}
  },

  // 读取 Bearer token
  getToken() {
    try { return localStorage.getItem('token') || ''; } catch (e) {
      return this.state.token || '';
    }
  },

  // 读取 user 对象（含 name / email / role / roles[]）
  getUser() {
    try {
      var raw = localStorage.getItem('user');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return this.state.user || null;
  },

  // 检查当前用户是否拥有指定角色（roles 数组兼容）
  isRole(role) {
    var u = this.getUser() || {};
    var roles = [];
    if (Array.isArray(u.roles)) {
      roles = u.roles;
    } else if (typeof u.role === 'string' && u.role) {
      roles = [u.role];
    } else if (typeof u.roles === 'string' && u.roles) {
      roles = [u.roles];
    }
    return roles.indexOf(role) >= 0;
  },

  // 清除认证并跳转登录页
  logout() {
    this.state.token = '';
    this.state.user = null;
    this.state._roles = [];
    this.state._orgId = '';
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch (e) {}
    if (location.hash !== '#/login') location.hash = '#/login';
  }
};
