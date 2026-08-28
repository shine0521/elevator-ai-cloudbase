// research_list.js — 模板研究任务（H5）
// GET /api/template-research?status → {data:[], total}
// 角色要求：admin
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md 重写
// 铁律：模板无裸 && || < >；禁 SVG；根 .page；三态齐全
window.Pages = window.Pages || {};

window.Pages.research_list = {
  name: 'research_list',
  props: ['query'],

  data: function () {
    return {
      loading: true,
      error: null,
      seg: 'all',   // all | draft | suggesting | reviewing | published
      list: [],
      total: 0
    };
  },

  computed: {
    hasList: function () { return this.list.length > 0; },
    segs: function () {
      return [
        { key: 'all',       label: '全部' },
        { key: 'draft',     label: '草稿' },
        { key: 'suggesting',label: 'AI 建议中' },
        { key: 'reviewing', label: '审核中' },
        { key: 'published', label: '已发布' }
      ];
    },
    isSeg: function () {
      var self = this;
      return function (k) { return self.seg === k; };
    }
  },

  methods: {
    go: function (p) { utils.go(p); },

    // 分段 → api 参数
    segParam: function () {
      if (this.seg === 'all') return '';
      return this.seg;
    },

    load: function () {
      var self = this;
      self.loading = true;
      self.error   = null;
      var p = {};
      var sp = self.segParam();
      if (sp) p.status = sp;
      api.getResearchTasks(p).then(function (d) {
        var arr = (d && d.data) || d || [];
        self.list  = Array.isArray(arr) ? arr : [];
        self.total = (d && typeof d.total === 'number') ? d.total : self.list.length;
      }).catch(function () {
        self.error = '研究任务列表加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    switchSeg: function (k) {
      if (this.seg === k) return;
      this.seg = k;
      this.load();
    },

    goDetail: function (id) { this.go('/research_detail?id=' + id); },

    // status → tag
    statusTag: function (s) {
      var m = {
        draft:     'tag-draft',
        suggesting:'tag-pending',
        reviewing: 'tag-pending',
        published: 'tag-ok'
      };
      return m[String(s || '').toLowerCase()] || 'tag-info';
    },
    statusText: function (s) {
      var m = {
        draft:     '草稿',
        suggesting:'AI 建议中',
        reviewing: '审核中',
        published: '已发布'
      };
      return m[String(s || '').toLowerCase()] || s || '草稿';
    },

    // 研究类型
    researchTypeText: function (r) {
      var m = {
        new:        '新建模板',
        modify:     '修改模板',
        supplement: '补充条款',
        review:     '合规审核'
      };
      return m[String(r.research_type || '').toLowerCase()] || r.research_type || '研究';
    },

    // 创建时间
    createdAt: function (r) {
      return utils.formatDateTime(r.created_at || r.createdAt || '');
    },

    // 标题
    title: function (r) {
      return r.title || '未命名研究任务';
    }
  },

  mounted: function () { this.load(); },

  template: `
<div class="page">
  <div class="seg" style="margin-bottom:10px;">
    <button v-for="(s, i) in segs" :key="s.key" :class="isSeg(s.key) ? 'on' : ''" @click="switchSeg(s.key)">{{ s.label }}</button>
  </div>

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
    <div v-if="!hasList" class="empty-state">
      <div style="font-size:32px;">🧪</div>
      <div class="muted" style="margin-top:8px;">暂无研究任务</div>
    </div>

    <div v-else class="list">
      <div v-for="(r, i) in list" :key="r.id || i" class="list-item" @click="goDetail(r.id)">
        <div class="li-icon">🧪</div>
        <div class="li-body">
          <div class="li-title">{{ title(r) }}</div>
          <div class="li-sub">{{ researchTypeText(r) }}</div>
          <div style="margin-top:5px;display:flex;gap:5px;align-items:center;flex-wrap:wrap;">
            <span class="tag" :class="statusTag(r.status)">{{ statusText(r.status) }}</span>
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
