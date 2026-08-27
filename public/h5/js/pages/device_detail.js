// 设备详情
window.Pages = window.Pages || {};
window.Pages.device_detail = {
  name: 'device_detail',
  props: ['query'],
  template: `
<div class="page page-pad">
  <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
  <div v-else-if="noDevice" class="empty-state"><span class="muted">未找到设备</span></div>
  <div v-else>

    <!-- 设备基本信息 -->
    <div class="device-card" style="margin-bottom:12px;">
      <div style="font-size:18px;font-weight:700;margin-bottom:4px;">{{device.device_name || '未知设备'}}</div>
      <div class="dev-sub" style="font-size:13px;">{{device.device_code || '-'}}</div>
      <div class="dev-sub">{{device.device_type || ''}} <span v-if="device.location">· {{device.location}}</span></div>
      <div style="margin-top:8px;">
        <span class="badge" :style="{background: statusBg, color:'#fff'}">{{statusText}}</span>
        <span v-if="device.risk_level" class="badge" :style="{background: riskBg, color:'#fff'}" style="margin-left:6px;">{{riskText}}</span>
      </div>
    </div>

    <!-- 日管控记录 -->
    <div class="card" style="margin-bottom:12px;">
      <div class="block-title">日管控记录</div>
      <div v-if="noDaily" class="muted" style="font-size:13px;padding:8px 0;">暂无记录</div>
      <div v-else>
        <div v-for="(item, i) in dailyList" :key="item.id || i" class="divider" style="padding:8px 0;">
          <div class="flex-between">
            <span style="font-size:14px;font-weight:500;">{{dailyTitle(item)}}</span>
            <span class="badge" :style="{background: statusBgByStr(item.status), color:'#fff'}">{{statusTextByStr(item.status)}}</span>
          </div>
          <div class="muted" style="font-size:12px;margin-top:2px;">{{dailyDate(item)}}</div>
        </div>
      </div>
    </div>

    <!-- 周排查记录 -->
    <div class="card" style="margin-bottom:12px;">
      <div class="block-title">周排查记录</div>
      <div v-if="noWeekly" class="muted" style="font-size:13px;padding:8px 0;">暂无记录</div>
      <div v-else>
        <div v-for="(item, i) in weeklyList" :key="item.id || i" class="divider" style="padding:8px 0;">
          <div class="flex-between">
            <span style="font-size:14px;font-weight:500;">{{weeklyTitle(item)}}</span>
            <span class="badge" :style="{background: statusBgByStr(item.status), color:'#fff'}">{{statusTextByStr(item.status)}}</span>
          </div>
          <div class="muted" style="font-size:12px;margin-top:2px;">{{weeklyDate(item)}}</div>
        </div>
      </div>
    </div>

    <!-- 预警记录 -->
    <div class="card" style="margin-bottom:12px;">
      <div class="block-title">预警记录</div>
      <div v-if="noWarnings" class="muted" style="font-size:13px;padding:8px 0;">暂无预警</div>
      <div v-else>
        <div v-for="(item, i) in warnings" :key="i" class="divider" style="padding:8px 0;">
          <div class="flex-between">
            <span class="ellipsis" style="flex:1;font-size:14px;font-weight:500;">{{item.warning_type || '预警'}}</span>
            <span class="badge" :style="{background: levelBg(item.warning_level), color:'#fff'}">{{levelText(item.warning_level)}}</span>
          </div>
          <div class="muted" style="font-size:12px;margin-top:2px;">{{warnStatus(item)}}</div>
        </div>
      </div>
    </div>

    <!-- 文档资料 -->
    <div class="card" style="margin-bottom:12px;">
      <div class="block-title">设备资料</div>
      <div v-if="noDocs" class="muted" style="font-size:13px;padding:8px 0;">暂无资料</div>
      <div v-else>
        <div v-for="(item, i) in docs" :key="i" class="divider" style="padding:8px 0;">
          <div style="font-size:14px;font-weight:500;">{{item.doc_title || item.title || '文档'}}</div>
          <div class="muted" style="font-size:12px;margin-top:2px;" v-if="item.doc_number">编号：{{item.doc_number}}</div>
        </div>
      </div>
    </div>

    <!-- 快捷操作 -->
    <div class="action-bar">
      <button class="ab-btn ab-primary" @click="goCheck">设备检查</button>
      <button class="ab-btn ab-gray" @click="goHazard">上报隐患</button>
      <button class="ab-btn ab-red" @click="goEmergency">应急事件</button>
    </div>

  </div>
</div>
`,
  data: function () {
    return {
      device: null,
      loading: true
    };
  },
  computed: {
    noDevice: function () { return !this.loading && !this.device; },
    dailyList: function () { return (this.device && this.device.daily) ? this.device.daily : []; },
    weeklyList: function () { return (this.device && this.device.weekly) ? this.device.weekly : []; },
    warnings: function () { return (this.device && this.device.warnings) ? this.device.warnings : []; },
    docs: function () { return (this.device && this.device.docs) ? this.device.docs : []; },
    noDaily: function () { return this.dailyList.length === 0; },
    noWeekly: function () { return this.weeklyList.length === 0; },
    noWarnings: function () { return this.warnings.length === 0; },
    noDocs: function () { return this.docs.length === 0; },
    statusBg: function () { return utils.statusColor(this.device && this.device.status); },
    statusText: function () { return utils.statusLabel(this.device && this.device.status); },
    riskBg: function () { return utils.levelColor(this.device && this.device.risk_level); },
    riskText: function () { return utils.levelLabel(this.device && this.device.risk_level); }
  },
  mounted: function () {
    var self = this;
    self.loading = true;
    var id = this.query && this.query.id;
    if (!id) {
      var r = Router.parse();
      id = r.query.id;
    }
    if (!id) { self.loading = false; return; }
    api.getDeviceDetail(id).then(function (d) {
      self.device = d.data || d;
    }).catch(function () {
      utils.toast('加载失败');
    }).finally(function () {
      self.loading = false;
    });
  },
  methods: {
    dailyTitle: function (item) { return item.inspection_no || item.inspectionNo || '日管控记录'; },
    dailyDate: function (item) { return utils.formatDate(item.check_date || item.inspection_date || item.date || ''); },
    weeklyTitle: function (item) { return item.inspection_no || item.inspectionNo || item.week_no || '周排查记录'; },
    weeklyDate: function (item) { return utils.formatDate(item.check_date || item.week_date || item.date || ''); },
    warnStatus: function (item) {
      return utils.statusLabel(item.status) + (item.warning_level ? ' · ' + utils.levelLabel(item.warning_level) : '');
    },
    levelBg: function (level) { return utils.levelColor(level); },
    levelText: function (level) { return utils.levelLabel(level); },
    statusBgByStr: function (s) { return utils.statusColor(s); },
    statusTextByStr: function (s) { return utils.statusLabel(s); },
    goCheck: function () { utils.go('/daily_form?deviceId=' + (this.device && this.device.id)); },
    goHazard: function () { utils.go('/hazard_form?deviceId=' + (this.device && this.device.id)); },
    goEmergency: function () { utils.go('/emergency_form?deviceId=' + (this.device && this.device.id)); }
  }
};
