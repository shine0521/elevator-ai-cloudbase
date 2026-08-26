// 统一请求封装：Bearer token 鉴权（后端 authMiddleware 支持 Authorization header）
function request(method, path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: getApp().globalData.baseURL + path,
      method: method,
      data: data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (getApp().globalData.token || '')
      },
      success(res) {
        if (res.statusCode === 401) {
          getApp().logout();
          wx.reLaunch({ url: '/pages/login/login' });
          return reject(res.data);
        }
        resolve(res.data);
      },
      fail(err) { reject(err); }
    });
  });
}
module.exports = {
  get: (p) => request('GET', p),
  post: (p, d) => request('POST', p, d),
  put: (p, d) => request('PUT', p, d),
  del: (p) => request('DELETE', p)
};
