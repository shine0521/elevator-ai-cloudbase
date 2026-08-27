// 应急事件列表 → H5（Vue3 全局构建，按契约重写）
// 契约 #15：api.get('/api/mobile/emergencies',{status})；status 筛选(responding/processing/recovering/completed)
// 项显示 event_no/device_name/alarm_type/trapped_count/status/start_time；点进 /emergency_form?id=（处置模式）
// 4 阶段进度条（computed 当前阶段索引）。铁律：模板无裸 && || < >；禁止 SVG；根 <div class="page em">
window.Pages = window.Pages || {};
window.Pages.emergency = {
  name: 'emergency',
  props: ['query'],
  data: function () {
    return {
      loading: true,
      list: [],
      activeStatus: 'all',
      tabs: [
        { key: 'all', label: '全部' },
        { key: 'responding', label: '响应中' },
        { key: 'processing', label: '处置中' },
        { key: 'recovering', label: '恢复中' },
        { key: 'completed', label: '已完成' }
      ],
      stages: [
        { key: 'responding', label: '响应' },
        { key: 'processing', label: '处置' },
        { key: 'recovering', label: '恢复' },
        { key: 'completed', label: '完成' }
      ]
    };
  },
  computed: {
    showEmpty: function () {
      return this.list.length === 0;
    },
    // 带参 helper：以 computed 返回函数的方式，在模板中传参调用
    alarmIcon: function () {
      var m = { '困人': '🛗', '坠落': '⬇️', '剪切': '✂️', '火灾': '🔥', '扶梯伤人': '⚠️', '停电': '⚡', '自然灾害': '🌪️', '其他': '⚠️' };
      return function (type) { return m[type] || '🚨'; };
    },
    alarmStyle: function () {
      var bg = { '困人': '#fff7e6', '坠落': '#fff1f0', '剪切': '#fff1f0', '火灾': '#fff1f0', '扶梯伤人': '#fff1f0', '停电': '#fff7e6', '自然灾害': '#f6ffed', '其他': '#f5f5f5' };
      var fg = { '困人': '#d46b08', '坠落': '#cf1322', '剪切': '#cf1322', '火灾': '#cf1322', '扶梯伤人': '#cf1322', '停电': '#d46b08', '自然灾害': '#389e0d', '其他': '#666' };
      return function (type) {
        return { background: bg[type] || '#f5f5f5', color: fg[type] || '#666' };
      };
    },
    statusLabel: function () {
      var m = { responding: '响应中', processing: '处置中', recovering: '恢复中', completed: '已完成', cancelled: '已取消' };
      return function (s) { return m[s] || s || ''; };
    },
    statusClass: function () {
      var m = { responding: 'badge-blue', processing: 'badge-orange', recovering: 'badge-green', completed: 'badge-gray', cancelled: 'badge-gray' };
      return function (s) { return m[s] || 'badge-gray'; };
    }
  },
  methods: {
    load: function () {
      var self = this;
      self.loading = true;
      var params = {};
      if (self.activeStatus !== 'all') params.status = self.activeStatus;
      return api.get('/api/mobile/emergencies', params).then(function (d) {
        self.list = (d && d.data) ? d.data : (Array.isArray(d) ? d : []);
      }).catch(function (e) {
        utils.toast((e && e.message) || '加载失败');
        self.list = [];
      }).then(function () {
        self.loading = false;
      });
    },
    onTab: function (k) {
      if (this.activeStatus === k) return;
      this.activeStatus = k;
      this.load();
    },
    tabClass: function (k) {
      return this.activeStatus === k ? 'active' : '';
    },
    goDetail: function (id) {
      utils.go('/emergency_form?id=' + id);
    },
    showNewForm: function () {
      utils.go('/emergency_form');
    },
    deviceLabel: function (item) {
      var name = item.device_name || '设备';
      return item.device_code ? (name + '（' + item.device_code + '）') : name;
    },
    showTrapped: function (item) {
      return !!(item.trapped_count && item.trapped_count > 0);
    },
    trappedText: function (item) {
      return item.trapped_count + ' 人被困';
    },
    startTime: function (item) {
      return utils.formatDateTime(item.start_time);
    },
    showDuration: function (item) {
      return !!item.start_time;
    },
    durationText: function (item) {
      var start = new Date(item.start_time).getTime();
      if (isNaN(start)) return '';
      var end = item.end_time ? new Date(item.end_time).getTime() : Date.now();
      var ms = end - start;
      if (ms < 0) ms = 0;
      var total = Math.floor(ms / 1000);
      var h = Math.floor(total / 3600);
      var m = Math.floor((total % 3600) / 60);
      var s = total % 60;
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      return (h > 0 ? h + '时' : '') + pad(m) + '分' + pad(s) + '秒';
    },
    stageIndex: function (item) {
      var m = { responding: 0, processing: 1, recovering: 2, completed: 3 };
      var s = item.status;
      return m[s] != null ? m[s] : -1;
    },
    stageClass: function (item, i) {
      var idx = this.stageIndex(item);
      if (idx < 0) return 'cancel';
      if (i < idx) return 'done';
      if (i === idx) return 'on';
      return '';
    },
    showConnector: function (i) {
      return i > 0;
    },
    connectorClass: function (item, i) {
      var idx = this.stageIndex(item);
      return (idx >= 0 && i <= idx) ? 'done' : '';
    }
  },
  mounted: function () {
    this.load();
  },
  template: `
  <div class="page em">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <template v-else>
      <div class="tabs-bar">
        <span v-for="t in tabs" :key="t.key" class="tab-item" :class="tabClass(t.key)" @click="onTab(t.key)">{{ t.label }}</span>
      </div>
      <div class="list-wrap">
        <div v-for="item in list" :key="item.id" class="list-item card" @click="goDetail(item.id)">
          <div class="em-top">
            <span class="em-dev">{{ deviceLabel(item) }}</span>
            <span class="badge" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
          </div>

          <div class="em-alarm" :style="alarmStyle(item.alarm_type)">
            <span class="em-alarm-icon">{{ alarmIcon(item.alarm_type) }}</span>
            <span>{{ item.alarm_type }}</span>
          </div>

          <div v-if="showTrapped(item)" class="em-trapped">{{ trappedText(item) }}</div>

          <div class="em-meta muted"><span>开始：{{ startTime(item) }}</span></div>
          <div v-if="showDuration(item)" class="em-duration">
            <span class="em-dur-label">持续</span>
            <span class="em-dur-value">{{ durationText(item) }}</span>
          </div>

          <div class="prog">
            <template v-for="(s,i) in stages" :key="s.key">
              <div v-if="showConnector(i)" class="prog-connector" :class="connectorClass(item, i)"></div>
              <div class="prog-step" :class="stageClass(item, i)">
                <div class="prog-dot"></div>
                <div class="prog-label">{{ s.label }}</div>
              </div>
            </template>
          </div>
        </div>
        <div v-if="showEmpty" class="empty-state"><span class="muted">暂无应急事件</span></div>
      </div>
      <div class="fab" @click="showNewForm">＋ 上报事件</div>
    </template>
  </div>
  `
};
