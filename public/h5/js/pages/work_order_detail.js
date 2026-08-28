// 整改工单详情 → H5（Vue3 全局构建，按契约 v2 重写）
// GET /api/mobile/work-orders/:id  api.getWorkOrder(id)
// pending 态：填写整改说明(rectifyDescription)+照片 → api.submitRectify(id,{rectifyDescription,rectifyPhotos}) → 置 rectifying
// rectifying 态：填写验收说明(verifyDescription)+照片 → api.verifyWorkOrder(id,{verifyDescription,pass}) → 置 closed(通过)/pending(打回)
// 铁律：v-model 仅限 textarea(整改/验收意见)；模板无裸 && || < >；禁止 SVG；根 <div class="page">
window.Pages = window.Pages || {};
window.Pages.work_order_detail = {
  name: 'work_order_detail',
  props: ['query'],
  data: function () {
    return {
      loading: true,
      error: '',
      id: '',
      data: null,
      rectifyDesc: '',
      rectifyPhotos: [],
      verifyPass: null,
      verifyDesc: '',
      verifyPhotos: [],
      actioning: false
    };
  },
  computed: {
    isPending: function () { return !!(this.data && this.data.status === 'pending'); },
    isVerifyStage: function () { return !!(this.data && this.data.status === 'rectifying'); },
    isClosed: function () { return !!(this.data && this.data.status === 'closed'); },
    orderNo: function () { return this.data ? (this.data.order_no || ('工单 #' + this.data.id)) : ''; },
    hazardDescText: function () {
      if (!this.data) return '';
      return this.data.hazard_desc || this.data.hazard_description || '（无隐患描述）';
    },
    deviceText: function () {
      if (!this.data) return '无';
      return this.data.device_name || this.data.device_code || ('设备 #' + (this.data.device_id || '')) || '无';
    },
    riskLevel: function () {
      var lv = String((this.data && this.data.risk_level) || '').toLowerCase();
      if (lv === 'high') lv = 'critical';
      if (lv === 'medium' || lv === 'mid') lv = 'major';
      if (['critical', 'major', 'general', 'low'].indexOf(lv) < 0) lv = 'low';
      return lv;
    },
    riskTagClass: function () {
      var m = { critical: 'tag-critical', major: 'tag-major', general: 'tag-general', low: 'tag-low' };
      return m[this.riskLevel] || 'tag-low';
    },
    riskLabel: function () {
      var m = { critical: '重大', major: '较大', general: '一般', low: '低' };
      return m[this.riskLevel] || '低';
    },
    statusTagClass: function () {
      var s = this.data ? this.data.status : '';
      var m = { pending: 'tag-pending', rectifying: 'tag-info', verifying: 'tag-warning', closed: 'tag-ok' };
      return m[String(s || '')] || 'tag-pending';
    },
    statusLabel: function () {
      var s = this.data ? this.data.status : '';
      var m = { pending: '待整改', rectifying: '整改中', verifying: '待验收', closed: '已关闭' };
      return m[String(s || '')] || '待处理';
    },
    createTimeText: function () { return this.data ? utils.formatDateTime(this.data.created_at || this.data.createdAt) : ''; },
    rectifyInfoText: function () { return (this.data && this.data.rectify_description) ? this.data.rectify_description : '（未填写）'; },
    verifyResultText: function () {
      if (!this.data) return '-';
      if (this.data.verify_pass === true) return '通过';
      if (this.data.verify_pass === false) return '不通过';
      return '-';
    },
    rectifyPhotoList: function () { return this.parsePhotos(this.data && this.data.rectify_photos); },
    verifyPhotoList: function () { return this.parsePhotos(this.data && this.data.verify_photos); },
    canAddRectify: function () { return this.rectifyPhotos.length < 6; },
    canAddVerify: function () { return this.verifyPhotos.length < 6; },
    showError: function () { return !!this.error && !this.data; }
  },
  methods: {
    parsePhotos: function (p) {
      if (!p) return [];
      if (Array.isArray(p)) return p;
      try { return JSON.parse(p); } catch (e) { return []; }
    },
    load: function () {
      var self = this;
      self.id = (self.query && self.query.id) || '';
      if (!self.id) { self.loading = false; self.error = '缺少工单 ID'; return Promise.resolve(); }
      self.loading = true;
      self.error = '';
      return api.getWorkOrder(self.id).then(function (d) {
        self.data = (d && d.data) ? d.data : d;
        self.rectifyDesc = '';
        self.rectifyPhotos = [];
        self.verifyPass = null;
        self.verifyDesc = '';
        self.verifyPhotos = [];
      }).catch(function (e) {
        self.error = (e && e.message) ? e.message : '加载失败';
      }).then(function () {
        self.loading = false;
      });
    },
    goHazard: function () { if (this.data && this.data.hazard_id) utils.go('/hazard_detail?id=' + this.data.hazard_id); },
    goDevice: function () { if (this.data && this.data.device_id) utils.go('/device_detail?id=' + this.data.device_id); },
    orDash: function (v) { return v || '-'; },
    timeText: function (v) { return utils.formatDateTime(v); },
    addRectifyPhoto: function () {
      var self = this;
      utils.chooseImage(6 - self.rectifyPhotos.length).then(function (urls) {
        self.rectifyPhotos = self.rectifyPhotos.concat(urls);
      }).catch(function () {});
    },
    removeRectifyPhoto: function (idx) { this.rectifyPhotos.splice(idx, 1); },
    addVerifyPhoto: function () {
      var self = this;
      utils.chooseImage(6 - self.verifyPhotos.length).then(function (urls) {
        self.verifyPhotos = self.verifyPhotos.concat(urls);
      }).catch(function () {});
    },
    removeVerifyPhoto: function (idx) { this.verifyPhotos.splice(idx, 1); },
    setVerifyPass: function (v) { this.verifyPass = v; },
    passClass: function (v) {
      if (this.verifyPass === null) return '';
      return this.verifyPass === v ? (v ? 'btn-primary' : 'btn-danger') : 'btn-o';
    },
    submitRectify: function () {
      var self = this;
      if (self.actioning) return;
      if (!self.rectifyDesc) { utils.toast('请填写整改描述'); return; }
      self.actioning = true;
      api.submitRectify(self.id, {
        rectifyDescription: self.rectifyDesc,
        rectifyPhotos: self.rectifyPhotos
      }).then(function () {
        utils.toast('整改提交成功');
        return self.load();
      }).catch(function (e) {
        utils.toast((e && e.message) || '提交失败');
      }).then(function () {
        self.actioning = false;
      });
    },
    submitVerify: function () {
      var self = this;
      if (self.actioning) return;
      if (self.verifyPass === null) { utils.toast('请选择验收结论'); return; }
      if (!self.verifyDesc) { utils.toast('请填写验收意见'); return; }
      self.actioning = true;
      api.verifyWorkOrder(self.id, {
        verifyDescription: self.verifyDesc,
        pass: self.verifyPass,
        verifyResult: self.verifyPass
      }).then(function () {
        utils.toast(self.verifyPass ? '验收通过，工单已闭环' : '已打回待整改');
        return self.load();
      }).catch(function (e) {
        utils.toast((e && e.message) || '提交失败');
      }).then(function () {
        self.actioning = false;
      });
    }
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
    <template v-else-if="data">

      <div class="card" :style="{ borderLeft: '4px solid var(--primary)' }">
        <div class="card-h" style="margin-bottom:8px">
          <span class="card-t">{{ orderNo }}</span>
          <span class="tag" :class="statusTagClass">{{ statusLabel }}</span>
        </div>
        <div class="detail-row"><span class="dk">关联隐患</span><span class="dv link" style="color:var(--primary)" @click="goHazard">隐患 #{{ data.hazard_id }} ›</span></div>
        <div class="detail-row"><span class="dk">设备信息</span><span class="dv link" style="color:var(--primary)" @click="goDevice">{{ deviceText }} ›</span></div>
        <div class="detail-row"><span class="dk">创建时间</span><span class="dv">{{ createTimeText }}</span></div>
      </div>

      <div class="card">
        <div class="card-h"><span class="card-t">📌 隐患信息</span></div>
        <div class="detail-row"><span class="dk">隐患描述</span><span class="dv">{{ hazardDescText }}</span></div>
        <div class="detail-row"><span class="dk">风险等级</span><span class="dv"><span class="tag" :class="riskTagClass">{{ riskLabel }}</span></span></div>
      </div>

      <!-- pending：整改表单 -->
      <div v-if="isPending" class="card">
        <div class="card-h"><span class="card-t">🔧 填写整改</span></div>
        <label class="form-label">整改描述 <span style="color:var(--danger)">*</span></label>
        <textarea class="fi-input" v-model="rectifyDesc" placeholder="请填写整改情况、处理措施与结果"></textarea>
        <label class="form-label" style="margin-top:10px">整改照片（最多 6 张）</label>
        <div class="photo-wall">
          <div v-for="(p,idx) in rectifyPhotos" :key="idx" class="photo-item">
            <img :src="p" />
            <div class="photo-del" @click="removeRectifyPhoto(idx)" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);color:#fff;border-radius:50%;width:18px;height:18px;text-align:center;line-height:18px;font-size:12px">×</div>
          </div>
          <div v-if="canAddRectify" class="photo-add" @click="addRectifyPhoto">＋</div>
        </div>
        <button class="btn-primary" style="margin-top:12px" :disabled="actioning" @click="submitRectify">{{ actioning ? '提交中...' : '去整改 · 提交' }}</button>
      </div>

      <!-- rectifying：验收表单 -->
      <div v-if="isVerifyStage" class="card">
        <div class="card-h"><span class="card-t">✅ 验收处理</span></div>
        <label class="form-label">验收结论 <span style="color:var(--danger)">*</span></label>
        <div class="btn-row" style="margin-top:0">
          <button class="btn" :class="passClass(true)" @click="setVerifyPass(true)">验收通过</button>
          <button class="btn" :class="passClass(false)" @click="setVerifyPass(false)">验收不通过</button>
        </div>
        <label class="form-label" style="margin-top:10px">验收意见 <span style="color:var(--danger)">*</span></label>
        <textarea class="fi-input" v-model="verifyDesc" placeholder="请填写验收意见（通过或不通过均须填写）"></textarea>
        <label class="form-label" style="margin-top:10px">验收照片</label>
        <div class="photo-wall">
          <div v-for="(p,idx) in verifyPhotos" :key="idx" class="photo-item">
            <img :src="p" />
            <div class="photo-del" @click="removeVerifyPhoto(idx)" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);color:#fff;border-radius:50%;width:18px;height:18px;text-align:center;line-height:18px;font-size:12px">×</div>
          </div>
          <div v-if="canAddVerify" class="photo-add" @click="addVerifyPhoto">＋</div>
        </div>
        <button class="btn-primary" style="margin-top:12px" :disabled="actioning" @click="submitVerify">{{ actioning ? '提交中...' : '去验收 · 提交' }}</button>
      </div>

      <!-- closed：完整闭环信息 -->
      <div v-if="isClosed" class="card">
        <div class="card-h"><span class="card-t">✅ 整改信息</span></div>
        <div class="detail-row"><span class="dk">整改描述</span><span class="dv">{{ rectifyInfoText }}</span></div>
        <div class="detail-row"><span class="dk">整改人</span><span class="dv">{{ orDash(data.rectify_by_name) }}</span></div>
        <div class="detail-row"><span class="dk">整改时间</span><span class="dv">{{ timeText(data.rectify_at) }}</span></div>
        <div v-if="rectifyPhotoList.length" class="detail-row"><span class="dk">整改照片</span><span class="dv">{{ rectifyPhotoList.length }} 张</span></div>
      </div>
      <div v-if="isClosed" class="card">
        <div class="card-h"><span class="card-t">🔍 验收信息</span></div>
        <div class="detail-row"><span class="dk">验收结论</span><span class="dv">{{ verifyResultText }}</span></div>
        <div class="detail-row"><span class="dk">验收意见</span><span class="dv">{{ orDash(data.verify_description) }}</span></div>
        <div class="detail-row"><span class="dk">验收人</span><span class="dv">{{ orDash(data.verify_by_name) }}</span></div>
        <div class="detail-row"><span class="dk">验收时间</span><span class="dv">{{ timeText(data.verify_at) }}</span></div>
        <div v-if="verifyPhotoList.length" class="detail-row"><span class="dk">验收照片</span><span class="dv">{{ verifyPhotoList.length }} 张</span></div>
      </div>

    </template>
    <div v-else class="empty-wrap"><div class="em-ic">🔍</div><div class="em-tip">未找到工单数据</div></div>
  </div>
  `
};
