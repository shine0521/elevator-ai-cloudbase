// 整改工单详情 → H5 (Vue3 global build)
// GET /api/mobile/work-orders/:id
// 整改 POST /api/mobile/work-orders/:id/rectify   { rectifyDescription, rectifyPhotos }
// 验收 POST /api/mobile/work-orders/:id/verify     { verifyPass, verifyDescription, verifyPhotos }
// 状态机：pending(整改表单) → rectifying(已填整改+提交验收) → verifying(验收表单) → closed(完整信息)
// Vue 模板安全：逻辑全部在 computed / methods，模板内无 && || 裸& > <
window.Pages = window.Pages || {};
window.Pages.work_order_detail = {
  template: `
  <div class="page wod">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <template v-else-if="data">

      <!-- 工单概览 -->
      <div class="section-title">工单概览</div>
      <div class="card">
        <div class="info-top">
          <span class="info-no">{{ orderNo }}</span>
          <span class="status-badge" :class="statusClass(data.status)">{{ statusLabel(data.status) }}</span>
        </div>
        <div class="info-row"><span class="label">关联隐患</span><span class="value link" @click="goHazard">{{ hazardText }}</span></div>
        <div class="info-row"><span class="label">设备信息</span><span class="value link" @click="goDevice">{{ deviceText }}</span></div>
        <div class="info-row"><span class="label">创建时间</span><span class="value">{{ createTimeText }}</span></div>
      </div>

      <!-- 整改阶段 -->
      <div class="section-title">整改阶段</div>

      <!-- pending：整改表单 -->
      <div v-if="showRectifyForm" class="card">
        <div class="form-label">整改描述 <span class="req">*</span></div>
        <textarea class="textarea" v-model="rectifyDesc" placeholder="请填写整改情况"></textarea>
        <div class="form-label" style="margin-top:10px">整改照片（最多6张）</div>
        <div class="photo-row">
          <div v-for="(p,idx) in rectifyFormPhotos" :key="idx" class="photo-wrap">
            <img class="photo-thumb" :src="p" />
            <div class="photo-del" @click="removeRectifyPhoto(idx)">×</div>
          </div>
          <label v-if="canAddRectifyPhoto" class="photo-add">＋
            <input type="file" accept="image/*" multiple class="photo-input" @change="onPhotoChange($event,'rectifyFormPhotos')" />
          </label>
        </div>
        <button class="btn-primary" :disabled="actioning" @click="onSubmitRectify">{{ actioning ? '提交中...' : '提交整改' }}</button>
      </div>

      <!-- rectifying：已填整改信息 + 提交验收 -->
      <div v-if="showRectifying" class="card">
        <div class="block-title">整改信息</div>
        <div class="kv"><span class="kv-k">整改描述</span><span class="kv-v">{{ rectifyInfoText }}</span></div>
        <div class="kv"><span class="kv-k">整改人</span><span class="kv-v">{{ orDash(data.rectify_by) }}</span></div>
        <div class="kv"><span class="kv-k">整改时间</span><span class="kv-v">{{ timeText(data.rectify_at) }}</span></div>
        <div class="photo-row" v-if="rectifyPhotos.length">
          <img v-for="(p,i) in rectifyPhotos" :key="i" class="photo-thumb" :src="p" />
        </div>
        <button class="btn-primary" :disabled="actioning" @click="onSubmitForVerify">{{ actioning ? '提交中...' : '提交验收' }}</button>
      </div>

      <!-- verifying：验收表单 -->
      <div v-if="showVerifyForm" class="card">
        <div class="form-label">验收结论 <span class="req">*</span></div>
        <div class="choice-row">
          <div class="choice-btn" :class="passClass(true)" @click="setVerifyPass(true)">验收通过</div>
          <div class="choice-btn" :class="passClass(false)" @click="setVerifyPass(false)">验收不通过</div>
        </div>
        <div class="form-label" style="margin-top:10px">验收意见 <span class="req">*</span></div>
        <textarea class="textarea" v-model="verifyDesc" placeholder="请填写验收意见"></textarea>
        <div class="form-label" style="margin-top:10px">验收照片</div>
        <div class="photo-row">
          <div v-for="(p,idx) in verifyFormPhotos" :key="idx" class="photo-wrap">
            <img class="photo-thumb" :src="p" />
            <div class="photo-del" @click="removeVerifyPhoto(idx)">×</div>
          </div>
          <label v-if="canAddVerifyPhoto" class="photo-add">＋
            <input type="file" accept="image/*" multiple class="photo-input" @change="onPhotoChange($event,'verifyFormPhotos')" />
          </label>
        </div>
        <button class="btn-primary" :disabled="actioning" @click="onSubmitVerify">{{ actioning ? '提交中...' : '提交验收' }}</button>
      </div>

      <!-- closed：完整信息 -->
      <div v-if="showClosed" class="card closed-card">
        <div class="closed-big">已关闭</div>
        <div class="block-title">整改信息</div>
        <div class="kv"><span class="kv-k">整改描述</span><span class="kv-v">{{ rectifyInfoText }}</span></div>
        <div class="kv"><span class="kv-k">整改人</span><span class="kv-v">{{ orDash(data.rectify_by) }}</span></div>
        <div class="kv"><span class="kv-k">整改时间</span><span class="kv-v">{{ timeText(data.rectify_at) }}</span></div>
        <div class="photo-row" v-if="rectifyPhotos.length">
          <img v-for="(p,i) in rectifyPhotos" :key="i" class="photo-thumb" :src="p" />
        </div>
        <div class="block-title">验收信息</div>
        <div class="kv"><span class="kv-k">验收结论</span><span class="kv-v">{{ verifyResultText }}</span></div>
        <div class="kv"><span class="kv-k">验收意见</span><span class="kv-v">{{ orDash(data.verify_description) }}</span></div>
        <div class="kv"><span class="kv-k">验收人</span><span class="kv-v">{{ orDash(data.verify_by) }}</span></div>
        <div class="kv"><span class="kv-k">验收时间</span><span class="kv-v">{{ timeText(data.verify_at) }}</span></div>
        <div class="photo-row" v-if="verifyPhotos.length">
          <img v-for="(p,i) in verifyPhotos" :key="i" class="photo-thumb" :src="p" />
        </div>
      </div>

    </template>

  </div>
  `,
  data: function () {
    return {
      loading: true,
      id: '',
      data: null,
      rectifyDesc: '',
      rectifyFormPhotos: [],
      verifyPass: null,
      verifyDesc: '',
      verifyFormPhotos: [],
      actioning: false
    };
  },
  computed: {
    canRectify: function () {
      return !!(this.data && this.data.status === 'pending');
    },
    canVerify: function () {
      return !!(this.data && this.data.status === 'verifying');
    },
    showRectifyForm: function () {
      return this.canRectify;
    },
    showVerifyForm: function () {
      return this.canVerify;
    },
    showRectifying: function () {
      return !!(this.data && this.data.status === 'rectifying');
    },
    showClosed: function () {
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
    rectifyInfoText: function () {
      if (!this.data || !this.data.rectify_description) return '（未填写）';
      return this.data.rectify_description;
    },
    createTimeText: function () {
      if (!this.data) return '';
      return utils.formatDateTime(this.data.created_at || this.data.createdAt);
    },
    verifyResultText: function () {
      if (!this.data) return '-';
      if (this.data.verify_pass === true) return '通过';
      if (this.data.verify_pass === false) return '不通过';
      return '-';
    },
    canAddRectifyPhoto: function () {
      return this.rectifyFormPhotos.length < 6;
    },
    canAddVerifyPhoto: function () {
      return this.verifyFormPhotos.length < 6;
    },
    rectifyPhotos: function () {
      var p = this.data && this.data.rectify_photos;
      if (!p) return [];
      try { return JSON.parse(p); } catch (e) { return []; }
    },
    verifyPhotos: function () {
      var p = this.data && this.data.verify_photos;
      if (!p) return [];
      try { return JSON.parse(p); } catch (e) { return []; }
    }
  },
  mounted: function () {
    this.id = (this.query && this.query.id) || '';
    if (!this.id) { utils.go('/work_order'); return; }
    this.reload();
  },
  methods: {
    reload: async function () {
      try {
        var d = await api.get('/api/mobile/work-orders/' + this.id);
        this.data = (d && d.data) ? d.data : d;
        this.rectifyDesc = '';
        this.rectifyFormPhotos = [];
        this.verifyPass = null;
        this.verifyDesc = '';
        this.verifyFormPhotos = [];
      } catch (e) {
        utils.toast((e && e.message) || '加载失败');
      } finally {
        this.loading = false;
      }
    },

    goHazard: function () {
      if (this.data && this.data.hazard_id) utils.go('/hazard_form?id=' + this.data.hazard_id);
    },
    goDevice: function () {
      if (this.data && this.data.device_id) utils.go('/device_detail?id=' + this.data.device_id);
    },

    orDash: function (v) { return v || '-'; },
    timeText: function (v) { return utils.formatDateTime(v); },

    statusLabel: function (s) {
      var m = { pending: '待整改', rectifying: '整改中', verifying: '待验收', closed: '已关闭' };
      return m[s] || s || '';
    },
    statusClass: function (s) {
      var m = { pending: 'tag-warn', rectifying: 'tag-info', verifying: 'tag-primary', closed: 'tag-gray' };
      return m[s] || 'tag-gray';
    },

    onPhotoChange: function (e, key) {
      var files = Array.prototype.slice.call(e.target.files || []);
      var self = this;
      files.forEach(function (f) { self[key].push(URL.createObjectURL(f)); });
      this[key] = this[key].slice(0, 6);
      if (e.target) e.target.value = '';
    },
    removeRectifyPhoto: function (idx) { this.rectifyFormPhotos.splice(idx, 1); },
    removeVerifyPhoto: function (idx) { this.verifyFormPhotos.splice(idx, 1); },

    setVerifyPass: function (v) { this.verifyPass = v; },
    passClass: function (v) {
      if (this.verifyPass === null) return '';
      return this.verifyPass === v ? (v ? 'selected-pass' : 'selected-reject') : '';
    },

    onSubmitRectify: async function () {
      if (this.actioning) return;
      if (!this.rectifyDesc) { utils.toast('请填写整改描述'); return; }
      this.actioning = true;
      try {
        await api.post('/api/mobile/work-orders/' + this.id + '/rectify', {
          rectifyDescription: this.rectifyDesc,
          rectifyPhotos: this.rectifyFormPhotos
        });
        utils.toast('整改提交成功');
        this.reload();
      } catch (e) {
        utils.toast((e && e.message) || '提交失败');
      } finally {
        this.actioning = false;
      }
    },

    onSubmitForVerify: async function () {
      if (this.actioning) return;
      this.actioning = true;
      try {
        await api.post('/api/mobile/work-orders/' + this.id + '/verify', {
          verifyPass: true,
          verifyDescription: '整改完成，提交验收',
          verifyPhotos: []
        });
        utils.toast('已提交验收');
        this.reload();
      } catch (e) {
        utils.toast((e && e.message) || '提交失败');
      } finally {
        this.actioning = false;
      }
    },

    onSubmitVerify: async function () {
      if (this.actioning) return;
      if (this.verifyPass === null) { utils.toast('请选择验收结论'); return; }
      if (!this.verifyDesc) { utils.toast('请填写验收意见'); return; }
      this.actioning = true;
      try {
        await api.post('/api/mobile/work-orders/' + this.id + '/verify', {
          verifyPass: this.verifyPass,
          verifyDescription: this.verifyDesc,
          verifyPhotos: this.verifyFormPhotos
        });
        utils.toast('验收提交成功');
        this.reload();
      } catch (e) {
        utils.toast((e && e.message) || '提交失败');
      } finally {
        this.actioning = false;
      }
    }
  }
};
