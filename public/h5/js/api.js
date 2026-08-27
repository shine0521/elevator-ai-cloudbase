// 统一请求封装：Bearer token 鉴权（对齐后端 authMiddleware）
window.api = {
  async req(method, path, data) {
    const opt = {
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (Store.state.token) opt.headers['Authorization'] = 'Bearer ' + Store.state.token;
    if (data !== undefined) opt.body = JSON.stringify(data);
    let res;
    try {
      res = await fetch(Store.baseURL + path, opt);
    } catch (e) {
      throw new Error('网络错误');
    }
    if (res.status === 401) {
      Store.logout();
      if (location.hash !== '#/login') location.hash = '#/login';
      throw new Error('登录已过期');
    }
    const ct = res.headers.get('content-type') || '';
    const json = ct.indexOf('application/json') >= 0 ? await res.json() : { success: res.ok };
    return json;
  },
  get(p, q) {
    let qs = '';
    if (q && Object.keys(q).length) {
      const sp = new URLSearchParams();
      Object.keys(q).forEach(k => { if (q[k] !== undefined && q[k] !== '') sp.append(k, q[k]); });
      qs = '?' + sp.toString();
    }
    return this.req('GET', p + qs);
  },
  post(p, d) { return this.req('POST', p, d); },
  put(p, d) { return this.req('PUT', p, d); },
  del(p) { return this.req('DELETE', p); }
};
