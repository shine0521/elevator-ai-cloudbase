// 隐患上报 → H5（Vue3 global build，按契约 #11 重写）
// 设备选择（api.get('/api/devices',{search}) 或扫码）→ 隐患类型 → 描述 → L/S/E 数字输入
// 页面端实时用 L*S*E 算 risk_B/risk_level/deadline 预览；提交仍把 lseL/lseS/lseE 传给后端
// api.createHazard({deviceId,hazardType,description,lseL,lseS,lseE,rectifyAdvice,rectifyOwnerId,photos,gpsLocation})
window.Pages = window.Pages || {};
window.Pages.hazard_form = {
  name: 'hazard_form',
  props: ['query'],
  data: function () {
    return {
      loading: false,
      submitting: false,
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
    // 风险等级（契约：B<=4 low/30天，<=9 general/15，<=19 major/7，>19 critical/3）
    riskLevel: function () {
      var b = this.riskB;
      if (b <= 4) return 'low';
      if (b <= 9) return 'general';
      if (b <= 19) return 'major';
      return 'critical';
    },
    levelLabel: function () { return utils.levelLabel(this.riskLevel); },
    levelColor: function () { return utils.levelColor(this.riskLevel); },
    deadlineDays: function () {
      var m = { low: 30, general: 15, major: 7, critical: 3 };
      return m[this.riskLevel] || 30;
    },
    deadlineText: function () { return this.deadlineDays + ' 天'; },
    canAddPhoto: function () { return this.photos.length < 6; },
    deviceEmpty: function () { return this.deviceList.length === 0; }
  },
  methods: {
    load: function () { this.loadDevices(); },
    // 设备搜索：契约 api.get('/api/devices',{search})
    loadDevices: function () {
      var self = this;
      api.get('/api/devices', { search: this.deviceSearch }).then(function (d) {
        var arr = d && d.data;
        self.deviceList = Array.isArray(arr) ? arr : (Array.isArray(d) ? d : []);
      }).catch(function () {
        // 设备加载失败静默处理，可改用扫码选择
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
        utils.toast('隐患上报成功');
        // 后端可能返回 id（详情页），否则返回列表
        var target = (res && res.id) ? ('/hazard_detail?id=' + res.id) : '/hazard';
        utils.go(target);
      } catch (e) {
        utils.toast(e && e.message ? e.message : '提交失败');
      } finally {
        self.submitting = false;
      }
    }
  },
  mounted: function () { this.load(); },
  template: `
  <div class="page hf">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <template v-else>
      <!-- ① 设备选择 -->
      <div class="section-title">① 选择设备</div>
      <div class="card">
        <div class="search-row">
          <input class="input" v-model="deviceSearch" placeholder="输入设备名称/编号搜索" />
          <button class="btn-sm" @click="doSearch">搜索</button>
        </div>
        <button class="btn-scan" @click="onScan">扫码选择设备</button>
        <div v-if="deviceList.length" class="dev-list">
          <div v-for="(d, i) in deviceList" :key="d.id || i" class="device-item" :class="isDeviceOn(d) ? 'on' : ''" @click="selectDevice(d)">
            <div class="dev-name">{{ devName(d) }}</div>
            <div class="dev-sub muted">{{ devSub(d) }}</div>
          </div>
        </div>
        <div v-if="form.deviceId" class="selected-device">已选设备：{{ form.deviceName }}</div>
        <div v-if="deviceEmpty" class="empty-state"><span class="muted">输入关键字搜索设备</span></div>
      </div>

      <!-- ② 隐患信息 -->
      <div class="section-title">② 隐患信息</div>
      <div class="card">
        <div class="form-group">
          <div class="form-label">隐患类型 *</div>
          <select class="input" v-model="form.hazardType">
            <option value="" disabled>请选择隐患类型</option>
            <option v-for="t in hazardTypes" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <div class="form-group">
          <div class="form-label">隐患描述 *</div>
          <textarea class="textarea" v-model="form.description" placeholder="请详细描述隐患情况（位置、现象、可能后果）"></textarea>
        </div>
      </div>

      <!-- ③ LSE 风险评估 -->
      <div class="section-title">③ 风险评估（L × S × E）</div>
      <div class="card">
        <div class="lseb-intro">风险值 R = L(可能性) × S(严重性) × E(暴露频次)，数值范围 1-5</div>
        <div class="form-group">
          <div class="form-label">L 发生可能性 (1-5)</div>
          <input class="input" type="number" min="1" max="5" :value="lseL" @input="onLse('L', $event)" />
        </div>
        <div class="form-group">
          <div class="form-label">S 后果严重性 (1-5)</div>
          <input class="input" type="number" min="1" max="5" :value="lseS" @input="onLse('S', $event)" />
        </div>
        <div class="form-group">
          <div class="form-label">E 暴露频次 (1-5)</div>
          <input class="input" type="number" min="1" max="5" :value="lseE" @input="onLse('E', $event)" />
        </div>
        <div class="risk-card" :style="{ borderColor: levelColor }">
          <div class="risk-level" :style="{ color: levelColor }">{{ levelLabel }}</div>
          <div class="risk-calc">
            <span class="rc-label">R = L × S × E =</span>
            <span class="rc-total" :style="{ color: levelColor }">{{ riskB }}</span>
          </div>
          <div class="risk-deadline">整改期限：{{ deadlineText }}</div>
        </div>
      </div>

      <!-- ④ 整改信息（可选） -->
      <div class="section-title">④ 整改信息（可选）</div>
      <div class="card">
        <div class="form-group">
          <div class="form-label">整改建议</div>
          <textarea class="textarea" v-model="rectifyAdvice" placeholder="请输入整改建议"></textarea>
        </div>
        <div class="form-group">
          <div class="form-label">整改责任人（姓名/工号）</div>
          <input class="input" v-model="form.rectifyOwnerId" placeholder="选填" />
        </div>
        <div class="form-group">
          <div class="form-label">现场照片（最多 6 张）</div>
          <div class="photo-row">
            <div v-for="(p, idx) in photos" :key="idx" class="photo-wrap">
              <img class="photo-thumb" :src="p" />
              <div class="photo-del" @click="removePhoto(idx)">×</div>
            </div>
            <div v-if="canAddPhoto" class="photo-add" @click="onTakePhoto">＋</div>
          </div>
        </div>
      </div>

      <div class="bottom-bar">
        <button class="btn-primary" :disabled="submitting" @click="doSubmit">{{ submitting ? '提交中...' : '提交上报' }}</button>
      </div>
    </template>
  </div>
  `
};
