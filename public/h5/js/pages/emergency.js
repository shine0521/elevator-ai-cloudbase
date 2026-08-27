// 应急事件列表 → H5 (Vue3 global build)
// GET /api/mobile/emergencies → { data: [{ id, event_no, device_name, alarm_type, alarm_source, trapped_count, status, start_time, end_time }] }
// 状态 tab：全部 | 进行中 | 已完成
// Vue 模板安全：逻辑全部在 computed / methods，模板内无 && || 裸& > <
window.Pages = window.Pages || {};
window.Pages.emergency = {
  template: `
  <div class="page em">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <template v-else>
      <div class="tabs-bar">
        <span v-for="t in tabs" :key="t.key" class="tab-item" :class="tabClass(t.key)" @click="onTab(t.key)">{{ t.label }}</span>
      </div>

      <div class="list-wrap">
        <div v-for="item in filteredList" :key="item.id" class="list-item card" @click="goDetail(item.id)">
          <div class="em-top">
            <span class="em-dev">{{ deviceLabel(item) }}</span>
            <span class="status-badge" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
          </div>

          <div class="em-alarm" :style="{ background: alarmBg(item.alarm_type), color: alarmColor(item.alarm_type) }">
            <span class="em-alarm-icon">{{ alarmIcon(item.alarm_type) }}</span>
            <span class="em-alarm-type">{{ item.alarm_type }}</span>
          </div>

          <div v-if="showTrapped(item)" class="em-trapped">{{ trappedText(item) }}</div>

          <div class="em-meta muted">
            <span>开始：{{ startTime(item) }}</span>
          </div>
          <div v-if="showDuration(item)" class="em-duration">
            <span class="em-dur-label">持续</span>
            <span class="em-dur-value">{{ durationText(item) }}</span>
          </div>

          <!-- 4 阶段进度条 -->
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
  `,
  data: function () {
    return {
      loading: true,
      list: [],
      activeStatus: 'all',
      now: Date.now(),
      timer: null,
      tabs: [
        { key: 'all', label: '全部' },
        { key: 'ongoing', label: '进行中' },
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
    filteredList: function () {
      if (this.activeStatus === 'all') return this.list;
      if (this.activeStatus === 'completed') {
        return this.list.filter(function (x) { return x.status === 'completed'; });
      }
      if (this.activeStatus === 'ongoing') {
        return this.list.filter(function (x) { return x.status !== 'completed' && x.status !== 'cancelled'; });
      }
      var s = this.activeStatus;
      return this.list.filter(function (x) { return x.status === s; });
    },
    showEmpty: function () {
      return this.filteredList.length === 0;
    },
    // 带参 helper：以 computed 返回函数的方式实现，既在 computed 中声明又可在模板中传参调用
    alarmIcon: function () {
      var m = { '困人': '🛗', '坠落': '⬇️', '剪切': '✂️', '火灾': '🔥', '停电': '⚡', '其他': '⚠️' };
      return function (type) { return m[type] || '🚨'; };
    },
    alarmBg: function () {
      var m = { '困人': '#fff7e6', '坠落': '#fff1f0', '剪切': '#fff1f0', '火灾': '#fff1f0', '停电': '#fff7e6' };
      return function (type) { return m[type] || '#f5f5f5'; };
    },
    alarmColor: function () {
      var m = { '困人': '#d46b08', '坠落': '#cf1322', '剪切': '#cf1322', '火灾': '#cf1322', '停电': '#d46b08' };
      return function (type) { return m[type] || '#666'; };
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
  mounted: function () {
    this.load();
    var self = this;
    this.timer = setInterval(function () { self.now = Date.now(); }, 1000);
  },
  unmounted: function () {
    if (this.timer) clearInterval(this.timer);
  },
  methods: {
    load: async function () {
      this.loading = true;
      try {
        var d = await api.get('/api/mobile/emergencies');
        this.list = (d && d.data) ? d.data : (Array.isArray(d) ? d : []);
      } catch (e) {
        utils.toast((e && e.message) || '加载失败');
        this.list = [];
      } finally {
        this.loading = false;
      }
    },
    onTab: function (k) { this.activeStatus = k; },
    tabClass: function (k) { return this.activeStatus === k ? 'active' : ''; },
    goDetail: function (id) { utils.go('/emergency_form?id=' + id); },
    showNewForm: function () { utils.go('/emergency_form'); },

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
    startTime: function (item) { return utils.formatDateTime(item.start_time); },
    showDuration: function (item) { return !!item.start_time; },
    durationText: function (item) {
      var start = new Date(item.start_time).getTime();
      if (isNaN(start)) return '';
      var end = item.end_time ? new Date(item.end_time).getTime() : this.now;
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
    showConnector: function (i) { return i > 0; },
    connectorClass: function (item, i) {
      var idx = this.stageIndex(item);
      return (idx >= 0 && i <= idx) ? 'done' : '';
    }
  }
};
