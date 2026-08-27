// Hash 路由表
window.Router = {
  map: {
    '/': 'home',
    '/login': 'login',
    '/check': 'check',
    '/daily': 'daily',
    '/daily_form': 'daily_form',
    '/weekly': 'weekly',
    '/weekly_form': 'weekly_form',
    '/hazard': 'hazard',
    '/hazard_form': 'hazard_form',
    '/work_order': 'work_order',
    '/work_order_detail': 'work_order_detail',
    '/device_scan': 'device_scan',
    '/device_detail': 'device_detail',
    '/emergency': 'emergency',
    '/approval': 'approval',
    '/approval_detail': 'approval_detail',
    '/message': 'message',
    '/profile': 'profile',
    '/record': 'record'
  },
  titleOf: {
    home: '工作台', login: '', check: '检查', daily: '日管控', daily_form: '日管控执行',
    weekly: '周排查', weekly_form: '周排查执行', hazard: '隐患排查', hazard_form: '隐患上报',
    work_order: '整改工单', work_order_detail: '工单详情', device_scan: '设备查询', device_detail: '设备详情',
    emergency: '应急救援', approval: '审批待办', approval_detail: '审批处理',
    message: '消息中心', profile: '我的', record: '检查记录'
  },
  tabOf: { home: 'home', check: 'check', message: 'message', profile: 'profile' },
  parse() {
    const raw = (location.hash || '').replace(/^#/, '') || '/';
    const sep = raw.indexOf('?');
    const path = sep >= 0 ? raw.slice(0, sep) || '/' : raw;
    const qs = sep >= 0 ? raw.slice(sep + 1) : '';
    const query = {};
    if (qs) qs.split('&').forEach(function(kv) {
      const i = kv.indexOf('=');
      if (i >= 0) query[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    });
    return { path: path, query: query };
  }
};
