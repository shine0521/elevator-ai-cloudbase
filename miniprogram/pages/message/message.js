const req = require('../../utils/request.js');
Page({
  data: { list: [], loading: true },
  onShow() { this.load(); },
  load() {
    req.get('/api/mobile/messages').then(d => {
      this.setData({ list: d.data || [], loading: false });
    }).catch(() => this.setData({ loading: false }));
  },
  read(e) {
    req.post('/api/mobile/messages/' + e.currentTarget.dataset.id + '/read').then(() => this.load());
  },
  readAll() {
    req.post('/api/mobile/messages/read-all').then(() => this.load());
  }
});
