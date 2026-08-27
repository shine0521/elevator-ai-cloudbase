// 隐患详情 → H5（Vue3 global build，按契约 #12 重写）
// GET /api/mobile/hazards/:id  api.getHazard(id)  → 隐患信息 + 关联 workOrder
// 验收：verifyDescription 输入 → api.post('/api/mobile/hazards/'+id+'/verify',{verifyDescription,pass}) 闭环/打回
// 状态展示统一走 utils.statusLabel / utils.statusColor；风险展示走 utils.levelColor / utils.levelLabel
window.Pages = window.Pages || {};
window.Pages.hazard_detail = {
  name: 'hazard_detail',
  props: ['query'],
  data: function () {
    return {
      loading: true,
      hazard: null,
      actioning: false,
      verifyDescription: ''
    };
  },
  computed: {
    hasData: function () { return !!this.hazard; },
    hasWorkOrder: function () { return !!(this.hazard && this.hazard.workOrder); },
    riskLevel: function () { return this.hazard ? (this.hazard.risk_level || '') : ''; },
    levelLabel: function () { return utils.levelLabel(this.riskLevel); },
    levelColor: function () { return utils.levelColor(this.riskLevel); },
    lseL: function () { return this.hazard ? (this.hazard.lse_L || this.hazard.lseL || 0) : 0; },
    lseS: function () { return this.hazard ? (this.hazard.lse_S || this.hazard.lseS || 0) : 0; },
    lseE: function () { return this.hazard ? (this.hazard.lse_E || this.hazard.lseE || 0) : 0; },
    lseB: function () {
      var b = this.hazard && (this.hazard.risk_B || this.hazard.riskB);
      if (b) return b;
      return (Number(this.lseL) || 0) * (Number(this.lseS) || 0) * (Number(this.lseE) || 0);
    },
    isPending: function () { return this.hazard && this.hazard.status === 'pending'; },
    isRectifying: function () { return this.hazard && this.hazard.status === 'rectifying'; },
    isVerifying: function () { return this.hazard && this.hazard.status === 'verifying'; },
    isClosed: function () { return this.hazard && this.hazard.status === 'closed'; },
    workOrderNo: function () {
      var w = this.hazard && this.hazard.workOrder;
      return w ? (w.order_no || w.orderNo || w.id || '-') : '-';
    },
    photoList: function () {
      var p = this.hazard ? this.hazard.photos : null;
      if (!p) return [];
      if (typeof p === 'string') {
        try { p = JSON.parse(p); } catch (e) { return []; }
      }
      return Array.isArray(p) ? p : [];
    },
    showPhotos: function () { return this.photoList.length > 0; }
  },
  methods: {
    load: async function () {
      var self = this;
      var id = (this.query && this.query.id) || '';
      if (!id) { this.loading = false; this.hazard = null; return; }
      this.loading = true;
      try {
        var d = await api.getHazard(id);
        self.hazard = d.data || d || null;
      } catch (e) {
        utils.toast(e && e.message ? e.message : '加载失败');
        self.hazard = null;
      } finally {
        self.loading = false;
      }
    },
    statusLabelOf: function (s) { return utils.statusLabel(s); },
    statusColorOf: function (s) { return utils.statusColor(s); },
    hazardNoOf: function () { return (this.hazard && (this.hazard.hazard_no || this.hazard.hazardNo)) || '-'; },
    deviceNameOf: function () { return (this.hazard && (this.hazard.device_name || this.hazard.deviceName)) || '-'; },
    deviceCodeOf: function () { return (this.hazard && (this.hazard.device_code || this.hazard.deviceCode)) || '-'; },
    locationOf: function () { return (this.hazard && (this.hazard.location || this.hazard.gps_location)) || '-'; },
    hazardTypeOf: function () { return (this.hazard && (this.hazard.hazard_type || this.hazard.hazardType)) || '-'; },
    descOf: function () { return (this.hazard && this.hazard.description) || '-'; },
    finderOf: function () { return (this.hazard && (this.hazard.finder_name || this.hazard.finderName)) || '-'; },
    deadlineOf: function () { return (this.hazard && this.hazard.deadline) || '未设定'; },
    ownerOf: function () { return (this.hazard && (this.hazard.rectify_owner_name || this.hazard.rectifyOwnerName)) || '未指派'; },
    adviceOf: function () { return (this.hazard && (this.hazard.rectify_advice || this.hazard.rectifyAdvice)) || '-'; },
    findTimeOf: function () {
      var t = this.hazard && (this.hazard.find_time || this.hazard.findTime || this.hazard.created_at || this.hazard.create_time);
      return t ? utils.formatTime(t) : '未记录';
    },
    goWorkOrder: function () {
      if (!this.hasWorkOrder) return;
      var w = this.hazard.workOrder;
      var wid = w.id || w.order_id || w.orderId;
      if (wid) utils.go('/work_order_detail?id=' + wid);
    },
    startRectify: async function () {
      if (this.actioning) return;
      if (!(await utils.confirm('确认开始整改该隐患？'))) return;
      await this.pushStatus('rectifying', '已开始整改');
    },
    advance: async function () {
      if (this.actioning) return;
      if (!(await utils.confirm('确认提交整改并报送验收？'))) return;
      await this.pushStatus('verifying', '已报送验收');
    },
    verify: async function (pass) {
      if (this.actioning) return;
      if (!this.verifyDescription || !this.verifyDescription.trim()) { utils.toast('请填写验收意见'); return; }
      var tip = pass ? '确认验收通过并闭环关闭？' : '确认不通过并打回整改？';
      if (!(await utils.confirm(tip))) return;
      this.actioning = true;
      var self = this;
      try {
        var id = self.query.id;
        await api.post('/api/mobile/hazards/' + id + '/verify', {
          verifyDescription: self.verifyDescription,
          pass: pass
        });
        utils.toast(pass ? '验收通过，隐患已闭环' : '已打回整改');
        self.verifyDescription = '';
        await self.load();
      } catch (e) {
        utils.toast(e && e.message ? e.message : '操作失败');
      } finally {
        self.actioning = false;
      }
    },
    pushStatus: async function (status, msg) {
      this.actioning = true;
      var self = this;
      try {
        var id = self.query.id;
        await api.submitHazard(id, { status: status });
        utils.toast(msg);
        await self.load();
      } catch (e) {
        utils.toast(e && e.message ? e.message : '操作失败');
      } finally {
        self.actioning = false;
      }
    }
  },
  mounted: function () { this.load(); },
  template: `
  <div class="page hd">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <template v-else-if="hasData">
      <!-- 顶部风险卡 -->
      <div class="risk-hero" :style="{ background: levelColor }">
        <div class="rh-level">{{ levelLabel }}</div>
        <div class="rh-r">R = L × S × E = <b>{{ lseB }}</b></div>
        <div class="rh-lse"><span>L {{ lseL }}</span><span>S {{ lseS }}</span><span>E {{ lseE }}</span></div>
      </div>

      <!-- 基本信息 -->
      <div class="section-title">隐患基本信息</div>
      <div class="card">
        <div class="info-row"><span class="label">隐患编号</span><span class="value">{{ hazardNoOf }}</span></div>
        <div class="info-row"><span class="label">设备名称</span><span class="value">{{ deviceNameOf }}</span></div>
        <div class="info-row"><span class="label">设备编号</span><span class="value">{{ deviceCodeOf }}</span></div>
        <div class="info-row"><span class="label">位置</span><span class="value">{{ locationOf }}</span></div>
        <div class="info-row"><span class="label">隐患类型</span><span class="value">{{ hazardTypeOf }}</span></div>
        <div class="info-row"><span class="label">隐患描述</span><span class="value multi">{{ descOf }}</span></div>
        <div class="info-row"><span class="label">发现人</span><span class="value">{{ finderOf }}</span></div>
        <div class="info-row"><span class="label">发现时间</span><span class="value">{{ findTimeOf }}</span></div>
      </div>

      <!-- 整改信息 -->
      <div class="section-title">整改信息</div>
      <div class="card">
        <div class="info-row"><span class="label">当前状态</span><span class="value"><span class="badge" :style="{ background: statusColorOf(hazard.status), color: '#fff' }">{{ statusLabelOf(hazard.status) }}</span></span></div>
        <div class="info-row"><span class="label">整改期限</span><span class="value">{{ deadlineOf }}</span></div>
        <div class="info-row"><span class="label">整改责任人</span><span class="value">{{ ownerOf }}</span></div>
        <div class="info-row"><span class="label">整改建议</span><span class="value multi">{{ adviceOf }}</span></div>
      </div>

      <!-- 关联工单 -->
      <div v-if="hasWorkOrder" class="section-title">关联工单</div>
      <div v-if="hasWorkOrder" class="card wo-card" @click="goWorkOrder">
        <div class="info-row"><span class="label">工单号</span><span class="value">{{ workOrderNo }} <span class="link">查看 ›</span></span></div>
        <div class="info-row"><span class="label">工单状态</span><span class="value"><span class="badge" :style="{ background: statusColorOf(hazard.workOrder.status), color: '#fff' }">{{ statusLabelOf(hazard.workOrder.status) }}</span></span></div>
      </div>

      <!-- 现场照片 -->
      <div v-if="showPhotos" class="section-title">现场照片</div>
      <div v-if="showPhotos" class="photo-grid">
        <img v-for="(p, idx) in photoList" :key="idx" class="photo" :src="p" />
      </div>

      <!-- 验收意见（仅待验收时） -->
      <div class="card" v-if="isVerifying">
        <div class="form-label">验收意见 *</div>
        <textarea class="fi-input" v-model="verifyDescription" placeholder="请填写验收意见（通过或不通过均须填写）"></textarea>
      </div>

      <!-- 操作条 -->
      <div class="action-bar">
        <button v-if="isPending" class="btn-primary" :disabled="actioning" @click="startRectify">开始整改</button>
        <button v-if="isRectifying" class="btn-primary" :disabled="actioning" @click="advance">提交整改（报验）</button>
        <button v-if="isVerifying" class="btn-primary" :disabled="actioning" @click="verify(true)">验收通过（闭环）</button>
        <button v-if="isVerifying" class="btn-danger" :disabled="actioning" @click="verify(false)">不通过（打回）</button>
        <div v-if="isClosed" class="closed-badge">✓ 隐患已闭环关闭</div>
      </div>
    </template>
    <div v-else class="empty-state"><span class="muted">未找到隐患数据</span></div>
  </div>
  `
};
