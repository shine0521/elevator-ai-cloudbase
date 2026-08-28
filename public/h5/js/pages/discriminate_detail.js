// discriminate_detail.js — 判别详情（H5）
// GET /api/discrimination-records/:id → {record, auditTask}
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md + server.js 路由段重写
// 铁律：模板无裸 && || < >；禁 SVG；根 .page；三态齐全；query.id 缺失显示空态
window.Pages = window.Pages || {};

window.Pages.discriminate_detail = {
  name: 'discriminate_detail',
  props: ['query'],

  data: function () {
    return {
      loading: true,
      error: null,
      record: null,
      auditTask: null
    };
  },

  computed: {
    hasId: function () {
      var q = this.query || {};
      return !!q.id;
    },
    hasRecord: function () { return !!this.record; },
    isAuditor: function () {
      return Store.isRole('auditor') || Store.isRole('admin');
    },
    // final_result → 展示用
    resultText: function () {
      if (!this.record) return '';
      var fr = this.record.final_result || '';
      var m = { '合规': '合规', '不合规': '不合规', '待人工': '待人工' };
      return m[fr] || fr || '—';
    },
    resultIcon: function () {
      var fr = this.resultText;
      if (fr === '合规') return '✅';
      if (fr === '不合规') return '❌';
      return '⏳';
    },
    resultClass: function () {
      var fr = this.resultText;
      if (fr === '合规') return 'ok';
      if (fr === '不合规') return 'ng';
      return 'mb';
    },
    // formData → 条目列表
    formEntries: function () {
      if (!this.record || !this.record.form_data) return [];
      var fd = this.record.form_data;
      var keys = Object.keys(fd);
      return keys.map(function (k) {
        var v = fd[k];
        if (Array.isArray(v)) v = v.join('、');
        return { key: k, value: (v === undefined || v === null || v === '') ? '—' : String(v) };
      });
    },
    // rule_results → 条目列表
    ruleEntries: function () {
      if (!this.record || !Array.isArray(this.record.rule_results)) return [];
      return this.record.rule_results.map(function (r) {
        return {
          name: r.rule || r.name || r.rule_name || '规则',
          result: r.result || r.status || '',
          clause: r.clause || r.clause_ref || '',
          detail: r.detail || r.message || ''
        };
      });
    },
    conclusion: function () { return this.record ? (this.record.conclusion || '') : ''; },
    clauseRef: function () { return this.record ? (this.record.clause_ref || '') : ''; },
    auditComment: function () { return this.record ? (this.record.audit_comment || '') : ''; },
    auditTaskId: function () {
      if (this.auditTask && this.auditTask.id) return this.auditTask.id;
      return this.record ? this.record.id : '';
    },
    auditStatusText: function () {
      var m = { pending: '待审核', approved: '已审核', rejected: '已驳回' };
      var s = this.record ? this.record.audit_status : '';
      return m[String(s || '').toLowerCase()] || (s || '未审核');
    },
    auditStatusTag: function () {
      var s = this.record ? this.record.audit_status : '';
      if (s === 'pending') return 'tag-pending';
      if (s === 'approved') return 'tag-published';
      if (s === 'rejected') return 'tag-ng';
      return 'tag-draft';
    },
    createdText: function () { return this.record ? utils.formatDateTime(this.record.created_at || '') : ''; }
  },

  methods: {
    go: function (p) { utils.go(p); },

    load: function () {
      var self = this;
      var q = self.query || {};
      var id = q.id;
      if (!id) {
        self.loading = false;
        self.error = '缺少记录参数';
        return;
      }
      self.loading = true;
      self.error = null;
      api.getDiscriminationRecord(id).then(function (d) {
        var r = (d && d.record) || (d && d.data) || d || null;
        if (!r) { self.error = '记录不存在'; return; }
        self.record = r;
        self.auditTask = (d && d.auditTask) || null;
      }).catch(function () {
        self.error = '详情加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    // 规则结果 tag
    ruleTag: function (rs) {
      if (rs === '合规' || rs === 'pass' || rs === 'PASS') return 'tag-ok';
      if (rs === '不合规' || rs === 'fail' || rs === 'FAIL') return 'tag-ng';
      if (rs === '待人工' || rs === 'pending') return 'tag-mb';
      return 'tag-info';
    },
    ruleText: function (rs) {
      var m = { pass: '合规', PASS: '合规', fail: '不合规', FAIL: '不合规', pending: '待人工' };
      return m[String(rs || '')] || rs || '—';
    },
    goAudit: function () {
      if (this.auditTaskId) this.go('/audit_detail?id=' + this.auditTaskId);
    },
    goBack: function () { this.go('/discriminate_history'); }
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
    <button class="btn-primary" style="margin-top:14px;width:auto;padding:9px 20px;" @click="goBack">返 回</button>
  </div>

  <template v-else-if="hasRecord">
    <!-- 结论卡 -->
    <div class="card">
      <div class="res-wrap" style="padding:24px 16px;">
        <div class="ric">{{ resultIcon }}</div>
        <div class="rtl">{{ resultText }}</div>
      </div>
      <div class="rr" :class="resultClass">
        <div class="ri">{{ resultIcon }}</div>
        <div class="rc">
          <div class="rn">判别结论</div>
          <div class="rd">{{ conclusion }}</div>
        </div>
      </div>
      <div v-if="clauseRef" class="rr mb">
        <div class="ri">📚</div>
        <div class="rc">
          <div class="rn">条款引用</div>
          <div class="rd">{{ clauseRef }}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;">
        <span class="tag" :class="auditStatusTag">{{ auditStatusText }}</span>
        <span class="muted" style="font-size:12px;">{{ createdText }}</span>
      </div>
    </div>

    <!-- 基本信息 -->
    <div class="card">
      <div class="card-title">基本信息</div>
      <div class="detail-row"><div class="dk">模板</div><div class="dv">{{ record.template_name }}</div></div>
      <div class="detail-row"><div class="dk">现场描述</div><div class="dv">{{ record.input_text || '—' }}</div></div>
    </div>

    <!-- 填报内容 -->
    <div class="card">
      <div class="card-title">填报内容</div>
      <div v-if="formEntries.length === 0" class="muted" style="font-size:13px;">无填报字段</div>
      <div v-for="(e, i) in formEntries" :key="i" class="detail-row">
        <div class="dk">{{ e.key }}</div>
        <div class="dv">{{ e.value }}</div>
      </div>
    </div>

    <!-- 规则结果 -->
    <div class="card">
      <div class="card-title">规则执行结果</div>
      <div v-if="ruleEntries.length === 0" class="muted" style="font-size:13px;">无规则结果</div>
      <div v-for="(rr, i) in ruleEntries" :key="i" class="rr" :class="ruleTag(rr.result) === 'tag-ok' ? 'ok' : (ruleTag(rr.result) === 'tag-ng' ? 'ng' : 'mb')">
        <div class="ri">{{ resultIcon }}</div>
        <div class="rc">
          <div class="rn">{{ rr.name }} <span class="tag" :class="ruleTag(rr.result)">{{ ruleText(rr.result) }}</span></div>
          <div class="rd" v-if="rr.detail">{{ rr.detail }}</div>
          <div class="rd" v-if="rr.clause">条款：{{ rr.clause }}</div>
        </div>
      </div>
    </div>

    <!-- 审核意见 -->
    <div v-if="auditComment" class="card">
      <div class="card-title">审核意见</div>
      <div class="dv">{{ auditComment }}</div>
    </div>

    <button v-if="isAuditor" class="btn-primary" @click="goAudit">去审核</button>
    <button class="btn-ghost" @click="goBack">返回历史</button>
  </template>

  <div v-else class="empty-state">
    <div style="font-size:32px;">📄</div>
    <div class="muted" style="margin-top:8px;">未找到该判别记录</div>
  </div>
</div>
`
};
