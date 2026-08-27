window.Pages = window.Pages || {};
window.Pages.approval_detail = {
  template: `
<div class="page">
  <!-- 加载态 -->
  <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>

  <!-- 审批单信息 -->
  <div v-else-if="approval" class="approval-wrap">

    <!-- 基本信息卡 -->
    <div class="card info-card">
      <div class="biz-type-tag">{{bizTypeLabel}}</div>
      <div class="info-title">{{approval.biz_title || approval.title || '审批单'}}</div>
      <div class="info-row muted">
        <span v-if="approval.applicant_name || approval.applicant">申请人：{{approval.applicant_name || approval.applicant}}</span>
        <span v-if="approval.create_time || approval.created_at"> | {{approval.create_time || approval.created_at}}</span>
      </div>
      <div class="info-row">
        <span class="status-badge" :style="{background: approval.current_node_status === 'PENDING' ? '#FF8C00' : '#52C41A', color: '#fff'}">
          {{approval.current_node_status === 'PENDING' ? '待审批' : '已完结'}}
        </span>
      </div>
    </div>

    <!-- 审批节点时间线 -->
    <div class="section" v-if="nodeList.length > 0">
      <div class="section-title">审批节点</div>
      <div class="timeline">
        <div
          v-for="(item, index) in nodeList"
          :key="item.node_seq || index"
          class="timeline-item"
        >
          <div class="tl-left">
            <div class="tl-icon" :style="{background: nodeColor(item.status), color: '#fff'}">
              {{nodeIcon(item.status)}}
            </div>
            <div v-if="index < nodeList.length - 1" class="tl-line"></div>
          </div>
          <div class="tl-right">
            <div class="tl-name" :class="{ 'current-node': item.status === 'PENDING' }">
              {{item.node_name || ('节点' + item.node_seq)}}
            </div>
            <div v-if="item.approver_email || item.approver" class="tl-sub muted">
              审批人：{{item.approver_email || item.approver}}
            </div>
            <div v-if="item.decided_at || item.update_time" class="tl-sub muted">
              {{item.decided_at || item.update_time}}
            </div>
            <div v-if="item.comment" class="tl-comment muted">
              意见：{{item.comment}}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 审批操作区（仅当前节点且 PENDING 时显示） -->
    <div v-if="canApprove()" class="card action-panel">
      <div class="section-title">审批意见</div>

      <!-- 意见输入 -->
      <div class="form-item">
        <div class="form-label">审批意见</div>
        <textarea
          class="form-textarea"
          placeholder="请输入审批意见（驳回时必填≥10字）"
          v-model="comment"
        ></textarea>
      </div>

      <!-- AI 对比摘要（可选） -->
      <div class="form-item">
        <div class="form-label">AI 对比摘要（可选）</div>
        <textarea
          class="form-textarea"
          placeholder="AI 比对结果摘要"
          v-model="aiComparisonSummary"
        ></textarea>
      </div>
      <div v-if="aiComparisonSummary" class="form-item">
        <div class="form-label">AI 置信度</div>
        <div class="confidence-row">
          <input type="range" min="0" max="100" :value="Math.round(aiConfidence * 100)" @input="bindConfidence" />
          <span class="confidence-val">{{Math.round(aiConfidence * 100)}}%</span>
        </div>
      </div>

      <!-- 转审区 -->
      <div v-if="showForward" class="form-item">
        <div class="form-label">转审至（邮箱）</div>
        <input class="form-input" type="text" placeholder="被转审人邮箱" v-model="forwardEmail" />
      </div>

      <!-- 操作按钮 -->
      <div class="action-btns">
        <button class="btn-approve" @click="doApprove" :disabled="submitting">✅ 批准</button>
        <button class="btn-reject" @click="doReject" :disabled="submitting">❌ 驳回</button>
        <button class="btn-forward" @click="showForward ? doForward() : toggleForward()" :disabled="submitting">
          {{showForward ? '确认转审' : '↪️ 转审'}}
        </button>
      </div>
    </div>

  </div>
</div>
  `,
  data() {
    return {
      id: null,
      approval: null,
      loading: true,
      comment: '',
      aiComparisonSummary: '',
      aiConfidence: 0.8,
      forwardEmail: '',
      submitting: false,
      showForward: false
    };
  },
  computed: {
    nodeList() {
      if (!this.approval) return [];
      return this.approval.nodes || this.approval.node_list || [];
    },
    bizTypeLabel() {
      const m = {
        daily: '日管控检查',
        inspection: '日管控检查',
        weekly: '周排查',
        hazard: '隐患排查',
        emergency: '应急事件'
      };
      return m[this.approval.biz_type] || '审批';
    }
  },
  mounted() {
    this.id = this.query.id;
    if (this.id) this.load(this.id);
  },
  methods: {
    nodeIcon(status) {
      const m = { PENDING: '⏳', APPROVED: '✅', REJECTED: '❌', FORWARDED: '↪️', SKIPPED: '⏭️' };
      return m[status] || '⬜';
    },
    nodeColor(status) {
      const m = { PENDING: '#FF8C00', APPROVED: '#52C41A', REJECTED: '#F5222D', FORWARDED: '#1082FF', SKIPPED: '#BFBFBF' };
      return m[status] || '#999';
    },
    canApprove() {
      return !!(this.approval && this.approval.current_node_status === 'PENDING');
    },
    bindConfidence(e) {
      this.aiConfidence = parseFloat(e.target.value) / 100;
    },
    toggleForward() {
      this.showForward = !this.showForward;
    },
    async load(id) {
      this.loading = true;
      try {
        const d = await api.get('/api/mobile/approvals/' + id);
        this.approval = d.data || d;
      } catch (e) {
        utils.toast(e.message || '网络错误');
      } finally {
        this.loading = false;
      }
    },
    async doApprove() {
      if (this.submitting) return;
      if (!utils.confirm('确定批准该申请？')) return;
      this.submitting = true;
      try {
        const payload = { comment: this.comment };
        if (this.aiComparisonSummary) {
          payload.aiComparisonSummary = this.aiComparisonSummary;
          payload.aiConfidence = this.aiConfidence;
        }
        await api.post('/api/mobile/approvals/' + this.id + '/approve', payload);
        utils.toast('已批准');
        setTimeout(() => history.back(), 1200);
      } catch (e) {
        utils.toast(e.message || '网络错误');
      } finally {
        this.submitting = false;
      }
    },
    async doReject() {
      if (this.comment.trim().length < 10) {
        utils.toast('驳回意见至少10个字');
        return;
      }
      if (!utils.confirm('确定驳回该申请？')) return;
      this.submitting = true;
      try {
        await api.post('/api/mobile/approvals/' + this.id + '/reject', { comment: this.comment });
        utils.toast('已驳回');
        setTimeout(() => history.back(), 1200);
      } catch (e) {
        utils.toast(e.message || '网络错误');
      } finally {
        this.submitting = false;
      }
    },
    async doForward() {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(this.forwardEmail.trim())) {
        utils.toast('请输入正确的邮箱');
        return;
      }
      this.submitting = true;
      try {
        await api.post('/api/mobile/approvals/' + this.id + '/forward', { forwardTo: this.forwardEmail.trim() });
        utils.toast('已转审');
        setTimeout(() => history.back(), 1200);
      } catch (e) {
        utils.toast(e.message || '网络错误');
      } finally {
        this.submitting = false;
      }
    }
  }
};
