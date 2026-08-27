// 日管控详情
window.Pages.daily_detail = {
  name: 'daily_detail',
  props: ['query'],
  data: function () {
    return {
      loading: true,
      insp: null,
      items: []
    };
  },
  computed: {
    deviceName: function () {
      var i = this.insp;
      if (!i) return '';
      return i.device_name || i.device_code || ('设备 #' + i.device_id);
    }
  },
  methods: {
    load: function () {
      var self = this;
      var id = this.query && this.query.id;
      if (!id) { utils.toast('缺少记录 ID'); this.loading = false; return; }
      api.getInspection(id).then(function (d) {
        var data = d.data || d;
        self.insp = data;
        self.items = data.items || [];
        self.loading = false;
      }).catch(function (e) {
        self.loading = false;
        utils.toast((e && e.message) || '加载失败');
      });
    },
    statusLabel: function (s) { return utils.statusLabel(s); },
    statusColor: function (s) { return utils.statusColor(s); },
    fmt: function (s) { return utils.formatDate(s); },
    inputVal: function (it) { return it.input_value ? it.input_value : '—'; },
    resultColor: function (r) {
      if (r === 'pass') return 'var(--success)';
      if (r === 'fail') return 'var(--danger)';
      return 'var(--muted)';
    },
    resultLabel: function (r) {
      if (r === 'pass') return '通过';
      if (r === 'fail') return '异常';
      return '待判';
    },
    hasPhoto: function (it) {
      return Array.isArray(it.photos) && it.photos.length > 0;
    }
  },
  mounted: function () { this.load(); },
  template: `
  <div class="page">
    <div v-if="loading" class="empty-state">
      <div class="empty-icon">⏳</div>
      <div class="empty-title">加载中…</div>
    </div>
    <template v-else-if="insp">
      <div class="card">
        <div class="card-title">{{deviceName}}</div>
        <div class="card-sub">{{insp.device_code}} · {{insp.location}}</div>
        <div class="divider"></div>
        <div class="row-between"><span class="muted">检查日期</span><span>{{fmt(insp.check_date)}}</span></div>
        <div class="row-between"><span class="muted">检查人</span><span>{{insp.inspector_name}}</span></div>
        <div class="row-between"><span class="muted">状态</span><span class="badge" :style="{color:statusColor(insp.status),borderColor:statusColor(insp.status)}">{{statusLabel(insp.status)}}</span></div>
        <div class="row-between" v-if="insp.signature"><span class="muted">签名</span><span>{{insp.signature}}</span></div>
      </div>
      <div class="block-title">检查项（{{items.length}}）</div>
      <div class="card" v-for="(it,i) in items" :key="it.id || i">
        <div class="fi-label">{{it.item_name}}</div>
        <div class="fi-readonly">{{inputVal(it)}}</div>
        <div class="btn-row" style="margin-top:8px;">
          <span class="badge" :style="{color:resultColor(it.compare_result),borderColor:resultColor(it.compare_result)}">{{resultLabel(it.compare_result)}}</span>
          <span v-if="hasPhoto(it)" class="badge-blue badge">📷 照片</span>
        </div>
      </div>
    </template>
    <div v-else class="empty-state">
      <div class="empty-icon">⚠️</div>
      <div class="empty-title">未找到记录</div>
    </div>
  </div>`
};
