// logs_list.js — 司法留痕（H5）
// GET /api/operation-logs?targetType&operationType → {data:[], total}
// GET /api/logs/worm-status → WORM 状态（可选，失败不阻塞）
// 角色要求：admin / auditor
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md 重写
// 铁律：模板无裸 && || < >；禁 SVG；根 .page；三态齐全
window.Pages = window.Pages || {};

window.Pages.logs_list = {
  name: 'logs_list',
  props: ['query'],

  data: function () {
    return {
      loading: true,
      error: null,
      seg: 'all',   // all | create | delete | update | query | approve | export
      list: [],
      total: 0,
      // WORM 状态（可选）
      wormLoading: true,
      wormSealed: null,
      wormRoot: null,
      wormLastId: null
    };
  },

  computed: {
    hasList: function () { return this.list.length > 0; },
    segs: function () {
      return [
        { key: 'all',    label: '全部' },
        { key: 'create', label: '新增' },
        { key: 'delete', label: '删除' },
        { key: 'update', label: '修改' },
        { key: 'query',  label: '查询' },
        { key: 'approve',label: '审批' },
        { key: 'export', label: '导出' }
      ];
    },
    isSeg: function () {
      var self = this;
      return function (k) { return self.seg === k; };
    }
  },

  methods: {
    go: function (p) { utils.go(p); },

    // 分段 → api 参数
    segParam: function () {
      if (this.seg === 'all') return '';
      return this.seg;
    },

    loadWorm: function () {
      var self = this;
      self.wormLoading = true;
      api.getWormStatus().then(function (d) {
        var data = (d && d.data) || d || {};
        self.wormSealed  = data.sealed;
        self.wormRoot    = data.merkleRoot || data.root || '';
        self.wormLastId  = data.lastLogId  || data.last_id || null;
      }).catch(function () {
        // WORM 失败不阻塞
      }).finally(function () {
        self.wormLoading = false;
      });
    },

    load: function () {
      var self = this;
      self.loading = true;
      self.error   = null;
      var p = {};
      var sp = self.segParam();
      if (sp) p.operationType = sp;
      api.getLogs(p).then(function (d) {
        var arr = (d && d.data) || d || [];
        self.list  = Array.isArray(arr) ? arr : [];
        self.total = (d && typeof d.total === 'number') ? d.total : self.list.length;
      }).catch(function () {
        self.error = '日志列表加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    switchSeg: function (k) {
      if (this.seg === k) return;
      this.seg = k;
      this.load();
    },

    goDetail: function (id) { this.go('/log_detail?id=' + id); },

    // 操作类型中文
    opTypeText: function (op) {
      var m = {
        create: '新增',
        delete: '删除',
        update: '修改',
        query:  '查询',
        approve:'审批',
        export: '导出',
        login:  '登录',
        logout: '登出'
      };
      return m[String(op || '').toLowerCase()] || op || '操作';
    },

    // 操作类型 → tag
    opTypeTag: function (op) {
      var m = {
        create: 'tag-ok',
        delete: 'tag-ng',
        update: 'tag-warn',
        query:  'tag-info',
        approve:'tag-ok',
        export: 'tag-info'
      };
      return m[String(op || '').toLowerCase()] || 'tag-info';
    },

    // target 类型中文
    targetTypeText: function (tt) {
      var m = {
        inspection:  '日管控',
        weekly:      '周排查',
        monthly:     '月调度',
        hazard:      '隐患',
        work_order:  '工单',
        emergency:   '应急',
        approval:    '审批',
        device:      '设备',
        template:    '模板',
        regulation:  '法规',
        audit_task:  '审核',
        discriminate:'判别',
        user:        '用户'
      };
      return m[String(tt || '').toLowerCase()] || tt || '其他';
    },

    // 时间
    logTime: function (r) {
      return utils.formatDateTime(r.timestamp || r.created_at || '');
    },

    // 操作员（脱敏）
    operator: function (r) {
      var e = r.operator_email || '';
      return utils.phoneify(e);
    },

    // 已删除标记
    isDeleted: function (r) {
      return r.is_deleted === true || r.is_deleted === 1;
    },

    // 摘要预览
    summary: function (r) {
      var s = r.request_summary || '';
      return s.length > 30 ? s.substring(0, 30) + '…' : s;
    }
  },

  mounted: function () {
    this.loadWorm();
    this.load();
  },

  template: `
<div class="page">
  <!-- WORM 状态卡 -->
  <div v-if="wormLoading" style="padding:8px 0 2px;">
    <div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>
  </div>
  <div v-else-if="wormSealed !== null" class="card" style="margin-bottom:10px;padding:10px 12px;">
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:18px;">🔐</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:var(--text);">司法级留痕 · WORM 不可篡改</div>
        <div v-if="wormRoot" class="muted" style="font-size:11px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          默克尔根：{{ wormRoot }}
        </div>
      </div>
      <span class="tag" :class="wormSealed ? 'tag-ok' : 'tag-warn'">
        {{ wormSealed ? '已封存' : '未封存' }}
      </span>
    </div>
  </div>

  <div class="seg" style="margin-bottom:10px;">
    <button v-for="(s, i) in segs" :key="s.key" :class="isSeg(s.key) ? 'on' : ''" @click="switchSeg(s.key)">{{ s.label }}</button>
  </div>

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
    <div v-if="!hasList" class="empty-state">
      <div style="font-size:32px;">📜</div>
      <div class="muted" style="margin-top:8px;">暂无操作日志</div>
    </div>

    <div v-else class="list">
      <div v-for="(r, i) in list" :key="r.id || i" class="list-item" @click="goDetail(r.id)">
        <div class="li-icon">
          <span v-if="isDeleted(r)" style="opacity:0.4;">📜</span>
          <span v-else>📜</span>
        </div>
        <div class="li-body">
          <div class="li-title" :style="isDeleted(r) ? 'opacity:0.5;text-decoration:line-through;' : ''">
            {{ operator(r) }}
            <span class="tag" :class="opTypeTag(r.operation_type)" style="margin-left:5px;">{{ opTypeText(r.operation_type) }}</span>
          </div>
          <div class="li-sub">
            {{ targetTypeText(r.target_type) }}
            <span v-if="r.target_id" class="muted"> · ID: {{ r.target_id }}</span>
          </div>
          <div v-if="summary(r)" class="li-sub" style="font-size:12px;">{{ summary(r) }}</div>
          <div v-if="isDeleted(r)" style="margin-top:3px;">
            <span class="tag tag-ng">已逻辑删除</span>
          </div>
        </div>
        <div style="margin-left:8px;flex-shrink:0;text-align:right;">
          <div class="li-arrow">›</div>
          <div class="muted" style="font-size:11px;margin-top:4px;">{{ logTime(r) }}</div>
        </div>
      </div>
    </div>
  </template>
</div>
`
};
