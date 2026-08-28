// discriminate_fill.js — 动态表单 + 合规判别（H5）
// GET /api/templates/:id/fields → 动态渲染字段 → POST /api/discriminate → 展示结论
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md + server.js 路由段重写
// 铁律：动态键用 :value+@input；radio/checkbox 用 :checked+@change+isChecked/toggleCheck；
//       模板无裸 && || < >；禁 SVG；根 .page；三态齐全
window.Pages = window.Pages || {};

window.Pages.discriminate_fill = {
  name: 'discriminate_fill',
  props: ['query'],

  data: function () {
    return {
      loading: true,
      error: null,
      tplId: '',
      templateName: '',
      fields: [],
      rules: [],
      inputText: '',
      formData: {},
      submitting: false,
      result: null,        // 判别结果对象
      resultError: null
    };
  },

  computed: {
    hasFields: function () { return this.fields.length > 0; },
    hasResult: function () { return !!this.result; },
    resultText: function () {
      if (!this.result) return '';
      var fr = this.result.finalResult || this.result.final_result || '';
      var m = { '合规': '合规', '不合规': '不合规', '待人工': '待人工' };
      return m[fr] || fr || '已判别';
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
    resultConclusion: function () {
      return this.result ? (this.result.conclusion || '') : '';
    },
    resultClause: function () {
      if (!this.result) return '';
      return this.result.clauseRef || this.result.clause_ref || '';
    },
    resultConf: function () {
      if (!this.result) return '';
      var c = this.result.aiConfidence;
      if (c === null || c === undefined || c === '') return '';
      return Math.round(Number(c) * 100) + '%';
    },
    recordId: function () {
      if (!this.result) return '';
      return this.result.recordId || this.result.id || '';
    }
  },

  methods: {
    go: function (p) { utils.go(p); },

    load: function () {
      var self = this;
      var q = self.query || {};
      self.tplId = q.id || '';
      if (q.inputText) self.inputText = q.inputText;
      if (!self.tplId) {
        self.loading = false;
        self.error = '缺少模板参数';
        return;
      }
      self.loading = true;
      self.error = null;
      Promise.all([
        api.getTemplate(self.tplId).catch(function () { return null; }),
        api.getTemplateFields(self.tplId)
      ]).then(function (arr) {
        var tpl = arr[0];
        var fld = arr[1] || {};
        if (tpl) {
          var t = tpl.data || tpl;
          self.templateName = t.name || '';
        }
        var d = fld.data || fld;
        self.fields = Array.isArray(d.fields) ? d.fields : [];
        self.rules = Array.isArray(d.rules) ? d.rules : [];
        if (!self.templateName && self.fields.length) {
          // 备选：用首个字段无法取模板名，保持空
        }
      }).catch(function () {
        self.error = '模板加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    // ===== 字段辅助 =====
    fieldKey: function (f) { return f.field_key || f.field_name || f.id; },
    fieldName: function (f) { return f.field_name || f.field_label || f.field_key || '字段'; },
    fieldType: function (f) { return f.field_type || 'text'; },
    isRequired: function (f) { return f.required === 1 || f.required === true || f.required === '1'; },
    isTextLike: function (f) {
      var t = this.fieldType(f);
      return t === 'text' || t === 'number' || t === 'date';
    },
    inputType: function (f) {
      var t = this.fieldType(f);
      if (t === 'number') return 'number';
      if (t === 'date') return 'date';
      return 'text';
    },
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

    // ===== 动态值绑定 =====
    onFieldInput: function (key, val) {
      this.formData[key] = val;
    },
    onRadio: function (f, val) {
      this.formData[this.fieldKey(f)] = val;
    },
    isChecked: function (f, opt) {
      var v = this.formData[this.fieldKey(f)];
      return Array.isArray(v) && v.indexOf(opt) >= 0;
    },
    toggleCheck: function (f, opt) {
      var k = this.fieldKey(f);
      var v = this.formData[k];
      if (!Array.isArray(v)) v = [];
      var i = v.indexOf(opt);
      if (i >= 0) v.splice(i, 1); else v.push(opt);
      this.formData[k] = v;
    },

    // ===== 提交判别 =====
    doSubmit: function () {
      var self = this;
      if (self.submitting) return;
      // 必填校验
      var miss = [];
      self.fields.forEach(function (f) {
        if (self.isRequired(f)) {
          var v = self.formData[self.fieldKey(f)];
          var empty = v === undefined || v === null || v === '' ||
            (Array.isArray(v) && v.length === 0);
          if (empty) miss.push(self.fieldName(f));
        }
      });
      if (miss.length) { utils.toast('请填写：' + miss.join('、')); return; }

      self.submitting = true;
      self.resultError = null;
      api.discriminate({
        templateId: self.tplId,
        inputText: self.inputText,
        formData: self.formData,
        templateName: self.templateName
      }).then(function (d) {
        var r = (d && d.data) || d || {};
        self.result = r;
        if (!r.finalResult && !r.final_result) {
          self.resultError = '未获得判别结论';
        }
      }).catch(function () {
        self.resultError = '判别失败，请重试';
      }).finally(function () {
        self.submitting = false;
      });
    },

    goDetail: function () {
      if (this.recordId) this.go('/discriminate_detail?id=' + this.recordId);
    },
    goBack: function () { this.go('/discriminate'); }
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

  <template v-else>
    <!-- 结果页 -->
    <div v-if="hasResult" class="card">
      <div class="res-wrap">
        <div class="ric">{{ resultIcon }}</div>
        <div class="rtl">{{ resultText }}</div>
        <div v-if="resultConf" class="rdc">AI 置信度：{{ resultConf }}</div>
      </div>
      <div v-if="resultConclusion" class="rr" :class="resultClass">
        <div class="ri">{{ resultIcon }}</div>
        <div class="rc">
          <div class="rn">判别结论</div>
          <div class="rd">{{ resultConclusion }}</div>
        </div>
      </div>
      <div v-if="resultClause" class="rr mb">
        <div class="ri">📚</div>
        <div class="rc">
          <div class="rn">条款引用</div>
          <div class="rd">{{ resultClause }}</div>
        </div>
      </div>
      <div v-if="resultError" class="rr ng">
        <div class="ri">⚠️</div>
        <div class="rc"><div class="rd">{{ resultError }}</div></div>
      </div>
      <div class="btn-row">
        <button v-if="recordId" class="btn-primary" @click="goDetail">查看详情</button>
        <button class="btn-ghost" @click="goBack">返回入口</button>
      </div>
    </div>

    <!-- 填写表单 -->
    <template v-else>
      <div class="card">
        <div class="card-h">
          <div class="card-t">📝 {{ templateName || '判别填写' }}</div>
        </div>
        <textarea class="fi-input" v-model="inputText" placeholder="补充现场问题描述（可选）" style="min-height:72px;"></textarea>
      </div>

      <div v-if="!hasFields" class="empty-state">
        <div style="font-size:32px;">📭</div>
        <div class="muted" style="margin-top:8px;">该模板暂无填写字段，可直接提交判别</div>
      </div>

      <div v-else class="card">
        <div class="card-title" style="margin-bottom:12px;">填写判别项</div>

        <div v-for="(f, i) in fields" :key="f.id || i" style="margin-bottom:14px;">
          <div style="font-size:13px;color:var(--text-2);margin-bottom:6px;">
            {{ fieldName(f) }}
            <span v-if="isRequired(f)" style="color:var(--danger);">*</span>
          </div>

          <!-- 文本 / 数字 / 日期 -->
          <input v-if="isTextLike(f)" class="fi-input" :type="inputType(f)"
                 :value="formData[fieldKey(f)]"
                 @input="e => onFieldInput(fieldKey(f), e.target.value)"
                 :placeholder="'请输入' + fieldName(f)" />

          <!-- 多行文本 -->
          <textarea v-else-if="fieldType(f) === 'textarea'" class="fi-input"
                    :value="formData[fieldKey(f)]"
                    @input="e => onFieldInput(fieldKey(f), e.target.value)"
                    :placeholder="'请输入' + fieldName(f)" style="min-height:72px;"></textarea>

          <!-- 下拉选择 -->
          <select v-else-if="fieldType(f) === 'select'" class="fi-input"
                  :value="formData[fieldKey(f)]"
                  @change="e => onFieldInput(fieldKey(f), e.target.value)">
            <option value="">请选择</option>
            <option v-for="(o, oi) in fieldOptions(f)" :key="o + '_' + oi" :value="o">{{ o }}</option>
          </select>

          <!-- 单选 -->
          <div v-else-if="fieldType(f) === 'radio'" style="display:flex;flex-wrap:wrap;gap:10px;">
            <label v-for="(o, oi) in fieldOptions(f)" :key="o + '_' + oi" style="display:flex;align-items:center;gap:6px;font-size:14px;">
              <input type="radio" :value="o" :checked="formData[fieldKey(f)] === o" @change="onRadio(f, o)" />
              <span>{{ o }}</span>
            </label>
          </div>

          <!-- 多选 -->
          <div v-else-if="fieldType(f) === 'checkbox'" style="display:flex;flex-wrap:wrap;gap:10px;">
            <label v-for="(o, oi) in fieldOptions(f)" :key="o + '_' + oi" style="display:flex;align-items:center;gap:6px;font-size:14px;">
              <input type="checkbox" :value="o" :checked="isChecked(f, o)" @change="toggleCheck(f, o)" />
              <span>{{ o }}</span>
            </label>
          </div>
        </div>
      </div>

      <button class="btn-primary" :disabled="submitting" @click="doSubmit">
        {{ submitting ? '判别中…' : '⚖️ 提交判别' }}
      </button>
    </template>
  </template>
</div>
`
};
