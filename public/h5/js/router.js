// router.js — Hash 路由表
window.Router = {
  routes: {
    '/':           'home',
    '/login':      'login',
    '/check':      'check',
    '/record':     'record',
    '/daily':          'daily',
    '/daily_form':     'daily_form',
    '/weekly':         'weekly',
    '/weekly_form':    'weekly_form',
    '/monthly':        'monthly',
    '/monthly_form':   'monthly_form',
    '/hazard':         'hazard',
    '/hazard_form':    'hazard_form',
    '/work_order':           'work_order',
    '/work_order_detail':    'work_order_detail',
    '/device_scan':       'device_scan',
    '/device_detail':     'device_detail',
    '/emergency':         'emergency',
    '/emergency_form':    'emergency_form',
    '/approval':          'approval',
    '/approval_detail':   'approval_detail',
    '/message':      'message',
    '/profile':      'profile'
  },

  titleOf: function (path) {
    var m = {
      home:             '\u5de5\u4f5c\u53f0',
      login:            '',
      check:            '\u68c0\u67e5',
      record:           '\u68c0\u67e5\u8bb0\u5f55',
      daily:            '\u65e5\u7ba1\u63a7',
      daily_form:       '\u65e5\u7ba1\u63a7\u6267\u884c',
      weekly:           '\u5468\u6392\u67e5',
      weekly_form:      '\u5468\u6392\u67e5\u6267\u884c',
      monthly:          '\u6708\u8c03\u5ea6',
      monthly_form:     '\u6708\u8c03\u5ea6\u6267\u884c',
      hazard:           '\u9690\u60a3\u6392\u67e5',
      hazard_form:      '\u9690\u60a3\u4e0a\u62a5',
      work_order:        '\u6574\u6539\u5de5\u5355',
      work_order_detail: '\u5de5\u5355\u8be6\u60c5',
      device_scan:       '\u8bbe\u5907\u67e5\u8be2',
      device_detail:     '\u8bbe\u5907\u8be6\u60c5',
      emergency:         '\u5e94\u6025\u6551\u63f4',
      emergency_form:    '\u5e94\u6025\u62a5\u544a',
      approval:          '\u5ba1\u6279\u5f85\u529e',
      approval_detail:   '\u5ba1\u6279\u5904\u7406',
      message:           '\u6d88\u606f\u4e2d\u5fc3',
      profile:           '\u6211\u7684'
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
