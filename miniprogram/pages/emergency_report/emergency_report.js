// pages/emergency_report/emergency_report.js — M-13/M-14 应急救援
const req = require('../../utils/request.js');

const STATUS_MAP = {
  responding:  { label: '响应中',  color: '#FF8C00' },
  processing:  { label: '处置中',  color: '#1082FF' },
  recovering:  { label: '恢复中',  color: '#FAAD14' },
  completed:   { label: '已完成',  color: '#52C41A' }
};

const ALARM_TYPES = ['困人报警', '故障报警', '物联网报警', '人工报警'];

Page({
  data: {
    list: [],
    loading: true,
    // 新建表单
    showForm: false,
    form: {
      alarm_type: '',
      device_id: '',
      device_name: '',
      trapped_count: '',
      description: '',
      contact_name: '',
      contact_phone: ''
    },
    submitting: false
  },

  onLoad() { this.load(); },

  onShow() { this.load(); },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true });
    req.get('/api/mobile/emergencies').then(d => {
      this.setData({ list: d.data || d || [], loading: false });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  statusCfg(status) {
    return STATUS_MAP[status] || { label: status, color: '#999' };
  },

  // 显示新建表单
  showNewForm() {
    this.setData({ showForm: true, form: {
      alarm_type: '', device_id: '', device_name: '',
      trapped_count: '', description: '', contact_name: '', contact_phone: ''
    }});
  },

  hideForm() {
    this.setData({ showForm: false });
  },

  // 报警类型选择
  bindAlarmType(e) {
    const val = ALARM_TYPES[e.detail.value];
    this.setData({ 'form.alarm_type': val });
  },

  // 设备扫码
  async scanDevice() {
    const native = require('../../utils/native.js');
    try {
      const result = await native.scanCode();
      const code = result.trim();
      wx.showLoading({ title: '查询设备...' });
      req.get(`/api/mobile/devices/scan?code=${encodeURIComponent(code)}`).then(d => {
        wx.hideLoading();
        const dev = d.data || d;
        if (dev && dev.id) {
          this.setData({ 'form.device_id': dev.id, 'form.device_name': dev.device_name || dev.name });
          wx.showToast({ title: '设备已关联', icon: 'success' });
        } else {
          wx.showToast({ title: '设备不存在', icon: 'none' });
        }
      }).catch(() => { wx.hideLoading(); wx.showToast({ title: '设备查询失败', icon: 'none' }); });
    } catch (e) {
      wx.showToast({ title: '扫码失败', icon: 'none' });
    }
  },

  // 输入设备名称（手动）
  inputDeviceName(e) {
    this.setData({ 'form.device_name': e.detail.value });
  },

  // 输入被困人数
  inputTrapped(e) {
    this.setData({ 'form.trapped_count': e.detail.value });
  },

  // 输入描述
  inputDesc(e) {
    this.setData({ 'form.description': e.detail.value });
  },

  // 输入联系人
  inputContact(e) {
    this.setData({ 'form.contact_name': e.detail.value });
  },

  // 输入联系电话
  inputPhone(e) {
    this.setData({ 'form.contact_phone': e.detail.value });
  },

  // 提交新建
  submitForm() {
    const { alarm_type, device_name, trapped_count, description, contact_name, contact_phone } = this.data.form;
    if (!alarm_type) {
      wx.showToast({ title: '请选择报警类型', icon: 'none' }); return;
    }
    if (!description || description.trim().length < 5) {
      wx.showToast({ title: '请填写描述（至少5字）', icon: 'none' }); return;
    }
    this.setData({ submitting: true });
    req.post('/api/mobile/emergencies', this.data.form).then(d => {
      this.setData({ submitting: false, showForm: false });
      wx.showToast({ title: '应急事件已创建', icon: 'success' });
      this.load();
    }).catch(() => {
      this.setData({ submitting: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // 更新事件状态
  updateStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    const statusOrder = ['responding', 'processing', 'recovering', 'completed'];
    const idx = statusOrder.indexOf(status);
    const nextStatus = idx >= 0 && idx < statusOrder.length - 1 ? statusOrder[idx + 1] : null;

    if (!nextStatus) {
      wx.showToast({ title: '已是最终状态', icon: 'none' }); return;
    }
    wx.showModal({
      title: '确认操作',
      content: `确定将状态更新为"${STATUS_MAP[nextStatus].label}"？`,
      success: res => {
        if (!res.confirm) return;
        req.put(`/api/mobile/emergencies/${id}`, { status: nextStatus }).then(() => {
          wx.showToast({ title: '状态已更新', icon: 'success' });
          this.load();
        }).catch(() => wx.showToast({ title: '网络错误', icon: 'none' }));
      }
    });
  },

  // 查看详情
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    // 目前应急事件暂无独立详情页，在列表中展示
    wx.showToast({ title: '事件进行中，请稍候', icon: 'none' });
  }
});
