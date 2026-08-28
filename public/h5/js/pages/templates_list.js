// templates_list.js — 模板库（管理员，H5）
// GET /api/templates?category&status&search
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md + server.js 路由段重写
// 铁律：模板无裸 && || < >；禁 SVG；根 .page；三态齐全
window.Pages = window.Pages || {};

window.Pages.templates_list = {
  name: 'templates_list',
  props: ['query'],

  data: function () {
    return {
      loading: true,
      error: null,
      status: 'all',     // all | published | draft | archived
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
        { key: 'published', label: '已发布' },
        { key: 'draft', label: '草稿' },
        { key: 'archived', label: '归档' }
      ];
    },
    isSeg: function () {
      var self = this;
      return function (k) { return self.status === k; };
    }
  },

  methods: {
    go: function (p) { utils.go(p); },

    buildParams: function () {
      var p = {};
      if (this.status !== 'all') p.status = this.status;
      var kw = (this.search || '').trim();
      if (kw) p.search = kw;
      return p;
    },

    load: function () {
      var self = this;
      self.loading = true;
      self.error = null;
      api.getTemplates(self.buildParams()).then(function (d) {
        var arr = (d && d.data) || d || [];
        self.list = Array.isArray(arr) ? arr : [];
        self.total = (d && typeof d.total === 'number') ? d.total : self.list.length;
      }).catch(function () {
        self.error = '模板加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    switchSeg: function (k) {
      if (this.status === k) return;
      this.status = k;
      this.load();
    },

    doSearch: function () { this.load(); },

    goDetail: function (id) { this.go('/template_detail?id=' + id); },

    statusTag: function (s) {
      var m = { published: 'tag-published', draft: 'tag-draft', archived: 'tag-archived' };
      return m[String(s || '').toLowerCase()] || 'tag-draft';
    },
    statusText: function (s) {
      var m = { published: '已发布', draft: '草稿', archived: '归档' };
      return m[String(s || '').toLowerCase()] || (s || '草稿');
    },
    tplName: function (t) { return t.name || '未命名模板'; },
    tplCode: function (t) { return t.code || ''; },
    tplCat: function (t) { return t.category || '通用'; },
    tplDevice: function (t) { return t.device_type || ''; },
    tplStage: function (t) { return t.process_stage || ''; },
    tplVersion: function (t) { return t.version || ''; },
    createdText: function (t) { return utils.formatDate(t.created_at || ''); }
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
      <input v-model="search" @input="doSearch" placeholder="搜索模板名称 / 编号 / 类别" />
    </div>

    <div v-if="!hasList" class="empty-state">
      <div style="font-size:32px;">📚</div>
      <div class="muted" style="margin-top:8px;">暂无模板</div>
    </div>

    <div v-else class="list">
      <div v-for="(t, i) in list" :key="t.id || i" class="list-item" @click="goDetail(t.id)">
        <div class="li-icon">📄</div>
        <div class="li-body">
          <div class="li-title">{{ tplName(t) }}</div>
          <div class="li-sub">{{ tplCat(t) }}<span v-if="tplDevice(t)"> · {{ tplDevice(t) }}</span><span v-if="tplStage(t)"> · {{ tplStage(t) }}</span></div>
          <div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <span class="tag" :class="statusTag(t.status)">{{ statusText(t.status) }}</span>
            <span v-if="tplCode(t)" class="muted" style="font-size:12px;">{{ tplCode(t) }}</span>
            <span v-if="tplVersion(t)" class="muted" style="font-size:12px;">v{{ tplVersion(t) }}</span>
          </div>
        </div>
        <div style="margin-left:8px;flex-shrink:0;text-align:right;">
          <div class="li-arrow">›</div>
          <div class="muted" style="font-size:11px;margin-top:4px;">{{ createdText(t) }}</div>
        </div>
      </div>
    </div>
  </template>
</div>
`
};
