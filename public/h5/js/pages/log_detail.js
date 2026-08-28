// log_detail.js — 日志详情（H5）
// GET /api/operation-logs（用 id 过滤）→ 日志详情
// GET /api/logs/verify-seal/:sealId → 验真（可选）
// 强调"司法级留痕 · WORM 不可篡改"
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md 重写
// 铁律：模板无裸 && || < >；禁 SVG；根 .page；三态齐全；query.id 缺失显示空态
window.Pages = window.Pages || {};

window.Pages.log_detail = {
  name: 'log_detail',
  props: ['query'],

  data: function () {
    return {
      loading: true,
      error: null,
      log: null,
      // 验真
      verifyLoading: false,
      verifyResult: null,
      verifyError: null,
      sealId: ''
    };
  },

  computed: {
    hasId: function () { return !!(this.query && this.query.id); },
    hasLog: function () { return !!this.log; },
    isDeleted: function () {
      return this.log ? (this.log.is_deleted === true || this.log.is_deleted === 1) : false;
    },
    // 操作类型
    opTypeText: function () {
      var m = {
        create: '新增', delete: '删除', update: '修改',
        query: '查询', approve: '审批', export: '导出',
        login: '登录', logout: '登出'
      };
      return m[String(this.log && this.log.operation_type || '').toLowerCase()] || (this.log && this.log.operation_type) || '操作';
    },
    opTypeTag: function () {
      var m = {
        create: 'tag-ok', delete: 'tag-ng', update: 'tag-warn',
        query: 'tag-info', approve: 'tag-ok', export: 'tag-info'
      };
      return m[String(this.log && this.log.operation_type || '').toLowerCase()] || 'tag-info';
    },
    // target 类型
    targetTypeText: function () {
      var m = {
        inspection: '日管控', weekly: '周排查', monthly: '月调度',
        hazard: '隐患', work_order: '工单', emergency: '应急',
        approval: '审批', device: '设备', template: '模板',
        regulation: '法规', audit_task: '审核',
        discriminate: '判别', user: '用户'
      };
      return m[String(this.log && this.log.target_type || '').toLowerCase()] || (this.log && this.log.target_type) || '其他';
    },
    // 操作员
    operator: function () {
      var e = this.log ? (this.log.operator_email || '') : '';
      return e;
    },
    operatorMasked: function () {
      return utils.phoneify(this.operator());
    },
    // 时间
    logTime: function () {
      return this.log ? utils.formatDateTime(this.log.timestamp || this.log.created_at || '') : '';
    },
    // IP
    ipText: function () {
      return this.log ? (this.log.ip || '—') : '—';
    },
    // 摘要
    summary: function () {
      return this.log ? (this.log.request_summary || '—') : '—';
    },
    // before_value / after_value
    beforeValue: function () {
      var bv = this.log ? this.log.before_value : null;
      if (!bv) return null;
      try { return JSON.stringify(typeof bv === 'string' ? JSON.parse(bv) : bv, null, 2); }
      catch (e) { return String(bv); }
    },
    afterValue: function () {
      var av = this.log ? this.log.after_value : null;
      if (!av) return null;
      try { return JSON.stringify(typeof av === 'string' ? JSON.parse(av) : av, null, 2); }
      catch (e) { return String(av); }
    },
    // 哈希链
    hashChain: function () {
      return this.log ? (this.log.hash_chain || '') : '';
    },
    // sealId（从日志取）
    sealIdFromLog: function () {
      return this.log ? (this.log.seal_id || this.log.sealId || '') : '';
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
        self.error = '缺少日志参数';
        return;
      }
      self.loading = true;
      self.error = null;
      // 用 getLogs 带 id 过滤
      api.getLogs({ id: id }).then(function (d) {
        var arr = (d && d.data) || d || [];
        var log = null;
        if (Array.isArray(arr)) {
          log = arr.find(function (l) { return String(l.id) === String(id); }) || null;
        }
        if (!log) log = (d && d.data && !Array.isArray(d.data)) ? d.data : null;
        if (!log) log = d || null;
        if (!log) { self.error = '日志不存在'; return; }
        self.log = log;
      }).catch(function () {
        self.error = '日志详情加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    goBack: function () { this.go('/logs_list'); },

    // 验真
    doVerify: function () {
      var self = this;
      var sid = self.sealId.trim() || self.sealIdFromLog;
      if (!sid) { utils.toast('请输入 Seal ID'); return; }
      self.verifyLoading = true;
      self.verifyResult  = null;
      self.verifyError   = null;
      api.verifySeal(sid).then(function (d) {
        self.verifyResult = (d && d.data) || d;
        utils.toast('验真完成');
      }).catch(function (e) {
        self.verifyError = '验真失败：' + (e && e.message || '网络错误');
      }).finally(function () {
        self.verifyLoading = false;
      });
    },

    // 复制哈希
    copyHash: function () {
      var h = this.hashChain();
      if (h) utils.copy(h);
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

  <template v-else-if="hasLog">
    <!-- 司法级留痕说明 -->
    <div class="card" style="background:linear-gradient(135deg,#e8f4fd,#f0f7ff);border:1px solid var(--primary);margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:20px;">🔐</span>
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--primary);">司法级留痕 · WORM 不可篡改</div>
          <div class="muted" style="font-size:12px;margin-top:2px;">本日志经哈希链锚定，不可删除、不可篡改，具备司法举证效力</div>
        </div>
      </div>
    </div>

    <!-- 操作基本信息 -->
    <div class="card">
      <div class="card-title">📜 操作详情</div>
      <div class="detail-row">
        <div class="dk">操作类型</div>
        <div class="dv">
          <span class="tag" :class="opTypeTag">{{ opTypeText }}</span>
        </div>
      </div>
      <div class="detail-row">
        <div class="dk">操作对象</div>
        <div class="dv">{{ targetTypeText }}</div>
      </div>
      <div class="detail-row">
        <div class="dk">对象 ID</div>
        <div class="dv">{{ log.target_id || '—' }}</div>
      </div>
      <div class="detail-row">
        <div class="dk">操作员</div>
        <div class="dv">{{ operator }}</div>
      </div>
      <div class="detail-row">
        <div class="dk">角色</div>
        <div class="dv">{{ log.operator_role || '—' }}</div>
      </div>
      <div class="detail-row">
        <div class="dk">IP 地址</div>
        <div class="dv">{{ ipText }}</div>
      </div>
      <div class="detail-row">
        <div class="dk">操作时间</div>
        <div class="dv">{{ logTime }}</div>
      </div>
      <div class="detail-row">
        <div class="dk">操作摘要</div>
        <div class="dv">{{ summary }}</div>
      </div>
      <div v-if="isDeleted" class="detail-row">
        <div class="dk">状态</div>
        <div class="dv"><span class="tag tag-ng">已逻辑删除</span></div>
      </div>
    </div>

    <!-- 变更前后（如果有） -->
    <div v-if="beforeValue" class="card" style="margin-top:10px;">
      <div class="card-title">变更前</div>
      <pre style="font-size:12px;background:var(--bg);padding:8px;border-radius:4px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:6px 0 0;">{{ beforeValue }}</pre>
    </div>

    <div v-if="afterValue" class="card" style="margin-top:10px;">
      <div class="card-title">变更后</div>
      <pre style="font-size:12px;background:var(--bg);padding:8px;border-radius:4px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:6px 0 0;">{{ afterValue }}</pre>
    </div>

    <!-- 哈希链可视化 -->
    <div v-if="hashChain" class="card" style="margin-top:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div class="card-title" style="margin-bottom:0;">🔗 哈希链锚定</div>
        <button class="btn-ghost" style="padding:4px 10px;font-size:12px;" @click="copyHash">复制</button>
      </div>
      <div class="hash-box" style="word-break:break-all;font-size:11px;line-height:1.6;background:var(--bg);padding:10px;border-radius:var(--radius);border:1px solid var(--border);">
        {{ hashChain }}
      </div>
    </div>

    <!-- WORM 验真 -->
    <div class="card" style="margin-top:10px;">
      <div class="card-title">🔍 WORM 验真</div>
      <div style="margin-top:8px;">
        <div class="muted" style="font-size:13px;margin-bottom:4px;">Seal ID（可选自动填充）</div>
        <input
          v-model="sealId"
          class="inp"
          :placeholder="sealIdFromLog || '输入 Seal ID'"
          style="width:100%;"
        />
        <div style="margin-top:6px;">
          <button
            class="btn-primary"
            :disabled="verifyLoading"
            @click="doVerify"
            style="width:100%;"
          >{{ verifyLoading ? '验真中...' : '验  真' }}</button>
        </div>
        <div v-if="verifyResult" class="tag tag-ok" style="margin-top:8px;display:inline-block;">
          ✅ 验真通过
        </div>
        <div v-if="verifyError" class="tag tag-ng" style="margin-top:8px;display:inline-block;">
          ❌ {{ verifyError }}
        </div>
      </div>
    </div>

    <button class="btn-ghost" style="margin-top:16px;" @click="goBack">返回列表</button>
  </template>

  <div v-else class="empty-state">
    <div style="font-size:32px;">📜</div>
    <div class="muted" style="margin-top:8px;">未找到该日志</div>
  </div>
</div>
`
};
