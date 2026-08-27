// pages/inspection_record/inspection_record.js — M-20 检查记录查询
const req = require('../../utils/request.js');

const TYPE_OPTS = ['全部', '日管控', '周排查', '隐患'];

const SOURCE_COLORS = {
  daily:  '#1082FF',
  weekly: '#52C41A',
  hazard: '#FAAD14'
};

const STATUS_COLORS = {
  PENDING:      '#FF8C00',
  APPROVED:     '#52C41A',
  REJECTED:     '#F5222D',
  IN_PROGRESS:  '#1082FF',
  OPEN:         '#FAAD14',
  CLOSED:       '#BFBFBF'
};

Page({
  data: {
    typeIndex: 0,
    startDate: '',
    endDate: '',
    list: [],
    loading: true,
    loadingMore: false,
    page: 1,
    hasMore: false
  },

  onLoad() {
    const now = new Date();
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    this.setData({
      startDate: fmt(new Date(now.getTime() - 30 * 86400000)),
      endDate: fmt(now)
    });
    this.load(true);
  },

  onPullDownRefresh() {
    this.load(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore) this.load(false, this.data.page + 1);
  },

  bindTypeChange(e) {
    this.setData({ typeIndex: parseInt(e.detail.value) });
    this.load(true);
  },

  bindStartDate(e) {
    this.setData({ startDate: e.detail.value });
    this.load(true);
  },

  bindEndDate(e) {
    this.setData({ endDate: e.detail.value });
    this.load(true);
  },

  load(refresh = true, page = 1) {
    if (refresh) page = 1;
    this.setData({ loading: refresh, loadingMore: !refresh, page });

    const typeIndex = this.data.typeIndex;
    const typeMap = ['all', 'daily', 'weekly', 'hazard'];
    const apiType = typeMap[typeIndex] || 'all';

    const params = { page, size: 20 };

    const fetchers = [];
    if (apiType === 'all' || apiType === 'daily') {
      fetchers.push(req.get('/api/mobile/inspections', params).then(d => {
        return (d.data || d || []).map(i => ({ ...i, _source: 'daily' }));
      }));
    }
    if (apiType === 'all' || apiType === 'weekly') {
      fetchers.push(req.get('/api/mobile/weekly', params).then(d => {
        return (d.data || d || []).map(i => ({ ...i, _source: 'weekly' }));
      }));
    }
    if (apiType === 'all' || apiType === 'hazard') {
      fetchers.push(req.get('/api/mobile/hazards', params).then(d => {
        return (d.data || d || []).map(i => ({ ...i, _source: 'hazard' }));
      }));
    }

    Promise.all(fetchers).then(results => {
      let flat = results.flat();
      // 日期过滤
      if (this.data.startDate || this.data.endDate) {
        flat = flat.filter(item => {
          const d = item.inspection_date || item.create_time || item.created_at || '';
          if (!d) return true;
          const ds = d.substring(0, 10);
          if (this.data.startDate && ds < this.data.startDate) return false;
          if (this.data.endDate && ds > this.data.endDate) return false;
          return true;
        });
      }
      this.setData({
        list: refresh ? flat : [...this.data.list, ...flat],
        loading: false, loadingMore: false,
        hasMore: flat.length >= 20
      });
    }).catch(() => {
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  sourceColor(src) { return SOURCE_COLORS[src] || '#999'; },
  statusColor(s) { return STATUS_COLORS[s] || '#999'; },

  sourceLabel(src) {
    return src === 'daily' ? '日管控' : src === 'weekly' ? '周排查' : src === 'hazard' ? '隐患' : '记录';
  },

  rowLabel(item) {
    return item.device_name
      || item.inspection_no
      || item.event_no
      || item.hazard_type
      || item.inspection_date
      || '记录';
  },

  goDetail(e) {
    const item = e.currentTarget.dataset.item;
    const id = item.id || item.inspection_id;
    const src = item._source;
    const urlMap = {
      daily:  `/pages/daily_form/daily_form?id=${id}`,
      weekly: `/pages/weekly_form/weekly_form?id=${id}`,
      hazard: `/pages/hazard_form/hazard_form?id=${id}`
    };
    const url = urlMap[src];
    if (url) wx.navigateTo({ url });
    else wx.showToast({ title: '该类型暂不支持', icon: 'none' });
  }
});
