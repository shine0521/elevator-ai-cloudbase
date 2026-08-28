// 应急事件列表 - H5 (Vue3 全局构建, 按契约重写)
// 契约 #18: GET /api/mobile/emergencies?status → {data:[{id,alarm_type,device_code,device_name,location,trapped_count,status,start_time,end_time}]}
// 铁律: v-model 仅限 input/select/textarea; 模板禁裸 && || < >; 根 <div class="page">; 三态齐全; 禁 SVG
window.Pages = window.Pages || {};
window.Pages.emergency = {
  name: 'emergency',
  props: ['query'],
  data: function () {
    return {
      loading: true,
      error: false,
      list: [],
      activeStatus: 'all',
      tabs: [
        { key: 'all', label: '全部' },
        { key: 'responding', label: '响应中' },
        { key: 'processing', label: '处置中' },
        { key: 'recovering', label: '恢复中' },
        { key: 'completed', label: '已完成' }
      ]
    };
  },
  computed: {
    showEmpty: function () {
      return !this.loading && !this.error && this.list.length === 0;
    },
    statusLabelMap: function () {
      return {
        responding: '响应中',
        processing: '处置中',
        recovering: '恢复中',
        completed: '已完成',
        cancelled: '已取消'
      };
    },
    statusClassMap: function () {
      return {
        responding: 'tag-info',
        processing: 'tag-pending',
        recovering: 'tag-completed',
        completed: 'tag-ok',
        cancelled: 'tag-low'
      };
    }
  },
  methods: {
    load: function () {
      var self = this;
      self.loading = true;
      self.error = false;
      var params = {};
      if (self.activeStatus !== 'all') {
        params.status = self.activeStatus;
      }
      api.get('/api/mobile/emergencies', params).then(function (d) {
        self.list = (d && d.data) ? d.data : (Array.isArray(d) ? d : []);
      }).catch(function (e) {
        self.error = true;
        utils.toast((e && e.message) || '加载失败');
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
      var code = item.device_code;
      return code ? (name + '（' + code + '）') : name;
    },
    alarmIcon: function (type) {
      var map = {
        '困人': '🛗',
        '坠落': '⬇️',
        '剪切': '✂️',
        '火灾': '🔥',
        '扶梯伤人': '⚠️',
        '停电': '⚡',
        '自然灾害': '🌪️',
        '其他': '🚨'
      };
      return map[type] || '🚨';
    },
    statusLabel: function (s) {
      return this.statusLabelMap[s] || s || '';
    },
    statusClass: function (s) {
      return this.statusClassMap[s] || 'tag-low';
    },
    showTrapped: function (item) {
      var count = item.trapped_count;
      return count && count > 0;
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
      var startMs = new Date(item.start_time).getTime();
      if (isNaN(startMs)) return '';
      var endMs = item.end_time ? new Date(item.end_time).getTime() : Date.now();
      var diffMs = endMs - startMs;
      if (diffMs < 0) diffMs = 0;
      var totalSec = Math.floor(diffMs / 1000);
      var h = Math.floor(totalSec / 3600);
      var m = Math.floor((totalSec % 3600) / 60);
      var s = totalSec % 60;
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      return (h > 0 ? h + '时' : '') + pad(m) + '分' + pad(s) + '秒';
    }
  },
  mounted: function () {
    this.load();
  },
  template: `
<div class="page">
  <div v-if="loading" class="empty-state">
    <div class="loading-spinner"></div>
    <div class="muted" style="margin-top:12px;">加载中...</div>
  </div>

  <div v-else-if="error" class="empty-state">
    <div class="text-danger">❌ 加载失败</div>
    <button class="btn btn-primary" style="margin-top:16px;" @click="load">重试</button>
  </div>

  <template v-else>
    <div class="seg">
      <span v-for="t in tabs" :key="t.key" class="seg-item" :class="tabClass(t.key)" @click="onTab(t.key)">{{ t.label }}</span>
    </div>

    <div v-if="showEmpty" class="empty-state">
      <div class="muted">🚨 暂无应急事件</div>
    </div>

    <div v-else class="list">
      <div v-for="item in list" :key="item.id" class="list-item card" @click="goDetail(item.id)">
        <div class="li-row">
          <span class="li-title">{{ deviceLabel(item) }}</span>
          <span class="tag" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
        </div>

        <div class="li-sub text-2">
          <span class="text-primary">{{ alarmIcon(item.alarm_type) }}</span>
          <span style="margin-left:4px;">{{ item.alarm_type }}</span>
        </div>

        <div v-if="showTrapped(item)" class="li-sub text-warning">
          ⚠️ {{ trappedText(item) }}
        </div>

        <div class="li-sub muted">
          <span>开始：{{ startTime(item) }}</span>
          <span v-if="showDuration(item)" style="margin-left:12px;">持续：{{ durationText(item) }}</span>
        </div>

        <div v-if="item.location" class="li-sub muted">📍 {{ item.location }}</div>
      </div>
    </div>

    <div class="fab" @click="showNewForm">🚨 上报</div>
  </template>
</div>
`
};
