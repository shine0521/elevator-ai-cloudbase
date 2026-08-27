// 隐患排查列表 → H5（Vue3 global build，按契约重写）
// GET /api/mobile/hazards   api.getHazards({status,riskLevel})
// 顶部按风险等级 + 状态筛选；项展示设备/编号/类型/风险/状态；点进 /hazard_detail?id=
window.Pages = window.Pages || {};
window.Pages.hazard = {
  name: 'hazard',
  props: ['query'],
  data: function () {
    return {
      loading: true,
      list: [],
      activeRisk: 'all',
      activeStatus: 'all',
      riskTabs: [
        { key: 'all', label: '全部', dot: 'dot-gray' },
        { key: 'critical', label: '重大', dot: 'dot-red' },
        { key: 'major', label: '较大', dot: 'dot-orange' },
        { key: 'general', label: '一般', dot: 'dot-yellow' },
        { key: 'low', label: '低', dot: 'dot-green' }
      ],
      statusTabs: [
        { key: 'all', label: '全部' },
        { key: 'pending', label: '待整改' },
        { key: 'rectifying', label: '整改中' },
        { key: 'verifying', label: '待验收' },
        { key: 'closed', label: '已关闭' }
      ]
    };
  },
  computed: {
    // 列表渲染无需裸运算符，直接用 list
    emptyList: function () { return this.list.length === 0; }
  },
  methods: {
    load: function () {
      var self = this;
      self.loading = true;
      var params = {};
      if (self.activeStatus !== 'all') params.status = self.activeStatus;
      if (self.activeRisk !== 'all') params.riskLevel = self.activeRisk;
      api.getHazards(params).then(function (d) {
        var arr = d && d.data;
        self.list = Array.isArray(arr) ? arr : (Array.isArray(d) ? d : []);
      }).catch(function (e) {
        self.list = [];
        utils.toast(e && e.message ? e.message : '网络错误');
      }).then(function () {
        self.loading = false;
      });
    },
    onRisk: function (key) { this.activeRisk = key; this.load(); },
    onStatus: function (key) { this.activeStatus = key; this.load(); },
    isRiskOn: function (key) { return this.activeRisk === key; },
    isStatusOn: function (key) { return this.activeStatus === key; },
    goForm: function () { utils.go('/hazard_form'); },
    goDetail: function (id) { utils.go('/hazard_detail?id=' + id); },
    // 风险等级展示统一走 utils.levelColor / utils.levelLabel
    levelLabel: function (level) { return utils.levelLabel(level); },
    levelColor: function (level) { return utils.levelColor(level); },
    statusLabel: function (status) { return utils.statusLabel(status); },
    statusColor: function (status) { return utils.statusColor(status); },
    // 设备名/位置 拼装（JS 内拼接，模板不出现运算符）
    deviceLine: function (item) {
      var line = item.device_name || item.deviceName || '未知设备';
      if (item.location) line = line + ' · ' + item.location;
      else if (item.device_location) line = line + ' · ' + item.device_location;
      return line;
    },
    // 设备编号 · 隐患类型 拼装
    codeLine: function (item) {
      var parts = [];
      if (item.device_code || item.deviceCode) parts.push(item.device_code || item.deviceCode);
      if (item.hazard_type || item.hazardType) parts.push(item.hazard_type || item.hazardType);
      return parts.join(' · ');
    },
    findTime: function (item) {
      var t = item.find_time || item.findTime || item.created_at || item.createdAt || item.create_time || '';
      return t ? utils.formatTime(t) : '';
    }
  },
  mounted: function () { this.load(); },
  template: `
  <div class="page haz">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <template v-else>
      <!-- 风险等级筛选（横向滚动） -->
      <div class="risk-tabs">
        <div v-for="t in riskTabs" :key="t.key" class="risk-tab" :class="isRiskOn(t.key) ? 'on' : ''" @click="onRisk(t.key)">
          <span class="dot" :class="t.dot"></span>{{ t.label }}
        </div>
      </div>

      <!-- 状态筛选 -->
      <div class="status-tabs">
        <div v-for="s in statusTabs" :key="s.key" class="status-tab" :class="isStatusOn(s.key) ? 'on' : ''" @click="onStatus(s.key)">
          {{ s.label }}
        </div>
      </div>

      <div class="list-wrap">
        <div v-for="(item, i) in list" :key="item.id || i" class="hcard" @click="goDetail(item.id)">
          <div class="hcard-top">
            <div class="hcard-desc">{{ item.description }}</div>
            <span class="badge" :style="{ background: levelColor(item.risk_level), color: '#fff' }">{{ levelLabel(item.risk_level) }}</span>
          </div>
          <div class="hcard-sub muted">{{ deviceLine(item) }}</div>
          <div class="hcard-sub muted">{{ codeLine(item) }}</div>
          <div class="hcard-foot">
            <span class="badge" :style="{ background: statusColor(item.status), color: '#fff' }">{{ statusLabel(item.status) }}</span>
            <span class="hcard-time muted">{{ findTime(item) }}</span>
          </div>
          <div v-if="item.deadline" class="hcard-deadline">整改期限：{{ item.deadline }}</div>
        </div>
        <div v-if="emptyList" class="empty-state"><span class="muted">暂无隐患记录</span></div>
      </div>
    </template>
    <button class="fab" @click="goForm">＋</button>
  </div>
  `
};
