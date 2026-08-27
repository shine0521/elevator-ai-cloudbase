// 整改工单详情 → H5（Vue3 全局构建，按契约重写）
// 契约 #14：pending→填写整改描述(rectifyDescription)+照片→api.submitRectify(id,{rectifyDescription,rectifyPhotos})
//           rectifying/verifying→验收通过/不通过：api.post('/api/mobile/work-orders/'+id+'/verify',{verifyDescription,verifyPhotos,pass})
//           pass=true→closed，pass=false→打回 pending
// 铁律：v-model 仅限 textarea(整改/验收意见)；动态键字段无；模板无裸 && || < >；禁止 SVG
window.Pages = window.Pages || {};
window.Pages.work_order_detail = {
  name: 'work_order_detail',
  props: ['query'],
  data: function () {
    return {
      loading: true,
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
    isPending: function () {
      return !!(this.data && this.data.status === 'pending');
    },
    isVerifyStage: function () {
      return !!(this.data && (this.data.status === 'rectifying' || this.data.status === 'verifying'));
    },
    isClosed: function () {
      return !!(this.data && this.data.status === 'closed');
    },
    orderNo: function () {
      if (!this.data) return '';
      return this.data.order_no || ('工单 #' + this.data.id);
    },
    hazardText: function () {
      if (!this.data || !this.data.hazard_id) return '无';
      return '隐患 #' + this.data.hazard_id;
    },
    deviceText: function () {
      if (!this.data) return '无';
      return this.data.device_name || this.data.device_code || ('设备 #' + this.data.device_id) || '无';
    },
    hazardDescText: function () {
      if (!this.data) return '';
      return this.data.hazard_desc || this.data.hazard_description || '（无隐患描述）';
    },
    riskText: function () {
      return this.data ? this.riskLabel(this.data.risk_level) : '';
    },
    rectifyInfoText: function () {
      if (!this.data || !this.data.rectify_description) return '（未填写）';
      return this.data.rectify_description;
    },
    createTimeText: function () {
      return this.data ? utils.formatDateTime(this.data.created_at || this.data.createdAt) : '';
    },
    verifyResultText: function () {
      if (!this.data) return '-';
      if (this.data.verify_pass === true) return '通过';
      if (this.data.verify_pass === false) return '不通过';
      return '-';
    },
    rectifyPhotoList: function () {
      return this.parsePhotos(this.data && this.data.rectify_photos);
    },
    verifyPhotoList: function () {
      return this.parsePhotos(this.data && this.data.verify_photos);
    },
    canAddRectify: function () {
      return this.rectifyPhotos.length < 6;
    },
    canAddVerify: function () {
      return this.verifyPhotos.length < 6;
    }
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
      if (!self.id) {
        utils.go('/work_order');
        return Promise.resolve();
      }
      self.loading = true;
      return api.getWorkOrder(self.id).then(function (d) {
        self.data = (d && d.data) ? d.data : d;
        self.rectifyDesc = '';
        self.rectifyPhotos = [];
        self.verifyPass = null;
        self.verifyDesc = '';
        self.verifyPhotos = [];
      }).catch(function (e) {
        utils.toast((e && e.message) || '加载失败');
      }).then(function () {
        self.loading = false;
      });
    },
    goHazard: function () {
      if (this.data && this.data.hazard_id) utils.go('/hazard_detail?id=' + this.data.hazard_id);
    },
    goDevice: function () {
      if (this.data && this.data.device_id) utils.go('/device_detail?id=' + this.data.device_id);
    },
    orDash: function (v) {
      return v || '-';
    },
    timeText: function (v) {
      return utils.formatDateTime(v);
    },
    riskLabel: function (level) {
      var lv = String(level || '').toLowerCase();
      if (lv === 'high') lv = 'critical';
      if (lv === 'medium' || lv === 'mid') lv = 'major';
      if (['critical', 'major', 'general', 'low'].indexOf(lv) < 0) lv = 'low';
      var m = { critical: '重大', major: '较大', general: '一般', low: '低' };
      return m[lv] || '低';
    },
    riskClass: function (level) {
      var lv = String(level || '').toLowerCase();
      if (lv === 'high') lv = 'critical';
      if (lv === 'medium' || lv === 'mid') lv = 'major';
      if (['critical', 'major', 'general', 'low'].indexOf(lv) < 0) lv = 'low';
      var m = { critical: 'badge-red', major: 'badge-orange', general: 'badge-yellow', low: 'badge-green' };
      return m[lv] || 'badge-gray';
    },
    statusLabel: function (s) {
      var m = { pending: '待整改', rectifying: '整改中', verifying: '待验收', closed: '已关闭' };
      return m[s] || s || '';
    },
    statusClass: function (s) {
      var m = { pending: 'badge-orange', rectifying: 'badge-blue', verifying: 'badge-green', closed: 'badge-gray' };
      return m[s] || 'badge-gray';
    },
    addRectifyPhoto: function () {
      var self = this;
      utils.chooseImage(6 - self.rectifyPhotos.length).then(function (urls) {
        self.rectifyPhotos = self.rectifyPhotos.concat(urls);
      }).catch(function () {});
    },
    removeRectifyPhoto: function (idx) {
      this.rectifyPhotos.splice(idx, 1);
    },
    addVerifyPhoto: function () {
      var self = this;
      utils.chooseImage(6 - self.verifyPhotos.length).then(function (urls) {
        self.verifyPhotos = self.verifyPhotos.concat(urls);
      }).catch(function () {});
    },
    removeVerifyPhoto: function (idx) {
      this.verifyPhotos.splice(idx, 1);
    },
    setVerifyPass: function (v) {
      this.verifyPass = v;
    },
    passClass: function (v) {
      if (this.verifyPass === null) return '';
      return this.verifyPass === v ? (v ? 'selected-pass' : 'selected-reject') : '';
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
      api.post('/api/mobile/work-orders/' + self.id + '/verify', {
        verifyDescription: self.verifyDesc,
        verifyPhotos: self.verifyPhotos,
        pass: self.verifyPass
      }).then(function () {
        utils.toast('验收提交成功');
        return self.load();
      }).catch(function (e) {
        utils.toast((e && e.message) || '提交失败');
      }).then(function () {
        self.actioning = false;
      });
    }
  },
  mounted: function () {
    this.load();
  },
  template: `
  <div class="page wod">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <template v-else-if="data">

      <div class="block-title">工单概览</div>
      <div class="card">
        <div class="info-top">
          <span class="info-no">{{ orderNo }}</span>
          <span class="badge" :class="statusClass(data.status)">{{ statusLabel(data.status) }}</span>
        </div>
        <div class="info-row"><span class="label">关联隐患</span><span class="value link" @click="goHazard">{{ hazardText }}</span></div>
        <div class="info-row"><span class="label">设备信息</span><span class="value link" @click="goDevice">{{ deviceText }}</span></div>
        <div class="info-row"><span class="label">创建时间</span><span class="value">{{ createTimeText }}</span></div>
      </div>

      <div class="block-title">隐患信息</div>
      <div class="card">
        <div class="kv"><span class="kv-k">隐患描述</span><span class="kv-v">{{ hazardDescText }}</span></div>
        <div class="kv"><span class="kv-k">风险等级</span><span class="kv-v"><span class="badge" :class="riskClass(data.risk_level)">{{ riskText }}</span></span></div>
      </div>

      <!-- pending：整改表单 -->
      <div v-if="isPending" class="card">
        <div class="block-title">填写整改</div>
        <div class="form-label">整改描述 <span class="req">*</span></div>
        <textarea class="fi-input" v-model="rectifyDesc" placeholder="请填写整改情况"></textarea>
        <div class="form-label" style="margin-top:10px">整改照片（最多 6 张）</div>
        <div class="photo-row">
          <div v-for="(p,idx) in rectifyPhotos" :key="idx" class="photo-wrap">
            <img class="photo-thumb" :src="p" />
            <div class="photo-del" @click="removeRectifyPhoto(idx)">×</div>
          </div>
          <div v-if="canAddRectify" class="photo-add" @click="addRectifyPhoto">＋</div>
        </div>
        <button class="btn-primary" :disabled="actioning" @click="submitRectify">{{ actioning ? '提交中...' : '提交整改' }}</button>
      </div>

      <!-- rectifying/verifying：验收表单 -->
      <div v-if="isVerifyStage" class="card">
        <div class="block-title">验收处理</div>
        <div class="form-label">验收结论 <span class="req">*</span></div>
        <div class="choice-row">
          <div class="choice-btn" :class="passClass(true)" @click="setVerifyPass(true)">验收通过</div>
          <div class="choice-btn" :class="passClass(false)" @click="setVerifyPass(false)">验收不通过</div>
        </div>
        <div class="form-label" style="margin-top:10px">验收意见 <span class="req">*</span></div>
        <textarea class="fi-input" v-model="verifyDesc" placeholder="请填写验收意见"></textarea>
        <div class="form-label" style="margin-top:10px">验收照片</div>
        <div class="photo-row">
          <div v-for="(p,idx) in verifyPhotos" :key="idx" class="photo-wrap">
            <img class="photo-thumb" :src="p" />
            <div class="photo-del" @click="removeVerifyPhoto(idx)">×</div>
          </div>
          <div v-if="canAddVerify" class="photo-add" @click="addVerifyPhoto">＋</div>
        </div>
        <button class="btn-primary" :disabled="actioning" @click="submitVerify">{{ actioning ? '提交中...' : '提交验收' }}</button>
      </div>

      <!-- closed：完整信息 -->
      <div v-if="isClosed" class="card">
        <div class="block-title">整改信息</div>
        <div class="kv"><span class="kv-k">整改描述</span><span class="kv-v">{{ rectifyInfoText }}</span></div>
        <div class="kv"><span class="kv-k">整改人</span><span class="kv-v">{{ orDash(data.rectify_by_name) }}</span></div>
        <div class="kv"><span class="kv-k">整改时间</span><span class="kv-v">{{ timeText(data.rectify_at) }}</span></div>
        <div class="photo-row" v-if="rectifyPhotoList.length">
          <img v-for="(p,i) in rectifyPhotoList" :key="i" class="photo-thumb" :src="p" />
        </div>
        <div class="block-title">验收信息</div>
        <div class="kv"><span class="kv-k">验收结论</span><span class="kv-v">{{ verifyResultText }}</span></div>
        <div class="kv"><span class="kv-k">验收意见</span><span class="kv-v">{{ orDash(data.verify_description) }}</span></div>
        <div class="kv"><span class="kv-k">验收人</span><span class="kv-v">{{ orDash(data.verify_by_name) }}</span></div>
        <div class="kv"><span class="kv-k">验收时间</span><span class="kv-v">{{ timeText(data.verify_at) }}</span></div>
        <div class="photo-row" v-if="verifyPhotoList.length">
          <img v-for="(p,i) in verifyPhotoList" :key="i" class="photo-thumb" :src="p" />
        </div>
      </div>

    </template>
  </div>
  `
};
