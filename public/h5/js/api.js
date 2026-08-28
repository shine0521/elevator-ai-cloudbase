// api.js — 统一 HTTP 请求层：Bearer token 鉴权 + 统一错误处理
// 字段名与后端 /api/mobile/* 完全对齐
(function () {
  var baseURL = location.origin;

  // 通用请求
  async function request(method, path, data, opts) {
    opts = opts || {};
    var url = baseURL + path;
    var q = opts.params;
    if (q && Object.keys(q).length) {
      var sp = [];
      Object.keys(q).forEach(function (k) {
        var v = q[k];
        if (v !== undefined && v !== null && v !== '') sp.push(k + '=' + encodeURIComponent(v));
      });
      if (sp.length) url += (path.indexOf('?') >= 0 ? '&' : '?') + sp.join('&');
    }
    var headers = { 'Content-Type': 'application/json' };
    var tk = Store.getToken();
    if (tk) headers['Authorization'] = 'Bearer ' + tk;
    var conf = { method: method, headers: headers, credentials: 'include' };
    if (data !== undefined && data !== null) conf.body = JSON.stringify(data);
    var res;
    try {
      res = await fetch(url, conf);
    } catch (e) {
      utils.toast('\u7f51\u7edc\u5f02\u5e38\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc');
      throw new Error('NETWORK_ERROR');
    }
    var json;
    try {
      json = await res.json();
    } catch (e) {
      json = { success: res.ok };
    }
    // 业务层错误（4xx）：toast 错误信息再 throw，让调用方 catch 块可见
    if (json && json.success === false) {
      utils.toast(json.error || '\u64cd\u4f5c\u5931\u8d25');
      throw new Error(json.error || 'BUSINESS_ERROR');
    }
    // 401 未认证：清除本地 token，由路由层跳回登录页（不在此处 toast，避免与 logout() 跳转冲突）
    if (res.status === 401) {
      Store.logout();
      throw new Error(json && json.error || '\u65e0\u6548\u7684\u767b\u5f55\u51ed\u8bc1');
    }
    // 5xx 服务端错误
    if (res.status >= 500) {
      utils.toast(json && json.error || '\u670d\u52a1\u7aef\u9519\u8bef');
      throw new Error('SERVER_ERROR');
    }
    return json;
  }

  function buildParams(params) { return params; }

  window.api = {
    baseURL: baseURL,

    get: function (path, params) { return request('GET', path, null, { params: params }); },
    post: function (path, data) { return request('POST', path, data); },
    put: function (path, data) { return request('PUT', path, data); },
    del: function (path, data) { return request('DELETE', path, data); },

    // ========== 工作台 ==========
    getDashboard: function () { return this.get('/api/mobile/dashboard'); },

    // ========== 检查 - 日管控 ==========
    getInspections: function (params) { return this.get('/api/mobile/inspections', params); },
    getInspection: function (id) { return this.get('/api/mobile/inspections/' + id); },
    createInspection: function (data) { return this.post('/api/mobile/inspections', data); },
    submitInspection: function (id, data) { return this.post('/api/mobile/inspections/' + id + '/submit', data); },

    // ========== 周排查 ==========
    getWeekly: function (params) { return this.get('/api/mobile/weekly', params); },
    getWeeklyDetail: function (id) { return this.get('/api/mobile/weekly/' + id); },
    createWeekly: function (data) { return this.post('/api/mobile/weekly', data); },
    submitWeekly: function (id, data) { return this.post('/api/mobile/weekly/' + id + '/submit', data); },

    // ========== 月调度 ==========
    getMonthly: function (params) { return this.get('/api/mobile/monthly', params); },
    getMonthlyDetail: function (id) { return this.get('/api/mobile/monthly/' + id); },
    createMonthly: function (data) { return this.post('/api/mobile/monthly', data); },
    submitMonthly: function (id, data) { return this.post('/api/mobile/monthly/' + id + '/submit', data); },

    // ========== 隐患 ==========
    getHazards: function (params) { return this.get('/api/mobile/hazards', params); },
    getHazard: function (id) { return this.get('/api/mobile/hazards/' + id); },
    createHazard: function (data) { return this.post('/api/mobile/hazards', data); },
    submitHazard: function (id, data) { return this.put('/api/mobile/hazards/' + id, data); },

    // ========== 整改 ==========
    getWorkOrders: function (params) { return this.get('/api/mobile/work-orders', params); },
    getWorkOrder: function (id) { return this.get('/api/mobile/work-orders/' + id); },
    submitRectify: function (id, data) { return this.post('/api/mobile/work-orders/' + id + '/rectify', data); },
    // 验收（安全员）：POST /api/mobile/work-orders/:id/verify {verifyDescription, pass}
    verifyWorkOrder: function (id, data) { return this.post('/api/mobile/work-orders/' + id + '/verify', data); },
    submitVerify: function (id, data) { return this.post('/api/mobile/work-orders/' + id + '/verify', data); },

    // ========== 应急 ==========
    getEmergencies: function (params) { return this.get('/api/mobile/emergencies', params); },
    getEmergency: function (id) { return this.get('/api/mobile/emergencies/' + id); },
    createEmergency: function (data) { return this.post('/api/mobile/emergencies', data); },
    updateEmergency: function (id, data) { return this.put('/api/mobile/emergencies/' + id, data); },
    addRescueLog: function (id, data) { return this.post('/api/mobile/emergencies/' + id + '/logs', data); },

    // ========== 审批 ==========
    getApprovals: function (params) { return this.get('/api/mobile/approvals', params); },
    getApproval: function (id) { return this.get('/api/mobile/approvals/' + id); },
    getApprovalStats: function () { return this.get('/api/mobile/approvals/stats'); },
    approve: function (id, data) { return this.post('/api/mobile/approvals/' + id + '/approve', data); },
    reject: function (id, data) { return this.post('/api/mobile/approvals/' + id + '/reject', data); },
    forward: function (id, data) { return this.post('/api/mobile/approvals/' + id + '/forward', data); }, // data:{forwardTo, comment}

    // ========== 统计 ==========
    getInspectionStats: function () { return this.get('/api/mobile/inspections/stats'); },
    getWeeklyStats: function () { return this.get('/api/mobile/weekly/stats'); },
    getMonthlyStats: function () { return this.get('/api/mobile/monthly/stats'); },
    getHazardStats: function () { return this.get('/api/mobile/hazards/stats'); },
    getEmergencyStats: function () { return this.get('/api/mobile/emergencies/stats'); },

    // ========== AI 合规判别系统（需求文档 8 大模块） ==========
    getTemplates: function (params) { return this.get('/api/templates', params); },
    getTemplate: function (id) { return this.get('/api/templates/' + id); },
    getTemplateFields: function (id) { return this.get('/api/templates/' + id + '/fields'); },
    getTemplateRules: function (id) { return this.get('/api/templates/' + id + '/rules'); },
    getTemplateVersions: function (id) { return this.get('/api/templates/' + id + '/versions'); },
    discriminate: function (data) { return this.post('/api/discriminate', data); },
    classifyAI: function (data) { return this.post('/api/ai/classify', data); },
    extractAI: function (data) { return this.post('/api/ai/extract', data); },
    analyzeAI: function (data) { return this.post('/api/ai/analyze', data); },
    askAI: function (data) { return this.post('/api/ai/ask', data); },
    getAIStatus: function () { return this.get('/api/ai/status'); },

    // ========== 人工审核 / 判别历史 ==========
    getAuditTasks: function (params) { return this.get('/api/audit-tasks', params); },
    auditAction: function (id, data) { return this.post('/api/audit-tasks/' + id + '/action', data); },

    // ========== 司法留痕（operation_logs 表） ==========
    getLogs: function (params) { return this.get('/api/operation-logs', params); },
    verifyLogSeal: function (data) { return this.post('/api/operation-logs/verify', data); },
    exportLogs: function (data) { return this.post('/api/logs/export', data); },
    getWormStatus: function () { return this.get('/api/logs/worm-status'); },
    verifySeal: function (sealId) { return this.get('/api/logs/verify-seal/' + sealId); },

    // ========== 判别历史（discrimination_records 表） ==========
    getDiscriminationRecords: function (params) { return this.get('/api/discrimination-records', params); },
    getDiscriminationRecord: function (id) { return this.get('/api/discrimination-records/' + id); },

    // ========== 法规知识库 ==========
    getRegulations: function (params) { return this.get('/api/regulations', params); },
    getRegulation: function (id) { return this.get('/api/regulations/' + id); },
    getRegulationClauses: function (id) { return this.get('/api/regulations/' + id + '/clauses'); },
    getClauses: function (params) { return this.get('/api/clauses', params); },
    getKnowledgeStats: function () { return this.get('/api/knowledge/stats'); },

    // ========== 模板研究 ==========
    getResearchTasks: function (params) { return this.get('/api/template-research', params); },
    getResearchTask: function (id) { return this.get('/api/template-research/' + id); },
    researchAISuggest: function (id) { return this.post('/api/template-research/' + id + '/ai-suggest', {}); },
    researchPublish: function (id) { return this.put('/api/template-research/' + id + '/publish', {}); },

    // ========== 设备 ==========
    scanDevice: function (code) { return this.get('/api/mobile/devices/scan', { code: code }); },
    getDeviceDetail: function (id) { return this.get('/api/mobile/devices/' + id + '/detail'); },

    // ========== 消息 ==========
    getMessages: function (params) { return this.get('/api/mobile/messages', params); },
    getMessageStats: function () { return this.get('/api/mobile/messages/stats'); },
    markRead: function (id) { return this.post('/api/mobile/messages/' + id + '/read'); },
    markAllRead: function () { return this.post('/api/mobile/messages/read-all'); },

    // ========== 用户 ==========
    getMe: function () { return this.get('/api/user/me'); },
    changePassword: function (data) { return this.post('/api/user/change-password', data); }
  };
})();
