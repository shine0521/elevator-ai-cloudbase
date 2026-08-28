// router.js — Hash 路由表（含 AI 合规判别系统增量页）
window.Router = {
  routes: {
    // ===== 工作台 / 基础 =====
    '/':                'home',
    '/login':           'login',
    '/profile':         'profile',
    '/message':         'message',
    // ===== 检查类（日/周/月）=====
    '/check':           'check',
    '/record':          'record',
    '/daily':           'daily',
    '/daily_form':      'daily_form',
    '/daily_detail':    'daily_detail',
    '/weekly':          'weekly',
    '/weekly_form':     'weekly_form',
    '/monthly':         'monthly',
    '/monthly_form':    'monthly_form',
    // ===== 隐患 / 工单 =====
    '/hazard':          'hazard',
    '/hazard_form':     'hazard_form',
    '/hazard_detail':   'hazard_detail',
    '/work_order':      'work_order',
    '/work_order_detail':'work_order_detail',
    // ===== 应急 / 审批 / 设备 =====
    '/emergency':       'emergency',
    '/emergency_form':  'emergency_form',
    '/approval':        'approval',
    '/approval_detail': 'approval_detail',
    '/device_scan':     'device_scan',
    '/device_detail':   'device_detail',
    // ===== AI 合规判别系统（需求文档 8 大模块）=====
    '/discriminate':          'discriminate',
    '/discriminate_fill':     'discriminate_fill',
    '/discriminate_history':  'discriminate_history',
    '/discriminate_detail':   'discriminate_detail',
    '/templates_list':        'templates_list',
    '/template_detail':       'template_detail',
    '/knowledge_list':        'knowledge_list',
    '/knowledge_detail':      'knowledge_detail',
    '/audit_list':            'audit_list',
    '/audit_detail':          'audit_detail',
    '/logs_list':             'logs_list',
    '/log_detail':            'log_detail',
    '/research_list':         'research_list',
    '/research_detail':       'research_detail'
  },

  titleOf: function (path) {
    var m = {
      home:             '\u5de5\u4f5c\u53f0',
      login:            '',
      profile:          '\u6211\u7684',
      message:          '\u6d88\u606f\u4e2d\u5fc3',
      check:            '\u68c0\u67e5',
      record:           '\u68c0\u67e5\u8bb0\u5f55',
      daily:            '\u65e5\u7ba1\u63a7',
      daily_form:      '\u65e5\u7ba1\u63a7\u6267\u884c',
      daily_detail:    '\u65e5\u7ba1\u63a7\u8be6\u60c5',
      weekly:          '\u5468\u6392\u67e5',
      weekly_form:     '\u5468\u6392\u67e5\u6267\u884c',
      monthly:         '\u6708\u8c03\u5ea6',
      monthly_form:    '\u6708\u8c03\u5ea6\u7eaa\u8981',
      hazard:          '\u9690\u60a3\u6392\u67e5',
      hazard_form:     '\u9690\u60a3\u4e0a\u62a5',
      hazard_detail:   '\u9690\u60a3\u8be6\u60c5',
      work_order:        '\u6574\u6539\u5de5\u5355',
      work_order_detail: '\u5de5\u5355\u8be6\u60c5',
      emergency:         '\u5e94\u6025\u6551\u63f4',
      emergency_form:    '\u5e94\u6025\u62a5\u544a',
      approval:          '\u5ba1\u6279\u5f85\u529e',
      approval_detail:   '\u5ba1\u6279\u5904\u7406',
      device_scan:       '\u8bbe\u5907\u67e5\u8be2',
      device_detail:     '\u8bbe\u5907\u8be6\u60c5',
      discriminate:           '\u5408\u89c4\u5224\u522b',
      discriminate_fill:      '\u586b\u5199\u5224\u522b',
      discriminate_history:   '\u5224\u522b\u5386\u53f2',
      discriminate_detail:    '\u5224\u522b\u8be6\u60c5',
      templates_list:         '\u6a21\u677f\u5e93',
      template_detail:        '\u6a21\u677f\u8be6\u60c5',
      knowledge_list:         '\u6cd5\u89c4\u77e5\u8bc6\u5e93',
      knowledge_detail:       '\u6cd5\u89c4\u8be6\u60c5',
      audit_list:             '\u4eba\u5de5\u5ba1\u6838',
      audit_detail:           '\u5ba1\u6838\u5904\u7406',
      logs_list:              '\u53f8\u6cd5\u7559\u75d5',
      log_detail:             '\u65e5\u5fd7\u8be6\u60c5',
      research_list:          '\u6a21\u677f\u7814\u7a76',
      research_detail:        '\u7814\u7a76\u4efb\u52a1\u8be6\u60c5'
    };
    return m[path] || '';
  },

  tabOf: function (path) {
    var m = {
      home:     'home',
      check:    'check',
      message:  'message',
      profile:  'profile'
    };
    return m[path] || '';
  },

  parse: function () {
    var raw = (location.hash || '').replace(/^#/, '') || '/';
    var sep = raw.indexOf('?');
    var path = sep >= 0 ? raw.slice(0, sep) || '/' : raw;
    var qs = sep >= 0 ? raw.slice(sep + 1) : '';
    var query = {};
    if (qs) {
      qs.split('&').forEach(function (kv) {
        var i = kv.indexOf('=');
        if (i >= 0) {
          query[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
        }
      });
    }
    return { path: path, query: query };
  }
};
