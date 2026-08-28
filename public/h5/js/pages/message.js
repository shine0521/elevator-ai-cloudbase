// 消息中心 - H5 (Vue3 全局构建, 按契约重写)
// 契约 #22: GET /api/mobile/messages?category → {data:[{id,category,title,content,is_read,created_at}]}
// 契约 #22: 已读 POST /api/mobile/messages/:id/read; 全部已读 POST /api/mobile/messages/read-all
// 铁律: v-model 仅限 input/select/textarea; 模板禁裸 && || < >; 根 <div class="page">; 三态齐全; 禁 SVG
window.Pages = window.Pages || {};
window.Pages.message = {
  name: 'message',
  props: ['query'],
  data: function () {
    return {
      loading: true,
      error: false,
      list: [],
      stats: {},
      activeCat: 'all',
      submitting: false,
      tabs: [
        { key: 'all', label: '全部' },
        { key: 'approval', label: '审批' },
        { key: 'warning', label: '预警' },
        { key: 'workorder', label: '工单' },
        { key: 'system', label: '系统' },
        { key: 'emergency', label: '应急' }
      ]
    };
  },
  computed: {
    showEmpty: function () {
      return !this.loading && !this.error && this.list.length === 0;
    },
    unreadCount: function () {
      return this.stats.unread || this.stats.unread_total || 0;
    },
    catIconMap: function () {
      return {
        approval: '⚖️',
        warning: '⚠️',
        workorder: '🔧',
        system: '⚙️',
        emergency: '🚨',
        hazard: '🔍'
      };
    },
    catColorMap: function () {
      return {
        approval: 'var(--success)',
        warning: 'var(--warning)',
        workorder: 'var(--purple)',
        system: 'var(--info)',
        emergency: 'var(--danger)',
        hazard: 'var(--primary)'
      };
    }
  },
  methods: {
    load: function () {
      var self = this;
      self.loading = true;
      self.error = false;
      var params = {};
      if (self.activeCat !== 'all') {
        params.category = self.activeCat;
      }
      Promise.all([
        api.get('/api/mobile/messages', params),
        api.get('/api/mobile/messages/stats')
      ]).then(function (results) {
        var d = results[0];
        var s = results[1];
        self.list = (d && d.data) ? d.data : (Array.isArray(d) ? d : []);
        self.stats = s || {};
      }).catch(function (e) {
        self.error = true;
        utils.toast((e && e.message) || '加载失败');
      }).then(function () {
        self.loading = false;
      });
    },
    onTab: function (k) {
      if (this.activeCat === k) return;
      this.activeCat = k;
      this.load();
    },
    tabClass: function (k) {
      return this.activeCat === k ? 'active' : '';
    },
    catBadge: function (key) {
      if (key === 'all') return this.unreadCount;
      var map = {
        approval: this.stats.approvalUnread || 0,
        warning: this.stats.warningUnread || 0,
        workorder: this.stats.workorderUnread || 0,
        emergency: this.stats.emergencyUnread || 0,
        system: 0
      };
      return map[key] || 0;
    },
    showBadge: function (key) {
      return this.catBadge(key) > 0;
    },
    catIcon: function (cat) {
      return this.catIconMap[cat] || '📩';
    },
    catColor: function (cat) {
      return this.catColorMap[cat] || 'var(--info)';
    },
    isUnread: function (item) {
      return !item.is_read;
    },
    msgTime: function (item) {
      return utils.formatDateTime(item.created_at);
    },
    relativeTime: function (item) {
      var ts = item.created_at;
      if (!ts) return '';
      var d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts);
      var diff = Date.now() - d.getTime();
      var mins = Math.floor(diff / 60000);
      if (mins < 1) return '刚刚';
      if (mins < 60) return mins + '分钟前';
      var hours = Math.floor(mins / 60);
      if (hours < 24) return hours + '小时前';
      var days = Math.floor(hours / 24);
      return days + '天前';
    },
    onTap: function (item) {
      if (this.isUnread(item)) {
        this.markRead(item);
      }
      this.navigateRelated(item);
    },
    markRead: function (item) {
      var self = this;
      api.post('/api/mobile/messages/' + item.id + '/read').then(function () {
        item.is_read = true;
        return api.get('/api/mobile/messages/stats');
      }).then(function (s) {
        self.stats = s || {};
      }).catch(function () {});
    },
    markAllRead: function () {
      var self = this;
      if (self.submitting) return;
      self.submitting = true;
      api.post('/api/mobile/messages/read-all').then(function () {
        self.list.forEach(function (it) {
          it.is_read = true;
        });
        self.stats = { unread: 0, unread_total: 0 };
        utils.toast('已全部标记已读');
      }).catch(function (e) {
        utils.toast((e && e.message) || '操作失败');
      }).then(function () {
        self.submitting = false;
      });
    },
    navigateRelated: function (item) {
      var rt = item.related_type || item.category;
      var rid = item.related_id || item.business_id;
      if (!rid) return;
      var map = {
        daily_inspection: '/daily_detail?id=' + rid,
        weekly_inspection: '/weekly_detail?id=' + rid,
        hazard: '/hazard_detail?id=' + rid,
        work_order: '/work_order_detail?id=' + rid,
        workorder: '/work_order_detail?id=' + rid,
        approval: '/approval_detail?id=' + rid,
        emergency: '/emergency_form?id=' + rid
      };
      var path = map[rt];
      if (path) utils.go(path);
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
    <!-- 统计栏 -->
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div class="text-2">未读 <span class="text-primary fw6">{{ unreadCount }}</span> 条</div>
      <button class="btn btn-ghost btn-sm" :disabled="submitting" @click="markAllRead">全部已读</button>
    </div>

    <!-- 分类 Tab -->
    <div class="seg">
      <span v-for="t in tabs" :key="t.key" class="seg-item" :class="tabClass(t.key)" @click="onTab(t.key)">
        {{ t.label }}
        <span v-if="showBadge(t.key)" class="badge tag-pending" style="margin-left:4px;">{{ catBadge(t.key) }}</span>
      </span>
    </div>

    <div v-if="showEmpty" class="empty-state">
      <div class="muted">📩 暂无消息</div>
    </div>

    <div v-else class="list">
      <div v-for="item in list" :key="item.id" class="list-item card" :class="isUnread(item) ? 'unread' : ''" @click="onTap(item)">
        <div class="li-row">
          <div class="li-icon" :style="{background: catColor(item.category)}">{{ catIcon(item.category) }}</div>
          <div style="flex:1;min-width:0;">
            <div class="li-row">
              <span class="li-title">{{ item.title }}</span>
              <span v-if="isUnread(item)" class="badge tag-pending">未读</span>
            </div>
            <div class="li-sub text-2" style="margin-top:4px;">{{ item.content }}</div>
            <div class="li-sub muted" style="margin-top:4px;">{{ msgTime(item) }} · {{ relativeTime(item) }}</div>
          </div>
        </div>
      </div>
    </div>
  </template>
</div>
`
};
