// M-08 隐患排查列表 → H5 (Vue3 global build, 重构)
// GET /api/mobile/hazards  {data:[], total}  支持 status / riskLevel / deviceId
// 顶部风险筛选（横滑标签）+ 状态子筛选 + 隐患卡片 + FAB 上报
window.Pages = window.Pages || {};
window.Pages.hazard = {
  template: `
  <div class="page haz">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <template v-else>
      <!-- 风险筛选（横向滚动） -->
      <div class="risk-tabs">
        <div v-for="t in riskTabs" :key="t.key" class="risk-tab" :class="riskActive(t.key)" @click="activeRisk = t.key">
          <span class="dot" :class="t.dot"></span>{{t.label}}
        </div>
      </div>

      <!-- 状态子筛选 -->
      <div class="status-tabs">
        <div v-for="s in statusTabs" :key="s.key" class="status-tab" :class="statusActive(s.key)" @click="activeStatus = s.key">
          {{s.label}}
        </div>
      </div>

      <div class="list-wrap">
        <div v-for="item in filteredList" :key="item.id" class="hcard" @click="goDetail(item.id)">
          <div class="hcard-top">
            <div class="hcard-desc">{{item.description}}</div>
            <span class="badge" :class="riskClass(item.risk_level)">{{riskLabel(item.risk_level)}}</span>
          </div>
          <div class="hcard-sub muted">{{deviceLine(item)}}</div>
          <div class="hcard-foot">
            <span class="badge" :class="statusClass(item.status)">{{statusLabel(item.status)}}</span>
            <span class="hcard-time muted">{{findTime(item)}}</span>
          </div>
          <div v-if="item.deadline" class="hcard-deadline">整改期限：{{item.deadline}}</div>
        </div>
        <div v-if="!filteredList.length" class="empty-state"><span class="muted">暂无隐患记录</span></div>
      </div>
    </template>
    <button class="fab" @click="goForm">上报隐患</button>

  </div>
  `,
  data() {
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
    riskLabel: function (level) {
      var m = { critical: '重大', major: '较大', general: '一般', low: '低' };
      return m[level] || level || '';
    },
    riskClass: function (level) {
      var m = { critical: 'badge-red', major: 'badge-orange', general: 'badge-yellow', low: 'badge-green' };
      return m[level] || 'badge-gray';
    },
    statusLabel: function (s) {
      var m = { pending: '待整改', rectifying: '整改中', verifying: '待验收', closed: '已关闭' };
      return m[s] || s || '';
    },
    statusClass: function (s) {
      var m = { pending: 'badge-orange', rectifying: 'badge-blue', verifying: 'badge-green', closed: 'badge-gray' };
      return m[s] || 'badge-gray';
    },
    filteredList: function () {
      var list = this.list;
      if (this.activeRisk !== 'all') list = list.filter(function (x) { return x.risk_level === this.activeRisk; }.bind(this));
      if (this.activeStatus !== 'all') list = list.filter(function (x) { return x.status === this.activeStatus; }.bind(this));
      return list;
    }
  },
  mounted() { this.load(); },
  methods: {
    async load() {
      try {
        const d = await api.get('/api/mobile/hazards', { page: 1, size: 200 });
        this.list = d.data || d || [];
      } catch (e) {
        utils.toast(e.message || '网络错误');
      } finally {
        this.loading = false;
      }
    },
    goForm() { utils.go('/hazard_form'); },
    goDetail(id) { utils.go('/hazard_detail?id=' + id); },
    riskActive(key) { return this.activeRisk === key ? 'on' : ''; },
    statusActive(key) { return this.activeStatus === key ? 'on' : ''; },
    deviceLine(item) {
      var line = item.device_name || item.deviceName || '未知设备';
      if (item.location) line = line + ' · ' + item.location;
      else if (item.device_location) line = line + ' · ' + item.device_location;
      return line;
    },
    findTime(item) {
      var t = item.find_time || item.findTime || item.createdAt || item.create_time || item.created_at || '';
      return t ? utils.formatTime(t) : '';
    }
  }
};
