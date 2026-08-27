// M-09 隐患排查执行
const req = require('../../utils/request.js');
const native = require('../../utils/native.js');
const app = getApp();

Page({
  data: {
    mode: 'create',
    step: 1,
    loading: false,
    submiting: false,
    deviceId: '',
    deviceName: '',
    deviceSearch: '',
    hazardType: '',
    hazardTypeIndex: 0,
    hazardTypes: ['制动器失效', '门机故障', '限速器失效', '安全回路故障', '轿厢异常', '钢丝绳损伤', '其他'],
    description: '',
    discoveredAt: '',
    photos: [],
    lseL: 3,
    lseS: 3,
    lseE: 3,
    lseB: 3,
    rectifyAdvice: '',
    rectifyOwnerId: '',
    rectifyOwnerName: '',
    users: [],
    _riskValue: 9,
    _riskLevel: 'major'
  },
  onLoad(q) {
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    this.setData({ mode: q.mode || 'create', discoveredAt: ts });
    if (q.id) this.setData({ loading: true });
    if (q.mode === 'view' && q.id) this.loadDetail(q.id);
    this.loadUsers();
    this._calcRisk();
  },
  nextStep() {
    if (this.data.step === 1) {
      if (!this.data.deviceId) return wx.showToast({ title: '请先选择设备', icon: 'none' });
      this.setData({ step: 2 });
    } else if (this.data.step === 2) {
      if (!this.data.hazardType) return wx.showToast({ title: '请选择隐患类型', icon: 'none' });
      if (!this.data.description) return wx.showToast({ title: '请填写隐患描述', icon: 'none' });
      this.setData({ step: 3 });
    } else if (this.data.step === 3) {
      this.setData({ step: 4 });
    }
  },
  prevStep() { if (this.data.step > 1) this.setData({ step: this.data.step - 1 }); },
  goStep(e) {
    const t = parseInt(e.currentTarget.dataset.step);
    if (t < this.data.step) this.setData({ step: t });
  },
  async onScanDevice() {
    try {
      const result = await native.scanCode();
      this.setData({ deviceId: result, deviceName: '设备 ' + result });
      wx.showToast({ title: '扫码成功', icon: 'success' });
    } catch { wx.showToast({ title: '扫码取消', icon: 'none' }); }
  },
  onDeviceSearch(e) { this.setData({ deviceSearch: e.detail.value }); },
  onSelectDevice(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    const devs = this.data._deviceList || [];
    if (devs[idx]) this.setData({ deviceId: devs[idx].id, deviceName: devs[idx].name });
  },
  onSearchDevice() {
    const kw = this.data.deviceSearch;
    if (!kw) return;
    req.get(`/api/mobile/devices?keyword=${kw}`).then(d => {
      const list = d.data || d || [];
      this.setData({ _deviceList: list });
      if (!list.length) wx.showToast({ title: '未找到设备', icon: 'none' });
    }).catch(() => {});
  },
  onHazardTypeChange(e) {
    const idx = parseInt(e.detail.value);
    this.setData({ hazardTypeIndex: idx, hazardType: this.data.hazardTypes[idx] });
  },
  onDescriptionInput(e) { this.setData({ description: e.detail.value }); },
  onLseLChange(e) { this.setData({ lseL: parseInt(e.detail.value) + 1 }); this._calcRisk(); },
  onLseSChange(e) { this.setData({ lseS: parseInt(e.detail.value) + 1 }); this._calcRisk(); },
  onLseEChange(e) { this.setData({ lseE: parseInt(e.detail.value) + 1 }); this._calcRisk(); },
  onLseBChange(e) { this.setData({ lseB: parseInt(e.detail.value) + 1 }); this._calcRisk(); },
  _calcRisk() {
    const { lseL, lseS } = this.data;
    const r = lseL * lseS;
    let level = 'low';
    if (r >= 16) level = 'critical';
    else if (r >= 9) level = 'major';
    else if (r >= 4) level = 'general';
    this.setData({ _riskValue: r, _riskLevel: level });
  },
  onRectifyAdviceInput(e) { this.setData({ rectifyAdvice: e.detail.value }); },
  onRectifyOwnerInput(e) { this.setData({ rectifyOwnerId: e.detail.value, rectifyOwnerName: e.detail.value }); },
  onSelectOwner(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    const u = this.data.users[idx];
    if (u) this.setData({ rectifyOwnerId: u.id, rectifyOwnerName: u.name });
  },
  async onTakePhoto() {
    try {
      const photos = await native.chooseImage(6);
      this.setData({ photos: [...this.data.photos, ...photos].slice(0, 6) });
    } catch { wx.showToast({ title: '取消', icon: 'none' }); }
  },
  onRemovePhoto(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    const photos = [...this.data.photos];
    photos.splice(idx, 1);
    this.setData({ photos });
  },
  async onSubmit() {
    if (this.data.submiting) return;
    this.setData({ submiting: true });
    wx.showLoading({ title: '提交中...' });
    try {
      const gps = await native.getLocation().catch(() => ({}));
      const payload = {
        deviceId:       this.data.deviceId,
        hazardType:     this.data.hazardType,
        description:    this.data.description,
        discoveredAt:   this.data.discoveredAt,
        lseL:          this.data.lseL,
        lseS:          this.data.lseS,
        lseE:          this.data.lseE,
        lseB:          this.data.lseB,
        rectifyAdvice: this.data.rectifyAdvice,
        rectifyOwnerId:this.data.rectifyOwnerId,
        photos:        this.data.photos,
        gpsLocation:   gps
      };
      await req.post('/api/mobile/hazards', payload);
      wx.hideLoading();
      wx.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => wx.navigateTo({ url: '/pages/work_order/work_order' }), 1500);
    } catch (err) {
      wx.hideLoading();
      this.setData({ submiting: false });
      wx.showToast({ title: '提交失败', icon: 'none' });
    }
  },
  onBack() { wx.navigateBack(); },
  loadDetail(id) {
    req.get(`/api/mobile/hazards/${id}`).then(d => {
      const h = d.data || d;
      const lseL = h.lseL || h.lse_l || 3;
      const lseS = h.lseS || h.lse_s || 3;
      const r = lseL * lseS;
      const level = r >= 16 ? 'critical' : r >= 9 ? 'major' : r >= 4 ? 'general' : 'low';
      this.setData({
        loading: false,
        deviceId:       h.deviceId || h.device_id || '',
        deviceName:     h.deviceName || h.device_name || '',
        hazardType:     h.hazardType || h.hazard_type || '',
        description:    h.description || '',
        discoveredAt:   h.discoveredAt || h.discovered_at || '',
        lseL, lseS,
        lseE: h.lseE || h.lse_e || 3,
        lseB: h.lseB || h.lse_b || 3,
        rectifyAdvice:  h.rectifyAdvice || h.rectify_advice || '',
        rectifyOwnerId: h.rectifyOwnerId || h.rectify_owner_id || '',
        photos:         h.photos || [],
        step: 4,
        _riskValue: r,
        _riskLevel: level
      });
    }).catch(() => this.setData({ loading: false }));
  },
  loadUsers() {
    req.get('/api/mobile/users').then(d => {
      this.setData({ users: d.data || d || [] });
    }).catch(() => {});
  },
  riskIcon(level) {
    const m = { critical: '🔴', major: '🟠', general: '🟡', low: '🟢' };
    return m[level] || '⚪';
  },
  riskLabel(level) {
    const m = { critical: '重大', major: '较大', general: '一般', low: '低' };
    return m[level] || level || '未知';
  }
});
