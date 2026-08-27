// M-06 周排查执行
const req = require('../../utils/request.js');
const native = require('../../utils/native.js');
const { FIELD_TYPES } = require('../../utils/field.js');
const app = getApp();

Page({
  data: {
    loading: true,
    submiting: false,
    weeklyId: '',           // 新建后获得
    isNew: true,

    // 周排查元信息
    weeklyNo: '',
    startDate: '',
    endDate: '',
    inspectorId: '',
    inspectorName: '',
    status: 'pending',

    // 检查项列表
    items: [],              // [{id, label, type, value, options, unit, required}]
    currentIndex: 0,
    completedCount: 0,
    totalCount: 0,

    // 当前检查项的值
    currentValue: null,
    currentPhotos: [],
    currentNote: ''
  },

  onLoad(q) {
    if (q.id) {
      this.setData({ weeklyId: q.id, isNew: false });
      this.loadWeekly(q.id);
    } else {
      this.setData({ isNew: true, loading: false });
      this.initWeekly();
    }
  },

  initWeekly() {
    const now = new Date();
    // 每周一为开始，周日为结束
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    this.setData({
      startDate: fmt(monday),
      endDate: fmt(sunday),
      inspectorName: app.globalData.user ? (app.globalData.user.name || app.globalData.user.username || '') : '',
      inspectorId: app.globalData.user ? (app.globalData.user.id || '') : ''
    });
    // 加载周排查模板
    this.loadTemplate();
  },

  loadWeekly(id) {
    Promise.all([
      req.get(`/api/mobile/weekly/${id}`),
      req.get(`/api/mobile/weekly/${id}/items`).catch(() => ({ data: [] }))
    ]).then(([meta, itemsData]) => {
      const meta2 = meta.data || meta || {};
      const items = (itemsData.data || itemsData || []).map(it => ({
        ...it,
        value: it.value || null,
        photos: it.photos || []
      }));
      const completed = items.filter(it => it.value !== null && it.value !== '' && it.value !== undefined).length;
      this.setData({
        loading: false,
        weeklyNo: meta2.weeklyNo || meta2.weekly_no || '',
        startDate: meta2.startDate || meta2.start_date || '',
        endDate:   meta2.endDate   || meta2.end_date   || '',
        inspectorName: meta2.inspectorName || meta2.inspector_name || '',
        inspectorId:   meta2.inspectorId   || meta2.inspector_id   || '',
        status: meta2.status || 'pending',
        items,
        totalCount: items.length,
        completedCount: completed,
        currentIndex: 0
      });
      if (items.length > 0) this._syncCurrent(0);
    }).catch(() => this.setData({ loading: false }));
  },

  loadTemplate() {
    req.get('/api/mobile/weekly-template').then(d => {
      const items = (d.data || d || []).map(it => ({
        id: it.id,
        label: it.label || it.name || it.field_name || '检查项',
        type: it.type || 'text',
        value: null,
        options: it.options || [],
        unit: it.unit || '',
        required: it.required !== false,
        photos: []
      }));
      this.setData({ items, totalCount: items.length, completedCount: 0, loading: false });
      if (items.length > 0) this._syncCurrent(0);
    }).catch(() => {
      // 无模板时用默认检查项
      const defaultItems = [
        { id: 'w1', label: '机房环境整洁', type: 'radio', options: ['合格', '不合格'], value: null, unit: '', required: true },
        { id: 'w2', label: '控制柜指示灯正常', type: 'radio', options: ['合格', '不合格'], value: null, unit: '', required: true },
        { id: 'w3', label: '曳引机运转正常', type: 'radio', options: ['合格', '不合格'], value: null, unit: '', required: true },
        { id: 'w4', label: '制动器动作可靠', type: 'radio', options: ['合格', '不合格'], value: null, unit: '', required: true },
        { id: 'w5', label: '门机系统运行正常', type: 'radio', options: ['合格', '不合格'], value: null, unit: '', required: true },
        { id: 'w6', label: '轿厢内照明正常', type: 'radio', options: ['合格', '不合格'], value: null, unit: '', required: true },
        { id: 'w7', label: '紧急报警装置有效', type: 'radio', options: ['合格', '不合格'], value: null, unit: '', required: true },
        { id: 'w8', label: '限速器动作正常', type: 'radio', options: ['合格', '不合格'], value: null, unit: '', required: true },
        { id: 'w9', label: '安全回路正常', type: 'radio', options: ['合格', '不合格'], value: null, unit: '', required: true },
        { id: 'w10', label: '备注说明', type: 'textarea', options: [], value: null, unit: '', required: false }
      ];
      this.setData({ items: defaultItems, totalCount: defaultItems.length, completedCount: 0, loading: false });
      this._syncCurrent(0);
    });
  },

  // ── 新建周排查 ──
  async onCreate() {
    if (this.data.submiting) return;
    this.setData({ submiting: true });
    wx.showLoading({ title: '创建中…' });
    try {
      const gps = await native.getLocation().catch(() => ({}));
      const payload = {
        startDate: this.data.startDate,
        endDate:   this.data.endDate,
        inspectorName: this.data.inspectorName,
        inspectorId:   this.data.inspectorId,
        gpsLocation: gps
      };
      const d = await req.post('/api/mobile/weekly', payload);
      const id = (d.data || d || {}).id || d.id;
      if (!id) throw new Error('no id');
      this.setData({ weeklyId: id, isNew: false, submiting: false });
      wx.hideLoading();
      wx.showToast({ title: '创建成功', icon: 'success' });
    } catch {
      wx.hideLoading();
      this.setData({ submiting: false });
      wx.showToast({ title: '创建失败', icon: 'none' });
    }
  },

  // ── 切换检查项 ──
  _syncCurrent(idx) {
    const item = this.data.items[idx];
    if (!item) return;
    this.setData({
      currentIndex: idx,
      currentValue: item.value || null,
      currentPhotos: item.photos || [],
      currentNote: item.note || ''
    });
  },
  prevItem() {
    if (this.data.currentIndex > 0) this._syncCurrent(this.data.currentIndex - 1);
  },
  nextItem() {
    const idx = this.data.currentIndex;
    // 保存当前值
    this._saveCurrent();
    if (idx < this.data.items.length - 1) this._syncCurrent(idx + 1);
  },
  goItem(e) { this._saveCurrent(); this._syncCurrent(parseInt(e.currentTarget.dataset.idx)); },

  // ── 字段操作 ──
  onValueChange(e) {
    this.setData({ currentValue: e.detail.value });
  },
  onNoteInput(e) { this.setData({ currentNote: e.detail.value }); },
  async onTakePhoto() {
    try {
      const photos = await native.chooseImage(3);
      this.setData({ currentPhotos: [...this.data.currentPhotos, ...photos].slice(0, 6) });
    } catch {}
  },
  onRemovePhoto(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    const photos = [...this.data.currentPhotos];
    photos.splice(idx, 1);
    this.setData({ currentPhotos: photos });
  },

  // ── 保存当前项到列表 ──
  _saveCurrent() {
    const idx = this.data.currentIndex;
    const items = [...this.data.items];
    items[idx] = {
      ...items[idx],
      value: this.data.currentValue,
      photos: this.data.currentPhotos,
      note: this.data.currentNote
    };
    const completed = items.filter(it => it.value !== null && it.value !== '' && it.value !== undefined).length;
    this.setData({ items, completedCount: completed });
  },

  // ── 提交单条检查项 ──
  async onSubmitItem() {
    if (!this.data.weeklyId) return wx.showToast({ title: '请先创建周排查', icon: 'none' });
    this._saveCurrent();
    const item = this.data.items[this.data.currentIndex];
    if (!item) return;
    wx.showLoading({ title: '保存中…' });
    try {
      await req.post(`/api/mobile/weekly/${this.data.weeklyId}/items`, {
        itemId:   item.id,
        value:    item.value,
        photos:   item.photos,
        note:     item.note
      });
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      // 自动下一项
      if (this.data.currentIndex < this.data.items.length - 1) {
        setTimeout(() => this.nextItem(), 1200);
      }
    } catch {
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // ── 最终提交 ──
  async onFinalSubmit() {
    if (!this.data.weeklyId) return wx.showToast({ title: '请先创建周排查', icon: 'none' });
    if (this.data.completedCount < this.data.totalCount) {
      return wx.showModal({
        title: '提示',
        content: `还有 ${this.data.totalCount - this.data.completedCount} 项未完成，确认提交吗？`,
        success: res => { if (res.confirm) this._doFinalSubmit(); }
      });
    }
    this._doFinalSubmit();
  },
  async _doFinalSubmit() {
    if (this.data.submiting) return;
    this.setData({ submiting: true });
    wx.showLoading({ title: '提交中…' });
    try {
      // 先保存所有当前值
      this._saveCurrent();
      await req.post(`/api/mobile/weekly/${this.data.weeklyId}/submit`, {});
      wx.hideLoading();
      wx.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch {
      wx.hideLoading();
      this.setData({ submiting: false });
      wx.showToast({ title: '提交失败', icon: 'none' });
    }
  },

  // ── 辅助方法 ──
  fieldComponent(type) { return FIELD_TYPES[type]?.component || 'input'; },
  isRadio(type) { return type === 'radio'; },
  isCheckbox(type) { return type === 'checkbox'; },
  isSelect(type) { return type === 'select'; },
  isDate(type) { return type === 'date'; },
  isPhoto(type) { return type === 'photo'; },
  isTextarea(type) { return type === 'textarea'; }
});
