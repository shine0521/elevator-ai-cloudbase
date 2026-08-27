// M-06 周排查执行
window.Pages = window.Pages || {};
window.Pages.weekly_form = {
  template: `
<div class="page">
  <div v-if="loading" class="muted center">加载中...</div>
  
  <!-- 新建模式 -->
  <div v-else-if="isNew" class="card">
    <div class="card-title">周排查信息</div>
    <div class="form-group">
      <div class="form-label">排查周期</div>
      <div class="date-range"><text>{{startDate}} ~ {{endDate}}</text></div>
    </div>
    <div class="form-group">
      <div class="form-label">检查人</div>
      <input class="input" placeholder="请输入检查人姓名" v-model="inspectorName"/>
    </div>
    <div class="form-group">
      <div class="form-label">备注说明</div>
      <textarea class="textarea" placeholder="可选…" v-model="note"></textarea>
    </div>
    <button class="btn-primary" @click="onCreate" :disabled="submiting">
      {{submiting?'创建中…':'创建并开始排查'}}
    </button>
  </div>
  
  <!-- 执行模式 -->
  <div v-else>
    <!-- 顶部进度 -->
    <div class="progress-header">
      <div class="progress-info">
        <text class="ph-title">{{weeklyNo||'周排查'}}</text>
        <text class="ph-date muted">{{startDate}} ~ {{endDate}}</text>
      </div>
      <div class="progress-right">
        <text class="ph-count">{{completedCount}}</text>
        <text class="ph-total muted">/ {{totalCount}} 项</text>
      </div>
    </div>
    <div class="progress-bar-wrap">
      <div class="progress-bar">
        <div class="progress-fill" :style="{width:progressWidth()}"></div>
      </div>
    </div>
    
    <!-- 检查项快捷跳转 -->
    <scroll-view scroll-x class="item-tabs">
      <div v-for="(item,idx) in items" :key="item.id"
        :class="['item-tab', currentIndex===idx?'active':'', itemDone(item)]"
        @click="goItem(idx)">{{idx+1}}</div>
    </scroll-view>
    
    <!-- 当前检查项 -->
    <div v-if="items[currentIndex]" class="check-card">
      <div class="check-header">
        <text class="check-num">第 {{currentIndex+1}} / {{totalCount}} 项</text>
        <text class="check-label">{{items[currentIndex].label}}</text>
        <text v-if="items[currentIndex].required" class="req-mark">*</text>
        <text v-if="items[currentIndex].unit" class="unit-mark">{{items[currentIndex].unit}}</text>
      </div>
      
      <!-- Radio -->
      <div v-if="isRadio(items[currentIndex].type)" class="options-grid">
        <div v-for="(opt,oi) in items[currentIndex].options" :key="oi"
          :class="['opt-btn', currentValue===opt?'selected':'']"
          @click="currentValue=opt">{{opt}}</div>
      </div>
      
      <!-- Textarea -->
      <textarea v-else-if="isTextarea(items[currentIndex].type)" class="textarea" 
        placeholder="请输入…" v-model="currentValue" maxlength="500"></textarea>
      
      <!-- Default input -->
      <input v-else class="input" placeholder="请输入…" v-model="currentValue"/>
      
      <!-- 备注 -->
      <div class="form-group" style="margin-top:20rpx">
        <div class="form-label">备注说明</div>
        <textarea class="textarea" placeholder="可选…" v-model="currentNote" maxlength="200"></textarea>
      </div>
      
      <!-- 照片 -->
      <div class="form-group">
        <div class="form-label">照片证据（可选）</div>
        <div class="photo-row">
          <div v-for="(p,pi) in currentPhotos" :key="pi" class="photo-wrap">
            <img :src="p" class="photo-thumb"/>
            <text class="photo-del" @click="onRemovePhoto(pi)">✕</text>
          </div>
          <div v-if="currentPhotos.length<6" class="photo-add" @click="onTakePhoto">+</div>
        </div>
      </div>
      
      <!-- 导航按钮 -->
      <div class="item-nav">
        <button v-if="currentIndex>0" class="btn-nav" @click="prevItem">← 上一项</button>
        <button class="btn-nav btn-next" @click="onSubmitItem">保存并下一项</button>
        <button v-if="currentIndex<items.length-1" class="btn-nav" @click="nextItem">下一项 →</button>
      </div>
    </div>
    
    <!-- 最终提交 -->
    <div class="submit-section">
      <div class="progress-tip muted">已完成 {{completedCount}} / {{totalCount}} 项</div>
      <button class="btn-final" @click="onFinalSubmit" :disabled="submiting">
        {{submiting?'提交中…':'全部完成，提交周排查'}}
      </button>
    </div>
  </div>
</div>
`,
  data() {
    return {
      query: {},
      loading: true,
      submiting: false,
      weeklyId: '',
      isNew: true,
      weeklyNo: '',
      startDate: '',
      endDate: '',
      inspectorId: '',
      inspectorName: '',
      status: 'pending',
      note: '',
      items: [],
      currentIndex: 0,
      completedCount: 0,
      totalCount: 0,
      currentValue: null,
      currentPhotos: [],
      currentNote: ''
    };
  },
  mounted() {
    const parsed = Router.parse();
    this.query = parsed.query;
    
    if (this.query.id) {
      this.weeklyId = this.query.id;
      this.isNew = false;
      this.loadWeekly(this.query.id);
    } else {
      this.isNew = true;
      this.loading = false;
      this.initWeekly();
    }
  },
  methods: {
    initWeekly() {
      const now = new Date();
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      this.startDate = fmt(monday);
      this.endDate = fmt(sunday);
      this.inspectorName = Store.state.user ? (Store.state.user.name || Store.state.user.username || '') : '';
      this.inspectorId = Store.state.user ? (Store.state.user.id || '') : '';
      this.loadTemplate();
    },
    async loadWeekly(id) {
      try {
        const meta = await api.get(`/api/mobile/weekly/${id}`);
        const itemsData = await api.get(`/api/mobile/weekly/${id}/items`).catch(() => ({ data: [] }));
        const meta2 = meta.data || meta || {};
        const items = (itemsData.data || itemsData || []).map(it => ({
          ...it,
          value: it.value || null,
          photos: it.photos || []
        }));
        const completed = items.filter(it => it.value !== null && it.value !== '' && it.value !== undefined).length;
        this.weeklyNo = meta2.weeklyNo || meta2.weekly_no || '';
        this.startDate = meta2.startDate || meta2.start_date || '';
        this.endDate = meta2.endDate || meta2.end_date || '';
        this.inspectorName = meta2.inspectorName || meta2.inspector_name || '';
        this.inspectorId = meta2.inspectorId || meta2.inspector_id || '';
        this.status = meta2.status || 'pending';
        this.items = items;
        this.totalCount = items.length;
        this.completedCount = completed;
        this.currentIndex = 0;
        this.loading = false;
        if (items.length > 0) this._syncCurrent(0);
      } catch (e) {
        this.loading = false;
        utils.toast('加载失败');
      }
    },
    async loadTemplate() {
      try {
        const d = await api.get('/api/mobile/weekly-template');
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
        this.items = items;
        this.totalCount = items.length;
        this.completedCount = 0;
        this.loading = false;
        if (items.length > 0) this._syncCurrent(0);
      } catch (e) {
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
        this.items = defaultItems;
        this.totalCount = defaultItems.length;
        this.completedCount = 0;
        this.loading = false;
        this._syncCurrent(0);
      }
    },
    async onCreate() {
      if (this.submiting) return;
      this.submiting = true;
      try {
        const gps = await utils.getLocation().catch(() => ({}));
        const payload = {
          startDate: this.startDate,
          endDate: this.endDate,
          inspectorName: this.inspectorName,
          inspectorId: this.inspectorId,
          gpsLocation: gps
        };
        const d = await api.post('/api/mobile/weekly', payload);
        const id = (d.data || d || {}).id || d.id;
        if (!id) throw new Error('no id');
        this.weeklyId = id;
        this.isNew = false;
        this.submiting = false;
        utils.toast('创建成功');
      } catch (e) {
        this.submiting = false;
        utils.toast('创建失败');
      }
    },
    _syncCurrent(idx) {
      const item = this.items[idx];
      if (!item) return;
      this.currentIndex = idx;
      this.currentValue = item.value || null;
      this.currentPhotos = item.photos || [];
      this.currentNote = item.note || '';
    },
    prevItem() {
      if (this.currentIndex > 0) this._syncCurrent(this.currentIndex - 1);
    },
    nextItem() {
      const idx = this.currentIndex;
      this._saveCurrent();
      if (idx < this.items.length - 1) this._syncCurrent(idx + 1);
    },
    goItem(idx) {
      this._saveCurrent();
      this._syncCurrent(idx);
    },
    async onTakePhoto() {
      try {
        const photos = await utils.chooseImage(3);
        this.currentPhotos = [...this.currentPhotos, ...photos].slice(0, 6);
      } catch (e) {}
    },
    onRemovePhoto(idx) {
      const photos = [...this.currentPhotos];
      photos.splice(idx, 1);
      this.currentPhotos = photos;
    },
    _saveCurrent() {
      const idx = this.currentIndex;
      const items = [...this.items];
      items[idx] = {
        ...items[idx],
        value: this.currentValue,
        photos: this.currentPhotos,
        note: this.currentNote
      };
      const completed = items.filter(it => it.value !== null && it.value !== '' && it.value !== undefined).length;
      this.items = items;
      this.completedCount = completed;
    },
    async onSubmitItem() {
      if (!this.weeklyId) return utils.toast('请先创建周排查');
      this._saveCurrent();
      const item = this.items[this.currentIndex];
      if (!item) return;
      try {
        await api.post(`/api/mobile/weekly/${this.weeklyId}/items`, {
          itemId: item.id,
          value: item.value,
          photos: item.photos,
          note: item.note
        });
        utils.toast('已保存');
        if (this.currentIndex < this.items.length - 1) {
          setTimeout(() => this.nextItem(), 1200);
        }
      } catch (e) {
        utils.toast('保存失败');
      }
    },
    async onFinalSubmit() {
      if (!this.weeklyId) return utils.toast('请先创建周排查');
      if (this.completedCount < this.totalCount) {
        const ok = await utils.confirm(`还有 ${this.totalCount - this.completedCount} 项未完成，确认提交吗？`);
        if (!ok) return;
      }
      await this._doFinalSubmit();
    },
    async _doFinalSubmit() {
      if (this.submiting) return;
      this.submiting = true;
      try {
        this._saveCurrent();
        await api.post(`/api/mobile/weekly/${this.weeklyId}/submit`, {});
        utils.toast('提交成功');
        setTimeout(() => history.back(), 1500);
      } catch (e) {
        this.submiting = false;
        utils.toast('提交失败');
      }
    },
    progressWidth() {
      if (this.totalCount <= 0) return '0%';
      return (this.completedCount / this.totalCount * 100).toFixed(1) + '%';
    },
    itemDone(item) {
      return (item.value !== null && item.value !== undefined && item.value !== '') ? 'done' : '';
    },
    isRadio(type) { return type === 'radio'; },
    isTextarea(type) { return type === 'textarea'; }
  }
};
