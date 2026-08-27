// M-09 隐患上报 → H5 (Vue3 global build, 重构)
// 4 步：选设备 → 隐患信息 → LSEB 评估 → 照片提交
// POST /api/mobile/hazards  |  设备选择 utils.scanCode / GET /api/mobile/devices
// LSEB 计算：B = L × S × E  风险等级：critical(R≥12 或 L≥4且S≥4) / major(B≥8) / general(B≥4) / low
window.Pages = window.Pages || {};
window.Pages.hazard_form = {
  template: `
  <div class="page hf">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <template v-else>
      <!-- 步骤条 -->
      <div class="steps-bar">
        <template v-for="(s,i) in steps" :key="i">
          <div class="step-item" :class="stepClass(i)" @click="goStep(i)">
            <div class="step-num">{{i + 1}}</div>
            <div class="step-label">{{s}}</div>
          </div>
          <div v-if="hasNextStep(i)" class="step-line" :class="stepLineClass(i)"></div>
        </template>
      </div>

      <!-- step 1 选择设备 -->
      <div v-if="isStep(1)" class="step-content">
        <div class="section-title">选择设备</div>
        <div class="card">
          <div class="search-row">
            <input class="input" v-model="deviceSearch" placeholder="输入设备名称/编号搜索" />
            <button class="btn-sm" @click="doSearch">搜索</button>
          </div>
          <button class="btn-scan" @click="onScan">扫码选择设备</button>
          <div v-if="filteredDevices.length" class="dev-list">
            <div v-for="d in filteredDevices" :key="d.id" class="device-item" :class="deviceOn(d)" @click="selectDevice(d)">
              <div class="dev-name">{{devName(d)}}</div>
              <div class="dev-sub muted">{{devSub(d)}}</div>
            </div>
          </div>
          <div v-if="form.deviceId" class="selected-device">已选设备：{{form.deviceName}}</div>
          <div v-if="!filteredDevices.length" class="empty-state"><span class="muted">输入关键字搜索设备</span></div>
        </div>
      </div>

      <!-- step 2 隐患信息 -->
      <div v-if="isStep(2)" class="step-content">
        <div class="section-title">隐患信息</div>
        <div class="card">
          <div class="form-group">
            <div class="form-label">设备</div>
            <div class="selected-device">{{deviceNameText}}</div>
          </div>
          <div class="form-group">
            <div class="form-label">隐患类型 *</div>
            <select v-model="form.hazardType" class="input">
              <option value="" disabled>请选择隐患类型</option>
              <option v-for="t in hazardTypes" :key="t" :value="t">{{t}}</option>
            </select>
          </div>
          <div class="form-group">
            <div class="form-label">隐患描述 *</div>
            <textarea v-model="form.description" class="textarea" placeholder="请详细描述隐患情况（位置、现象、可能后果）"></textarea>
          </div>
          <div class="form-group">
            <div class="form-label">发现时间</div>
            <input type="datetime-local" v-model="findTime" class="input" />
          </div>
        </div>
      </div>

      <!-- step 3 LSEB 评估 -->
      <div v-if="isStep(3)" class="step-content">
        <div class="section-title">LSEB 风险评估</div>
        <div class="card">
          <div class="lseb-intro">风险值 R = L(可能性) × S(严重性) × E(暴露频次)</div>
          <div class="form-group">
            <div class="form-label">L 发生可能性 (1-5)</div>
            <select v-model="lseL" class="input">
              <option v-for="n in five" :key="'l'+n" :value="n">{{n}}</option>
            </select>
          </div>
          <div class="form-group">
            <div class="form-label">S 后果严重性 (1-5)</div>
            <select v-model="lseS" class="input">
              <option v-for="n in five" :key="'s'+n" :value="n">{{n}}</option>
            </select>
          </div>
          <div class="form-group">
            <div class="form-label">E 暴露频次 (1-5)</div>
            <select v-model="lseE" class="input">
              <option v-for="n in five" :key="'e'+n" :value="n">{{n}}</option>
            </select>
          </div>

          <div class="risk-card" :style="riskCardStyle">
            <div class="risk-level" :style="{ color: riskColor }">{{riskLabel}}</div>
            <div class="risk-calc">
              <span class="rc-label">R = L × S × E =</span>
              <span class="rc-total" :style="{ color: riskColor }">{{riskB}}</span>
            </div>
            <div class="risk-deadline">整改期限：{{deadlineText}}</div>
          </div>

          <div class="form-group" style="margin-top:14px">
            <div class="form-label">整改建议（系统自动推荐，可修改）</div>
            <textarea v-model="rectifyAdvice" class="textarea" placeholder="请输入整改建议"></textarea>
          </div>
          <div class="form-group">
            <div class="form-label">整改责任人</div>
            <select v-model="form.rectifyOwnerId" class="input">
              <option value="" disabled>请选择责任人</option>
              <option v-for="u in users" :key="u.id" :value="u.id">{{userName(u)}}</option>
            </select>
          </div>
        </div>
      </div>

      <!-- step 4 照片 + 提交 -->
      <div v-if="isStep(4)" class="step-content">
        <div class="section-title">现场照片 + 提交</div>
        <div class="card">
          <div class="form-group">
            <div class="form-label">隐患照片（最多 6 张）</div>
            <div class="photo-row">
              <div v-for="(p,idx) in photos" :key="idx" class="photo-wrap">
                <img class="photo-thumb" :src="p" />
                <div class="photo-del" @click="removePhoto(idx)">×</div>
              </div>
              <div v-if="canAddPhoto" class="photo-add" @click="onTakePhoto">+</div>
            </div>
          </div>

          <div class="lseb-summary">
            <div class="sum-row"><span>L（可能性）</span><b>{{lseL}}</b></div>
            <div class="sum-row"><span>S（严重性）</span><b>{{lseS}}</b></div>
            <div class="sum-row"><span>E（暴露频次）</span><b>{{lseE}}</b></div>
            <div class="sum-row"><span>风险值 R</span><b :style="{ color: riskColor }">{{riskB}}</b></div>
            <div class="sum-row"><span>风险等级</span><b :style="{ color: riskColor }">{{riskLabel}}</b></div>
            <div class="sum-row"><span>整改期限</span><b>{{deadlineText}}</b></div>
            <div class="sum-row"><span>整改责任人</span><b>{{ownerName}}</b></div>
          </div>
        </div>
      </div>

      <!-- 底部栏 -->
      <div class="bottom-bar">
        <button v-if="canPrev" class="btn-default" @click="prevStep">上一步</button>
        <button v-if="canNext" class="btn-primary" @click="nextStep">下一步</button>
        <button v-if="isLast" class="btn-primary" :disabled="submitting" @click="doSubmit">{{submitting ? '提交中...' : '提交上报'}}</button>
      </div>
    </template>

  </div>
  `,
  data() {
    return {
      step: 1,
      steps: ['设备', '隐患', '评估', '提交'],
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
      findTime: nowLocalDT(),
      users: [],
      hazardTypes: ['设备', '环境', '人员', '管理'],
      five: [1, 2, 3, 4, 5]
    };
  },
  computed: {
    riskB: function () {
      var l = parseInt(this.lseL) || 0;
      var s = parseInt(this.lseS) || 0;
      var e = parseInt(this.lseE) || 0;
      return l * s * e;
    },
    riskLevel: function () {
      var b = this.riskB, l = parseInt(this.lseL) || 0, s = parseInt(this.lseS) || 0;
      if (b >= 12 || (l >= 4 && s >= 4)) return 'critical';
      if (b >= 8) return 'major';
      if (b >= 4) return 'general';
      return 'low';
    },
    riskLabel: function () {
      var m = { critical: '重大风险', major: '较大风险', general: '一般风险', low: '低风险' };
      return m[this.riskLevel] || '';
    },
    riskColor: function () {
      var m = { critical: '#FF4D4F', major: '#FA8C16', general: '#D48806', low: '#52C41A' };
      return m[this.riskLevel] || '#999';
    },
    riskCardStyle: function () {
      return { borderColor: this.riskColor };
    },
    deadlineDays: function () {
      var m = { critical: 1, major: 7, general: 15, low: 30 };
      return m[this.riskLevel] || 30;
    },
    deadlineText: function () {
      if (this.riskLevel === 'critical') return '立即（1 天）';
      return this.deadlineDays + ' 天';
    },
    filteredDevices: function () {
      var kw = (this.deviceSearch || '').trim().toLowerCase();
      if (!kw) return this.deviceList;
      return this.deviceList.filter(function (d) {
        var name = (d.device_name || d.name || '').toLowerCase();
        var code = (d.device_code || d.code || '').toLowerCase();
        return name.indexOf(kw) >= 0 || code.indexOf(kw) >= 0;
      });
    },
    canAddPhoto: function () { return this.photos.length < 6; },
    canPrev: function () { return this.step > 1; },
    canNext: function () { return this.step < 4; },
    isLast: function () { return this.step === 4; },
    ownerName: function () {
      var u = this.users.find(function (x) { return String(x.id) === String(this.form.rectifyOwnerId); }.bind(this));
      return u ? (u.name || u.username || u.id) : '未指定';
    },
    deviceNameText: function () { return this.form.deviceName || '未选择'; }
  },
  watch: {
    riskLevel: function () {
      if (!this.rectifyAdvice) this.rectifyAdvice = this.suggestAdvice();
    }
  },
  mounted() {
    this.loadDevices();
    this.loadUsers();
    if (!this.rectifyAdvice) this.rectifyAdvice = this.suggestAdvice();
  },
  methods: {
    isStep(n) { return this.step === n; },
    hasNextStep(i) { return i < this.steps.length - 1; },
    stepClass(i) {
      if (this.step === i + 1) return 'active';
      if (this.step > i + 1) return 'done';
      return '';
    },
    stepLineClass(i) { return this.step > i + 1 ? 'active' : ''; },
    goStep(i) { if (this.step > i + 1) this.step = i + 1; },
    async loadDevices() {
      try {
        const d = await api.get('/api/mobile/devices', { page: 1, size: 200 });
        this.deviceList = d.data || d || [];
      } catch (e) { /* 忽略，允许扫码录入 */ }
    },
    doSearch() { /* 客户端过滤由 filteredDevices 处理 */ },
    async onScan() {
      try {
        const code = await utils.scanCode();
        this.form.deviceId = code;
        this.form.deviceName = '设备 ' + code;
        utils.toast('扫码成功');
      } catch (e) { utils.toast('扫码取消'); }
    },
    selectDevice(d) {
      this.form.deviceId = d.id;
      this.form.deviceName = d.device_name || d.name || d.device_code || d.id;
    },
    deviceOn(d) { return this.form.deviceId === d.id ? 'on' : ''; },
    devName(d) { return d.device_name || d.name || d.device_code || d.id || ''; },
    devSub(d) { return ((d.device_code || d.code || '') + ' ' + (d.location || '')).trim(); },
    userName(u) { return u.name || u.username || u.id || ''; },
    async loadUsers() {
      try {
        const d = await api.get('/api/mobile/users');
        this.users = d.data || d || [];
      } catch (e) { /* 忽略 */ }
    },
    suggestAdvice() {
      var m = {
        critical: '立即停用设备并采取紧急控制措施，24 小时内完成整改并复核。',
        major: '限期 7 天内完成整改，整改期间加强巡查与监测。',
        general: '限期 15 天内完成整改，落实安全防范措施。',
        low: '限期 30 天内完成整改，纳入日常维护保养计划。'
      };
      return m[this.riskLevel] || '';
    },
    async onTakePhoto() {
      try {
        const photos = await utils.chooseImage(6);
        this.photos = this.photos.concat(photos).slice(0, 6);
      } catch (e) { /* 取消 */ }
    },
    removePhoto(idx) { this.photos.splice(idx, 1); },
    nextStep() {
      if (this.step === 1) {
        if (!this.form.deviceId) return utils.toast('请先选择设备');
        this.step = 2;
      } else if (this.step === 2) {
        if (!this.form.hazardType) return utils.toast('请选择隐患类型');
        if (!this.form.description) return utils.toast('请填写隐患描述');
        this.step = 3;
      } else if (this.step === 3) {
        this.step = 4;
      }
    },
    prevStep() { if (this.step > 1) this.step = this.step - 1; },
    doSubmit: async function () {
      if (this.submitting) return;
      if (!this.form.deviceId) return utils.toast('请先选择设备');
      if (!this.form.hazardType) return utils.toast('请选择隐患类型');
      if (!this.form.description) return utils.toast('请填写隐患描述');
      this.submitting = true;
      try {
        var gps = {};
        try { gps = await utils.getLocation(); } catch (e) { gps = {}; }
        var payload = {
          deviceId: this.form.deviceId,
          hazardType: this.form.hazardType,
          description: this.form.description,
          lseL: parseInt(this.lseL),
          lseS: parseInt(this.lseS),
          lseE: parseInt(this.lseE),
          rectifyAdvice: this.rectifyAdvice,
          rectifyOwnerId: this.form.rectifyOwnerId,
          photos: JSON.stringify(this.photos || []),
          findTime: this.findTime,
          gpsLocation: gps
        };
        await api.post('/api/mobile/hazards', payload);
        utils.toast('隐患上报成功');
        utils.go('/hazard');
      } catch (e) {
        utils.toast(e.message || '提交失败');
      } finally {
        this.submitting = false;
      }
    }
  }
};

// 当前时间 → datetime-local 格式 YYYY-MM-DDTHH:mm
function nowLocalDT() {
  var d = new Date();
  var p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}
