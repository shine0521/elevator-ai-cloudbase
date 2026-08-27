// M-10b 工单详情 → H5 (Vue3 global build)
// GET /api/mobile/work-orders/:id
// 整改 POST /api/mobile/work-orders/:id/rectify  |  验收 POST /api/mobile/work-orders/:id/verify
window.Pages = window.Pages || {};
window.Pages.work_order_detail = {
  template: `
  <div class="page wod">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <template v-else-if="detail">
      <!-- 基本信息 -->
      <div class="section-title">工单信息</div>
      <div class="card">
        <div class="info-title">{{detail.title||detail.order_no||('工单 #'+detail.id)}}</div>
        <div class="info-row"><span class="label">工单编号</span><span class="value">{{detail.order_no||'-'}}</span></div>
        <div class="info-row"><span class="label">状态</span><span class="value"><span class="status-badge" :class="statusClass(detail.status)">{{statusLabel(detail.status)}}</span></span></div>
        <div class="info-row"><span class="label">负责人</span><span class="value">{{detail.assigneeName||detail.assignee_name||'-'}}</span></div>
        <div class="info-row"><span class="label">设备</span><span class="value">{{detail.deviceName||detail.device_name||detail.deviceCode||'-'}}</span></div>
        <div class="info-row"><span class="label">描述</span><span class="value multi">{{detail.description||detail.hazardDescription||'-'}}</span></div>
        <div class="info-row"><span class="label">创建时间</span><span class="value">{{detail.createTime||detail.create_time||detail.createdAt||detail.created_at||'-'}}</span></div>
      </div>

      <!-- 风险 / LSEB -->
      <div v-if="hasRisk" class="section-title">风险评估</div>
      <div v-if="hasRisk" class="card">
        <div class="wo-tags">
          <span class="risk-badge" :class="riskClass(detail)">{{riskLabel(detail)}}</span>
          <span class="lseb-chip">L={{detail.lseL||detail.lse_l||'-'}}</span>
          <span class="lseb-chip">S={{detail.lseS||detail.lse_s||'-'}}</span>
          <span class="lseb-chip">E={{detail.lseE||detail.lse_e||'-'}}</span>
          <span class="lseb-chip">B={{detail.lseB||detail.lse_b||'-'}}</span>
        </div>
      </div>

      <!-- 进度时间线 -->
      <div class="section-title">处理进度</div>
      <div class="card">
        <div class="progress-timeline">
          <div class="pt-item" :class="{done:progressStep(detail.status)>=0}"><div class="pt-dot"></div><div class="pt-label">待整改</div></div>
          <div class="pt-line" :class="{done:progressStep(detail.status)>=1}"></div>
          <div class="pt-item" :class="{done:progressStep(detail.status)>=1}"><div class="pt-dot"></div><div class="pt-label">整改中</div></div>
          <div class="pt-line" :class="{done:progressStep(detail.status)>=2}"></div>
          <div class="pt-item" :class="{done:progressStep(detail.status)>=2}"><div class="pt-dot"></div><div class="pt-label">待验收</div></div>
          <div class="pt-line" :class="{done:progressStep(detail.status)>=3}"></div>
          <div class="pt-item" :class="{done:progressStep(detail.status)>=3}"><div class="pt-dot"></div><div class="pt-label">已关闭</div></div>
        </div>
      </div>

      <!-- 整改操作（待整改） -->
      <div v-if="isPending" class="section-title">整改填报</div>
      <div v-if="isPending" class="card">
        <div class="form-group">
          <div class="form-label">整改描述 *</div>
          <textarea v-model="rectifyDesc" class="textarea" placeholder="请填写整改情况"></textarea>
        </div>
        <div class="form-group">
          <div class="form-label">整改照片</div>
          <div class="photo-row">
            <div v-for="(p,idx) in rectifyPhotos" :key="idx" class="photo-wrap">
              <img class="photo-thumb" :src="p" />
              <div class="photo-del" @click="onRectifyRemovePhoto(idx)">×</div>
            </div>
            <div v-if="rectifyPhotos.length<6" class="photo-add" @click="onRectifyTakePhoto">+</div>
          </div>
        </div>
        <button class="btn-primary" :disabled="actioning" @click="onSubmitRectify">{{actioning?'提交中...':'提交整改'}}</button>
      </div>

      <!-- 验收操作（待验收） -->
      <div v-if="isVerifying" class="section-title">验收处理</div>
      <div v-if="isVerifying" class="card">
        <div class="form-group">
          <div class="form-label">验收结论 *</div>
          <div class="choice-row">
            <div class="choice-btn" :class="{'selected-pass':verifyPass===true}" @click="verifyPass=true">验收通过</div>
            <div class="choice-btn" :class="{'selected-reject':verifyPass===false}" @click="verifyPass=false">验收不通过</div>
          </div>
        </div>
        <div class="form-group">
          <div class="form-label">验收意见 *</div>
          <textarea v-model="verifyDesc" class="textarea" placeholder="请填写验收意见"></textarea>
        </div>
        <div class="form-group">
          <div class="form-label">验收照片</div>
          <div class="photo-row">
            <div v-for="(p,idx) in verifyPhotos" :key="idx" class="photo-wrap">
              <img class="photo-thumb" :src="p" />
              <div class="photo-del" @click="onVerifyRemovePhoto(idx)">×</div>
            </div>
            <div v-if="verifyPhotos.length<6" class="photo-add" @click="onVerifyTakePhoto">+</div>
          </div>
        </div>
        <button class="btn-primary" :disabled="actioning" @click="onSubmitVerify">{{actioning?'提交中...':'提交验收'}}</button>
      </div>

      <!-- 已关闭 -->
      <div v-if="detail.status==='closed'" class="card done-card">
        <span class="done-icon">✓</span>
        <span class="done-text">工单已关闭</span>
      </div>
    </template>

    <style>
      .wod.page { min-height:100vh; background:var(--bg); padding-bottom:20px; }
      .wod .section-title { font-size:13px; color:#888; padding:8px 4px 4px 12px; }
      .wod .card { background:#fff; border-radius:10px; padding:14px; margin:0 12px 12px; }
      .wod .info-title { font-size:16px; font-weight:700; margin-bottom:10px; color:#333; }
      .wod .info-row { display:flex; padding:6px 0; border-bottom:1px solid #F5F6FA; gap:10px; align-items:flex-start; }
      .wod .info-row:last-child { border-bottom:none; }
      .wod .label { font-size:13px; color:#888; width:80px; flex-shrink:0; }
      .wod .value { font-size:13px; color:#333; flex:1; }
      .wod .value.multi { word-break:break-all; }
      .wod .wo-tags { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .wod .risk-badge { display:inline-block; padding:4px 12px; border-radius:6px; font-size:13px; }
      .wod .risk-critical { background:#FFF1F0; color:#CF1322; }
      .wod .risk-major    { background:#FFF7E6; color:#D46B08; }
      .wod .risk-general  { background:#FFFBE6; color:#7CB305; }
      .wod .risk-low      { background:#F6FFED; color:#389E0D; }
      .wod .lseb-chip { background:#F5F6FA; color:#333; border-radius:6px; padding:4px 10px; font-size:13px; }
      .wod .tag-warn    { background:#FFF7E6; color:#FF6600; }
      .wod .tag-info    { background:#E6F7FF; color:#1082FF; }
      .wod .tag-primary { background:#F6FFED; color:#09B44A; }
      .wod .tag-gray    { background:#F5F5F5; color:#888; }
      .wod .progress-timeline { display:flex; align-items:center; padding:10px 0; }
      .wod .pt-item { display:flex; flex-direction:column; align-items:center; gap:6px; }
      .wod .pt-dot { width:12px; height:12px; border-radius:50%; background:#ddd; }
      .wod .pt-item.done .pt-dot { background:#1082FF; }
      .wod .pt-label { font-size:11px; color:#888; }
      .wod .pt-item.done .pt-label { color:#1082FF; }
      .wod .pt-line { flex:1; height:2px; background:#ddd; margin-bottom:22px; }
      .wod .pt-line.done { background:#1082FF; }
      .wod .form-group { margin-bottom:12px; }
      .wod .form-label { font-size:13px; color:#333; font-weight:500; margin-bottom:6px; }
      .wod .textarea { width:100%; border:1px solid var(--border); border-radius:8px; padding:10px; font-size:13px; background:#fff; box-sizing:border-box; min-height:70px; }
      .wod .choice-row { display:flex; gap:12px; }
      .wod .choice-btn { flex:1; text-align:center; padding:10px; border-radius:8px; border:1px solid var(--border); font-size:14px; color:#666; cursor:pointer; }
      .wod .choice-btn.selected-pass { border-color:#09B44A; background:#F6FFED; color:#09B44A; font-weight:600; }
      .wod .choice-btn.selected-reject { border-color:#CF1322; background:#FFF1F0; color:#CF1322; font-weight:600; }
      .wod .photo-row { display:flex; flex-wrap:wrap; gap:8px; }
      .wod .photo-wrap { position:relative; }
      .wod .photo-thumb { width:74px; height:74px; border-radius:8px; object-fit:cover; }
      .wod .photo-del { position:absolute; top:-6px; right:-6px; width:18px; height:18px; border-radius:50%; background:rgba(0,0,0,.5); color:#fff; font-size:12px; display:flex; align-items:center; justify-content:center; }
      .wod .photo-add { width:74px; height:74px; border-radius:8px; border:2px dashed #ccc; color:#ccc; font-size:28px; display:flex; align-items:center; justify-content:center; }
      .wod .btn-primary { width:100%; background:#1082FF; color:#fff; border:none; border-radius:8px; font-size:15px; font-weight:600; padding:12px; margin-top:6px; }
      .wod .btn-primary:disabled { opacity:.6; }
      .wod .done-card { text-align:center; padding:30px 0; }
      .wod .done-icon { display:block; font-size:30px; color:#09B44A; margin-bottom:8px; }
      .wod .done-text { font-size:15px; color:#09B44A; }
      .wod .muted { color:#999; }
      .wod .empty-state { text-align:center; padding:40px 0; }
    </style>
  </div>
  `,
  data() {
    return {
      loading: true,
      id: '',
      detail: null,
      rectifyDesc: '',
      rectifyPhotos: [],
      verifyDesc: '',
      verifyPhotos: [],
      verifyPass: null,
      actioning: false
    };
  },
  computed: {
    isPending() { return !!(this.detail && this.detail.status === 'pending'); },
    isVerifying() { return !!(this.detail && this.detail.status === 'verifying'); },
    hasRisk() {
      const d = this.detail || {};
      return !!(d.riskLevel || d.risk_level || d.lseL || d.lse_l || d.lseS || d.lse_s);
    }
  },
  mounted() {
    this.id = this.query.id || '';
    if (!this.id) { utils.go('/work_order'); return; }
    this.load(this.id);
  },
  methods: {
    async load(id) {
      try {
        const d = await api.get('/api/mobile/work-orders/' + id);
        this.detail = d.data || d;
      } catch (e) {
        utils.toast(e.message || '加载失败');
      } finally {
        this.loading = false;
      }
    },
    riskLevel(item) {
      let lv = (item.riskLevel || item.risk_level || item.risk || '').toLowerCase();
      if (lv === 'high') lv = 'critical';
      if (lv === 'medium' || lv === 'mid') lv = 'major';
      if (['critical', 'major', 'general', 'low'].indexOf(lv) < 0) lv = 'low';
      return lv;
    },
    riskLabel(item) {
      const lv = this.riskLevel(item);
      return ({ critical: '重大', major: '较大', general: '一般', low: '低' })[lv] || '低';
    },
    riskClass(item) {
      const lv = this.riskLevel(item);
      return ({ critical: 'risk-critical', major: 'risk-major', general: 'risk-general', low: 'risk-low' })[lv] || 'risk-low';
    },
    statusLabel(s) {
      return ({ pending: '待整改', rectifying: '整改中', verifying: '待验收', closed: '已关闭', completed: '已完成' })[s] || s || '';
    },
    statusClass(s) {
      return ({ pending: 'tag-warn', rectifying: 'tag-info', verifying: 'tag-primary', closed: 'tag-gray' })[s] || 'tag-gray';
    },
    progressStep(status) {
      const map = { pending: 0, rectifying: 1, verifying: 2, closed: 3 };
      return map[status] != null ? map[status] : 0;
    },
    async onRectifyTakePhoto() {
      try { const photos = await utils.chooseImage(6); this.rectifyPhotos = this.rectifyPhotos.concat(photos).slice(0, 6); }
      catch (e) { /* 取消 */ }
    },
    onRectifyRemovePhoto(idx) { this.rectifyPhotos.splice(idx, 1); },
    async onSubmitRectify() {
      if (this.actioning) return;
      if (!this.rectifyDesc) return utils.toast('请填写整改描述');
      this.actioning = true;
      try {
        await api.post('/api/mobile/work-orders/' + this.id + '/rectify', {
          rectifyDescription: this.rectifyDesc,
          rectifyPhotos: this.rectifyPhotos
        });
        utils.toast('整改提交成功');
        setTimeout(() => {
          this.load(this.id);
          this.actioning = false;
          this.rectifyDesc = '';
          this.rectifyPhotos = [];
        }, 1500);
      } catch (e) {
        utils.toast(e.message || '提交失败');
        this.actioning = false;
      }
    },
    async onVerifyTakePhoto() {
      try { const photos = await utils.chooseImage(6); this.verifyPhotos = this.verifyPhotos.concat(photos).slice(0, 6); }
      catch (e) { /* 取消 */ }
    },
    onVerifyRemovePhoto(idx) { this.verifyPhotos.splice(idx, 1); },
    async onSubmitVerify() {
      if (this.actioning) return;
      if (this.verifyPass === null) return utils.toast('请选择验收结论');
      if (!this.verifyDesc) return utils.toast('请填写验收意见');
      this.actioning = true;
      try {
        await api.post('/api/mobile/work-orders/' + this.id + '/verify', {
          pass: this.verifyPass,
          verifyDescription: this.verifyDesc,
          verifyPhotos: this.verifyPhotos
        });
        utils.toast('验收提交成功');
        setTimeout(() => {
          this.load(this.id);
          this.actioning = false;
          this.verifyDesc = '';
          this.verifyPhotos = [];
          this.verifyPass = null;
        }, 1500);
      } catch (e) {
        utils.toast(e.message || '提交失败');
        this.actioning = false;
      }
    }
  }
};
