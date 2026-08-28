// audit_detail.js — 审核处理（H5）
// GET /api/audit-tasks/:id → 任务详情
// POST /api/audit-tasks/:id/action {action, comment, aiConfidence}
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md 重写
// 铁律：模板无裸 && || < >；禁 SVG；根 .page；三态齐全；query.id 缺失显示空态
window.Pages = window.Pages || {};

window.Pages.audit_detail = {
  name: 'audit_detail',
  props: ['query'],

  data: function () {
    return {
      loading: true,
      error: null,
      task: null,
      discRecord: null,
      // 操作相关
      actionMode: null,   // 'approve' | 'reject' | 'forward'
      actionLoading: false,
      comment: '',
      aiConfidence: 80,
      forwardTo: ''
    };
  },

  computed: {
    hasId: function () { return !!(this.query && this.query.id); },
    hasTask: function () { return !!this.task; },
    isPending: function () {
      var s = this.task ? this.task.status : '';
      return String(s).toUpperCase() === 'PENDING';
    },
    // 状态 tag
    statusTag: function () {
      var s = this.task ? this.task.status : '';
      var m = { PENDING: 'tag-pending', APPROVED: 'tag-ok', REJECTED: 'tag-ng' };
      return m[String(s).toUpperCase()] || 'tag-info';
    },
    statusText: function () {
      var s = this.task ? this.task.status : '';
      var m = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' };
      return m[String(s).toUpperCase()] || s || '待审核';
    },
    // 判别结果
    finalResultText: function () { return this.task ? (this.task.final_result || '—') : '—'; },
    finalResultTag: function () {
      var fr = this.finalResultText;
      if (fr === '合规') return 'tag-ok';
      if (fr === '不合规') return 'tag-ng';
      return 'tag-mb';
    },
    // 提交时间
    submittedAt: function () {
      return this.task ? utils.formatDateTime(this.task.submitted_at || this.task.created_at || '') : '';
    },
    // 审核类型
    auditTypeText: function () {
      var at = this.task ? this.task.audit_type : '';
      var m = { auto: 'AI 审核', manual: '人工审核' };
      return m[String(at).toLowerCase()] || at || 'AI 审核';
    },
    // 优先级
    priorityText: function () {
      var p = this.task ? this.task.priority : '';
      var m = { urgent: '紧急', high: '高', normal: '普通', low: '低' };
      return m[String(p).toLowerCase()] || p || '';
    },
    priorityTag: function () {
      var p = this.task ? this.task.priority : '';
      var m = { urgent: 'tag-critical', high: 'tag-major', normal: 'tag-info', low: 'tag-low' };
      return m[String(p).toLowerCase()] || 'tag-info';
    },
    // 提交人
    submitter: function () {
      var e = this.task ? this.task.submitter_email : '';
      return utils.phoneify(e);
    },
    // 操作 comment 是否有效
    canSubmitAction: function () {
      var am = this.actionMode;
      if (!am) return false;
      var c = (this.comment || '').trim();
      if (am === 'forward') {
        var ft = (this.forwardTo || '').trim();
        return c.length > 0 && ft.length > 0;
      }
      return c.length > 0;
    },
    // 意见框 placeholder（避免模板内裸比较）
    commentPlaceholder: function () {
      var am = this.actionMode;
      if (am === 'approve') return '选填：通过意见';
      if (am === 'reject') return '必填：驳回原因';
      return '必填：转审说明';
    },
    // 置信度百分比（method，避免与 computed 同名冲突）
    confPct: function () { return Math.round(Number(this.aiConfidence || 0)); },
    confColor: function () {
      var p = this.confPct;
      if (p >= 85) return 'var(--success)';
      if (p >= 70) return 'var(--warning)';
      return 'var(--danger)';
    },
    notPending: function () {
      return this.isPending === false;
    },
    showConfidence: function () {
      var dr = this.discRecord;
      if (!dr) return false;
      var c = dr.ai_confidence;
      return c !== null && c !== undefined;
    }
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
      api.getAuditTasks({ id: id }).then(function (d) {
        var arr = (d && d.data) || d || [];
        var task = null;
        if (Array.isArray(arr)) {
          task = arr.find(function (t) { return String(t.id) === String(id); }) || null;
        }
        if (!task) task = (d && d.data && !Array.isArray(d.data)) ? d.data : null;
        if (!task) task = d || null;
        self.task = task;
        // 可选：补拉判别记录
        var rid = task && task.record_id;
        if (rid) {
          return api.getDiscriminationRecord(rid).then(function (rd) {
            var rec = (rd && rd.record) || (rd && rd.data) || rd || null;
            self.discRecord = rec;
          }).catch(function () {});
        }
      }).catch(function () {
        self.error = '详情加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    goBack: function () { this.go('/audit_list'); },

    // 显示操作面板
    showApprove: function () { this.actionMode = 'approve'; this.comment = ''; },
    showReject: function () { this.actionMode = 'reject';  this.comment = ''; },
    showForward: function () { this.actionMode = 'forward'; this.comment = ''; this.forwardTo = ''; },
    cancelAction: function () { this.actionMode = null; },

    doAction: function () {
      var self = this;
      var am = self.actionMode;
      if (!am) return;
      var c = (self.comment || '').trim();
      if (!c) { utils.toast('请填写审核意见'); return; }
      if (am === 'forward') {
        var ft = (self.forwardTo || '').trim();
        if (!ft) { utils.toast('请填写转审对象'); return; }
      }
      self.actionLoading = true;
      var payload = { action: am, comment: c };
      if (am === 'approve') payload.aiConfidence = Number(self.aiConfidence) / 100;
      if (am === 'forward') payload.forwardTo = ft;
      api.auditAction(self.task.id, payload).then(function () {
        utils.toast('审核操作成功');
        self.actionMode = null;
        self.load();
      }).catch(function () {
        utils.toast('审核操作失败，请重试');
      }).finally(function () {
        self.actionLoading = false;
      });
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
      <div class="card-title">⚖️ 审核任务</div>
      <div class="detail-row">
        <div class="dk">模板名称</div>
        <div class="dv fw6">{{ task.template_name || '—' }}</div>
      </div>
      <div class="detail-row">
        <div class="dk">审核状态</div>
        <div class="dv">
          <span class="tag" :class="statusTag">{{ statusText }}</span>
        </div>
      </div>
      <div class="detail-row">
        <div class="dk">AI 判别结论</div>
        <div class="dv">
          <span class="tag" :class="finalResultTag">{{ finalResultText }}</span>
        </div>
      </div>
      <div class="detail-row">
        <div class="dk">提交人</div>
        <div class="dv">{{ submitter }}</div>
      </div>
      <div class="detail-row">
        <div class="dk">提交时间</div>
        <div class="dv">{{ submittedAt }}</div>
      </div>
      <div class="detail-row">
        <div class="dk">审核类型</div>
        <div class="dv">{{ auditTypeText }}</div>
      </div>
      <div v-if="priorityText" class="detail-row">
        <div class="dk">优先级</div>
        <div class="dv">
          <span class="tag" :class="priorityTag">{{ priorityText }}</span>
        </div>
      </div>
    </div>

    <!-- 判别记录补充信息 -->
    <div v-if="discRecord" class="card" style="margin-top:10px;">
      <div class="card-title">🔍 判别详情</div>
      <div v-if="discRecord.conclusion" class="detail-row">
        <div class="dk">AI 结论</div>
        <div class="dv">{{ discRecord.conclusion }}</div>
      </div>
      <div v-if="discRecord.clause_ref" class="detail-row">
        <div class="dk">条款引用</div>
        <div class="dv">{{ discRecord.clause_ref }}</div>
      </div>
      <div v-if="showConfidence" class="detail-row">
        <div class="dk">AI 置信度</div>
        <div class="dv">{{ Math.round(Number(discRecord.ai_confidence) * 100) }}%</div>
      </div>
      <div v-if="discRecord.input_text" class="detail-row">
        <div class="dk">现场描述</div>
        <div class="dv">{{ discRecord.input_text }}</div>
      </div>
    </div>

    <!-- 已完成状态显示结论 -->
    <div v-if="isPending" class="card" style="margin-top:10px;">
      <div class="card-title">🛡️ 审核操作</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
        <button class="btn-primary" style="flex:1;" @click="showApprove">通过</button>
        <button class="btn-danger" style="flex:1;" @click="showReject">驳回</button>
        <button class="btn-ghost" style="flex:1;" @click="showForward">转审</button>
      </div>
    </div>

    <!-- 操作面板 -->
    <div v-if="actionMode" class="card" style="margin-top:10px;">
      <div class="card-title">
        <span v-if="actionMode === 'approve'">✅ 通过审核</span>
        <span v-else-if="actionMode === 'reject'">❌ 驳回审核</span>
        <span v-else>🔄 转审处理</span>
      </div>

      <!-- AI 置信度滑块（仅通过） -->
      <div v-if="actionMode === 'approve'" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span class="muted" style="font-size:13px;">AI 置信度</span>
          <span :style="{ color: confColor }" style="font-weight:600;font-size:16px;">{{ confPct }}%</span>
        </div>
        <input
          type="range"
          :value="aiConfidence"
          @input="aiConfidence = Number($event.target.value)"
          min="0" max="100" step="1"
          style="width:100%;accent-color:var(--primary);"
        />
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);">
          <span>低</span><span>高</span>
        </div>
      </div>

      <!-- 转审对象 -->
      <div v-if="actionMode === 'forward'" style="margin-bottom:10px;">
        <div class="muted" style="font-size:13px;margin-bottom:4px;">转审给</div>
        <input
          class="inp"
          v-model="forwardTo"
          placeholder="输入邮箱或用户名"
          style="width:100%;"
        />
      </div>

      <!-- 审核意见 -->
      <div style="margin-bottom:10px;">
        <div class="muted" style="font-size:13px;margin-bottom:4px;">审核意见</div>
        <textarea
          v-model="comment"
          class="txta"
          :placeholder="commentPlaceholder"
          rows="3"
          style="width:100%;resize:none;"
        ></textarea>
      </div>

      <div style="display:flex;gap:8px;">
        <button class="btn-ghost" style="flex:1;" @click="cancelAction">取消</button>
        <button
          class="btn-primary"
          style="flex:1;"
          :disabled="actionLoading || !canSubmitAction"
          @click="doAction"
        >{{ actionLoading ? '提交中...' : '确认提交' }}</button>
      </div>
    </div>

    <!-- 非 PENDING 状态结论 -->
    <div v-if="notPending" class="card" style="margin-top:10px;">
      <div class="card-title">📋 审核结论</div>
      <div style="padding:12px 0;">
        <span class="tag" :class="statusTag" style="font-size:15px;padding:6px 16px;">{{ statusText }}</span>
      </div>
    </div>

    <button class="btn-ghost" style="margin-top:16px;" @click="goBack">返回列表</button>
  </template>

  <div v-else class="empty-state">
    <div style="font-size:32px;">📋</div>
    <div class="muted" style="margin-top:8px;">未找到该审核任务</div>
  </div>
</div>
`
};
