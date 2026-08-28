// audit_list.js — 人工审核工作台（H5）
// GET /api/audit-tasks?status → {data:[], total}
// 角色要求：auditor / admin
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md 重写
// 铁律：模板无裸 && || < >；禁 SVG；根 .page；三态齐全
window.Pages = window.Pages || {};

window.Pages.audit_list = {
  name: 'audit_list',
  props: ['query'],

  data: function () {
    return {
      loading: true,
      error: null,
      seg: 'PENDING',   // PENDING | APPROVED | REJECTED | all
      list: [],
      total: 0
    };
  },

  computed: {
    hasList: function () { return this.list.length > 0; },
    segs: function () {
      return [
        { key: 'PENDING',   label: '待审' },
        { key: 'APPROVED',  label: '已通过' },
        { key: 'REJECTED',  label: '已驳回' },
        { key: 'all',       label: '全部' }
      ];
    },
    isSeg: function () {
      var self = this;
      return function (k) { return self.seg === k; };
    }
  },

  methods: {
    go: function (p) { utils.go(p); },

    // 分段 → api 参数（后端 status 为小写：pending/approved/rejected）
    segParam: function () {
      if (this.seg === 'all') return '';
      return this.seg.toLowerCase();
    },

    load: function () {
      var self = this;
      self.loading = true;
      self.error   = null;
      var p = {};
      var sp = self.segParam();
      if (sp) p.status = sp;
      api.getAuditTasks(p).then(function (d) {
        var arr = (d && d.data) || d || [];
        self.list  = Array.isArray(arr) ? arr : [];
        self.total = (d && typeof d.total === 'number') ? d.total : self.list.length;
      }).catch(function () {
        self.error = '审核列表加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    switchSeg: function (k) {
      if (this.seg === k) return;
      this.seg = k;
      this.load();
    },

    goDetail: function (id) { this.go('/audit_detail?id=' + id); },

    // status → tag
    statusTag: function (s) {
      var m = { PENDING: 'tag-pending', APPROVED: 'tag-ok', REJECTED: 'tag-ng' };
      return m[String(s || '').toUpperCase()] || 'tag-info';
    },
    statusText: function (s) {
      var m = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' };
      return m[String(s || '').toUpperCase()] || s || '待审核';
    },

    // priority → tag
    priorityTag: function (p) {
      var m = { urgent: 'tag-critical', high: 'tag-major', normal: 'tag-info', low: 'tag-low' };
      return m[String(p || '').toLowerCase()] || 'tag-info';
    },
    priorityText: function (p) {
      var m = { urgent: '紧急', high: '高', normal: '普通', low: '低' };
      return m[String(p || '').toLowerCase()] || p || '';
    },

    // 提交时间
    submittedAt: function (r) {
      return utils.formatDateTime(r.submitted_at || r.created_at || '');
    },

    // 结果展示
    resultText: function (r) {
      var fr = r.final_result;
      if (!fr) return '—';
      return fr;
    },
    resultTag: function (r) {
      var fr = r.final_result || '';
      if (fr === '合规') return 'tag-ok';
      if (fr === '不合规') return 'tag-ng';
      return 'tag-mb';
    },

    // 提交人脱敏
    submitter: function (r) {
      var e = r.submitter_email || '';
      return utils.phoneify(e);
    },

    // 审核类型
    auditTypeText: function (r) {
      var at = r.audit_type;
      if (!at) return 'AI 审核';
      var m = { auto: 'AI 审核', manual: '人工审核' };
      return m[String(at).toLowerCase()] || at;
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
      <div style="font-size:32px;">📋</div>
      <div class="muted" style="margin-top:8px;">暂无审核任务</div>
    </div>

    <div v-else class="list">
      <div v-for="(r, i) in list" :key="r.id || i" class="list-item" @click="goDetail(r.id)">
        <div class="li-icon">⚖️</div>
        <div class="li-body">
          <div class="li-title">{{ r.template_name || '未知模板' }}</div>
          <div class="li-sub">
            <span>提交人：{{ submitter(r) }}</span>
            <span class="muted"> · {{ auditTypeText(r) }}</span>
          </div>
          <div style="margin-top:5px;display:flex;gap:5px;align-items:center;flex-wrap:wrap;">
            <span class="tag" :class="statusTag(r.status)">{{ statusText(r.status) }}</span>
            <span class="tag" :class="resultTag(r)">{{ resultText(r) }}</span>
            <span v-if="r.priority" class="tag" :class="priorityTag(r.priority)">{{ priorityText(r.priority) }}</span>
          </div>
        </div>
        <div style="margin-left:8px;flex-shrink:0;text-align:right;">
          <div class="li-arrow">›</div>
          <div class="muted" style="font-size:11px;margin-top:4px;">{{ submittedAt(r) }}</div>
        </div>
      </div>
    </div>
  </template>
</div>
`
};
