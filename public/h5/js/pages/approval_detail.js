// 审批详情 - H5 (Vue3 全局构建, 按契约重写)
// 契约 #21: GET /api/mobile/approvals/:id → {..., nodes:[{id,node_name,node_type,approver_email,status,ai_confidence,ai_comparison_summary,comment,acted_at}]}
// 契约 #21: 通过 POST /api/mobile/approvals/:id/approve {comment,aiConfidence}
// 契约 #21: 驳回 POST /api/mobile/approvals/:id/reject {comment} 评论≥10字
// 契约 #21: 转审 POST /api/mobile/approvals/:id/forward {forwardEmail,comment}
// 铁律: v-model 仅限 input/select/textarea; 模板禁裸 && || < >; 根 <div class="page">; 三态齐全; 禁 SVG
window.Pages = window.Pages || {};
window.Pages.approval_detail = {
  name: 'approval_detail',
  props: ['query'],
  data: function () {
    return {
      loading: true,
      error: false,
      id: '',
      data: null,
      nodes: [],
      comment: '',
      aiConfidence: 80,
      forwardTo: '',
      showForward: false,
      submitting: false
    };
  },
  computed: {
    showEmpty: function () {
      return !this.loading && !this.error && !this.data;
    },
    bizTitle: function () {
      if (!this.data) return '';
      return this.data.business_title || this.data.title || '审批单';
    },
    bizLabelMap: function () {
      return {
        daily_inspection: '日管控',
        weekly_inspection: '周排查',
        hazard: '隐患上报',
        emergency: '应急事件',
        work_order: '整改工单',
        monthly: '月调度'
      };
    },
    statusLabelMap: function () {
      return {
        PENDING: '待审批',
        APPROVED: '已批准',
        REJECTED: '已驳回',
        RECALLED: '已撤回',
        CANCELLED: '已取消'
      };
    },
    statusClassMap: function () {
      return {
        PENDING: 'tag-pending',
        APPROVED: 'tag-ok',
        REJECTED: 'tag-ng',
        RECALLED: 'tag-low',
        CANCELLED: 'tag-low'
      };
    },
    nodeStatusLabelMap: function () {
      return {
        PENDING: '待处理',
        APPROVED: '已通过',
        REJECTED: '已驳回',
        FORWARDED: '已转审',
        SKIPPED: '已跳过'
      };
    },
    nodeColorMap: function () {
      return {
        PENDING: 'var(--warning)',
        APPROVED: 'var(--success)',
        REJECTED: 'var(--danger)',
        FORWARDED: 'var(--primary)',
        SKIPPED: 'var(--info)'
      };
    },
    canOperate: function () {
      return !!(this.data && this.data.status === 'PENDING');
    },
    applicantText: function () {
      if (!this.data) return '';
      return this.data.applicant_email || this.data.applicant_name || '';
    },
    createdAt: function () {
      if (!this.data) return '';
      return utils.formatDateTime(this.data.created_at);
    },
    currentNodeText: function () {
      if (!this.data) return '';
      var node = this.data.current_node;
      var total = this.data.total_nodes;
      if (!node) return '';
      return '当前节点 ' + node + (total ? '/' + total : '');
    }
  },
  methods: {
    load: function () {
      var self = this;
      self.id = (self.query && self.query.id) || '';
      if (!self.id) {
        self.loading = false;
        return;
      }
      self.loading = true;
      self.error = false;
      api.get('/api/mobile/approvals/' + self.id).then(function (d) {
        self.data = (d && d.data) ? d.data : d;
        self.nodes = (self.data && self.data.nodes) ? self.data.nodes : [];
      }).catch(function (e) {
        self.error = true;
        utils.toast((e && e.message) || '加载失败');
      }).then(function () {
        self.loading = false;
      });
    },
    bizLabel: function (type) {
      return this.bizLabelMap[type] || type || '审批';
    },
    statusLabel: function (s) {
      return this.statusLabelMap[s] || s || '';
    },
    statusClass: function (s) {
      return this.statusClassMap[s] || 'tag-low';
    },
    nodeStatusLabel: function (s) {
      return this.nodeStatusLabelMap[s] || '未开始';
    },
    nodeColor: function (s) {
      return this.nodeColorMap[s] || 'var(--info)';
    },
    isCurrentNode: function (node) {
      if (!this.data || !node) return false;
      var current = this.data.current_node;
      return node.node_seq === current;
    },
    nodeName: function (node) {
      if (!node) return '';
      return node.node_name || ('节点 ' + (node.node_seq || '?'));
    },
    nodeApprover: function (node) {
      if (!node) return '';
      return node.approver_role || node.approver_email || '';
    },
    nodeDecidedAt: function (node) {
      if (!node || !node.acted_at) return '';
      return utils.formatDateTime(node.acted_at);
    },
    aiConfText: function (val) {
      if (val == null) return '-';
      var pct = Math.round(val * 100);
      return pct + '%';
    },
    toggleForward: function () {
      this.showForward = !this.showForward;
    },
    doApprove: function () {
      var self = this;
      if (self.submitting) return;
      self.submitting = true;
      api.approve(self.id, {
        comment: self.comment,
        aiConfidence: self.aiConfidence / 100
      }).then(function () {
        utils.toast('审批成功');
        self.comment = '';
        self.showForward = false;
        self.load();
      }).catch(function (e) {
        utils.toast((e && e.message) || '操作失败');
      }).then(function () {
        self.submitting = false;
      });
    },
    doReject: function () {
      var self = this;
      if (self.submitting) return;
      var c = self.comment.trim();
      if (c.length < 10) {
        utils.toast('驳回意见至少10个字');
        return;
      }
      self.submitting = true;
      api.reject(self.id, { comment: c }).then(function () {
        utils.toast('已驳回');
        utils.go('/approval');
      }).catch(function (e) {
        utils.toast((e && e.message) || '操作失败');
      }).then(function () {
        self.submitting = false;
      });
    },
    doForward: function () {
      var self = this;
      if (self.submitting) return;
      var email = self.forwardTo.trim();
      var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!re.test(email)) {
        utils.toast('请输入正确的邮箱');
        return;
      }
      self.submitting = true;
      api.forward(self.id, { forwardTo: email, comment: self.comment }).then(function () {
        utils.toast('已转审');
        utils.go('/approval');
      }).catch(function (e) {
        utils.toast((e && e.message) || '操作失败');
      }).then(function () {
        self.submitting = false;
      });
    }
  },
  mounted: function () {
    this.load();
  },
  template: `
<div class="page">
  <div v-if="loading" class="empty-state">
    <div class="loading-spinner"></div>
    <div class="muted" style="margin-top:12px;">加载中...</div>
  </div>

  <div v-else-if="error" class="empty-state">
    <div class="text-danger">❌ 加载失败</div>
    <button class="btn btn-primary" style="margin-top:16px;" @click="load">重试</button>
  </div>

  <div v-else-if="showEmpty" class="empty-state">
    <div class="muted">⚖️ 未找到审批单</div>
  </div>

  <template v-else>
    <!-- 基本信息 -->
    <div class="card">
      <div class="card-h">
        <span class="tag" :class="statusClass(data.status)">{{ bizLabel(data.business_type) }}</span>
      </div>
      <div class="card-t" style="margin-top:8px;">{{ bizTitle }}</div>

      <div v-if="applicantText" class="detail-row">
        <span class="detail-label">申请人</span>
        <span class="detail-value">{{ applicantText }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">创建时间</span>
        <span class="detail-value">{{ createdAt }}</span>
      </div>
      <div v-if="currentNodeText" class="detail-row">
        <span class="detail-label">进度</span>
        <span class="detail-value">{{ currentNodeText }}</span>
      </div>
    </div>

    <!-- 审批流程 -->
    <div v-if="nodes.length" class="card">
      <div class="card-t">审批流程</div>
      <div class="list">
        <div v-for="(node, idx) in nodes" :key="node.id || idx" class="list-item" :class="isCurrentNode(node) ? 'highlight' : ''">
          <div class="li-row">
            <div class="li-icon" :style="{background: nodeColor(node.status)}">{{ idx + 1 }}</div>
            <span class="li-title">{{ nodeName(node) }}</span>
            <span class="tag" :class="statusClass(node.status)">{{ nodeStatusLabel(node.status) }}</span>
          </div>

          <div v-if="nodeApprover(node)" class="li-sub text-2">
            审批人：{{ nodeApprover(node) }}
          </div>

          <div v-if="node.acted_at" class="li-sub muted">
            处理时间：{{ nodeDecidedAt(node) }}
          </div>

          <div v-if="node.comment" class="li-sub text-2" style="padding:8px;background:var(--bg);border-radius:4px;margin-top:4px;">
            {{ node.comment }}
          </div>

          <div v-if="node.ai_confidence != null" class="li-sub text-primary">
            🤖 AI 置信度：{{ aiConfText(node.ai_confidence) }}
          </div>

          <div v-if="node.ai_comparison_summary" class="li-sub muted" style="padding:8px;background:var(--primary-light);border-radius:4px;margin-top:4px;">
            📊 {{ node.ai_comparison_summary }}
          </div>
        </div>
      </div>
    </div>

    <!-- 审批操作 -->
    <div v-if="canOperate" class="card">
      <div class="card-t">审批操作</div>

      <div class="field">
        <div class="fi-label">审批意见</div>
        <textarea class="fi-input txta" :value="comment" @input="e => comment = e.target.value" placeholder="请输入审批意见（驳回需≥10字）"></textarea>
      </div>

      <div class="field">
        <div class="fi-label">AI 置信度：{{ aiConfidence }}%</div>
        <input type="range" style="width:100%;" min="0" max="100" step="5" :value="aiConfidence" @input="e => aiConfidence = Number(e.target.value)" />
      </div>

      <div class="btn-row">
        <button class="btn btn-primary" :disabled="submitting" @click="doApprove">✅ 批准</button>
        <button class="btn btn-danger" :disabled="submitting" @click="doReject">❌ 驳回</button>
        <button class="btn btn-ghost" :disabled="submitting" @click="toggleForward">🔄 转审</button>
      </div>

      <div v-if="showForward" class="card" style="margin-top:12px;background:var(--bg);">
        <div class="field">
          <div class="fi-label">转审至（邮箱）</div>
          <input class="fi-input" type="email" :value="forwardTo" @input="e => forwardTo = e.target.value" placeholder="请输入被转审人邮箱" />
        </div>
        <button class="btn btn-primary btn-row" :disabled="submitting" @click="doForward">确认转审</button>
      </div>
    </div>

    <div v-if="submitting" class="empty-state" style="padding:16px;">
      <div class="muted">处理中...</div>
    </div>
  </template>
</div>
`
};
