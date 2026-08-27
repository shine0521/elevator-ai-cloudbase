// M-05 周排查列表
window.Pages = window.Pages || {};
window.Pages.weekly = {
  template: `
<div class="page">
  <div v-if="loading" class="empty-state"><text class="muted">加载中...</text></div>
  <div v-else-if="list.length===0" class="empty-state"><text class="muted">暂无周排查记录</text></div>
  <div v-else class="list-wrap">
    <div class="tab-bar card" style="margin-bottom:16rpx">
      <div v-for="t in tabs" :key="t.key"
        :class="['tab', activeTab===t.key?'active':'']"
        @click="activeTab=t.key">{{t.label}}</div>
    </div>
    <div v-for="item in filteredList" :key="item.id"
      class="list-item card"
      @click="goForm(item.id)">
      <div class="item-main">
        <div class="item-title">{{item.device_name || item.inspection_no || '记录' + item.id}}</div>
        <div class="status-badge" :style="{background:item.status==='PENDING'?'#FF8C00':'#52C41A',color:'#fff'}">{{item.status || '进行中'}}</div>
      </div>
      <div class="item-sub muted">{{item.inspection_date || item.create_time || ''}}</div>
    </div>
  </div>
</div>
`,
  data() {
    return {
      loading: true,
      list: [],
      activeTab: 'all',
      tabs: [
        { key: 'all', label: '全部' },
        { key: 'pending', label: '待执行' },
        { key: 'ongoing', label: '执行中' },
        { key: 'completed', label: '已完成' }
      ]
    };
  },
  computed: {
    filteredList() {
      if (this.activeTab === 'all') return this.list;
      return this.list.filter(x => x.status === this.activeTab);
    }
  },
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      try {
        const d = await api.get('/api/mobile/weekly');
        this.list = d.data || d || [];
        this.loading = false;
      } catch (e) {
        this.loading = false;
        utils.toast(e.message || '网络错误');
      }
    },
    goForm(id) {
      if (id) {
        utils.go('/weekly_form?id=' + id);
      } else {
        utils.go('/weekly_form');
      }
    }
  }
};
