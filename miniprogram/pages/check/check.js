const req = require('../../utils/request.js');
Page({
  data: { type: 'daily', list: [], loading: true },
  onLoad(q) {
    this.setData({ type: q.type || 'daily' });
    this.load();
  },
  load() {
    const map = {
      daily: '/api/mobile/inspections', weekly: '/api/mobile/weekly',
      hazard: '/api/mobile/hazards', approve: '/api/mobile/approvals',
      record: '/api/mobile/inspections', monthly: '/api/mobile/monthly'
    };
    const path = map[this.data.type] || '/api/mobile/inspections';
    req.get(path).then(d => {
      this.setData({ list: d.data || d || [], loading: false });
    }).catch(() => this.setData({ loading: false }));
  },
  rowLabel(item) {
    return item.device_name || item.inspection_no || item.event_no || item.order_no || item.hazard_type || item.month_no || '记录';
  }
});
