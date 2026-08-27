// 设备详情
window.Pages = window.Pages || {};
window.Pages.device_detail = {
  template: `
<div class="page page-pad">
  <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>

  <div v-else-if="device" class="device-wrap">
    <div class="device-card">
      <div class="dc-name">{{deviceName()}}</div>
      <div class="dc-code-lg">{{registerCode()}}</div>
      <div class="dc-info">
        <span>{{deviceType()}}</span>
        <span v-if="hasLocation()">· {{location()}}</span>
      </div>
      <div class="mt8">
        <span class="status-badge" :style="{background: statusColor(device.status), color:'#fff'}">{{deviceStatusLabel(device.status)}}</span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">设备参数</div>
      <div>
        <div class="info-row"><span class="info-label">注册代码</span><span class="info-val">{{paramRegister()}}</span></div>
        <div class="info-row"><span class="info-label">设备型号</span><span class="info-val">{{paramModel()}}</span></div>
        <div class="info-row"><span class="info-label">制造单位</span><span class="info-val">{{paramManufacturer()}}</span></div>
        <div class="info-row"><span class="info-label">使用单位</span><span class="info-val">{{paramUseUnit()}}</span></div>
        <div class="info-row"><span class="info-label">检验日期</span><span class="info-val">{{paramInspectDate()}}</span></div>
        <div class="info-row"><span class="info-label">风险等级</span><span class="info-val" :style="{color: riskColor(device.risk_level)}">{{riskLevel()}}</span></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">最近检查记录</div>
      <div v-if="noInspections" class="muted text-sm">暂无检查记录</div>
      <div v-else>
        <div v-for="item in recentInspections" :key="item.id" class="doc-item">
          <div class="flex-between">
            <span class="text-sm fw600">{{inspDate(item)}}</span>
            <span class="status-badge" :style="{background: statusColor(item.status), color:'#fff'}">{{deviceStatusLabel(item.status)}}</span>
          </div>
          <div class="text-sm muted mt4">通过率：{{passRate(item)}}%</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">隐患记录</div>
      <div v-if="noHazards" class="muted text-sm">暂无隐患记录</div>
      <div v-else>
        <div v-for="item in recentHazards" :key="item.id" class="doc-item">
          <div class="flex-between">
            <span class="text-sm fw600 ellipsis" style="max-width:70%">{{hazardDesc(item)}}</span>
            <span class="status-badge" :style="{background: riskColor(item.risk_level), color:'#fff'}">{{itemRisk(item)}}</span>
          </div>
          <div class="text-sm muted mt4">状态：{{deviceStatusLabel(item.status)}}</div>
        </div>
      </div>
    </div>

    <div class="act-bar">
      <button class="ab-btn ab-primary" @click="goCheck">设备检查</button>
      <button class="ab-btn" style="background:#FA8C16" @click="goHazard">上报隐患</button>
      <button class="ab-btn ab-red" @click="goEmergency">应急事件</button>
    </div>
  </div>

  <div v-else class="empty-state"><span class="muted">未找到设备</span></div>
</div>
`,
  data() {
    return {
      id: null,
      device: null,
      loading: true
    };
  },
  computed: {
    recentInspections: function () {
      if (!this.device || !this.device.inspections) return [];
      return this.device.inspections.slice(0, 3);
    },
    recentHazards: function () {
      if (!this.device || !this.device.hazards) return [];
      return this.device.hazards.slice(0, 3);
    },
    noInspections: function () {
      return this.recentInspections.length === 0;
    },
    noHazards: function () {
      return this.recentHazards.length === 0;
    }
  },
  mounted() {
    var r = Router.parse();
    this.id = r.query.id || r.query.device_id;
    if (this.id) this.load(this.id);
    else this.loading = false;
  },
  methods: {
    load: async function (id) {
      this.loading = true;
      try {
        var d = await api.get('/api/mobile/devices/' + id + '/detail');
        this.device = d.data || d;
      } catch (e) {
        utils.toast('加载失败');
      } finally {
        this.loading = false;
      }
    },
    deviceName: function () {
      return (this.device && (this.device.device_name || this.device.name)) || '未知设备';
    },
    registerCode: function () {
      if (!this.device) return '-';
      return this.device.register_code || this.device.device_code || this.device.registration_code || '-';
    },
    deviceType: function () {
      if (!this.device) return '未知类型';
      return this.device.device_type || this.device.type || '未知类型';
    },
    hasLocation: function () {
      return !!(this.device && (this.device.location || this.device.address));
    },
    location: function () {
      if (!this.device) return '';
      return this.device.location || this.device.address || '';
    },
    paramRegister: function () {
      if (!this.device) return '-';
      return this.device.register_code || this.device.registration_code || '-';
    },
    paramModel: function () {
      if (!this.device) return '-';
      return this.device.model || this.device.device_model || '-';
    },
    paramManufacturer: function () {
      if (!this.device) return '-';
      return this.device.manufacturer || '-';
    },
    paramUseUnit: function () {
      if (!this.device) return '-';
      return this.device.use_unit || this.device.useUnit || '-';
    },
    paramInspectDate: function () {
      if (!this.device) return '-';
      return this.device.inspect_date || this.device.inspection_date || '-';
    },
    riskLevel: function () {
      if (!this.device) return '未知';
      return this.device.risk_level || '未知';
    },
    inspDate: function (item) {
      return item.inspection_date || item.date || item.create_time || '检查记录';
    },
    hazardDesc: function (item) {
      return this.truncate(item.description || item.hazard_desc || item.title || '隐患', 24);
    },
    itemRisk: function (item) {
      return item.risk_level || '未知';
    },
    statusColor: function (s) {
      var m = { ONLINE: '#52C41A', OFFLINE: '#BFBFBF', FAULT: '#F5222D', RUNNING: '#52C41A', NORMAL: '#52C41A', STOP: '#BFBFBF' };
      return m[String(s || '').toUpperCase()] || '#999';
    },
    deviceStatusLabel: function (s) {
      var m = { ONLINE: '运行中', OFFLINE: '离线', FAULT: '故障', RUNNING: '运行中', NORMAL: '正常', STOP: '停用', OPEN: '未整改', CLOSED: '已关闭', RECTIFYING: '整改中', COMPLETED: '已完成' };
      return m[String(s || '').toUpperCase()] || (s || '未知');
    },
    riskColor: function (level) {
      var m = { HIGH: '#F5222D', MEDIUM: '#FAAD14', LOW: '#52C41A', 高风险: '#F5222D', 中风险: '#FAAD14', 低风险: '#52C41A' };
      return m[String(level || '').toUpperCase()] || '#999';
    },
    passRate: function (item) {
      var r = item.pass_rate != null ? item.pass_rate : (item.passRate != null ? item.passRate : null);
      if (r == null) return '-';
      if (r <= 1) return Math.round(r * 100);
      return Math.round(r);
    },
    truncate: function (str, n) {
      str = String(str || '');
      if (str.length > n) return str.slice(0, n) + '…';
      return str;
    },
    goCheck: function () { utils.go('/daily_form?deviceId=' + this.id); },
    goHazard: function () { utils.go('/hazard_form?deviceId=' + this.id); },
    goEmergency: function () { utils.go('/emergency_form?deviceId=' + this.id); }
  }
};
