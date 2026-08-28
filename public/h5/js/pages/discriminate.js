// discriminate.js — AI 合规判别入口（H5）
// 输入现场问题/描述 → 可选 AI 智能分类选模板 → 选择模板进入填写
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md + server.js 路由段重写
// 铁律：v-model 仅用于 input/textarea；模板无裸 && || < >；禁 SVG；根 .page；三态齐全
window.Pages = window.Pages || {};

window.Pages.discriminate = {
  name: 'discriminate',
  props: ['query'],

  data: function () {
    return {
      loading: true,
      error: null,
      inputText: '',
      templates: [],
      search: '',
      classifyLoading: false,
      classifyResult: null
    };
  },

  computed: {
    // 从路由带入的预选模板 id
    preselectId: function () {
      var q = this.query || {};
      return q.id || '';
    },

    // 带入的预填描述
    prefillText: function () {
      var q = this.query || {};
      return q.inputText || '';
    },

    // 过滤后的模板列表
    shownTemplates: function () {
      var kw = (this.search || '').trim().toLowerCase();
      var list = this.templates;
      if (!kw) return list;
      return list.filter(function (t) {
        var hay = [t.name, t.category, t.device_type, t.code].join(' ').toLowerCase();
        return hay.indexOf(kw) >= 0;
      });
    },

    hasTemplates: function () { return this.templates.length > 0; },
    hasShown: function () { return this.shownTemplates.length > 0; },
    classified: function () { return !!this.classifyResult; },
    suggestedName: function () {
      return this.classifyResult ? (this.classifyResult.templateName || '') : '';
    },
    suggestedConf: function () {
      var c = this.classifyResult ? this.classifyResult.confidence : 0;
      if (!c) return '';
      return Math.round(Number(c) * 100) + '%';
    },
    preselectTemplate: function () {
      var id = this.preselectId;
      if (!id) return null;
      var found = null;
      this.templates.forEach(function (t) {
        if (String(t.id) === String(id)) found = t;
      });
      return found;
    }
  },

  methods: {
    go: function (p) { utils.go(p); },

    load: function () {
      var self = this;
      self.loading = true;
      self.error = null;
      if (self.prefillText && !self.inputText) self.inputText = self.prefillText;
      api.getTemplates({ status: 'published' }).then(function (d) {
        var arr = (d && d.data) || d || [];
        self.templates = Array.isArray(arr) ? arr : [];
        // 带入预选模板时，直接进入填写页
        if (self.preselectTemplate) {
          self.goFill(self.preselectTemplate);
        }
      }).catch(function () {
        self.error = '模板加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    // AI 智能分类：POST /api/ai/classify {text}
    doClassify: function () {
      var self = this;
      var txt = (self.inputText || '').trim();
      if (!txt) { utils.toast('请先描述现场问题'); return; }
      self.classifyLoading = true;
      self.classifyResult = null;
      api.classifyAI({ text: txt }).then(function (d) {
        var r = d || {};
        self.classifyResult = {
          templateId: r.templateId,
          templateName: r.templateName || '',
          confidence: r.confidence || 0
        };
      }).catch(function () {
        utils.toast('分类失败，可手动选择模板');
      }).finally(function () {
        self.classifyLoading = false;
      });
    },

    // 采用 AI 推荐模板
    useSuggested: function () {
      var r = this.classifyResult;
      if (!r || !r.templateId) { utils.toast('未获得推荐模板'); return; }
      this.go('/discriminate_fill?id=' + r.templateId +
        (this.inputText ? '&inputText=' + encodeURIComponent(this.inputText) : ''));
    },

    chooseTemplate: function (t) { this.goFill(t); },

    goFill: function (t) {
      var id = t.id;
      this.go('/discriminate_fill?id=' + id +
        (this.inputText ? '&inputText=' + encodeURIComponent(this.inputText) : ''));
    },

    doSearch: function () { /* 计算属性实时过滤，无需请求 */ },

    tplCategory: function (t) { return t.category || '通用'; },
    tplDevice: function (t) { return t.device_type || ''; }
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
    <div class="card">
      <div class="card-h">
        <div class="card-t">⚖️ AI 合规判别</div>
      </div>
      <div class="card-sub" style="margin-top:0;margin-bottom:10px;">描述现场问题或检验情况，AI 帮您匹配判别模板，或手动选择模板。</div>
      <textarea class="fi-input" v-model="inputText" placeholder="例如：某客梯制动器衬垫磨损超过原厚度 1/4，维保记录缺失……" style="min-height:96px;"></textarea>
      <button class="btn-primary" style="margin-top:10px;" :disabled="classifyLoading" @click="doClassify">
        {{ classifyLoading ? 'AI 分析中…' : '🔍 AI 智能分类' }}
      </button>
    </div>

    <div v-if="classified" class="card" style="background:var(--primary-light);border-color:var(--primary);">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:22px;">🧪</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;color:var(--primary);font-weight:600;">AI 推荐模板</div>
          <div style="font-size:15px;font-weight:600;margin-top:2px;">{{ suggestedName }}</div>
          <div v-if="suggestedConf" style="font-size:12px;color:var(--text-3);margin-top:2px;">匹配置信度 {{ suggestedConf }}</div>
        </div>
      </div>
      <button class="btn-primary" style="margin-top:10px;" @click="useSuggested">采用并填写</button>
    </div>

    <div class="card-title" style="font-size:15px;font-weight:600;margin:4px 0 10px;">选择判别模板</div>

    <div class="search-bar">
      <input v-model="search" @input="doSearch" placeholder="搜索模板名称 / 类别 / 设备" />
    </div>

    <div v-if="!hasShown" class="empty-state">
      <div style="font-size:32px;">📋</div>
      <div class="muted" style="margin-top:8px;">{{ hasTemplates ? '没有匹配的模板' : '暂无已发布模板' }}</div>
    </div>

    <div v-else class="list">
      <div v-for="(t, i) in shownTemplates" :key="t.id || i" class="list-item" @click="chooseTemplate(t)">
        <div class="li-icon">📄</div>
        <div class="li-body">
          <div class="li-title">{{ t.name }}</div>
          <div class="li-sub">{{ tplCategory(t) }}<span v-if="tplDevice(t)"> · {{ tplDevice(t) }}</span></div>
        </div>
        <div class="li-arrow">›</div>
      </div>
    </div>
  </template>
</div>
`
};
