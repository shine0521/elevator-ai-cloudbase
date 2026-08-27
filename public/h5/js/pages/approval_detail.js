// 审批详情
window.Pages = window.Pages || {};
window.Pages.approval_detail = {
  name: 'approval_detail',
  props: ['query'],
  template: `
<div class="page">
  <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
  <div v-else-if="noData" class="empty-state"><span class="muted">未找到审批单</span></div>
  <div v-else>

    <!-- 基本信息卡片 -->
    <div class="card" style="margin-bottom:12px;">
      <div style="margin-bottom:8px;">
        <span class="badge badge-blue">{{bizLabel(data.business_type)}}</span>
      </div>
      <div style="font-size:17px;font-weight:700;margin-bottom:6px;">{{bizTitle()}}</div>
      <div class="dev-sub" v-if="hasApplicant">申请人：{{applicantName()}}</div>
      <div class="dev-sub">{{createdAt()}}</div>
      <div class="dev-sub" v-if="hasNode">当前节点：{{nodeName()}}</div>
    </div>

    <!-- 节点流程 -->
    <div v-if="hasNodes" class="card" style="margin-bottom:12px;">
      <div class="block-title">审批流程</div>
      <div class="timeline">
        <div v-for="(node, idx) in nodes" :key="nodeKey(node, idx)" class="tl-item" :class="isPendingNode(node) ? 'on' : ''">
          <div class="tl-dot" :style="{background: nodeColor(node.status)}"></div>
          <div v-if="notLast(idx)" class="tl-line"></div>
          <div class="tl-body">
            <div class="tl-title">{{nodeNameText(node)}}</div>
            <div class="tl-meta">
              {{nodeStatusLabel(node.status)}}
              <span v-if="hasNodeApprover(node)"> · {{nodeApprover(node)}}</span>
            </div>
            <div class="tl-meta" v-if="hasNodeDecidedAt(node)">{{nodeDecidedAt(node)}}</div>
            <div class="tl-comment" v-if="node.comment">意见：{{node.comment}}</div>
            <div class="tl-meta" v-if="node.ai_confidence != null">AI 置信度：{{aiConfText(node.ai_confidence)}}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 审批操作 -->
    <div v-if="canOperate" class="card" style="margin-bottom:12px;">
      <div class="block-title">审批意见</div>

      <div class="field" style="margin-bottom:12px;">
        <div class="fi-label">审批意见</div>
        <textarea class="fi-input" :value="comment" @input="e => comment = e.target.value"
          placeholder="请输入审批意见" style="height:72px;resize:none;"></textarea>
      </div>

      <div class="field" style="margin-bottom:12px;">
        <div class="fi-label">AI 置信度：{{aiConfidence}}%</div>
        <input type="range" min="0" max="100" step="5"
          :value="aiConfidence"
          @input="e => aiConfidence = parseInt(e.target.value, 10)"
          style="width:100%;" />
      </div>

      <div class="flex gap8" style="flex-wrap:wrap;">
        <button class="btn-primary" style="flex:1;min-width:80px;" :disabled="submitting" @click="doApprove">批准</button>
        <button class="btn-danger" style="flex:1;min-width:80px;" :disabled="submitting" @click="doReject">驳回</button>
        <button class="btn-ghost" style="flex:1;min-width:80px;" :disabled="submitting" @click="toggleForward">转审</button>
      </div>

      <div v-if="showForward" style="margin-top:12px;">
        <div class="field">
          <div class="fi-label">转审至（邮箱）</div>
          <input class="fi-input" type="email" :value="forwardTo" @input="e => forwardTo = e.target.value"
            placeholder="请输入被转审人邮箱" />
        </div>
        <button class="btn-primary" style="margin-top:8px;width:100%;" :disabled="submitting" @click="doForward">确认转审</button>
      </div>
    </div>

    <!-- 操作成功提示区 -->
    <div v-if="submitting" class="empty-state" style="padding:16px;"><span class="muted">处理中...</span></div>

  </div>
</div>
`,
  data: function () {
    return {
      id: null,
      data: null,
      loading: true,
      comment: '',
      aiConfidence: 80,
      forwardTo: '',
      showForward: false,
      submitting: false
    };
  },
  computed: {
    noData: function () { return !this.loading && !this.data; },
    nodes: function () { return this.data && this.data.nodes ? this.data.nodes : []; },
    hasNodes: function () { return this.nodes.length > 0; },
    hasApplicant: function () { return !!(this.data && (this.data.applicant_name || this.data.applicant)); },
    hasNode: function () { return !!(this.data && (this.data.node_name || this.data.current_node)); },
    canOperate: function () { return !!(this.data && this.data.status === 'PENDING'); }
  },
  mounted: function () {
    var r = Router.parse();
    this.id = r.query.id;
    if (this.id) this.load();
    else this.loading = false;
  },
  methods: {
    load: function () {
      var self = this;
      self.loading = true;
      api.getApproval(this.id).then(function (d) {
        self.data = d.data || d;
      }).catch(function () {
        utils.toast('加载失败');
      }).finally(function () {
        self.loading = false;
      });
    },
    bizLabel: function (type) {
      var m = {
        daily_inspection: '日管控',
        weekly_inspection: '周排查',
        hazard: '隐患上报',
        emergency: '应急事件',
        work_order: '整改工单',
        monthly: '月调度'
      };
      return m[type] || type || '审批';
    },
    bizTitle: function () {
      return (this.data && (this.data.business_title || this.data.title)) || '审批单';
    },
    applicantName: function () {
      return (this.data && (this.data.applicant_name || this.data.applicant)) || '';
    },
    createdAt: function () {
      return utils.formatDateTime(this.data && (this.data.created_at || this.data.create_time) || '');
    },
    nodeName: function () {
      return (this.data && (this.data.node_name || this.data.current_node)) || '';
    },
    nodeKey: function (node, idx) {
      return node.node_seq != null ? node.node_seq : idx;
    },
    notLast: function (idx) { return idx < this.nodes.length - 1; },
    isPendingNode: function (node) { return node.status === 'PENDING'; },
    nodeNameText: function (node) {
      return node.node_name || ('节点 ' + (node.node_seq != null ? node.node_seq : '?'));
    },
    hasNodeApprover: function (node) {
      return !!(node.approver_role || node.approver_email);
    },
    nodeApprover: function (node) {
      return node.approver_role || node.approver_email || '';
    },
    hasNodeDecidedAt: function (node) {
      return !!(node.decided_at || node.update_time);
    },
    nodeDecidedAt: function (node) {
      return utils.formatDateTime(node.decided_at || node.update_time || '');
    },
    aiConfText: function (v) {
      return v != null ? Math.round(v * 100) + '%' : '-';
    },
    nodeColor: function (status) {
      var m = {
        PENDING: 'var(--orange)',
        APPROVED: 'var(--green)',
        REJECTED: 'var(--red)',
        FORWARDED: 'var(--primary)',
        SKIPPED: 'var(--muted)'
      };
      return m[String(status || '').toUpperCase()] || 'var(--muted)';
    },
    nodeStatusLabel: function (status) {
      var m = {
        PENDING: '待处理',
        APPROVED: '已通过',
        REJECTED: '已驳回',
        FORWARDED: '已转审',
        SKIPPED: '已跳过'
      };
      return m[String(status || '').toUpperCase()] || '未开始';
    },
    toggleForward: function () { this.showForward = !this.showForward; },
    doApprove: function () {
      var self = this;
      if (self.submitting) return;
      self.submitting = true;
      api.approve(this.id, {
        comment: self.comment,
        aiConfidence: self.aiConfidence / 100
      }).then(function () {
        utils.toast('审批成功');
        self.comment = '';
        self.load();
      }).catch(function () {
        utils.toast('操作失败');
      }).finally(function () {
        self.submitting = false;
      });
    },
    doReject: function () {
      var self = this;
      if (self.submitting) return;
      var c = self.comment.trim();
      if (c.length < 10) { utils.toast('驳回意见至少10个字'); return; }
      self.submitting = true;
      api.reject(this.id, { comment: c }).then(function () {
        utils.toast('已驳回');
        utils.go('/approval');
      }).catch(function () {
        utils.toast('操作失败');
      }).finally(function () {
        self.submitting = false;
      });
    },
    doForward: function () {
      var self = this;
      if (self.submitting) return;
      var email = self.forwardTo.trim();
      var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!re.test(email)) { utils.toast('请输入正确的邮箱'); return; }
      self.submitting = true;
      api.forward(this.id, { forwardTo: email }).then(function () {
        utils.toast('已转审');
        utils.go('/approval');
      }).catch(function () {
        utils.toast('操作失败');
      }).finally(function () {
        self.submitting = false;
      });
    }
  }
};
