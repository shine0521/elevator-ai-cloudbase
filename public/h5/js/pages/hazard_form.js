// 隐患上报 → H5（Vue3 global build，按契约 v2 重写）
// 设备选择（api.get('/api/devices',{search}) 或扫码）→ 隐患类型 → 描述 → L/S/E 数字输入
// 页面端实时用 L*S*E 算 risk_B/risk_level/deadline 预览；提交仍把 lseL/lseS/lseE 传给后端
// api.createHazard({deviceId,hazardType,description,lseL,lseS,lseE,rectifyAdvice,rectifyOwnerId,photos,gpsLocation})
// 后端响应 {success,hazardNo,risk:{B,level,deadline}}（无 id，自动建工单）→ 回 /hazard
window.Pages = window.Pages || {};
window.Pages.hazard_form = {
  name: 'hazard_form',
  props: ['query'],
  data: function () {
    return {
      loading: false,
      submitting: false,
      error: '',
      deviceList: [],
      deviceSearch: '',
      form: { deviceId: '', deviceName: '', hazardType: '', description: '', rectifyOwnerId: '' },
      lseL: 3,
      lseS: 3,
      lseE: 3,
      rectifyAdvice: '',
      photos: [],
      hazardTypes: ['设备', '环境', '人员', '管理']
    };
  },
  computed: {
    // 风险值 B = L * S * E
    riskB: function () {
      var l = Number(this.lseL) || 0;
      var s = Number(this.lseS) || 0;
      var e = Number(this.lseE) || 0;
      return l * s * e;
    },
    // 风险等级（契约：B<=4 low/30天，<=9 general/15天，<=19 major/7天，>19 critical/3天）
    riskLevel: function () {
      var b = this.riskB;
      if (b <= 4) return 'low';
      if (b <= 9) return 'general';
      if (b <= 19) return 'major';
      return 'critical';
    },
    riskTagClass: function () {
      var m = { low: 'tag-low', general: 'tag-general', major: 'tag-major', critical: 'tag-critical' };
      return m[this.riskLevel] || 'tag-low';
    },
    riskLabel: function () {
      var m = { low: '低', general: '一般', major: '较大', critical: '重大' };
      return m[this.riskLevel] || '低';
    },
    deadlineDays: function () {
      var m = { low: 30, general: 15, major: 7, critical: 3 };
      return m[this.riskLevel] || 30;
    },
    deadlineText: function () { return this.deadlineDays + ' 天'; },
    canAddPhoto: function () { return this.photos.length < 6; },
    deviceEmpty: function () { return this.deviceList.length === 0; },
    showDeviceHint: function () { return this.deviceEmpty && !this.form.deviceId; }
  },
  methods: {
    load: function () { this.loadDevices(); },
    // 设备搜索：GET /api/devices?search=
    loadDevices: function () {
      var self = this;
      api.get('/api/devices', { search: this.deviceSearch }).then(function (d) {
        var arr = d && d.data;
        self.deviceList = Array.isArray(arr) ? arr : (Array.isArray(d) ? d : []);
      }).catch(function () {
        // 设备加载失败静默处理，可改用扫码 / 手动输入设备号
        self.deviceList = [];
      });
    },
    doSearch: function () { this.loadDevices(); },
    onScan: async function () {
      try {
        var code = await utils.scanCode();
        try {
          var dev = await api.scanDevice(code);
          var d = dev.data || dev;
          this.form.deviceId = (d && (d.id || d.device_id)) || code;
          this.form.deviceName = (d && (d.device_name || d.name)) || code;
        } catch (e) {
          this.form.deviceId = code;
          this.form.deviceName = '设备 ' + code;
        }
        utils.toast('已选择设备');
      } catch (e) { /* 取消扫码 */ }
    },
    selectDevice: function (d) {
      this.form.deviceId = d.id || d.device_id || d.device_code || '';
      this.form.deviceName = d.device_name || d.name || d.device_code || '未命名设备';
    },
    selStyle: function (d) {
      var on = this.form.deviceId === (d.id || d.device_id);
      return on ? { background: 'var(--primary-light)', borderColor: 'var(--primary)' } : {};
    },
    isDeviceOn: function (d) { return this.form.deviceId === (d.id || d.device_id); },
    devName: function (d) { return d.device_name || d.name || d.device_code || '未命名设备'; },
    devSub: function (d) { return ((d.device_code || d.code || '') + ' ' + (d.location || '')).trim(); },
    // L/S/E 数字输入（1-5），@input 夹紧并重写，避免 v-model 字符串问题
    onLse: function (which, e) {
      var v = parseInt(e.target.value, 10);
      if (isNaN(v)) v = 1;
      if (v < 1) v = 1;
      if (v > 5) v = 5;
      if (which === 'L') this.lseL = v;
      else if (which === 'S') this.lseS = v;
      else this.lseE = v;
    },
    onTakePhoto: async function () {
      try {
        var photos = await utils.chooseImage(6);
        this.photos = this.photos.concat(photos).slice(0, 6);
      } catch (e) { /* 取消 */ }
    },
    removePhoto: function (idx) { this.photos.splice(idx, 1); },
    doSubmit: async function () {
      if (this.submitting) return;
      if (!this.form.deviceId) { utils.toast('请先选择设备'); return; }
      if (!this.form.hazardType) { utils.toast('请选择隐患类型'); return; }
      if (!this.form.description) { utils.toast('请填写隐患描述'); return; }
      this.submitting = true;
      this.error = '';
      var self = this;
      try {
        var gps = {};
        try { gps = await utils.getLocation(); } catch (e) { gps = {}; }
        var payload = {
          deviceId: self.form.deviceId,
          hazardType: self.form.hazardType,
          description: self.form.description,
          lseL: Number(self.lseL),
          lseS: Number(self.lseS),
          lseE: Number(self.lseE),
          rectifyAdvice: self.rectifyAdvice,
          rectifyOwnerId: self.form.rectifyOwnerId,
          photos: self.photos,
          gpsLocation: gps
        };
        var res = await api.createHazard(payload);
        utils.toast('隐患上报成功，已自动生成整改工单');
        // 后端不返回 id，仅返回 hazardNo → 回列表；若返回 id 则进详情
        var target = (res && res.id) ? ('/hazard_detail?id=' + res.id) : '/hazard';
        utils.go(target);
      } catch (e) {
        self.error = (e && e.message) ? e.message : '提交失败，请重试';
        utils.toast(self.error);
      } finally {
        self.submitting = false;
      }
    }
  },
  mounted: function () { this.load(); },
  template: `
  <div class="page">
    <div v-if="loading" class="loading-wrap"><span class="spinner"></span><span>加载中...</span></div>
    <template v-else>
      <!-- ① 选择设备 -->
      <div class="card">
        <div class="card-h"><span class="card-t">① 选择设备</span></div>
        <div class="search-bar">
          <input type="text" v-model="deviceSearch" placeholder="输入设备名称 / 编号搜索" />
          <button class="btn-sm" @click="doSearch">搜索</button>
        </div>
        <button class="btn-ghost" style="margin-top:8px" @click="onScan">📷 扫码选择设备</button>
        <div v-if="deviceList.length" class="list" style="margin-top:10px">
          <div v-for="(d, i) in deviceList" :key="d.id || i" class="list-item" :style="selStyle(d)" @click="selectDevice(d)">
            <div class="li-icon">🛗</div>
            <div class="li-body">
              <div class="li-title">{{ devName(d) }}</div>
              <div class="li-sub">{{ devSub(d) }}</div>
            </div>
            <div class="li-extra"><span v-if="isDeviceOn(d)" class="tag tag-ok">已选</span></div>
          </div>
        </div>
        <div v-if="form.deviceId" class="rr ok" style="margin-top:10px"><span class="ri">✅</span><div class="rc">已选设备：{{ form.deviceName }}</div></div>
        <div v-if="showDeviceHint" class="empty-wrap" style="padding:24px 0"><div class="em-tip">输入关键字搜索设备，或扫码选择</div></div>
      </div>

      <!-- ② 隐患信息 -->
      <div class="card">
        <div class="card-h"><span class="card-t">② 隐患信息</span></div>
        <div class="form-item">
          <label class="form-label">隐患类型 <span class="req" style="color:var(--danger)">*</span></label>
          <select class="fi-input" v-model="form.hazardType">
            <option value="" disabled>请选择隐患类型</option>
            <option v-for="t in hazardTypes" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <div class="form-item">
          <label class="form-label">隐患描述 <span class="req" style="color:var(--danger)">*</span></label>
          <textarea class="fi-input" v-model="form.description" placeholder="请详细描述隐患情况（位置、现象、可能后果）"></textarea>
        </div>
      </div>

      <!-- ③ LSE 风险评估 -->
      <div class="card">
        <div class="card-h"><span class="card-t">③ 风险评估（L × S × E）</span></div>
        <p class="muted" style="font-size:12px;margin:0 0 10px">风险值 R = L(可能性) × S(严重性) × E(暴露频次)，数值范围 1-5</p>
        <div class="form-item">
          <label class="form-label">L 发生可能性 (1-5)</label>
          <input class="fi-input" type="number" min="1" max="5" :value="lseL" @input="onLse('L', $event)" />
        </div>
        <div class="form-item">
          <label class="form-label">S 后果严重性 (1-5)</label>
          <input class="fi-input" type="number" min="1" max="5" :value="lseS" @input="onLse('S', $event)" />
        </div>
        <div class="form-item">
          <label class="form-label">E 暴露频次 (1-5)</label>
          <input class="fi-input" type="number" min="1" max="5" :value="lseE" @input="onLse('E', $event)" />
        </div>
        <div class="rr mb" :style="{ borderLeft: '4px solid var(--primary)' }">
          <div class="rc">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span class="tag" :class="riskTagClass">{{ riskLabel }}</span>
              <span class="muted">风险值 R = L × S × E = <b style="color:var(--primary);font-size:18px">{{ riskB }}</b></span>
            </div>
            <div class="muted">整改期限：{{ deadlineText }}</div>
          </div>
        </div>
      </div>

      <!-- ④ 整改信息（可选） -->
      <div class="card">
        <div class="card-h"><span class="card-t">④ 整改信息（可选）</span></div>
        <div class="form-item">
          <label class="form-label">整改建议</label>
          <textarea class="fi-input" v-model="rectifyAdvice" placeholder="请输入整改建议"></textarea>
        </div>
        <div class="form-item">
          <label class="form-label">整改责任人（姓名 / 工号）</label>
          <input class="fi-input" type="text" v-model="form.rectifyOwnerId" placeholder="选填" />
        </div>
        <div class="form-item">
          <label class="form-label">现场照片（最多 6 张）</label>
          <div class="photo-wall">
            <div v-for="(p, idx) in photos" :key="idx" class="photo-item">
              <img :src="p" />
              <div class="photo-del" @click="removePhoto(idx)" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);color:#fff;border-radius:50%;width:18px;height:18px;text-align:center;line-height:18px;font-size:12px">×</div>
            </div>
            <div v-if="canAddPhoto" class="photo-add" @click="onTakePhoto">＋</div>
          </div>
        </div>
      </div>

      <div v-if="error" class="rr ng" style="margin:12px"><span class="ri">⚠️</span><div class="rc">{{ error }}</div></div>

      <div style="padding:12px">
        <button class="btn-primary" :disabled="submitting" @click="doSubmit">{{ submitting ? '提交中...' : '提交上报' }}</button>
      </div>
    </template>
  </div>
  `
};
