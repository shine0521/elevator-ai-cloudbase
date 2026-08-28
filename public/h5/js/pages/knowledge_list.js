// knowledge_list.js — 法规知识库（H5）
// GET /api/knowledge/stats → {totalRegulations,totalClauses,byLevel,byCategory}
// GET /api/regulations?level&category&search → {data:[], total}
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md 重写
// 铁律：模板无裸 && || < >；禁 SVG；根 .page；三态齐全
window.Pages = window.Pages || {};

window.Pages.knowledge_list = {
  name: 'knowledge_list',
  props: ['query'],

  data: function () {
    return {
      loading: true,
      error: null,
      seg: 'all',   // all | national | local | dept
      category: '',
      search: '',
      list: [],
      total: 0,
      // stats
      statsLoading: true,
      totalRegulations: 0,
      totalClauses: 0,
      byLevel: {}
    };
  },

  computed: {
    hasList: function () { return this.list.length > 0; },
    segs: function () {
      return [
        { key: 'all',   label: '全部' },
        { key: 'national', label: '国家法规' },
        { key: 'local', label: '地方标准' },
        { key: 'dept',  label: '部门规章' }
      ];
    },
    isSeg: function () {
      var self = this;
      return function (k) { return self.seg === k; };
    },
    levelParam: function () {
      if (this.seg === 'national') return 'national';
      if (this.seg === 'local') return 'local';
      if (this.seg === 'dept') return 'dept';
      return '';
    },
    // stats 头卡
    statCards: function () {
      var bl = this.byLevel || {};
      return [
        { label: '法规总数', value: this.totalRegulations, icon: '📖' },
        { label: '条款总数', value: this.totalClauses,      icon: '📜' },
        { label: '国家法规', value: (bl.national || {}).count || 0, icon: '🏛️' },
        { label: '地方标准', value: (bl.local    || {}).count || 0, icon: '🏙️' }
      ];
    }
  },

  methods: {
    go: function (p) { utils.go(p); },

    loadStats: function () {
      var self = this;
      self.statsLoading = true;
      api.getKnowledgeStats().then(function (d) {
        var data = (d && d.data) || d || {};
        self.totalRegulations = data.totalRegulations || 0;
        self.totalClauses     = data.totalClauses     || 0;
        self.byLevel          = data.byLevel          || {};
      }).catch(function () {
        // stats 失败不阻塞
      }).finally(function () {
        self.statsLoading = false;
      });
    },

    load: function () {
      var self = this;
      self.loading = true;
      self.error   = null;
      var p = {};
      var lp = self.levelParam();
      if (lp) p.level = lp;
      var cat = (self.category || '').trim();
      if (cat) p.category = cat;
      var kw = (self.search || '').trim();
      if (kw) p.search = kw;
      api.getRegulations(p).then(function (d) {
        var arr = (d && d.data) || d || [];
        self.list  = Array.isArray(arr) ? arr : [];
        self.total = (d && typeof d.total === 'number') ? d.total : self.list.length;
      }).catch(function () {
        self.error = '法规列表加载失败，请重试';
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

    goDetail: function (id) { this.go('/knowledge_detail?id=' + id); },

    // 法规 level → tag
    levelTag: function (lv) {
      var m = { national: 'tag-ok', local: 'tag-info', dept: 'tag-warn' };
      return m[String(lv || '').toLowerCase()] || 'tag-draft';
    },
    levelText: function (lv) {
      var m = { national: '国家法规', local: '地方标准', dept: '部门规章' };
      return m[String(lv || '').toLowerCase()] || lv || '';
    },
    // 法规 status → tag
    statusTag: function (s) {
      var m = { active: 'tag-ok', effective: 'tag-ok', superseded: 'tag-draft', expired: 'tag-draft' };
      return m[String(s || '').toLowerCase()] || 'tag-info';
    },
    statusText: function (s) {
      var m = { active: '现行', effective: '现行', superseded: '已废止', expired: '已过期' };
      return m[String(s || '').toLowerCase()] || s || '现行';
    },
    formatDate: function (iso) {
      if (!iso) return '';
      return utils.formatDate(iso);
    }
  },

  mounted: function () {
    this.loadStats();
    this.load();
  },

  template: `
<div class="page">
  <!-- 统计头卡 -->
  <div v-if="statsLoading" style="padding:10px 0 2px;">
    <div class="spinner" style="width:18px;height:18px;border-width:2px;"></div>
  </div>
  <div v-else class="stats" style="margin-bottom:12px;">
    <div v-for="(s, i) in statCards" :key="i" class="stat">
      <div class="si b-p">{{ s.icon }}</div>
      <div class="sv b-p">{{ s.value }}</div>
      <div class="sn b-p">{{ s.label }}</div>
    </div>
  </div>

  <!-- 三态 -->
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
      <input v-model="search" @input="doSearch" placeholder="搜索法规名称 / 编号" />
    </div>

    <div v-if="!hasList" class="empty-state">
      <div style="font-size:32px;">📖</div>
      <div class="muted" style="margin-top:8px;">暂无相关法规</div>
    </div>

    <div v-else class="list">
      <div v-for="(r, i) in list" :key="r.id || i" class="list-item" @click="goDetail(r.id)">
        <div class="li-icon">📚</div>
        <div class="li-body">
          <div class="li-title">{{ r.name || '未知法规' }}</div>
          <div class="li-sub">
            <span>{{ r.code || '—' }}</span>
          </div>
          <div style="margin-top:5px;display:flex;gap:5px;align-items:center;flex-wrap:wrap;">
            <span class="tag" :class="levelTag(r.level)">{{ levelText(r.level) }}</span>
            <span class="tag" :class="statusTag(r.status)">{{ statusText(r.status) }}</span>
            <span v-if="r.category" class="muted" style="font-size:12px;">{{ r.category }}</span>
          </div>
        </div>
        <div style="margin-left:8px;flex-shrink:0;text-align:right;">
          <div class="li-arrow">›</div>
          <div v-if="r.created_at" class="muted" style="font-size:11px;margin-top:4px;">{{ formatDate(r.created_at) }}</div>
        </div>
      </div>
    </div>
  </template>
</div>
`
};
