// 消息中心
window.Pages = window.Pages || {};
window.Pages.message = {
  template: `
<div class="page">
  <div class="flex-between" style="margin-bottom:10px;">
    <div class="muted text-sm">未读 {{unreadTotal()}} 条</div>
    <button class="btn-mini" @click="readAll">全部已读</button>
  </div>

  <div class="flex" style="gap:6px; margin-bottom:10px;">
    <div v-for="t in catTabs" :key="t.key" :style="catTabStyle(t.key)" @click="switchCat(t.key)">
      {{t.label}}
    </div>
  </div>

  <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
  <div v-else-if="listEmpty" class="empty-state"><span class="muted">暂无消息</span></div>
  <div v-else>
    <div v-for="item in list" :key="item.id" class="msg-swipe">
      <div class="msg-del" @click="delMsg(item)">删除</div>
      <div class="msg-item" :class="item.is_read ? '' : 'unread'" :style="msgStyle(item)"
           @click="onTapMsg(item)"
           @touchstart="startSwipe(item, $event)"
           @touchmove="moveSwipe(item, $event)"
           @touchend="endSwipe(item)">
        <div class="msg-ico" :style="{background: categoryBg(item.category)}">{{categoryIcon(item.category)}}</div>
        <div class="msg-body">
          <div class="msg-t ellipsis">{{item.title}}</div>
          <div class="msg-c">{{item.content}}</div>
          <div class="msg-time">{{msgTime(item)}}</div>
        </div>
        <div v-if="!item.is_read" class="dot-unread"></div>
      </div>
    </div>
  </div>
</div>
`,
  data() {
    return {
      cat: 'all',
      list: [],
      stats: {},
      loading: true,
      openId: null,
      curOffset: 0,
      justSwiped: false,
      swiping: { id: null, startX: 0, base: 0, moved: false }
    };
  },
  computed: {
    catTabs: function () {
      return [
        { key: 'all', label: '全部' },
        { key: 'approval', label: '审批' },
        { key: 'warning', label: '预警' },
        { key: 'hazard', label: '隐患' },
        { key: 'emergency', label: '应急' },
        { key: 'system', label: '系统' }
      ];
    },
    listEmpty: function () {
      return this.list.length === 0;
    }
  },
  mounted() {
    this.load();
  },
  methods: {
    switchCat: function (key) {
      if (this.cat === key) return;
      this.cat = key;
      this.openId = null;
      this.curOffset = 0;
      this.load();
    },
    catTabStyle: function (key) {
      var active = this.cat === key;
      return {
        flex: '1',
        textAlign: 'center',
        padding: '8px 0',
        borderRadius: '8px',
        fontSize: '13px',
        cursor: 'pointer',
        background: active ? 'var(--primary)' : '#fff',
        color: active ? '#fff' : 'var(--text)',
        border: active ? '1px solid var(--primary)' : '1px solid var(--border)'
      };
    },
    unreadTotal: function () {
      return this.stats.unread_total || 0;
    },
    load: async function () {
      this.loading = true;
      try {
        var params = {};
        if (this.cat !== 'all') params.category = this.cat;
        var res = await api.get('/api/mobile/messages', params);
        this.list = res.data || res || [];
        var s = await api.get('/api/mobile/messages/stats');
        this.stats = s || {};
      } catch (e) {
        utils.toast('加载失败');
      } finally {
        this.loading = false;
      }
    },
    categoryLabel: function (cat) {
      var m = { approval: '审批', warning: '预警', hazard: '隐患', workorder: '工单', system: '系统', emergency: '应急' };
      return m[cat] || cat || '通知';
    },
    categoryIcon: function (cat) {
      var m = { approval: '✅', warning: '⚠️', hazard: '🔧', workorder: '📋', system: '⚙️', emergency: '🚨' };
      return m[cat] || '📢';
    },
    categoryBg: function (cat) {
      var m = { approval: '#52C41A', warning: '#FA8C16', hazard: '#1677FF', workorder: '#722ED1', system: '#999', emergency: '#FF4D4F' };
      return m[cat] || '#999';
    },
    relativeTime: function (ts) {
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
    msgTime: function (item) {
      return this.relativeTime(item.created_at || item.create_time);
    },
    msgStyle: function (item) {
      var off = 0;
      if (this.swiping.id === item.id) off = this.curOffset;
      else if (this.openId === item.id) off = -72;
      return { transform: 'translateX(' + off + 'px)', padding: '14px' };
    },
    startSwipe: function (item, e) {
      if (!e.touches || !e.touches.length) return;
      this.swiping.id = item.id;
      this.swiping.startX = e.touches[0].clientX;
      this.swiping.base = (this.openId === item.id) ? -72 : 0;
      this.swiping.moved = false;
      this.curOffset = this.swiping.base;
    },
    moveSwipe: function (item, e) {
      if (this.swiping.id !== item.id || !e.touches || !e.touches.length) return;
      var dx = e.touches[0].clientX - this.swiping.startX;
      if (Math.abs(dx) > 5) this.swiping.moved = true;
      var off = this.swiping.base + dx;
      if (off > 0) off = 0;
      if (off < -72) off = -72;
      this.curOffset = off;
    },
    endSwipe: function (item) {
      if (this.swiping.id !== item.id) return;
      var closed = this.curOffset > -36;
      if (closed) { this.openId = null; this.curOffset = 0; }
      else { this.openId = item.id; this.curOffset = -72; }
      this.justSwiped = this.swiping.moved;
      this.swiping.id = null;
    },
    onTapMsg: function (item) {
      if (this.justSwiped) { this.justSwiped = false; return; }
      if (this.openId === item.id) { this.openId = null; this.curOffset = 0; return; }
      if (!item.is_read) {
        this.markRead(item);
      }
    },
    markRead: async function (item) {
      try {
        await api.post('/api/mobile/messages/' + item.id + '/read');
        item.is_read = true;
        var s = await api.get('/api/mobile/messages/stats');
        this.stats = s || this.stats;
      } catch (e) { /* silent */ }
    },
    readAll: async function () {
      try {
        await api.post('/api/mobile/messages/read-all');
        this.list.forEach(function (it) { it.is_read = true; });
        this.stats = { unread_total: 0, by_category: {} };
        utils.toast('已全部标记已读');
      } catch (e) {
        utils.toast('操作失败');
      }
    },
    delMsg: async function (item) {
      try {
        await api.del('/api/mobile/messages/' + item.id);
        this.list = this.list.filter(function (it) { return it.id !== item.id; });
        this.openId = null;
        this.curOffset = 0;
        utils.toast('已删除');
      } catch (e) {
        utils.toast('删除失败');
      }
    }
  }
};
