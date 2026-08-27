// M-09 隐患上报 → H5 (Vue3 global build)
// 4 步 + LSEB 评估：R = L×S；重大隐患判定 L≥4 且 S≥4 或 R≥12
// POST /api/mobile/hazards  |  设备选择 utils.scanCode / GET /api/mobile/devices?keyword=
window.Pages = window.Pages || {};
window.Pages.hazard_form = {
  template: `
  <div class="page hf">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <template v-else>
      <!-- 步骤条 -->
      <div class="steps-bar">
        <template v-for="(s,i) in steps" :key="i">
          <div class="step-item" :class="{active:step>=i+1}" @click="goStep(i+1)">
            <div class="step-num">{{i+1}}</div>
            <div class="step-label">{{s}}</div>
          </div>
          <div v-if="i<steps.length-1" class="step-line" :class="{active:step>=i+2}"></div>
        </template>
      </div>

      <!-- step 1 选择设备 -->
      <div v-if="step===1" class="step-content">
        <div class="section-title">选择设备</div>
        <div class="card">
          <div class="search-row">
            <input class="input" v-model="deviceSearch" placeholder="输入设备名称/编号搜索" />
            <button class="btn-sm" @click="onSearchDevice">搜索</button>
          </div>
          <button class="btn-scan" @click="onScanDevice">扫码选择设备</button>
          <div v-if="_deviceList.length" class="dev-list">
            <div v-for="(d,idx) in _deviceList" :key="d.id" class="device-item" @click="onSelectDevice(idx)">{{devLabel(d)}}</div>
          </div>
          <div v-if="deviceId" class="selected-device">已选设备：{{fmtDev(deviceName,deviceId)}}</div>
        </div>
      </div>

      <!-- step 2 隐患信息 -->
      <div v-if="step===2" class="step-content">
        <div class="section-title">隐患信息</div>
        <div class="card">
          <div class="form-group">
            <div class="form-label">设备</div>
            <div class="selected-device">{{deviceName||deviceId}}</div>
          </div>
          <div class="form-group">
            <div class="form-label">隐患类型 *</div>
            <select v-model="hazardType" class="input" :disabled="isViewDisabled">
              <option value="" disabled>请选择隐患类型</option>
              <option v-for="t in hazardTypes" :key="t" :value="t">{{t}}</option>
            </select>
          </div>
          <div class="form-group">
            <div class="form-label">隐患描述 *</div>
            <textarea v-model="description" class="textarea" :disabled="isViewDisabled" placeholder="请详细描述隐患情况"></textarea>
          </div>
          <div class="form-group">
            <div class="form-label">发现时间</div>
            <input class="input" v-model="discoveredAt" :disabled="isViewDisabled" placeholder="发现时间" />
          </div>
        </div>
      </div>

      <!-- step 3 LSEB 评估 -->
      <div v-if="step===3" class="step-content">
        <div class="section-title">LSEB 风险评估</div>
        <div class="card">
          <div class="lseb-intro">风险值 R = L(可能性) × S(严重性)；E / B 为辅助记录项（1~5 级）</div>
          <div class="form-group">
            <div class="form-label">L 发生可能性 (1-5)</div>
            <select v-model.number="lseL" class="input" :disabled="isViewDisabled" @change="_calcRisk">
              <option v-for="n in five" :key="'l'+n" :value="n">{{n}}</option>
            </select>
          </div>
          <div class="form-group">
            <div class="form-label">S 后果严重性 (1-5)</div>
            <select v-model.number="lseS" class="input" :disabled="isViewDisabled" @change="_calcRisk">
              <option v-for="n in five" :key="'s'+n" :value="n">{{n}}</option>
            </select>
          </div>
          <div class="form-group">
            <div class="form-label">E 暴露频次 (1-5)</div>
            <select v-model.number="lseE" class="input" :disabled="isViewDisabled">
              <option v-for="n in five" :key="'e'+n" :value="n">{{n}}</option>
            </select>
          </div>
          <div class="form-group">
            <div class="form-label">B 后果影响 (1-5)</div>
            <select v-model.number="lseB" class="input" :disabled="isViewDisabled">
              <option v-for="n in five" :key="'b'+n" :value="n">{{n}}</option>
            </select>
          </div>
          <div class="risk-card">
            <div class="risk-calc">
              <span class="rc-label">风险值 R = L×S =</span>
              <span class="rc-total" :class="riskClassByLevel(_riskLevel)">{{_riskValue}}</span>
              <span class="risk-badge" :class="riskClassByLevel(_riskLevel)">{{riskLabelByLevel(_riskLevel)}}</span>
            </div>
            <div v-if="_isMajor" class="critical-warn">⚠ 重大隐患判定：L≥4 且 S≥4，或 R≥12，已触发重大隐患标准！</div>
          </div>
        </div>
      </div>

      <!-- step 4 整改信息 + 提交 -->
      <div v-if="step===4" class="step-content">
        <div class="section-title">整改信息</div>
        <div class="card">
          <div class="form-group">
            <div class="form-label">整改建议</div>
            <textarea v-model="rectifyAdvice" class="textarea" :disabled="isViewDisabled" placeholder="请输入整改建议"></textarea>
          </div>
          <div class="form-group">
            <div class="form-label">整改责任人</div>
            <select v-model="rectifyOwnerId" class="input" :disabled="isViewDisabled" @change="onSelectOwner">
              <option value="" disabled>请选择责任人</option>
              <option v-for="u in users" :key="u.id" :value="u.id">{{u.name}}</option>
            </select>
          </div>
          <div class="form-group">
            <div class="form-label">现场照片</div>
            <div class="photo-row">
              <div v-for="(p,idx) in photos" :key="idx" class="photo-wrap">
                <img class="photo-thumb" :src="p" />
                <div v-if="!isView" class="photo-del" @click="onRemovePhoto(idx)">×</div>
              </div>
              <div v-if="canAddPhoto" class="photo-add" @click="onTakePhoto">+</div>
            </div>
          </div>
          <div v-if="isView" class="confirm-card">
            <div class="confirm-title">隐患详情</div>
            <div class="info-row"><span class="label">风险值</span><span class="value">{{_riskValue}}（{{riskLabelByLevel(_riskLevel)}}）</span></div>
            <div class="info-row"><span class="label">重大隐患</span><span class="value">{{_isMajor?'是':'否'}}</span></div>
            <div class="info-row"><span class="label">责任人</span><span class="value">{{fmtNA(rectifyOwnerName)}}</span></div>
            <div class="info-row"><span class="label">整改建议</span><span class="value multi">{{fmtNA(rectifyAdvice)}}</span></div>
          </div>
        </div>
      </div>

      <!-- 底部栏 -->
      <div class="bottom-bar">
        <button v-if="canPrevStep" class="btn-default" @click="prevStep">上一步</button>
        <button v-if="canNextStep" class="btn-primary" @click="nextStep">下一步</button>
        <button v-if="canSubmitStep" class="btn-primary" :disabled="submiting" @click="onSubmit">{{submiting?'提交中...':'提交上报'}}</button>
        <button v-if="isView" class="btn-primary" @click="goBack">返回</button>
      </div>
    </template>

    <style>
      .hf.page { min-height:100vh; background:var(--bg); padding-bottom:90px; }
      .hf .section-title { font-size:13px; color:#888; padding:8px 4px 4px; }
      .hf .card { background:#fff; border-radius:10px; padding:14px; margin-bottom:12px; }
      .hf .steps-bar { display:flex; align-items:center; background:#fff; padding:16px 24px; margin-bottom:12px; }
      .hf .step-item { display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer; }
      .hf .step-num { width:26px; height:26px; border-radius:50%; background:#ddd; color:#fff; font-size:13px; display:flex; align-items:center; justify-content:center; }
      .hf .step-item.active .step-num { background:#1082FF; }
      .hf .step-label { font-size:11px; color:#888; }
      .hf .step-item.active .step-label { color:#1082FF; }
      .hf .step-line { flex:1; height:2px; background:#ddd; margin:0 8px 14px; }
      .hf .step-line.active { background:#1082FF; }
      .hf .step-content { padding:0 12px 80px; }
      .hf .form-group { margin-bottom:14px; }
      .hf .form-label { font-size:13px; color:#333; font-weight:500; margin-bottom:6px; }
      .hf .input { width:100%; border:1px solid var(--border); border-radius:8px; padding:10px; font-size:14px; background:#fff; box-sizing:border-box; }
      .hf .textarea { width:100%; border:1px solid var(--border); border-radius:8px; padding:10px; font-size:13px; background:#fff; box-sizing:border-box; min-height:80px; }
      .hf .search-row { display:flex; gap:8px; }
      .hf .btn-sm { background:#1082FF; color:#fff; border:none; border-radius:8px; font-size:13px; padding:0 14px; white-space:nowrap; }
      .hf .btn-scan { width:100%; background:#1082FF; color:#fff; border:none; border-radius:22px; font-size:14px; padding:12px; margin-top:10px; }
      .hf .dev-list { margin-top:10px; border:1px solid var(--border); border-radius:8px; overflow:hidden; }
      .hf .device-item { padding:10px 12px; font-size:13px; border-bottom:1px solid var(--border); }
      .hf .device-item:last-child { border-bottom:none; }
      .hf .selected-device { background:#E6F7FF; border:1px solid #1082FF; border-radius:8px; padding:10px 12px; color:#1082FF; font-size:13px; margin-top:12px; }
      .hf .lseb-intro { font-size:12px; color:#888; margin-bottom:12px; text-align:center; }
      .hf .risk-card { background:#fff; border:1px solid var(--border); border-radius:8px; padding:12px; margin-top:8px; }
      .hf .risk-calc { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .hf .rc-label { font-size:14px; color:#333; }
      .hf .rc-total { font-size:18px; font-weight:700; padding:2px 10px; border-radius:6px; }
      .hf .risk-badge { display:inline-block; padding:2px 10px; border-radius:6px; font-size:12px; }
      .hf .risk-critical { background:#FFF1F0; color:#CF1322; }
      .hf .risk-major    { background:#FFF7E6; color:#D46B08; }
      .hf .risk-general  { background:#FFFBE6; color:#7CB305; }
      .hf .risk-low      { background:#F6FFED; color:#389E0D; }
      .hf .critical-warn { background:#FFF1F0; border:1px solid #FF6600; border-radius:6px; padding:8px; color:#CF1322; font-size:13px; margin-top:10px; }
      .hf .photo-row { display:flex; flex-wrap:wrap; gap:8px; }
      .hf .photo-wrap { position:relative; }
      .hf .photo-thumb { width:74px; height:74px; border-radius:8px; object-fit:cover; }
      .hf .photo-del { position:absolute; top:-6px; right:-6px; width:18px; height:18px; border-radius:50%; background:rgba(0,0,0,.5); color:#fff; font-size:12px; display:flex; align-items:center; justify-content:center; }
      .hf .photo-add { width:74px; height:74px; border-radius:8px; border:2px dashed #ccc; color:#ccc; font-size:28px; display:flex; align-items:center; justify-content:center; }
      .hf .confirm-card { background:#fff; border:1px solid var(--border); border-radius:8px; padding:12px; margin-top:8px; }
      .hf .confirm-title { font-size:15px; font-weight:600; color:#333; margin-bottom:10px; }
      .hf .info-row { display:flex; padding:6px 0; border-bottom:1px solid #F5F6FA; gap:10px; }
      .hf .info-row:last-child { border-bottom:none; }
      .hf .label { font-size:13px; color:#888; width:80px; flex-shrink:0; }
      .hf .value { font-size:13px; color:#333; flex:1; }
      .hf .value.multi { word-break:break-all; }
      .hf .bottom-bar { position:fixed; bottom:0; left:0; right:0; max-width:480px; margin:0 auto; background:#fff; padding:10px 16px; padding-bottom:calc(10px + env(safe-area-inset-bottom)); box-shadow:0 -2px 12px rgba(0,0,0,.06); display:flex; gap:12px; }
      .hf .btn-primary { flex:1; background:#1082FF; color:#fff; border:none; border-radius:22px; font-size:15px; font-weight:600; padding:12px 0; }
      .hf .btn-primary:disabled { opacity:.6; }
      .hf .btn-default { flex:1; background:#fff; color:#1082FF; border:1px solid #1082FF; border-radius:22px; font-size:15px; font-weight:600; padding:12px 0; }
      .hf .muted { color:#999; }
      .hf .empty-state { text-align:center; padding:40px 0; }
    </style>
  </div>
  `,
  data() {
    return {
      mode: 'create',
      step: 1,
      loading: false,
      submiting: false,
      deviceId: '',
      deviceName: '',
      deviceSearch: '',
      hazardType: '',
      hazardTypes: ['制动器失效', '门机故障', '限速器失效', '安全回路故障', '轿厢异常', '钢丝绳损伤', '其他'],
      description: '',
      discoveredAt: '',
      photos: [],
      lseL: 3, lseS: 3, lseE: 3, lseB: 3,
      rectifyAdvice: '',
      rectifyOwnerId: '',
      rectifyOwnerName: '',
      users: [],
      _deviceList: [],
      _riskValue: 9,
      _riskLevel: 'major',
      _isMajor: false,
      steps: ['设备', '隐患', '评估', '整改'],
      five: [1, 2, 3, 4, 5]
    };
  },
  computed: {
    isView() { return this.mode === 'view'; }
  },
  mounted() {
    const now = new Date();
    const p = n => String(n).padStart(2, '0');
    this.discoveredAt = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) + ' ' + p(now.getHours()) + ':' + p(now.getMinutes());
    this.mode = this.query.mode || 'create';
    this._calcRisk();
    this.loadUsers();
    if (this.query.id && this.mode === 'view') this.loadDetail(this.query.id);
  },
  methods: {
    nextStep() {
      if (this.step === 1) {
        if (!this.deviceId) return utils.toast('请先选择设备');
        this.step = 2;
      } else if (this.step === 2) {
        if (!this.hazardType) return utils.toast('请选择隐患类型');
        if (!this.description) return utils.toast('请填写隐患描述');
        this.step = 3;
      } else if (this.step === 3) {
        this.step = 4;
      }
    },
    prevStep() { if (this.step > 1) this.step = this.step - 1; },
    goStep(t) { if (t < this.step) this.step = t; },
    async onScanDevice() {
      try {
        const code = await utils.scanCode();
        this.deviceId = code;
        this.deviceName = '设备 ' + code;
        utils.toast('扫码成功');
      } catch (e) { utils.toast('扫码取消'); }
    },
    async onSearchDevice() {
      const kw = this.deviceSearch;
      if (!kw) return;
      try {
        const d = await api.get('/api/mobile/devices', { keyword: kw });
        const list = d.data || d || [];
        this._deviceList = list;
        if (!list.length) utils.toast('未找到设备');
      } catch (e) { utils.toast(e.message || '搜索失败'); }
    },
    onSelectDevice(idx) {
      const devs = this._deviceList || [];
      if (devs[idx]) {
        this.deviceId = devs[idx].id;
        this.deviceName = devs[idx].name || devs[idx].deviceName || devs[idx].code || devs[idx].id;
      }
    },
    onSelectOwner() {
      const u = this.users.find(x => String(x.id) === String(this.rectifyOwnerId));
      this.rectifyOwnerName = u ? u.name : '';
    },
    async onTakePhoto() {
      try {
        const photos = await utils.chooseImage(6);
        this.photos = this.photos.concat(photos).slice(0, 6);
      } catch (e) { /* 取消 */ }
    },
    onRemovePhoto(idx) { this.photos.splice(idx, 1); },
    _calcRisk() {
      const r = this.lseL * this.lseS;
      let level = 'low';
      if (r >= 16) level = 'critical';
      else if (r >= 9) level = 'major';
      else if (r >= 4) level = 'general';
      this._riskValue = r;
      this._riskLevel = level;
      this._isMajor = (this.lseL >= 4 && this.lseS >= 4) || r >= 12;
    },
    async onSubmit() {
      if (this.submiting) return;
      if (!this.deviceId) return utils.toast('请先选择设备');
      if (!this.hazardType) return utils.toast('请选择隐患类型');
      if (!this.description) return utils.toast('请填写隐患描述');
      this.submiting = true;
      try {
        const gps = await utils.getLocation().catch(() => ({}));
        await api.post('/api/mobile/hazards', {
          deviceId: this.deviceId,
          hazardType: this.hazardType,
          description: this.description,
          discoveredAt: this.discoveredAt,
          lseL: this.lseL, lseS: this.lseS, lseE: this.lseE, lseB: this.lseB,
          rectifyAdvice: this.rectifyAdvice,
          rectifyOwnerId: this.rectifyOwnerId,
          photos: this.photos,
          gpsLocation: gps
        });
        utils.toast('提交成功');
        setTimeout(() => utils.go('/work_order'), 1500);
      } catch (e) {
        utils.toast(e.message || '提交失败');
      } finally {
        this.submiting = false;
      }
    },
    goBack() { utils.go('/hazard'); },
    async loadUsers() {
      try {
        const d = await api.get('/api/mobile/users');
        this.users = d.data || d || [];
      } catch (e) { /* 忽略 */ }
    },
    async loadDetail(id) {
      try {
        const d = await api.get('/api/mobile/hazards/' + id);
        const h = d.data || d;
        const lseL = h.lseL || h.lse_l || 3;
        const lseS = h.lseS || h.lse_s || 3;
        const r = lseL * lseS;
        const level = r >= 16 ? 'critical' : r >= 9 ? 'major' : r >= 4 ? 'general' : 'low';
        this.deviceId = h.deviceId || h.device_id || '';
        this.deviceName = h.deviceName || h.device_name || '';
        this.hazardType = h.hazardType || h.hazard_type || '';
        this.description = h.description || '';
        this.discoveredAt = h.discoveredAt || h.discovered_at || this.discoveredAt;
        this.lseL = lseL; this.lseS = lseS;
        this.lseE = h.lseE || h.lse_e || 3;
        this.lseB = h.lseB || h.lse_b || 3;
        this.rectifyAdvice = h.rectifyAdvice || h.rectify_advice || '';
        this.rectifyOwnerId = h.rectifyOwnerId || h.rectify_owner_id || '';
        this.rectifyOwnerName = h.rectifyOwnerName || h.rectify_owner_name || '';
        this.photos = h.photos || [];
        this.step = 4;
        this._riskValue = r;
        this._riskLevel = level;
        this._isMajor = (lseL >= 4 && lseS >= 4) || r >= 12;
      } catch (e) {
        utils.toast(e.message || '加载失败');
      } finally {
        this.loading = false;
      }
    },
    fmtDev(a, b) { return a || b; },
    fmtNA(v) { return v || '-'; },
    devLabel(d) { return d.name || d.deviceName || d.code || d.id; },
    isViewDisabled() { return this.isView; },
    canAddPhoto() { return !this.isView && this.photos.length < 6; },
    canPrevStep() { return this.step > 1 && !this.isView; },
    canNextStep() { return !this.isView && this.step < 4; },
    canSubmitStep() { return !this.isView && this.step === 4; },
    riskLabelByLevel(level) {
      return ({ critical: '重大', major: '较大', general: '一般', low: '低' })[level] || '低';
    },
    riskClassByLevel(level) {
      return ({ critical: 'risk-critical', major: 'risk-major', general: 'risk-general', low: 'risk-low' })[level] || 'risk-low';
    }
  }
};
