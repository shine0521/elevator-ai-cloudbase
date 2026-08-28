// discriminate_history.js — 判别历史（H5）
// GET /api/discrimination-records?result&auditStatus&search
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md + server.js 路由段重写
// 铁律：模板无裸 && || < >；禁 SVG；根 .page；三态齐全
window.Pages = window.Pages || {};

window.Pages.discriminate_history = {
  name: 'discriminate_history',
  props: ['query'],

  data: function () {
    return {
      loading: true,
      error: null,
      seg: 'all',        // all | ok | ng | mb | pending
      search: '',
      list: [],
      total: 0
    };
  },

  computed: {
    hasList: function () { return this.list.length > 0; },
    segs: function () {
      return [
        { key: 'all', label: '全部' },
        { key: 'ok', label: '合规' },
        { key: 'ng', label: '不合规' },
        { key: 'mb', label: '待人工' },
        { key: 'pending', label: '待审核' }
      ];
    },
    isSeg: function () {
      var self = this;
      return function (k) { return self.seg === k; };
    }
  },

  methods: {
    go: function (p) { utils.go(p); },

    // 当前 segment 对应的查询参数
    buildParams: function () {
      var p = {};
      if (this.seg === 'ok') p.result = '合规';
      else if (this.seg === 'ng') p.result = '不合规';
      else if (this.seg === 'mb') p.result = '待人工';
      else if (this.seg === 'pending') p.auditStatus = 'pending';
      var kw = (this.search || '').trim();
      if (kw) p.search = kw;
      return p;
    },

    load: function () {
      var self = this;
      self.loading = true;
      self.error = null;
      api.getDiscriminationRecords(self.buildParams()).then(function (d) {
        var arr = (d && d.data) || d || [];
        self.list = Array.isArray(arr) ? arr : [];
        self.total = (d && typeof d.total === 'number') ? d.total : self.list.length;
      }).catch(function () {
        self.error = '历史加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    switchSeg: function (k) {
      if (this.seg === k) return;
      this.seg = k;
      this.load();
    },

    doSearch: function () { this.load(); },

    goDetail: function (id) { this.go('/discriminate_detail?id=' + id); },

    // final_result → tag 类
    resultTag: function (fr) {
      if (fr === '合规') return 'tag-ok';
      if (fr === '不合规') return 'tag-ng';
      if (fr === '待人工') return 'tag-mb';
      return 'tag-info';
    },
    resultText: function (fr) { return fr || '—'; },

    // audit_status → tag 类 + 文字
    auditTag: function (s) {
      if (s === 'pending') return 'tag-pending';
      if (s === 'approved') return 'tag-published';
      if (s === 'rejected') return 'tag-ng';
      return 'tag-draft';
    },
    auditText: function (s) {
      var m = { pending: '待审核', approved: '已审核', rejected: '已驳回' };
      return m[String(s || '').toLowerCase()] || (s || '未审核');
    },

    tplName: function (r) { return r.template_name || '模板判别'; },
    inputPreview: function (r) {
      var t = r.input_text || '';
      return t.length > 24 ? t.substring(0, 24) + '…' : t;
    },
    createdAt: function (r) { return utils.formatDateTime(r.created_at || ''); },
    confText: function (r) {
      var c = r.ai_confidence;
      if (c === null || c === undefined || c === '') return '';
      return Math.round(Number(c) * 100) + '%';
    }
  },

  mounted: function () { this.load(); },

  template: `
<div class="page">
  <div v-if="loading" class="loading-wrap">
    <div class="spinner"></div>
    <div>加载中...</div>
  </div>

  <div v-else-if="error" class="error-wrap">
    <div>⚠️</div>
    <div>{{ error }}</div>
    <button class="btn-primary" style="margin-top:14px;width:auto;padding:9px 20px;" @click="load">重 试</button>
  </div>

  <template v-else>
    <div class="seg" style="margin-bottom:10px;">
      <button v-for="(s, i) in segs" :key="s.key" :class="isSeg(s.key) ? 'on' : ''" @click="switchSeg(s.key)">{{ s.label }}</button>
    </div>

    <div class="search-bar">
      <input v-model="search" @input="doSearch" placeholder="搜索模板 / 描述" />
    </div>

    <div v-if="!hasList" class="empty-state">
      <div style="font-size:32px;">📂</div>
      <div class="muted" style="margin-top:8px;">暂无判别记录</div>
    </div>

    <div v-else class="list">
      <div v-for="(r, i) in list" :key="r.id || i" class="list-item" @click="goDetail(r.id)">
        <div class="li-icon">⚖️</div>
        <div class="li-body">
          <div class="li-title">{{ tplName(r) }}</div>
          <div class="li-sub">{{ inputPreview(r) }}</div>
          <div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <span class="tag" :class="resultTag(r.final_result)">{{ resultText(r.final_result) }}</span>
            <span class="tag" :class="auditTag(r.audit_status)">{{ auditText(r.audit_status) }}</span>
            <span v-if="confText(r)" class="muted" style="font-size:12px;">AI {{ confText(r) }}</span>
          </div>
        </div>
        <div style="margin-left:8px;flex-shrink:0;text-align:right;">
          <div class="li-arrow">›</div>
          <div class="muted" style="font-size:11px;margin-top:4px;">{{ createdAt(r) }}</div>
        </div>
      </div>
    </div>
  </template>
</div>
`
};
