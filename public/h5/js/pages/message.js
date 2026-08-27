window.Pages = window.Pages || {};
window.Pages.message = {
  template: `
<div class="page">
  <!-- 顶部统计栏 -->
  <div class="stats-bar card">
    <div class="stats-total" @click="readAll">
      <span class="num">{{stats.total}}</span>
      <span class="lbl">未读消息</span>
      <span class="mark-all">全部已读 ›</span>
    </div>
    <div class="stats-row">
      <div class="stat-chip" @click="goCat('approval')" :style="{borderColor: catColor('approval'), color: catColor('approval')}">
        <span>{{catIcon('approval')}} 审批 {{stats.approval}}</span>
      </div>
      <div class="stat-chip" @click="goCat('warning')" :style="{borderColor: catColor('warning'), color: catColor('warning')}">
        <span>{{catIcon('warning')}} 预警 {{stats.warning}}</span>
      </div>
      <div class="stat-chip" @click="goCat('workorder')" :style="{borderColor: catColor('workorder'), color: catColor('workorder')}">
        <span>{{catIcon('workorder')}} 工单 {{stats.workorder}}</span>
      </div>
      <div class="stat-chip" @click="goCat('emergency')" :style="{borderColor: catColor('emergency'), color: catColor('emergency')}">
        <span>{{catIcon('emergency')}} 应急 {{stats.emergency}}</span>
      </div>
    </div>
  </div>

  <!-- 消息列表 -->
  <div v-if="loading" class="empty-state">
    <span class="muted">加载中...</span>
  </div>
  <div v-else-if="list.length === 0" class="empty-state">
    <span class="muted">暂无消息</span>
  </div>
  <div v-else class="msg-list">
    <div
      v-for="item in list"
      :key="item.id"
      class="msg-item card"
      :class="item.is_read ? 'readed' : 'unread'"
      @click="onTapMsg(item)"
      :data-id="item.id"
    >
      <div class="msg-icon" :style="{background: catColor(item.category)}">
        {{catIcon(item.category)}}
      </div>
      <div class="msg-body">
        <div class="msg-title">{{item.title}}</div>
        <div class="msg-content muted">{{item.content}}</div>
        <div class="msg-time muted">{{item.create_time || item.created_at}}</div>
      </div>
      <div v-if="!item.is_read" class="unread-dot"></div>
    </div>
  </div>
</div>
  `,
  data() {
    return {
      stats: { total: 0, approval: 0, warning: 0, workorder: 0, emergency: 0 },
      list: [],
      loading: true
    };
  },
  mounted() {
    this.load();
  },
  methods: {
    catIcon(cat) {
      const m = { approval: '✅', warning: '⚠️', workorder: '🔧', emergency: '🚨', other: '📢' };
      return m[cat] || m.other;
    },
    catColor(cat) {
      const m = { approval: '#1082FF', warning: '#FAAD14', workorder: '#52C41A', emergency: '#F5222D', other: '#999' };
      return m[cat] || m.other;
    },
    async load() {
      this.loading = true;
      try {
        const [msgs, stats] = await Promise.all([
          api.get('/api/mobile/messages'),
          api.get('/api/mobile/messages/stats')
        ]);
        this.list = msgs.data || msgs || [];
        this.stats = stats || { total: 0, approval: 0, warning: 0, workorder: 0, emergency: 0 };
      } catch (e) {
        utils.toast(e.message || '网络错误');
      } finally {
        this.loading = false;
      }
    },
    async onTapMsg(item) {
      try {
        await api.post('/api/mobile/messages/' + item.id + '/read');
        item.is_read = true;
        // 刷新统计
        const stats = await api.get('/api/mobile/messages/stats');
        this.stats = stats || { total: 0, approval: 0, warning: 0, workorder: 0, emergency: 0 };
      } catch (e) {
        utils.toast('网络错误');
      }
      // 跳转详情
      if (item.biz_type && item.biz_id) {
        const routes = {
          inspection: '/daily_form',
          daily: '/daily_form',
          weekly: '/weekly_form',
          hazard: '/hazard_form',
          approval: '/approval_detail',
          emergency: '/emergency'
        };
        const base = routes[item.biz_type];
        if (base) utils.go(base + '?id=' + item.biz_id);
      }
    },
    async readAll() {
      try {
        await api.post('/api/mobile/messages/read-all');
        utils.toast('已全部标记已读');
        this.load();
      } catch (e) {
        utils.toast('网络错误');
      }
    },
    goCat(cat) {
      if (cat === 'approval') utils.go('/approval');
      else if (cat === 'emergency') utils.go('/emergency');
      else utils.toast('该分类暂无可跳转页面');
    }
  }
};
