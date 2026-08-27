// 全局状态：token / user / baseURL（H5 与 API 同源部署，baseURL = 当前 origin）
window.Store = {
  state: {
    token: localStorage.getItem('token') || '',
    user: (function(){ try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch(e) { return null; } })()
  },
  setAuth(token, user) {
    this.state.token = token;
    this.state.user = user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },
  logout() {
    this.state.token = '';
    this.state.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
  get baseURL() { return window.location.origin; }
};
