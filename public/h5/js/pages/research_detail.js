// research_detail.js — 研究任务详情（H5）
// GET /api/template-research/:id → {title,research_type,status,ai_suggestions:[],suggestions:[]}
// POST /api/template-research/:id/ai-suggest → AI 建议
// PUT /api/template-research/:id/publish → 发布模板
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md 重写
// 铁律：模板无裸 && || < >；禁 SVG；根 .page；三态齐全；query.id 缺失显示空态
window.Pages = window.Pages || {};

window.Pages.research_detail = {
  name: 'research_detail',
  props: ['query'],

  data: function () {
    return {
      loading: true,
      error: null,
      task: null,
      // 操作
      aiSuggestLoading: false,
      publishLoading: false
    };
  },

  computed: {
    hasId: function () { return !!(this.query && this.query.id); },
    hasTask: function () { return !!this.task; },
    // 状态
    statusText: function () {
      var m = { draft: '草稿', suggesting: 'AI 建议中', reviewing: '审核中', published: '已发布' };
      return m[String(this.task && this.task.status || '').toLowerCase()] || (this.task && this.task.status) || '草稿';
    },
    statusTag: function () {
      var s = String(this.task && this.task.status || '').toLowerCase();
      var m = { draft: 'tag-draft', suggesting: 'tag-pending', reviewing: 'tag-pending', published: 'tag-ok' };
      return m[s] || 'tag-info';
    },
    // 是否可操作
    canAISuggest: function () {
      var s = this.task ? this.task.status : '';
      return String(s).toLowerCase() === 'draft' || String(s).toLowerCase() === 'suggesting';
    },
    canPublish: function () {
      var s = this.task ? this.task.status : '';
      return String(s).toLowerCase() !== 'published';
    },
    // AI 建议列表
    aiSuggestions: function () {
      return (this.task && Array.isArray(this.task.ai_suggestions)) ? this.task.ai_suggestions : [];
    },
    // 专家修改对比列表
    suggestions: function () {
      return (this.task && Array.isArray(this.task.suggestions)) ? this.task.suggestions : [];
    },
    // 研究类型
    researchTypeText: function () {
      var m = { new: '新建模板', modify: '修改模板', supplement: '补充条款', review: '合规审核' };
      return m[String(this.task && this.task.research_type || '').toLowerCase()] || (this.task && this.task.research_type) || '研究';
    },
    // 标题
    taskTitle: function () { return this.task ? (this.task.title || '未命名研究任务') : ''; },
    // 创建时间
    createdAt: function () { return this.task ? utils.formatDateTime(this.task.created_at || '') : ''; },
    // 更新时间
    updatedAt: function () { return this.task ? utils.formatDateTime(this.task.updated_at || '') : ''; }
  },

  methods: {
    go: function (p) { utils.go(p); },

    load: function () {
      var self = this;
      var q = self.query || {};
      var id = q.id;
      if (!id) {
        self.loading = false;
        self.error = '缺少任务参数';
        return;
      }
      self.loading = true;
      self.error = null;
      api.getResearchTask(id).then(function (d) {
        var task = (d && d.data) || d || null;
        if (!task) { self.error = '研究任务不存在'; return; }
        self.task = task;
      }).catch(function () {
        self.error = '详情加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    goBack: function () { this.go('/research_list'); },

    // AI 建议
    doAISuggest: function () {
      var self = this;
      if (!self.canAISuggest) return;
      self.aiSuggestLoading = true;
      api.researchAISuggest(self.task.id).then(function () {
        utils.toast('AI 建议生成中，请稍后刷新查看');
        // 延迟刷新
        setTimeout(function () { self.load(); }, 2000);
      }).catch(function () {
        utils.toast('AI 建议生成失败，请重试');
      }).finally(function () {
        self.aiSuggestLoading = false;
      });
    },

    // 发布模板
    doPublish: function () {
      var self = this;
      if (!self.canPublish) return;
      utils.confirm('确认发布此模板？发布后模板将正式生效。').then(function (ok) {
        if (!ok) return;
        self.publishLoading = true;
        api.researchPublish(self.task.id).then(function () {
          utils.toast('发布成功');
          self.load();
        }).catch(function () {
          utils.toast('发布失败，请重试');
        }).finally(function () {
          self.publishLoading = false;
        });
      });
    },

    // suggestion status → tag
    suggestionStatusTag: function (s) {
      var m = { pending: 'tag-pending', approved: 'tag-ok', rejected: 'tag-ng', modified: 'tag-warn' };
      return m[String(s || '').toLowerCase()] || 'tag-info';
    },
    suggestionStatusText: function (s) {
      var m = { pending: '待确认', approved: '已采纳', rejected: '已拒绝', modified: '已修改' };
      return m[String(s || '').toLowerCase()] || s || '待确认';
    },

    // AI 建议时间
    suggestTime: function (s) {
      return utils.formatDateTime(s.created_at || '');
    },

    // 判断内容是否过长（预览）
    contentPreview: function (c) {
      if (!c) return '';
      return c.length > 200 ? c.substring(0, 200) + '…' : c;
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
    <button class="btn-primary" style="margin-top:14px;width:auto;padding:9px 20px;" @click="goBack">返 回</button>
  </div>

  <template v-else-if="hasTask">
    <!-- 任务基本信息 -->
    <div class="card">
      <div class="card-title">🧪 {{ taskTitle }}</div>
      <div class="detail-row">
        <div class="dk">任务状态</div>
        <div class="dv">
          <span class="tag" :class="statusTag">{{ statusText }}</span>
        </div>
      </div>
      <div class="detail-row">
        <div class="dk">研究类型</div>
        <div class="dv">{{ researchTypeText }}</div>
      </div>
      <div class="detail-row">
        <div class="dk">创建时间</div>
        <div class="dv">{{ createdAt }}</div>
      </div>
      <div v-if="updatedAt" class="detail-row">
        <div class="dk">更新时间</div>
        <div class="dv">{{ updatedAt }}</div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="card" style="margin-top:10px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button
          class="btn-primary"
          :disabled="!canAISuggest || aiSuggestLoading"
          @click="doAISuggest"
          style="flex:1;"
        >{{ aiSuggestLoading ? '生成中...' : '🤖 AI 建议' }}</button>
        <button
          class="btn-primary"
          :disabled="!canPublish || publishLoading"
          @click="doPublish"
          style="flex:1;"
        >{{ publishLoading ? '发布中...' : '📤 发布模板' }}</button>
      </div>
    </div>

    <!-- AI 建议列表 -->
    <div class="card" style="margin-top:10px;">
      <div class="card-title">🤖 AI 大模型建议</div>
      <div v-if="aiSuggestions.length === 0" class="muted" style="font-size:13px;padding:8px 0;">暂无 AI 建议</div>
      <div v-else class="list">
        <div v-for="(s, i) in aiSuggestions" :key="s.id || i" class="list-item" style="flex-direction:column;align-items:flex-start;">
          <div style="display:flex;width:100%;align-items:flex-start;gap:8px;margin-bottom:6px;">
            <div class="li-icon" style="flex-shrink:0;">🧠</div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
                <span class="fw6" style="font-size:13px;">{{ s.model_name || 'AI 模型' }}</span>
                <span class="muted" style="font-size:11px;">{{ suggestTime(s) }}</span>
              </div>
              <div class="li-sub" style="line-height:1.7;">{{ contentPreview(s.content) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 专家修改对比 -->
    <div class="card" style="margin-top:10px;">
      <div class="card-title">👤 专家修改对比</div>
      <div v-if="suggestions.length === 0" class="muted" style="font-size:13px;padding:8px 0;">暂无修改记录</div>
      <div v-else class="list">
        <div v-for="(s, i) in suggestions" :key="s.id || i" class="list-item" style="flex-direction:column;align-items:flex-start;">
          <div style="display:flex;width:100%;align-items:flex-start;gap:8px;margin-bottom:6px;">
            <div class="li-icon" style="flex-shrink:0;">📝</div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
                <span class="fw6" style="font-size:13px;">{{ s.field_name || '字段' }}</span>
                <span class="tag" :class="suggestionStatusTag(s.status)">{{ suggestionStatusText(s.status) }}</span>
              </div>
              <div v-if="s.suggested" class="li-sub" style="color:var(--primary);">
                AI 建议：{{ s.suggested }}
              </div>
              <div v-if="s.expert_modified" class="li-sub" style="margin-top:4px;">
                专家修改：{{ s.expert_modified }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <button class="btn-ghost" style="margin-top:16px;" @click="goBack">返回列表</button>
  </template>

  <div v-else class="empty-state">
    <div style="font-size:32px;">🧪</div>
    <div class="muted" style="margin-top:8px;">未找到该研究任务</div>
  </div>
</div>
`
};
