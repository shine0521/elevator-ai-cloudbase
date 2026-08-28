// knowledge_detail.js — 法规详情（H5）
// GET /api/regulations/:id → 法规信息
// GET /api/regulations/:id/clauses → 条款列表
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md 重写
// 铁律：模板无裸 && || < >；禁 SVG；根 .page；三态齐全；query.id 缺失显示空态
window.Pages = window.Pages || {};

window.Pages.knowledge_detail = {
  name: 'knowledge_detail',
  props: ['query'],

  data: function () {
    return {
      loading: true,
      error: null,
      regulation: null,
      clauses: []
    };
  },

  computed: {
    hasId: function () { return !!(this.query && this.query.id); },
    hasRegulation: function () { return !!this.regulation; },
    hasClauses: function () { return this.clauses.length > 0; },
    levelText: function () {
      var lv = this.regulation ? this.regulation.level : '';
      var m = { national: '国家法规', local: '地方标准', dept: '部门规章' };
      return m[String(lv || '').toLowerCase()] || lv || '';
    },
    levelTag: function () {
      var lv = this.regulation ? this.regulation.level : '';
      var m = { national: 'tag-ok', local: 'tag-info', dept: 'tag-warn' };
      return m[String(lv || '').toLowerCase()] || 'tag-draft';
    },
    statusText: function () {
      var s = this.regulation ? this.regulation.status : '';
      var m = { active: '现行', effective: '现行', superseded: '已废止', expired: '已过期' };
      return m[String(s || '').toLowerCase()] || s || '现行';
    },
    statusTag: function () {
      var s = this.regulation ? this.regulation.status : '';
      if (s === 'active' || s === 'effective') return 'tag-ok';
      return 'tag-draft';
    }
  },

  methods: {
    go: function (p) { utils.go(p); },

    load: function () {
      var self = this;
      var q = self.query || {};
      var id = q.id;
      if (!id) {
        self.loading = false;
        self.error = '缺少法规参数';
        return;
      }
      self.loading = true;
      self.error = null;
      // 并行拉法规信息和条款
      Promise.all([
        api.getRegulation(id),
        api.getRegulationClauses(id)
      ]).then(function (results) {
        var regData = results[0];
        var clsData = results[1];
        var reg = (regData && regData.data) || regData || null;
        if (!reg) {
          self.error = '法规不存在';
          return;
        }
        self.regulation = reg;
        var arr = (clsData && clsData.data) || clsData || [];
        self.clauses = Array.isArray(arr) ? arr : [];
      }).catch(function () {
        self.error = '详情加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    goBack: function () { this.go('/knowledge_list'); },

    // severity → tag
    severityTag: function (s) {
      var m = { critical: 'tag-critical', major: 'tag-major', general: 'tag-general', low: 'tag-low' };
      return m[String(s || '').toLowerCase()] || 'tag-info';
    },
    severityText: function (s) {
      var m = { critical: '重要', major: '较重', general: '一般', low: '轻微' };
      return m[String(s || '').toLowerCase()] || s || '';
    },

    // clause 序号展示
    clauseNo: function (c) {
      if (c.clause_number) return c.clause_number;
      if (c.article) return '第' + c.article + '条';
      return '#' + (c.id || '');
    },

    formatArticle: function (c) {
      if (!c.article && !c.clause_number) return '';
      if (c.clause_number) return '第' + c.clause_number + '条';
      return '';
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

  <template v-else-if="hasRegulation">
    <!-- 法规信息卡 -->
    <div class="card">
      <div class="card-title">📚 {{ regulation.name }}</div>
      <div class="detail-row">
        <div class="dk">法规编号</div>
        <div class="dv">{{ regulation.code || '—' }}</div>
      </div>
      <div class="detail-row">
        <div class="dk">法规层级</div>
        <div class="dv">
          <span class="tag" :class="levelTag">{{ levelText }}</span>
        </div>
      </div>
      <div class="detail-row">
        <div class="dk">类目分类</div>
        <div class="dv">{{ regulation.category || '—' }}</div>
      </div>
      <div class="detail-row">
        <div class="dk">法规状态</div>
        <div class="dv">
          <span class="tag" :class="statusTag">{{ statusText }}</span>
        </div>
      </div>
    </div>

    <!-- 条款数量统计 -->
    <div v-if="hasClauses" class="card" style="margin-top:10px;">
      <div class="card-title">📜 条款列表（共 {{ clauses.length }} 条）</div>
    </div>

    <!-- 条款列表 -->
    <div v-if="!hasClauses" class="empty-state" style="margin-top:10px;">
      <div style="font-size:32px;">📜</div>
      <div class="muted" style="margin-top:8px;">暂无条款信息</div>
    </div>

    <div v-else class="list">
      <div v-for="(c, i) in clauses" :key="c.id || i" class="list-item" style="flex-direction:column;align-items:flex-start;">
        <div style="display:flex;width:100%;align-items:flex-start;gap:8px;">
          <div class="li-icon" style="flex-shrink:0;margin-top:2px;">📜</div>
          <div class="li-body" style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
              <span class="fw6" style="font-size:14px;">{{ clauseNo(c) }}</span>
              <span v-if="c.title" class="fw6" style="font-size:14px;">{{ c.title }}</span>
              <span v-if="c.severity" class="tag" :class="severityTag(c.severity)">{{ severityText(c.severity) }}</span>
            </div>
            <div v-if="c.content" class="li-sub" style="line-height:1.7;">{{ c.content }}</div>
            <div v-if="c.standard_ref" style="margin-top:4px;font-size:12px;color:var(--primary);">标准引用：{{ c.standard_ref }}</div>
          </div>
        </div>
      </div>
    </div>

    <button class="btn-ghost" style="margin-top:16px;" @click="goBack">返回列表</button>
  </template>

  <div v-else class="empty-state">
    <div style="font-size:32px;">📚</div>
    <div class="muted" style="margin-top:8px;">未找到该法规</div>
  </div>
</div>
`
};
