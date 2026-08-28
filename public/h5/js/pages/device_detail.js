// 设备详情 → H5（Vue3 global build，按契约 v2 重写）
// GET /api/mobile/devices/:id/detail  →  设备主档 + 检查/预警/资料三个列表区块
// 铁律：v-model 仅限 input/select/textarea；模板无裸 && || < >；禁止 SVG；根 <div class="page">
window.Pages = window.Pages || {};
window.Pages.device_detail = {
  name: 'device_detail',
  props: ['query'],
  data: function () {
    return {
      loading: true,
      errorMsg: '',
      device: null,
      daily: [],
      weekly: [],
      warnings: [],
      docs: []
    };
  },
  computed: {
    noDevice: function () { return !this.loading && !this.device; },
    showError: function () { return !this.loading && this.errorMsg; },
    hasDaily: function () { return this.daily.length > 0; },
    hasWeekly: function () { return this.weekly.length > 0; },
    hasWarnings: function () { return this.warnings.length > 0; },
    hasDocs: function () { return this.docs.length > 0; },
    hasRiskLevel: function () { return !!(this.device && this.device.risk_level); },
    // Vue :style 禁用字面量 hex，改用 computed
    statusTagStyle: function () {
      var s = this.device ? this.device.status : '';
      return { background: utils.statusColor(s), color: 'var(--card)' };
    },
    riskTagStyle: function () {
      var l = this.device ? this.device.risk_level : '';
      return { background: utils.levelColor(l), color: 'var(--card)' };
    },
    statusTagLabel: function () {
      var s = this.device ? this.device.status : '';
      return utils.statusLabel(s);
    },
    riskTagLabel: function () {
      var l = this.device ? this.device.risk_level : '';
      return utils.levelLabel(l);
    },
    deviceNameText: function () {
      return (this.device && this.device.device_name) ? this.device.device_name : '未知设备';
    },
    deviceCodeText: function () {
      return (this.device && this.device.device_code) ? this.device.device_code : '-';
    },
    deviceTypeText: function () {
      return (this.device && this.device.device_type) ? this.device.device_type : '';
    },
    locationText: function () {
      return (this.device && this.device.location) ? this.device.location : '';
    },
    // 设备主档类型行：type + location 组合
    typeLocationLine: function () {
      var t = this.deviceTypeText;
      var l = this.locationText;
      if (t && l) return t + ' · ' + l;
      if (t) return t;
      if (l) return l;
      return '';
    },
    registrationCodeText: function () {
      return (this.device && this.device.registration_code) ? this.device.registration_code : '-';
    },
    lastInspectionText: function () {
      var d = this.device ? (this.device.last_inspection_date || this.device.last_inspection) : '';
      return d ? utils.formatDate(d) : '暂无';
    },
    nextInspectionText: function () {
      var d = this.device ? this.device.next_inspection_date : '';
      return d ? utils.formatDate(d) : '暂无';
    },
    hasBrandModel: function () {
      return !!(this.device && (this.device.brand || this.device.model));
    },
    brandModelText: function () {
      if (!this.device) return '';
      var b = this.device.brand || '';
      var m = this.device.model || '';
      if (b && m) return b + ' / ' + m;
      return b || m;
    },
    hasOwner: function () {
      return !!(this.device && this.device.owner);
    },
    hasMaintenanceUnit: function () {
      return !!(this.device && this.device.maintenance_unit);
    }
  },
  methods: {
    load: function () {
      var self = this;
      var id = (this.query && this.query.id) ? String(this.query.id) : '';
      if (!id) {
        var r = {};
        try { r = (window.Router && window.Router.parse) ? window.Router.parse() : {}; } catch (e) {}
        id = r && r.query && r.query.id ? String(r.query.id) : '';
      }
      if (!id) {
        self.loading = false;
        self.errorMsg = '缺少设备 ID';
        return;
      }
      self.loading = true;
      self.errorMsg = '';
      api.getDeviceDetail(id).then(function (d) {
        var res = d && d.data ? d.data : (d || {});
        self.device = res.device || res;
        self.daily = Array.isArray(res.daily) ? res.daily : [];
        self.weekly = Array.isArray(res.weekly) ? res.weekly : [];
        self.warnings = Array.isArray(res.warnings) ? res.warnings : [];
        self.docs = Array.isArray(res.docs) ? res.docs : [];
      }).catch(function () {
        self.errorMsg = '加载失败，请重试';
      }).then(function () {
        self.loading = false;
      });
    },
    retry: function () { this.load(); },
    goCheck: function () {
      var id = this.device ? this.device.id : '';
      utils.go('/daily_form?deviceId=' + id);
    },
    goHazard: function () {
      var id = this.device ? this.device.id : '';
      utils.go('/hazard_form?deviceId=' + id);
    },
    goEmergency: function () {
      var id = this.device ? this.device.id : '';
      utils.go('/emergency_form?deviceId=' + id);
    },
    // 日管控
    dailyTitle: function (item) { return item.inspection_no || ('日管控 #' + item.id); },
    dailyDate: function (item) {
      var d = item.check_date || item.date || '';
      return d ? utils.formatDate(d) : '';
    },
    dailyStatusLabel: function (item) { return utils.statusLabel(item.status); },
    dailyStatusStyle: function (item) {
      return { background: utils.statusColor(item.status), color: 'var(--card)' };
    },
    goDaily: function (item) { if (item && item.id) utils.go('/daily_detail?id=' + item.id); },
    // 周排查
    weeklyTitle: function (item) {
      var t = item.inspection_no || item.week_no || '';
      return t || ('周排查 #' + item.id);
    },
    weeklyDate: function (item) {
      var d = item.check_date || item.created_at || item.date || '';
      return d ? utils.formatDate(d) : '';
    },
    weeklyStatusLabel: function (item) { return utils.statusLabel(item.status); },
    weeklyStatusStyle: function (item) {
      return { background: utils.statusColor(item.status), color: 'var(--card)' };
    },
    goWeekly: function (item) { if (item && item.id) utils.go('/weekly_detail?id=' + item.id); },
    // 预警
    warningTypeLabel: function (item) { return item.warning_type || '预警'; },
    warningLevelLabel: function (item) { return utils.levelLabel(item.warning_level); },
    warningLevelStyle: function (item) {
      return { background: utils.levelColor(item.warning_level), color: 'var(--card)' };
    },
    warningDate: function (item) {
      var d = item.created_at || item.date || '';
      return d ? utils.formatTime(d) : '';
    },
    warningStatusLabel: function (item) { return utils.statusLabel(item.status); },
    warningStatusStyle: function (item) {
      return { background: utils.statusColor(item.status), color: 'var(--card)' };
    },
    // 文档
    docTitle: function (item) { return item.doc_title || item.title || '文档'; },
    docNumber: function (item) { return item.doc_number || item.docNumber || ''; },
    docType: function (item) { return item.doc_type || item.type || ''; },
    hasDocNumber: function (item) { return !!this.docNumber(item); },
    hasDocType: function (item) { return !!this.docType(item); }
  },
  mounted: function () { this.load(); },
  template: `
  <div class="page">
    <!-- 加载中 -->
    <div v-if="loading" class="empty-wrap">
      <div style="width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:12px;"></div>
      <div class="em-tip">加载中...</div>
    </div>

    <!-- 错误态 -->
    <div v-else-if="showError" class="error-wrap">
      <div style="font-size:44px;margin-bottom:12px;">⚠️</div>
      <div class="em-tip">{{ errorMsg }}</div>
      <button class="btn-primary" style="margin-top:14px;padding:10px 24px;width:auto;display:inline-flex;" @click="retry">重试</button>
    </div>

    <!-- 空态（无设备） -->
    <div v-else-if="noDevice" class="empty-wrap">
      <div class="em-ic">📱</div>
      <div class="em-tip">未找到设备</div>
    </div>

    <!-- 设备详情主体 -->
    <template v-else>

      <!-- 设备主档卡片 -->
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:17px;font-weight:700;margin-bottom:4px;">{{ deviceNameText }}</div>
            <div class="muted fz12">{{ deviceCodeText }}</div>
          </div>
          <div style="font-size:24px;margin-left:8px;flex-shrink:0;">📱</div>
        </div>
        <div class="muted fz13" style="margin-bottom:10px;">{{ typeLocationLine }}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px;">
          <span class="tag" :style="statusTagStyle">{{ statusTagLabel }}</span>
          <span v-if="hasRiskLevel" class="tag" :style="riskTagStyle">{{ riskTagLabel }}</span>
        </div>
        <div class="detail-row">
          <div class="dk">注册代码</div>
          <div class="dv">{{ registrationCodeText }}</div>
        </div>
        <div class="detail-row">
          <div class="dk">上次检验</div>
          <div class="dv">{{ lastInspectionText }}</div>
        </div>
        <div class="detail-row">
          <div class="dk">下次检验</div>
          <div class="dv">{{ nextInspectionText }}</div>
        </div>
        <div v-if="hasBrandModel" class="detail-row">
          <div class="dk">品牌型号</div>
          <div class="dv">{{ brandModelText }}</div>
        </div>
        <div v-if="hasOwner" class="detail-row">
          <div class="dk">使用单位</div>
          <div class="dv">{{ device.owner }}</div>
        </div>
        <div v-if="hasMaintenanceUnit" class="detail-row">
          <div class="dk">维保单位</div>
          <div class="dv">{{ device.maintenance_unit }}</div>
        </div>
      </div>

      <!-- 快捷操作 -->
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button class="btn-primary" style="flex:1;padding:10px 0;font-size:14px;" @click="goCheck">📋 设备检查</button>
        <button class="btn-ghost" style="flex:1;padding:10px 0;font-size:14px;" @click="goHazard">⚠️ 上报隐患</button>
        <button class="btn-danger" style="flex:1;padding:10px 0;font-size:14px;" @click="goEmergency">🚨 应急事件</button>
      </div>

      <!-- 日管控记录 -->
      <div class="card" style="margin-bottom:12px;">
        <div class="card-h">
          <div class="card-t">📋 日管控记录</div>
          <span class="muted fz12">{{ daily.length }} 条</span>
        </div>
        <div v-if="!hasDaily" class="muted fz13" style="padding:8px 0;">暂无记录</div>
        <div v-for="(item, i) in daily" :key="item.id || i" class="list-item" style="padding:10px 0;border-bottom:1px solid var(--border-light);cursor:pointer;" :style="i === daily.length - 1 ? 'border-bottom:none;' : ''" @click="goDaily(item)">
          <div class="li-body">
            <div class="li-title fz13">{{ dailyTitle(item) }}</div>
            <div class="li-sub fz12 muted">{{ dailyDate(item) }}</div>
          </div>
          <span class="tag" :style="dailyStatusStyle(item)">{{ dailyStatusLabel(item) }}</span>
          <span class="li-arrow">→</span>
        </div>
      </div>

      <!-- 周排查记录 -->
      <div class="card" style="margin-bottom:12px;">
        <div class="card-h">
          <div class="card-t">🔍 周排查记录</div>
          <span class="muted fz12">{{ weekly.length }} 条</span>
        </div>
        <div v-if="!hasWeekly" class="muted fz13" style="padding:8px 0;">暂无记录</div>
        <div v-for="(item, i) in weekly" :key="item.id || i" class="list-item" style="padding:10px 0;border-bottom:1px solid var(--border-light);cursor:pointer;" :style="i === weekly.length - 1 ? 'border-bottom:none;' : ''" @click="goWeekly(item)">
          <div class="li-body">
            <div class="li-title fz13">{{ weeklyTitle(item) }}</div>
            <div class="li-sub fz12 muted">{{ weeklyDate(item) }}</div>
          </div>
          <span class="tag" :style="weeklyStatusStyle(item)">{{ weeklyStatusLabel(item) }}</span>
          <span class="li-arrow">→</span>
        </div>
      </div>

      <!-- 预警记录 -->
      <div class="card" style="margin-bottom:12px;">
        <div class="card-h">
          <div class="card-t">🚨 预警记录</div>
          <span class="muted fz12">{{ warnings.length }} 条</span>
        </div>
        <div v-if="!hasWarnings" class="muted fz13" style="padding:8px 0;">暂无预警</div>
        <div v-for="(item, i) in warnings" :key="item.id || i" style="padding:10px 0;border-bottom:1px solid var(--border-light);" :style="i === warnings.length - 1 ? 'border-bottom:none;' : ''">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <span class="fz13 fw6">{{ warningTypeLabel(item) }}</span>
            <div style="display:flex;gap:6px;">
              <span v-if="item.warning_level" class="tag" :style="warningLevelStyle(item)">{{ warningLevelLabel(item) }}</span>
              <span v-if="item.status" class="tag" :style="warningStatusStyle(item)">{{ warningStatusLabel(item) }}</span>
            </div>
          </div>
          <div class="muted fz12">{{ warningDate(item) }}</div>
        </div>
      </div>

      <!-- 设备资料 -->
      <div class="card" style="margin-bottom:12px;">
        <div class="card-h">
          <div class="card-t">📄 设备资料</div>
          <span class="muted fz12">{{ docs.length }} 条</span>
        </div>
        <div v-if="!hasDocs" class="muted fz13" style="padding:8px 0;">暂无资料</div>
        <div v-for="(item, i) in docs" :key="i" style="padding:10px 0;border-bottom:1px solid var(--border-light);" :style="i === docs.length - 1 ? 'border-bottom:none;' : ''">
          <div class="fz13 fw6">{{ docTitle(item) }}</div>
          <div v-if="hasDocNumber(item)" class="muted fz12" style="margin-top:2px;">编号：{{ docNumber(item) }}</div>
          <div v-if="hasDocType(item)" class="muted fz12">{{ docType(item) }}</div>
        </div>
      </div>

    </template>
  </div>
  `
};
