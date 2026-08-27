// 审批详情
window.Pages = window.Pages || {};
window.Pages.approval_detail = {
  template: `
<div class="page">
  <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>

  <div v-else-if="hasData" class="approval-wrap">
    <div class="card info-card">
      <div class="biz-type-tag" style="display:inline-block;background:#eef4ff;color:#1677FF;font-size:12px;padding:2px 8px;border-radius:10px;">{{bizLabel(data.biz_type)}}</div>
      <div class="info-title" style="font-size:18px;font-weight:700;margin:8px 0 6px;">{{bizTitle()}}</div>
      <div class="info-row muted">
        <span v-if="hasApplicant">申请人：{{applicantName()}}</span>
        <span v-if="hasCreatedAt"> · {{createdAt()}}</span>
      </div>
      <div class="info-row muted" v-if="hasCurrentNode">当前节点：{{data.current_node}}</div>
    </div>

    <div class="section" v-if="hasNodes">
      <div class="section-title" style="font-size:15px;font-weight:600;margin:4px 0 10px;">审批流程</div>
      <div class="timeline">
        <div v-for="(node, idx) in nodeList" :key="nodeKey(node, idx)" class="tl-item" :class="nodeClass(node)">
          <div class="tl-dot" :style="{background: nodeColor(node.status)}"></div>
          <div v-if="!isLast(idx)" class="tl-line"></div>
          <div class="tl-body">
            <div class="tl-title">{{nodeName(node, idx)}}</div>
            <div class="tl-meta">{{nodeStatusLabel(node.status)}}<span v-if="hasNodeApprover(node)"> · 审批人：{{nodeApprover(node)}}</span></div>
            <div class="tl-meta" v-if="hasNodeDecidedAt(node)">{{nodeDecidedAt(node)}}</div>
            <div class="tl-comment" v-if="node.comment">意见：{{node.comment}}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="canApprove" class="card action-panel">
      <div class="section-title" style="font-size:15px;font-weight:600;margin-bottom:10px;">审批意见</div>
      <div class="form-item">
        <div class="form-label">审批意见</div>
        <textarea class="fi-input" v-model="comment" placeholder="请输入审批意见（驳回时必填）"></textarea>
      </div>
      <div class="form-item">
        <div class="form-label">AI 置信度（{{aiConfidence}}%）</div>
        <input type="range" min="0" max="100" step="1" v-model.number="aiConfidence" style="width:100%;" />
      </div>

      <div class="flex gap8">
        <button class="ab-btn ab-green" :disabled="submitting" @click="doApprove">✅ 批准</button>
        <button class="ab-btn ab-red" :disabled="submitting" @click="doReject">❌ 驳回</button>
        <button class="ab-btn ab-blue" :disabled="submitting" @click="toggleForward">↪️ 转审</button>
      </div>

      <div v-show="showForward" class="form-item mt10">
        <div class="form-label">转审至（邮箱）</div>
        <input class="fi-input" type="text" v-model="forwardEmail" placeholder="被转审人邮箱" />
        <button class="ab-btn ab-blue mt8" :disabled="submitting" @click="doForward">确认转审</button>
      </div>
    </div>
  </div>

  <div v-else class="empty-state"><span class="muted">未找到审批单</span></div>
</div>
`,
  data() {
    return {
      id: null,
      data: null,
      loading: true,
      comment: '',
      aiConfidence: 80,
      forwardEmail: '',
      showForward: false,
      submitting: false
    };
  },
  computed: {
    hasData: function () {
      return !!this.data;
    },
    canApprove: function () {
      return !!(this.data && this.data.current_node_status === 'PENDING');
    },
    hasNodes: function () {
      return this.nodeList.length > 0;
    },
    nodeList: function () {
      return this.data && this.data.nodes ? this.data.nodes : [];
    }
  },
  mounted() {
    var r = Router.parse();
    this.id = r.query.id;
    if (this.id) this.load(this.id);
    else this.loading = false;
  },
  methods: {
    bizLabel: function (type) {
      var m = {
        inspection: '日管控', daily: '日管控', weekly: '周排查',
        hazard: '隐患上报', emergency: '应急事件',
        work_order: '整改工单', monthly: '月调度'
      };
      return m[type] || type || '审批';
    },
    bizTitle: function () {
      return (this.data && (this.data.biz_title || this.data.title)) || '审批单';
    },
    hasApplicant: function () {
      return !!(this.data && (this.data.applicant_name || this.data.applicant));
    },
    applicantName: function () {
      return (this.data && (this.data.applicant_name || this.data.applicant)) || '';
    },
    hasCreatedAt: function () {
      return !!(this.data && (this.data.created_at || this.data.create_time));
    },
    createdAt: function () {
      return (this.data && (this.data.created_at || this.data.create_time)) || '';
    },
    hasCurrentNode: function () {
      return !!(this.data && this.data.current_node);
    },
    nodeKey: function (node, idx) {
      return node.seq != null ? node.seq : idx;
    },
    isLast: function (idx) {
      return idx === this.nodeList.length - 1;
    },
    nodeClass: function (node) {
      return node.status === 'PENDING' ? 'on' : '';
    },
    nodeName: function (node, idx) {
      return node.name || node.node_name || ('节点' + (node.seq != null ? node.seq : idx + 1));
    },
    hasNodeApprover: function (node) {
      return !!(node.approver_name || node.approver);
    },
    nodeApprover: function (node) {
      return node.approver_name || node.approver || '';
    },
    hasNodeDecidedAt: function (node) {
      return !!(node.decided_at || node.update_time);
    },
    nodeDecidedAt: function (node) {
      return node.decided_at || node.update_time || '';
    },
    nodeColor: function (status) {
      var m = {
        PENDING: '#FF8C00', APPROVED: '#52C41A',
        REJECTED: '#F5222D', FORWARDED: '#1677FF', SKIPPED: '#BFBFBF'
      };
      return m[String(status || '').toUpperCase()] || '#999';
    },
    nodeStatusLabel: function (status) {
      var m = {
        PENDING: '待处理', APPROVED: '已通过',
        REJECTED: '已驳回', FORWARDED: '已转审', SKIPPED: '已跳过'
      };
      return m[String(status || '').toUpperCase()] || '未开始';
    },
    toggleForward: function () {
      this.showForward = !this.showForward;
    },
    load: async function (id) {
      this.loading = true;
      try {
        var d = await api.get('/api/mobile/approvals/' + id);
        this.data = d.data || d;
      } catch (e) {
        utils.toast('加载失败');
      } finally {
        this.loading = false;
      }
    },
    doApprove: async function () {
      if (this.submitting) return;
      this.submitting = true;
      try {
        await api.post('/api/mobile/approvals/' + this.id + '/approve', {
          comment: this.comment,
          aiConfidence: parseFloat(this.aiConfidence) / 100
        });
        utils.toast('审批成功');
        this.load(this.id);
      } catch (e) {
        utils.toast('操作失败');
      } finally {
        this.submitting = false;
      }
    },
    doReject: async function () {
      if (this.submitting) return;
      if (!this.comment || this.comment.trim().length < 1) {
        utils.toast('请填写驳回意见');
        return;
      }
      this.submitting = true;
      try {
        await api.post('/api/mobile/approvals/' + this.id + '/reject', { comment: this.comment });
        utils.toast('已驳回');
        utils.go('/approval');
      } catch (e) {
        utils.toast('操作失败');
      } finally {
        this.submitting = false;
      }
    },
    doForward: async function () {
      if (this.submitting) return;
      var email = (this.forwardEmail || '').trim();
      var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!re.test(email)) {
        utils.toast('请输入正确的邮箱');
        return;
      }
      this.submitting = true;
      try {
        await api.post('/api/mobile/approvals/' + this.id + '/forward', {
          forwardEmail: email,
          comment: this.comment
        });
        utils.toast('已转审');
        utils.go('/approval');
      } catch (e) {
        utils.toast('操作失败');
      } finally {
        this.submitting = false;
      }
    }
  }
};
