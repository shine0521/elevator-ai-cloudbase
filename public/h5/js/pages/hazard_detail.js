// 隐患详情 → H5（Vue3 global build，按契约 v2 重写）
// GET /api/mobile/hazards/:id  api.getHazard(id)  → 隐患信息 + 关联 workOrder
// .detail-row 展示 L/S/E/B/level/deadline/责任人；关联 workOrder 卡（status pending/rectifying/verifying/closed）+ 跳转 work_order_detail
// 铁律：v-model 仅限 input/select/textarea；模板无裸 && || < >；禁止 SVG；根 <div class="page">
window.Pages = window.Pages || {};
window.Pages.hazard_detail = {
  name: 'hazard_detail',
  props: ['query'],
  data: function () {
    return {
      loading: true,
      error: '',
      hazard: null
    };
  },
  computed: {
    hasData: function () { return !!this.hazard; },
    hasWorkOrder: function () { return !!(this.hazard && this.hazard.workOrder); },
    riskLevel: function () { return this.hazard ? (this.hazard.risk_level || '') : ''; },
    riskTagClass: function () {
      var m = { low: 'tag-low', general: 'tag-general', major: 'tag-major', critical: 'tag-critical' };
      return m[String(this.riskLevel || '').toLowerCase()] || 'tag-low';
    },
    riskLabel: function () {
      var m = { low: '低', general: '一般', major: '较大', critical: '重大' };
      return m[String(this.riskLevel || '').toLowerCase()] || String(this.riskLevel || '');
    },
    lseL: function () { return this.hazard ? (this.hazard.lse_L || this.hazard.lseL || 0) : 0; },
    lseS: function () { return this.hazard ? (this.hazard.lse_S || this.hazard.lseS || 0) : 0; },
    lseE: function () { return this.hazard ? (this.hazard.lse_E || this.hazard.lseE || 0) : 0; },
    lseB: function () {
      var b = this.hazard && (this.hazard.risk_B || this.hazard.riskB);
      if (b) return b;
      return (Number(this.lseL) || 0) * (Number(this.lseS) || 0) * (Number(this.lseE) || 0);
    },
    workOrderNo: function () {
      var w = this.hazard && this.hazard.workOrder;
      return w ? (w.order_no || w.orderNo || w.id || '-') : '-';
    },
    woStatusTagClass: function () {
      var w = this.hazard && this.hazard.workOrder;
      var s = w ? w.status : '';
      var m = { pending: 'tag-pending', rectifying: 'tag-info', verifying: 'tag-warning', closed: 'tag-ok' };
      return m[String(s || '')] || 'tag-pending';
    },
    woStatusLabel: function () {
      var w = this.hazard && this.hazard.workOrder;
      var s = w ? w.status : '';
      var m = { pending: '待整改', rectifying: '整改中', verifying: '待验收', closed: '已关闭' };
      return m[String(s || '')] || '待处理';
    },
    photoList: function () {
      var p = this.hazard ? this.hazard.photos : null;
      if (!p) return [];
      if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { return []; } }
      return Array.isArray(p) ? p : [];
    },
    showPhotos: function () { return this.photoList.length > 0; },
    showError: function () { return !!this.error && !this.hasData; },
    rectifyPhotoList: function () { return this.parsePhotos(this.hazard && this.hazard.workOrder && this.hazard.workOrder.rectify_photos); },
    verifyPhotoList: function () { return this.parsePhotos(this.hazard && this.hazard.workOrder && this.hazard.workOrder.verify_photos); }
  },
  methods: {
    parsePhotos: function (p) {
      if (!p) return [];
      if (Array.isArray(p)) return p;
      try { return JSON.parse(p); } catch (e) { return []; }
    },
    load: function () {
      var self = this;
      var id = (this.query && this.query.id) || '';
      if (!id) { this.loading = false; this.hazard = null; this.error = '缺少隐患 ID'; return; }
      this.loading = true;
      this.error = '';
      return api.getHazard(id).then(function (d) {
        self.hazard = d.data || d || null;
      }).catch(function (e) {
        self.error = (e && e.message) ? e.message : '加载失败';
        self.hazard = null;
      }).then(function () {
        self.loading = false;
      });
    },
    hazardNoOf: function () { return (this.hazard && (this.hazard.hazard_no || this.hazard.hazardNo)) || '-'; },
    deviceNameOf: function () { return (this.hazard && (this.hazard.device_name || this.hazard.deviceName)) || '-'; },
    deviceCodeOf: function () { return (this.hazard && (this.hazard.device_code || this.hazard.deviceCode)) || '-'; },
    locationOf: function () { return (this.hazard && (this.hazard.location || this.hazard.device_location || this.hazard.gps_location)) || '-'; },
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
    goHazardList: function () { utils.go('/hazard'); }
  },
  mounted: function () { this.load(); },
  template: `
  <div class="page">
    <div v-if="loading" class="loading-wrap"><span class="spinner"></span><span>加载中...</span></div>
    <div v-else-if="showError" class="error-wrap">
      <div class="em-ic">⚠️</div>
      <div class="em-tip">{{ error }}</div>
      <button class="btn btn-o er-btn" @click="load">重试</button>
    </div>
    <template v-else-if="hasData">
      <!-- 顶部风险卡 -->
      <div class="card" :style="{ borderLeft: '4px solid var(--primary)' }">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span class="tag" :class="riskTagClass">{{ riskLabel }}</span>
          <span class="muted">风险值 R = {{ lseB }}</span>
        </div>
        <div class="muted" style="font-size:12px;margin-top:6px">L {{ lseL }} · S {{ lseS }} · E {{ lseE }}</div>
      </div>

      <!-- 基本信息 -->
      <div class="card">
        <div class="card-h"><span class="card-t">📌 隐患基本信息</span></div>
        <div class="detail-row"><span class="dk">隐患编号</span><span class="dv">{{ hazardNoOf }}</span></div>
        <div class="detail-row"><span class="dk">设备名称</span><span class="dv">{{ deviceNameOf }}</span></div>
        <div class="detail-row"><span class="dk">设备编号</span><span class="dv">{{ deviceCodeOf }}</span></div>
        <div class="detail-row"><span class="dk">位置</span><span class="dv">{{ locationOf }}</span></div>
        <div class="detail-row"><span class="dk">隐患类型</span><span class="dv">{{ hazardTypeOf }}</span></div>
        <div class="detail-row"><span class="dk">隐患描述</span><span class="dv">{{ descOf }}</span></div>
        <div class="detail-row"><span class="dk">发现人</span><span class="dv">{{ finderOf }}</span></div>
        <div class="detail-row"><span class="dk">发现时间</span><span class="dv">{{ findTimeOf }}</span></div>
      </div>

      <!-- LSEB 与整改 -->
      <div class="card">
        <div class="card-h"><span class="card-t">🧮 风险评估与整改</span></div>
        <div class="detail-row"><span class="dk">L 可能性</span><span class="dv">{{ lseL }}</span></div>
        <div class="detail-row"><span class="dk">S 严重性</span><span class="dv">{{ lseS }}</span></div>
        <div class="detail-row"><span class="dk">E 暴露频次</span><span class="dv">{{ lseE }}</span></div>
        <div class="detail-row"><span class="dk">风险值 B</span><span class="dv">{{ lseB }}</span></div>
        <div class="detail-row"><span class="dk">风险等级</span><span class="dv"><span class="tag" :class="riskTagClass">{{ riskLabel }}</span></span></div>
        <div class="detail-row"><span class="dk">整改期限</span><span class="dv">{{ deadlineOf }}</span></div>
        <div class="detail-row"><span class="dk">整改责任人</span><span class="dv">{{ ownerOf }}</span></div>
        <div class="detail-row"><span class="dk">整改建议</span><span class="dv">{{ adviceOf }}</span></div>
      </div>

      <!-- 关联工单 -->
      <div v-if="hasWorkOrder" class="card" @click="goWorkOrder">
        <div class="card-h"><span class="card-t">🔧 关联整改工单</span></div>
        <div class="detail-row"><span class="dk">工单号</span><span class="dv">{{ workOrderNo }} <span class="link" style="color:var(--primary)">查看 ›</span></span></div>
        <div class="detail-row"><span class="dk">工单状态</span><span class="dv"><span class="tag" :class="woStatusTagClass">{{ woStatusLabel }}</span></span></div>
        <div v-if="rectifyPhotoList.length" class="detail-row"><span class="dk">整改照片</span><span class="dv">{{ rectifyPhotoList.length }} 张</span></div>
        <div v-if="verifyPhotoList.length" class="detail-row"><span class="dk">验收照片</span><span class="dv">{{ verifyPhotoList.length }} 张</span></div>
      </div>
      <div v-else class="card">
        <div class="card-h"><span class="card-t">🔧 关联整改工单</span></div>
        <div class="muted" style="font-size:13px">尚未生成整改工单</div>
      </div>

      <!-- 现场照片 -->
      <div v-if="showPhotos" class="card">
        <div class="card-h"><span class="card-t">📷 现场照片</span></div>
        <div class="photo-wall">
          <div v-for="(p, idx) in photoList" :key="idx" class="photo-item"><img :src="p" /></div>
        </div>
      </div>

      <div style="padding:12px">
        <button class="btn-ghost" @click="goHazardList">返回隐患列表</button>
      </div>
    </template>
    <div v-else class="empty-wrap"><div class="em-ic">🔍</div><div class="em-tip">未找到隐患数据</div></div>
  </div>
  `
};
