// 消息中心
window.Pages = window.Pages || {};
window.Pages.message = {
  name: 'message',
  props: ['query'],
  template: `
<div class="page">
  <!-- 统计栏 -->
  <div class="flex-between" style="padding:8px 0 10px;border-bottom:1px solid var(--border);margin-bottom:10px;">
    <div class="muted text-sm">未读 {{unreadCount}} 条</div>
    <button class="btn-sm btn-ghost" :disabled="submitting" @click="markAllRead">全部已读</button>
  </div>

  <!-- 分类 Tab -->
  <div class="filter-bar" style="margin-bottom:10px;">
    <div v-for="t in catTabs" :key="t.key"
      :class="['check-tab', isActiveCat(t.key) ? 'check-tab-on' : '']"
      @click="switchCat(t.key)">
      {{t.label}}
      <span v-if="catBadge(t.key) > 0" class="badge badge-orange" style="margin-left:3px;">{{catBadge(t.key)}}</span>
    </div>
  </div>

  <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
  <div v-else-if="listEmpty" class="empty-state"><span class="muted">暂无消息</span></div>
  <div v-else>
    <div v-for="(item, i) in list" :key="item.id || i" class="msg-swipe">
      <div class="msg-del" @click="delMsg(item)">删除</div>
      <div class="msg-item" :class="isUnread(item) ? 'unread' : ''"
        :style="msgStyle(item)"
        @click="onTap(item)"
        @touchstart="startSwipe(item, $event)"
        @touchmove="moveSwipe(item, $event)"
        @touchend="endSwipe(item)">
        <div class="msg-ico" :style="{background: catBg(item.category)}">{{catIcon(item.category)}}</div>
        <div class="msg-body">
          <div class="msg-t ellipsis">{{item.title}}</div>
          <div class="msg-c">{{item.content}}</div>
          <div class="msg-time">{{msgTime(item)}}</div>
        </div>
        <div v-if="isUnread(item)" class="dot-unread"></div>
      </div>
    </div>
  </div>
</div>
`,
  data: function () {
    return {
      cat: 'all',
      list: [],
      stats: {},
      loading: true,
      submitting: false,
      openId: null,
      curOffset: 0,
      justSwiped: false,
      swiping: { id: null, startX: 0, base: 0, moved: false }
    };
  },
  computed: {
    catTabs: function () {
      return [
        { key: 'all',      label: '全部' },
        { key: 'approval', label: '审批' },
        { key: 'warning',  label: '预警' },
        { key: 'workorder',label: '工单' },
        { key: 'system',   label: '系统' },
        { key: 'emergency',label: '应急' }
      ];
    },
    listEmpty: function () { return this.list.length === 0; },
    unreadCount: function () {
      return this.stats.unread || this.stats.unread_total || 0;
    }
  },
  mounted: function () { this.load(); },
  methods: {
    isActiveCat: function (key) { return this.cat === key; },
    switchCat: function (key) {
      if (this.cat === key) return;
      this.cat = key;
      this.openId = null;
      this.curOffset = 0;
      this.load();
    },
    catBadge: function (key) {
      if (key === 'all') return this.unreadCount;
      var m = {
        approval: this.stats.approvalUnread || 0,
        warning: this.stats.warningUnread || 0,
        workorder: this.stats.workorderUnread || 0,
        emergency: this.stats.emergencyUnread || 0,
        system: 0
      };
      return m[key] || 0;
    },
    isUnread: function (item) { return !item.is_read; },
    load: function () {
      var self = this;
      self.loading = true;
      var params = {};
      if (self.cat !== 'all') params.category = self.cat;
      Promise.all([
        api.getMessages(params),
        api.getMessageStats()
      ]).then(function (results) {
        var d = results[0];
        var s = results[1];
        self.list = d.data || d || [];
        self.stats = s || {};
      }).catch(function () {
        utils.toast('加载失败');
      }).finally(function () {
        self.loading = false;
      });
    },
    catIcon: function (cat) {
      var m = {
        approval: '审',
        warning: '警',
        workorder: '工',
        system: '系',
        emergency: '应',
        hazard: '患'
      };
      return m[cat] || '通';
    },
    catBg: function (cat) {
      var m = {
        approval: '#52C41A',
        warning: '#FA8C16',
        workorder: '#722ED1',
        system: '#999',
        emergency: '#FF4D4F',
        hazard: '#1677FF'
      };
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
    onTap: function (item) {
      if (this.justSwiped) { this.justSwiped = false; return; }
      if (this.openId === item.id) { this.openId = null; this.curOffset = 0; return; }
      if (!item.is_read) {
        this.markRead(item);
      }
      // 跳转到关联页面
      this.navigateRelated(item);
    },
    markRead: function (item) {
      var self = this;
      api.markRead(item.id).then(function () {
        item.is_read = true;
        return api.getMessageStats();
      }).then(function (s) {
        self.stats = s || {};
      }).catch(function () {});
    },
    markAllRead: function () {
      var self = this;
      if (self.submitting) return;
      self.submitting = true;
      api.markAllRead().then(function () {
        self.list.forEach(function (it) { it.is_read = true; });
        self.stats = { unread: 0, unread_total: 0 };
        utils.toast('已全部标记已读');
      }).catch(function () {
        utils.toast('操作失败');
      }).finally(function () {
        self.submitting = false;
      });
    },
    delMsg: function (item) {
      var self = this;
      api.del('/api/mobile/messages/' + item.id).then(function () {
        self.list = self.list.filter(function (it) { return it.id !== item.id; });
        if (self.openId === item.id) { self.openId = null; self.curOffset = 0; }
        utils.toast('已删除');
      }).catch(function () {
        utils.toast('删除失败');
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
        approval: '/approval_detail?id=' + rid,
        approval_detail: '/approval_detail?id=' + rid,
        emergency: '/emergency_form?id=' + rid
      };
      var path = map[rt];
      if (path) utils.go(path);
    }
  }
};
