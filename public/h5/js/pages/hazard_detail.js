// M-07 隐患详情 → H5 (Vue3 global build, 重构)
// GET /api/mobile/hazards/:id  （含关联 workOrder）
// 顶部风险卡片（渐变）+ 基本信息 + 整改信息 + 关联工单 + 照片 + 状态操作
window.Pages = window.Pages || {};
window.Pages.hazard_detail = {
  template: `
  <div class="page hd">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <template v-else-if="data">
      <!-- 顶部风险卡片 -->
      <div class="risk-hero" :style="{ background: riskGradient }">
        <div class="rh-level">{{riskLabelOf}}</div>
        <div class="rh-r">R = L × S × E = <b>{{lsebR}}</b></div>
        <div class="rh-lse">
          <span>L {{lseL}}</span><span>S {{lseS}}</span><span>E {{lseE}}</span>
        </div>
      </div>

      <!-- 基本信息 -->
      <div class="section-title">隐患基本信息</div>
      <div class="card">
        <div class="info-row"><span class="label">隐患编号</span><span class="value">{{hazardNoOf}}</span></div>
        <div class="info-row"><span class="label">设备名称</span><span class="value">{{deviceNameOf}}</span></div>
        <div class="info-row"><span class="label">设备编号</span><span class="value">{{deviceIdOf}}</span></div>
        <div class="info-row"><span class="label">位置</span><span class="value">{{locationOf}}</span></div>
        <div class="info-row"><span class="label">隐患类型</span><span class="value">{{hazardTypeOf}}</span></div>
        <div class="info-row"><span class="label">隐患描述</span><span class="value multi">{{descOf}}</span></div>
        <div class="info-row"><span class="label">发现人</span><span class="value">{{finderOf}}</span></div>
        <div class="info-row"><span class="label">发现时间</span><span class="value">{{findTimeOf(data)}}</span></div>
      </div>

      <!-- 整改信息 -->
      <div class="section-title">整改信息</div>
      <div class="card">
        <div class="info-row"><span class="label">当前状态</span><span class="value"><span class="badge" :class="statusClassOf(data.status)">{{statusLabelOf(data.status)}}</span></span></div>
        <div class="info-row"><span class="label">整改期限</span><span class="value">{{deadlineOf}}</span></div>
        <div class="info-row"><span class="label">整改责任人</span><span class="value">{{ownerOf}}</span></div>
        <div class="info-row"><span class="label">整改建议</span><span class="value multi">{{adviceOf}}</span></div>
      </div>

      <!-- 关联工单 -->
      <div v-if="hasWorkOrder" class="section-title">关联工单</div>
      <div v-if="hasWorkOrder" class="card wo-card" @click="goWorkOrder">
        <div class="info-row"><span class="label">工单号</span><span class="value">{{workOrderNo}} <span class="link">查看 ›</span></span></div>
        <div class="info-row"><span class="label">工单状态</span><span class="value"><span class="badge" :class="statusClassOf(data.workOrder.status)">{{statusLabelOf(data.workOrder.status)}}</span></span></div>
      </div>

      <!-- 照片 -->
      <div v-if="photoList.length" class="section-title">现场照片</div>
      <div v-if="photoList.length" class="photo-grid">
        <img v-for="(p,idx) in photoList" :key="idx" class="photo" :src="p" />
      </div>

      <!-- 操作按钮 -->
      <div class="action-bar">
        <button v-if="isPending" class="btn-primary" :disabled="actioning" @click="startRectify">开始整改</button>
        <button v-if="isRectifying" class="btn-primary" :disabled="actioning" @click="advance">提交整改（报验）</button>
        <button v-if="isVerifying" class="btn-primary" :disabled="actioning" @click="verify">验收</button>
        <div v-if="isClosed" class="closed-badge">✓ 隐患已关闭</div>
      </div>
    </template>
    <div v-else class="empty-state"><span class="muted">未找到隐患数据</span></div>

  </div>
  `,
  data() {
    return {
      loading: true,
      data: null,
      actioning: false
    };
  },
  computed: {
    riskColor: function () {
      var m = { critical: '#FF4D4F', major: '#FA8C16', general: '#D48806', low: '#52C41A' };
      return m[this.data ? this.data.risk_level : ''] || '#999';
    },
    hasWorkOrder: function () {
      return !!(this.data && this.data.workOrder);
    },
    riskLabelOf: function () {
      var m = { critical: '重大风险', major: '较大风险', general: '一般风险', low: '低风险' };
      return m[this.data ? this.data.risk_level : ''] || '未知';
    },
    riskGradient: function () {
      var m = {
        critical: 'linear-gradient(135deg,#FF4D4F 0%,#FF7875 100%)',
        major: 'linear-gradient(135deg,#FA8C16 0%,#FFA940 100%)',
        general: 'linear-gradient(135deg,#D48806 0%,#FFC53D 100%)',
        low: 'linear-gradient(135deg,#52C41A 0%,#73D13D 100%)'
      };
      return m[this.data ? this.data.risk_level : ''] || 'linear-gradient(135deg,#999 0%,#bbb 100%)';
    },
    statusLabelMap: function () {
      return { pending: '待整改', rectifying: '整改中', verifying: '待验收', closed: '已关闭' };
    },
    statusClassMap: function () {
      return { pending: 'badge-orange', rectifying: 'badge-blue', verifying: 'badge-green', closed: 'badge-gray' };
    },
    lseL: function () { return this.data ? (this.data.lse_L || this.data.lseL || 0) : 0; },
    lseS: function () { return this.data ? (this.data.lse_S || this.data.lseS || 0) : 0; },
    lseE: function () { return this.data ? (this.data.lse_E || this.data.lseE || 0) : 0; },
    lsebR: function () {
      var b = (this.data && this.data.risk_B) || (this.data && this.data.riskB);
      if (b) return b;
      return (parseInt(this.lseL) || 0) * (parseInt(this.lseS) || 0) * (parseInt(this.lseE) || 0);
    },
    isPending: function () { return this.data && this.data.status === 'pending'; },
    isRectifying: function () { return this.data && this.data.status === 'rectifying'; },
    isVerifying: function () { return this.data && this.data.status === 'verifying'; },
    isClosed: function () { return this.data && this.data.status === 'closed'; },
    workOrderNo: function () {
      var w = this.data && this.data.workOrder;
      return w ? (w.order_no || w.orderNo || w.id || '-') : '-';
    },
    photoList: function () {
      var p = this.data ? this.data.photos : null;
      if (!p) return [];
      if (typeof p === 'string') {
        try { p = JSON.parse(p); } catch (e) { return []; }
      }
      return Array.isArray(p) ? p : [];
    }
  },
  mounted() { this.load(); },
  methods: {
    async load() {
      var id = (this.query && this.query.id) || '';
      if (!id) { this.loading = false; return; }
      try {
        const d = await api.get('/api/mobile/hazards/' + id);
        this.data = d.data || d || null;
      } catch (e) {
        utils.toast(e.message || '加载失败');
      } finally {
        this.loading = false;
      }
    },
    statusLabelOf(s) { return this.statusLabelMap[s] || s || ''; },
    statusClassOf(s) { return this.statusClassMap[s] || 'badge-gray'; },
    hazardNoOf() { return (this.data && (this.data.hazard_no || this.data.hazardNo)) || '-'; },
    deviceNameOf() { return (this.data && (this.data.device_name || this.data.deviceName)) || '-'; },
    deviceIdOf() { return (this.data && (this.data.device_id || this.data.deviceId)) || '-'; },
    locationOf() { return (this.data && (this.data.location || this.data.gps_location)) || '-'; },
    hazardTypeOf() { return (this.data && (this.data.hazard_type || this.data.hazardType)) || '-'; },
    descOf() { return (this.data && this.data.description) || '-'; },
    finderOf() { return (this.data && (this.data.finder_name || this.data.finderName)) || '-'; },
    deadlineOf() { return (this.data && this.data.deadline) || '未设定'; },
    ownerOf() { return (this.data && (this.data.rectify_owner_name || this.data.rectifyOwnerName)) || '未指派'; },
    adviceOf() { return (this.data && (this.data.rectify_advice || this.data.rectifyAdvice)) || '-'; },
    findTimeOf(item) {
      var t = item.find_time || item.findTime || item.createdAt || item.create_time || item.created_at || '';
      return t ? utils.formatTime(t) : '未记录';
    },
    goWorkOrder() {
      if (!this.hasWorkOrder) return;
      var w = this.data.workOrder;
      var wid = w.id || w.order_id || w.orderId;
      if (wid) utils.go('/work_order_detail?id=' + wid);
    },
    async startRectify() {
      if (this.actioning) return;
      if (!(await utils.confirm('确认开始整改该隐患？'))) return;
      await this.pushStatus('rectifying', '已开始整改');
    },
    async advance() {
      if (this.actioning) return;
      if (!(await utils.confirm('确认提交整改并报送验收？'))) return;
      await this.pushStatus('verifying', '已报送验收');
    },
    async verify() {
      if (this.actioning) return;
      if (!(await utils.confirm('确认验收通过并关闭该隐患？'))) return;
      this.actioning = true;
      try {
        var id = this.query.id;
        await api.post('/api/mobile/hazards/' + id + '/verify', {});
        utils.toast('验收成功');
        this.load();
      } catch (e) {
        utils.toast(e.message || '验收失败');
      } finally {
        this.actioning = false;
      }
    },
    async pushStatus(status, msg) {
      this.actioning = true;
      try {
        var id = this.query.id;
        await api.put('/api/mobile/hazards/' + id, { status: status });
        utils.toast(msg);
        this.load();
      } catch (e) {
        utils.toast(e.message || '操作失败');
      } finally {
        this.actioning = false;
      }
    }
  }
};
