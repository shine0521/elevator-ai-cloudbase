// template_detail.js — 模板详情（H5）
// GET /api/templates/:id（基础）+ /fields（字段）+ /rules（规则）
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md + server.js 路由段重写
// 铁律：模板无裸 && || < >；禁 SVG；根 .page；三态齐全；query.id 缺失显示空态
window.Pages = window.Pages || {};

window.Pages.template_detail = {
  name: 'template_detail',
  props: ['query'],

  data: function () {
    return {
      loading: true,
      error: null,
      tplId: '',
      base: null,
      fields: [],
      rules: []
    };
  },

  computed: {
    hasId: function () {
      var q = this.query || {};
      return !!q.id;
    },
    hasBase: function () { return !!this.base; },
    hasFields: function () { return this.fields.length > 0; },
    hasRules: function () { return this.rules.length > 0; },

    statusTag: function () {
      var s = this.base ? this.base.status : '';
      var m = { published: 'tag-published', draft: 'tag-draft', archived: 'tag-archived' };
      return m[String(s || '').toLowerCase()] || 'tag-draft';
    },
    statusText: function () {
      var s = this.base ? this.base.status : '';
      var m = { published: '已发布', draft: '草稿', archived: '归档' };
      return m[String(s || '').toLowerCase()] || (s || '草稿');
    },
    tplName: function () { return this.base ? (this.base.name || '未命名模板') : ''; },
    tplCode: function () { return this.base ? (this.base.code || '') : ''; }
  },

  methods: {
    go: function (p) { utils.go(p); },

    load: function () {
      var self = this;
      var q = self.query || {};
      self.tplId = q.id || '';
      if (!self.tplId) {
        self.loading = false;
        self.error = '缺少模板参数';
        return;
      }
      self.loading = true;
      self.error = null;
      Promise.all([
        api.getTemplate(self.tplId).catch(function () { return null; }),
        api.getTemplateFields(self.tplId).catch(function () { return null; }),
        api.getTemplateRules(self.tplId).catch(function () { return null; })
      ]).then(function (arr) {
        var b = arr[0];
        self.base = b ? (b.data || b) : null;
        var f = arr[1] || {};
        var fd = f.data || f;
        self.fields = Array.isArray(fd.fields) ? fd.fields : [];
        var r = arr[2] || {};
        var rd = r.data || r;
        self.rules = Array.isArray(rd) ? rd : (Array.isArray(rd.rules) ? rd.rules : []);
        if (!self.base) self.error = '模板不存在';
      }).catch(function () {
        self.error = '模板加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    fieldName: function (f) { return f.field_name || f.field_label || f.field_key || '字段'; },
    fieldType: function (f) { return f.field_type || 'text'; },
    fieldRequired: function (f) { return f.required === 1 || f.required === true || f.required === '1'; },
    fieldOptions: function (f) {
      var ol = f.options_list;
      if (Array.isArray(ol)) return ol;
      var o = f.options;
      if (Array.isArray(o)) return o;
      if (typeof o === 'string' && o) {
        if (o.charAt(0) === '[') {
          try { var j = JSON.parse(o); if (Array.isArray(j)) return j; } catch (e) {}
        }
        return o.split(/[|;；,，、]/).map(function (s) { return s.trim(); }).filter(Boolean);
      }
      return [];
    },
    optionsText: function (f) {
      var ops = this.fieldOptions(f);
      return ops.length ? ops.join(' / ') : '—';
    },

    ruleType: function (r) { return r.rule_type || r.type || '规则'; },
    ruleExpr: function (r) {
      return r.expression || r.config || r.rule_config || r.rule || '';
    },
    ruleMsg: function (r) { return r.message || r.rule_name || r.name || ''; },

    useTemplate: function () {
      if (this.tplId) this.go('/discriminate?id=' + this.tplId);
    },
    goBack: function () { this.go('/templates_list'); }
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

  <template v-else-if="hasBase">
    <!-- 基本信息 -->
    <div class="card">
      <div class="card-h">
        <div class="card-t">📄 {{ tplName }}</div>
        <span class="tag" :class="statusTag">{{ statusText }}</span>
      </div>
      <div class="detail-row"><div class="dk">编号</div><div class="dv">{{ tplCode || '—' }}</div></div>
      <div class="detail-row"><div class="dk">类别</div><div class="dv">{{ base.category || '通用' }}</div></div>
      <div class="detail-row"><div class="dk">设备类型</div><div class="dv">{{ base.device_type || '—' }}</div></div>
      <div class="detail-row"><div class="dk">流程阶段</div><div class="dv">{{ base.process_stage || '—' }}</div></div>
      <div class="detail-row"><div class="dk">版本</div><div class="dv">{{ base.version || '—' }}</div></div>
    </div>

    <!-- 字段定义 -->
    <div class="card">
      <div class="card-title">字段定义</div>
      <div v-if="!hasFields" class="muted" style="font-size:13px;">暂无字段</div>
      <div v-else class="list" style="box-shadow:none;">
        <div v-for="(f, i) in fields" :key="f.id || i" class="list-item">
          <div class="li-body">
            <div class="li-title">{{ fieldName(f) }}<span v-if="fieldRequired(f)" style="color:var(--danger);"> *</span></div>
            <div class="li-sub">{{ fieldType(f) }}<span v-if="fieldType(f)==='select' || fieldType(f)==='radio' || fieldType(f)==='checkbox'"> · {{ optionsText(f) }}</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 规则定义 -->
    <div class="card">
      <div class="card-title">规则定义</div>
      <div v-if="!hasRules" class="muted" style="font-size:13px;">暂无规则</div>
      <div v-else class="list" style="box-shadow:none;">
        <div v-for="(r, i) in rules" :key="r.id || i" class="list-item">
          <div class="li-body">
            <div class="li-title">{{ ruleMsg(r) }}</div>
            <div class="li-sub">{{ ruleType(r) }} · {{ ruleExpr(r) }}</div>
          </div>
        </div>
      </div>
    </div>

    <button class="btn-primary" @click="useTemplate">用此模板判别</button>
    <button class="btn-ghost" @click="goBack">返回模板库</button>
  </template>

  <div v-else class="empty-state">
    <div style="font-size:32px;">📄</div>
    <div class="muted" style="margin-top:8px;">未找到该模板</div>
  </div>
</div>
`
};
