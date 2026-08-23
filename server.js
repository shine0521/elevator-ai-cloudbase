/**
 * 特种设备(电梯)安全管理AI系统 - 主服务器 v4.0
 * 
 * 技术栈: Node.js 18+ / Express / SQLite / EJS
 * 
 * 架构：三层解耦
 *   - 知识库层：regulations + regulation_clauses
 *   - 模块库层：templates + template_fields + template_rules
 *   - 应用层：discrimination_records + audit_tasks
 * 
 * v4.0 更新：
 *   ✅ 动态规则引擎（数据库配置）
 *   ✅ 统一错误处理
 *   ✅ 安全加固（XSS/输入验证/速率限制）
 *   ✅ 规则API接口
 *   ✅ 系统配置管理
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const {
  getDb, getConfig, setConfig,
  REGULATION_LEVELS, REGULATION_LEVEL_LABELS, REGULATION_REVIEW_STATUSES, normalizeRegulationLevel
} = require('./db');
// 注：hashPassword 在「系统设置页」与「修改密码」中使用，旧版本漏导入，
// 导致 GET /settings 与 PUT /api/user/password 直接 500（ReferenceError）。
const { login, authMiddleware, roleMiddleware, generateToken, verifyToken, hashPassword, verifyPassword, validatePassword } = require('./auth');
const ruleEngine = require('./rule-engine');
const { logOperation, verifyChain, getLogs, exportLogs, shapeLog } = require('./hash-chain');
const aiService = require('./ai-service');
const cozeService = require('./coze-service');
const crawler = require('./crawler');
const auditCtx = require('./utils/audit-context');
const { parseFieldOptions, serializeFieldOptions, withOptionsListAll } = require('./utils/field-options');
const dt = require('./utils/datetime');

// 错误处理模块
const {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  asyncHandler,
  errorHandler,
  notFoundHandler,
  setupProcessHandlers
} = require('./utils/error');

// 安全中间件
const {
  xssSanitizer,
  validateInput,
  RateLimiter,
  requestLogger,
  securityHeaders
} = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3000;

// EJS 模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ==================== 全局中间件 ====================

// 安全头
app.use(securityHeaders);

// CORS
app.use(cors());

// 请求日志
app.use(requestLogger);

// XSS 防护
app.use(xssSanitizer);

// Body 解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Body 解析完成后补充请求摘要（LOG-02）
app.use((req, res, next) => {
  const ctx = auditCtx.current();
  if (ctx && getConfig('audit.log_request_digest', true)) {
    ctx.requestDigest = JSON.stringify(Object.assign(
      { method: req.method, path: ctx.path },
      auditCtx.digest({ query: req.query || {}, body: req.body || {} })
    ));
  }
  next();
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// Cookie 解析
app.use((req, res, next) => {
  req.cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      req.cookies[name] = decodeURIComponent(value || '');
    });
  }
  next();
});

// ============= 司法留痕上下文（LOG-01 / LOG-02 / LOG-03）=============
// 为每个请求建立 AsyncLocalStorage 上下文，使任意深度的 logOperation()
// 都能自动拿到 IP / UA / 请求ID / 请求摘要，无需修改几十个调用点。
app.use((req, res, next) => {
  const ip = auditCtx.extractIp(req);
  const requestId = auditCtx.newRequestId();
  const userAgent = (req.headers['user-agent'] || '').slice(0, 400);

  req.clientIp = ip;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const ctx = {
    ip,
    userAgent,
    requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    startedAt: Date.now(),
    userEmail: null,
    userRole: null,
    requestDigest: null,
    loggedOps: []
  };

  auditCtx.run(ctx, () => {
    // 请求摘要：body 尚未解析，故先记录路径/查询，解析后再补充（见下一个中间件）
    ctx.requestDigest = JSON.stringify(Object.assign(
      { method: req.method, path: ctx.path },
      auditCtx.digest({ query: req.query || {} })
    ));

    // 响应摘要：包装 res.json 捕获响应体指纹
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      try {
        if (getConfig('audit.log_response_digest', true)) {
          ctx.responseDigest = auditCtx.digest(body, 400);
        }
      } catch (_) { /* 摘要失败不影响业务 */ }
      return originalJson(body);
    };

    // 响应结束：若本请求发生过业务操作，追加一条「操作响应」链上日志，
    // 使「请求摘要 + 响应摘要」成对，且保持日志只追加、不回写（哈希链不可变）。
    res.on('finish', () => {
      try {
        if (!ctx.loggedOps.length) return;
        if (!getConfig('audit.log_response_digest', true)) return;
        const durationMs = Date.now() - ctx.startedAt;
        const ops = ctx.loggedOps.map(o => o.action).join(', ');
        logOperation(
          '操作响应',
          ctx.userEmail || 'anonymous',
          'http_response',
          0,
          `${req.method} ${ctx.path} → ${res.statusCode} (${durationMs}ms) 关联操作: ${ops}`,
          { response: ctx.responseDigest || { status: res.statusCode }, userRole: ctx.userRole }
        );
      } catch (e) {
        console.warn('[留痕] 响应摘要记录失败:', e.message);
      }
    });

    next();
  });
});

// ============= 设备检测 + 视图自动切换 =============
// PC 路由 ↔ 移动端路由 映射表
const PC_TO_MOBILE = {
  '/':              '/mobile',
  '/history':       '/mobile/history',
  '/discriminate':  '/mobile/discriminate',
  '/logs':          '/mobile/logs',
  '/settings':      '/mobile/settings'
};
const MOBILE_TO_PC = {
  '/mobile':              '/',
  '/mobile/discriminate': '/discriminate',
  '/mobile/history':      '/history',
  '/mobile/logs':         '/logs',
  '/mobile/settings':     '/settings'
};

// 识别移动端 UA（手机 + 平板）
function isMobileUA(req) {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  if (!ua) return false;
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|phone|symbian|windows phone/i.test(ua);
}

// 设备路由中间件
app.use((req, res, next) => {
  const p = req.path;

  // 不重定向的路径：API、登录、登出、静态资源
  if (p.startsWith('/api/') || p === '/api' || p === '/login' || p === '/logout') {
    req.isMobile = false; // API 不区分设备
    res.locals.isMobile = false;
    res.locals.currentPath = p;
    res.locals.viewPref = req.cookies.view_pref || 'auto';
    return next();
  }

  // 显式切换 ?view=pc / ?view=mobile  → 写 cookie 后重定向到目标视图
  const qView = req.query.view;
  if (qView === 'pc' || qView === 'mobile') {
    res.cookie('view_pref', qView, { maxAge: 365*24*3600*1000, path: '/', sameSite: 'lax', httpOnly: false });
    if (qView === 'mobile') return res.redirect(PC_TO_MOBILE[p] || '/mobile');
    if (qView === 'pc')     return res.redirect(MOBILE_TO_PC[p] || '/');
  }

  // 决定当前设备
  const pref = req.cookies.view_pref;
  let isMobile;
  if (pref === 'pc')      isMobile = false;
  else if (pref === 'mobile') isMobile = true;
  else                    isMobile = isMobileUA(req);

  req.isMobile = isMobile;
  res.locals.isMobile = isMobile;
  res.locals.currentPath = p;
  res.locals.viewPref = pref || 'auto';
  // 切换到“另一形态”的链接（加 ?view=xxx 即可，中间件会重定向 + 写 cookie）
  res.locals.toggleViewHref = (p.indexOf('?') >= 0 ? p + '&' : p + '?') + 'view=' + (isMobile ? 'pc' : 'mobile');
  res.locals.toggleViewLabel = isMobile ? '桌面版' : '移动版';
  res.locals.toggleViewIcon  = isMobile ? '💻' : '📱';

  // 自动重定向
  if (isMobile && PC_TO_MOBILE[p])  return res.redirect(PC_TO_MOBILE[p]);
  if (!isMobile && MOBILE_TO_PC[p]) return res.redirect(MOBILE_TO_PC[p]);

  next();
});

// 速率限制
const apiLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 200,                 // 最多200次请求
  message: 'API请求过于频繁，请稍后再试'
});

const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10, // 最多10次登录尝试
  message: '登录尝试次数过多，请15分钟后再试'
});

app.use('/api/', apiLimiter.middleware());

// ==================== 文档 9.1 API 别名 + 参数规范化 ====================
// 将需求文档 9.1 约定的接口路径/字段名映射到内部实现，保证对外 API 契约一致。
app.use('/api', (req, res, next) => {
  // 注意：挂载在 /api 下时 Express 已剥离前缀（内部 url/path = '/classify'），
  // 且会在 next() 后自动把 baseUrl('/api') 拼回 url，
  // 因此别名目标须写成「相对于 /api 的路径」（不要带 /api 前缀），避免 /api/api/... 翻倍。
  if (req.body && typeof req.body === 'object') {
    const rename = (from, to) => {
      if (req.body[from] !== undefined && req.body[to] === undefined) {
        req.body[to] = req.body[from];
      }
    };
    rename('template_id', 'templateId');
    rename('field_values', 'formData');
    rename('question', 'text');
  }

  const p = req.path; // 已剥离 /api：如 '/classify'
  const alias = (re, fn) => { const m = p.match(re); if (m) req.url = fn(m); };

  // 目标均为「相对 /api 的内部路径」
  alias(/^\/classify$/, () => '/ai/classify');
  alias(/^\/extract$/, () => '/ai/extract');
  alias(/^\/instances$/, () => '/discrimination-records');
  alias(/^\/audit\/pending$/, () => '/audit-tasks?status=pending');
  alias(/^\/logs$/, () => '/operation-logs');
  alias(/^\/template-research\/tasks$/, () => '/template-research');
  alias(/^\/template-research\/([^/]+)\/ai-suggest$/, (m) => `/template-research/${m[1]}/ai-suggest`);
  alias(/^\/template-research\/([^/]+)\/publish$/, (m) => `/template-research/${m[1]}/publish`);
  alias(/^\/instances\/([^/]+)\/audit$/, (m) => {
    if (req.body && typeof req.body === 'object') {
      const d = req.body.decision;
      if (d && ['approve', 'reject'].includes(d)) req.body.action = d;
      const a = req.body.audit_opinion;
      if (a && !req.body.comment) req.body.comment = a;
    }
    req.method = 'POST';
    return `/audit-tasks/${m[1]}/action`;
  });

  next();
});

// 文档 9.1：AI 字段提取（AI-02：从非结构化文本中抽取字段值）
// 旧实现只能抽「标签+数字」，日期/枚举/文本全部抽不到；
// 新实现下沉到 coze-service，支持类型感知提取与枚举合法性校验。
app.post('/api/ai/extract', authMiddleware, asyncHandler(async (req, res) => {
  const { text, templateId, template_id } = req.body;
  const tid = templateId || template_id;
  if (!text) throw new ValidationError('请输入待提取文本');

  const result = await cozeService.extractFields(text, tid);
  const count = Object.keys(result.values || {}).length;

  logOperation('AI字段提取', req.user.email, 'ai', tid || 0,
    `输入文本长度: ${String(text).length}，模板: ${tid || '无'}，提取字段: ${count}，提供方: ${result.provider}`);

  res.json({
    success: true,
    provider: result.provider,
    extracted: result.values,
    evidence: result.evidence,
    fields: (result.fields || []).map(f => ({
      name: f.field_name,
      label: f.field_label,
      type: f.field_type,
      required: !!f.required,
      options: parseFieldOptions(f.options)
    }))
  });
}));

/**
 * 文档 9.1 / LOG-07：审计日志导出（BUG-08）
 * 支持时间范围筛选 + JSON/CSV 两种格式，并随导出附带哈希链校验结果，
 * 使导出件本身具备可验证性（外部审计可重算 Merkle 根与逐块哈希）。
 * 兼容 GET 与 POST。
 */
function handleLogExport(req, res) {
  const src = Object.assign({}, req.query || {}, req.body || {});
  const format = String(src.format || 'json').toLowerCase();
  const logs = exportLogs({
    from: src.from,
    to: src.to,
    action: src.action,
    userEmail: src.userEmail
  });
  const chain = verifyChain({ maxErrors: 50 });
  const stamp = Date.now();

  logOperation('导出审计日志', req.user.email, 'operation_logs', 0,
    `导出 ${logs.length} 条（${src.from || '起始'} ~ ${src.to || '至今'}，格式 ${format}），链校验: ${chain.isValid ? '通过' : '失败'}`);

  if (format === 'csv') {
    const cols = ['id', 'timestamp', 'action', 'user_email', 'user_role', 'target_type', 'target_id',
      'ip_address', 'user_agent', 'request_id', 'detail', 'request_digest', 'response_digest',
      'data_before', 'data_after', 'chain_version', 'prev_hash', 'hash'];
    const escapeCsv = v => {
      const s = v == null ? '' : String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    // \uFEFF BOM：保证 Excel 打开不乱码
    const csv = '\uFEFF' + [cols.join(',')]
      .concat(logs.map(l => cols.map(c => escapeCsv(l[c])).join(',')))
      .join('\r\n');
    res.setHeader('Content-Disposition', `attachment; filename="operation_logs_${stamp}.csv"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return res.send(csv);
  }

  const payload = JSON.stringify({
    exported_at: new Date().toISOString(),
    exported_by: req.user.email,
    filters: { from: src.from || null, to: src.to || null, action: src.action || null, userEmail: src.userEmail || null },
    count: logs.length,
    chain_verification: {
      isValid: chain.isValid,
      totalBlocks: chain.totalBlocks,
      chainRoot: chain.chainRoot,
      genesisHash: chain.genesisHash,
      errors: chain.errors
    },
    logs: logs.map(shapeLog)
  }, null, 2);
  res.setHeader('Content-Disposition', `attachment; filename="operation_logs_${stamp}.json"`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(payload);
}
app.post('/api/logs/export', authMiddleware, roleMiddleware('auditor', 'admin'), asyncHandler(async (req, res) => handleLogExport(req, res)));
app.get('/api/logs/export', authMiddleware, roleMiddleware('auditor', 'admin'), asyncHandler(async (req, res) => handleLogExport(req, res)));

// BUG-08：判别记录导出（CSV/JSON）
app.get('/api/discrimination-records/export', authMiddleware, asyncHandler(async (req, res) => {
  const db = getDb();
  const format = String(req.query.format || 'csv').toLowerCase();
  const conditions = [];
  const params = [];
  if (req.query.result) { conditions.push('dr.final_result = ?'); params.push(req.query.result); }
  if (req.query.from) { conditions.push('dr.created_at >= ?'); params.push(req.query.from); }
  if (req.query.to) { conditions.push('dr.created_at <= ?'); params.push(req.query.to); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT dr.id, COALESCE(t.name, dr.template_name) AS template_name, dr.final_result, dr.conclusion,
           dr.user_email, dr.audit_status, dr.audit_by, dr.ip_address, dr.created_at
    FROM discrimination_records dr LEFT JOIN templates t ON dr.template_id = t.id
    ${where} ORDER BY dr.id DESC LIMIT 10000
  `).all(...params);

  logOperation('导出判别记录', req.user.email, 'discrimination_records', 0, `导出 ${rows.length} 条（格式 ${format}）`);

  if (format === 'json') {
    res.setHeader('Content-Disposition', `attachment; filename="discrimination_records_${Date.now()}.json"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.send(JSON.stringify({ count: rows.length, data: dt.attachIsoAll(rows, ['created_at']) }, null, 2));
  }
  const cols = ['id', 'template_name', 'final_result', 'conclusion', 'user_email', 'audit_status', 'audit_by', 'ip_address', 'created_at'];
  const esc = v => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = '\uFEFF' + [cols.join(',')].concat(rows.map(r => cols.map(c => esc(r[c])).join(','))).join('\r\n');
  res.setHeader('Content-Disposition', `attachment; filename="discrimination_records_${Date.now()}.csv"`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(csv);
}));

// ==================== 分页参数归一化（BUG-02） ====================
/**
 * BUG-02 修复：分页失效
 * 原因一：req.query 取出的是字符串，直接参与 LIMIT/OFFSET 运算与绑定，
 *          异常输入（page=abc / page=-3 / pageSize=99999）会产生 NaN 或负偏移量。
 * 原因二：total 计数语句与数据语句的 FROM/JOIN 不一致，带搜索条件时直接 SQL 报错。
 * 原因三：page 超出 totalPages 时返回空列表，前端清空分页器，用户“卡在空页”。
 */
function parsePaging(query, defaults) {
  const d = defaults || {};
  const maxPageSize = d.maxPageSize || 200;
  let page = parseInt(query && query.page, 10);
  let pageSize = parseInt(query && (query.pageSize || query.page_size || query.limit), 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = d.pageSize || 20;
  pageSize = Math.min(maxPageSize, pageSize);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** 统一分页响应（page 超界时回落到最后一页，避免空页） */
function pagedResult({ page, pageSize }, total, fetchRows) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const data = fetchRows(pageSize, offset);
  return { data, total, page: safePage, pageSize, totalPages, requestedPage: page };
}

// ==================== 页面鉴权中间件 ====================

function pageAuth(req, res, next) {
  const token = req.cookies['ev3_tok'] || req.query.token;
  if (!token) return res.redirect('/login');
  
  try {
    const parsed = verifyToken(token);
    if (!parsed) return res.redirect('/login');
    const sessionTimeout = (getConfig('session.timeout_hours', 24)) * 60 * 60 * 1000;
    
    if (Date.now() - parsed.timestamp > sessionTimeout) {
      return res.redirect('/login');
    }
    
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND status = ?').get(parsed.email, 'active');
    if (!user) return res.redirect('/login');
    
    req.user = { 
      id: user.id, 
      email: user.email, 
      name: user.name, 
      role: user.role,
      department: user.department 
    };
    auditCtx.patch({ userEmail: user.email, userRole: user.role, userId: user.id });
    next();
  } catch (e) {
    return res.redirect('/login');
  }
}

function pageRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/login');
    if (!roles.includes(req.user.role)) {
      return res.status(403).render('error', { 
        title: '权限不足', 
        message: '您没有权限访问此页面',
        user: req.user 
      });
    }
    next();
  };
}

// ==================== 公开接口 ====================

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(), 
    version: '4.0.0',
    features: {
      ruleEngine: 'dynamic',
      aiService: aiService.getStatus().method,
      crawler: crawler.getCrawlerStatus().enabled
    }
  });
});

// Cookie 安全选项：HTTPS（含反向代理 x-forwarded-proto）下标记为 Secure（SEC-02 修复）
function secureCookieOpts(req, extra) {
  const isHttps = req && (req.secure || (req.headers && req.headers['x-forwarded-proto'] === 'https'));
  return Object.assign({ httpOnly: true, sameSite: 'lax', secure: !!isHttps }, extra || {});
}

// API 登录（带速率限制）
app.post('/api/login', loginLimiter.middleware(), (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return next(new ValidationError('请输入邮箱和密码'));
  }

  const result = login(email, password);
  if (!result.success) {
    return next(new UnauthorizedError(result.error));
  }

  const token = generateToken(email);
  logOperation('登录系统', email, 'users', result.user.id, '用户登录');
  
  res.cookie('ev3_tok', token, secureCookieOpts(req, { 
    maxAge: getConfig('session.timeout_hours', 24) * 60 * 60 * 1000 
  }));
  
  res.json({ 
    success: true,
    token, 
    user: result.user 
  });
});

// ==================== 页面路由 (SSR) ====================

// 登录页面
app.get('/login', (req, res) => {
  const token = req.cookies['ev3_tok'];
  if (token) {
    const parsed = verifyToken(token);
    if (parsed) {
      const sessionTimeout = (getConfig('session.timeout_hours', 24)) * 60 * 60 * 1000;
      if (Date.now() - parsed.timestamp <= sessionTimeout) {
        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE email = ? AND status = ?', [parsed.email, 'active']).get();
        if (user) return res.redirect('/');
      }
    }
  }
  res.render('login', { title: '登录', error: '', user: null });
});

// 登录处理（带速率限制）
app.post('/login', loginLimiter.middleware(), (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.render('login', { title: '登录', error: '请输入邮箱和密码', user: null });
  }
  
  const result = login(email, password);
  if (!result.success) {
    return res.render('login', { title: '登录', error: result.error, user: null });
  }
  
  const token = generateToken(email);
  logOperation('登录系统', email, 'users', result.user.id, '用户登录');
  res.cookie('ev3_tok', token, secureCookieOpts(req, { 
    maxAge: getConfig('session.timeout_hours', 24) * 60 * 60 * 1000 
  }));
  res.redirect('/');
});

// 退出
app.get('/logout', (req, res) => {
  const user = req.user;
  if (user) {
    logOperation('退出系统', user.email, 'users', user.id, '用户退出');
  }
  res.clearCookie('ev3_tok');
  res.redirect('/login');
});

// 仪表盘
app.get('/', pageAuth, (req, res) => {
  const db = getDb();

  const stats = {
    todayDiscriminations: db.prepare(
      "SELECT COUNT(*) as c FROM discrimination_records WHERE date(created_at) = date('now')"
    ).get().c,
    pendingAudits: db.prepare(
      "SELECT COUNT(*) as c FROM audit_tasks WHERE status = 'pending'"
    ).get().c,
    activeTemplates: db.prepare(
      "SELECT COUNT(*) as c FROM templates WHERE status = 'published'"
    ).get().c,
    compliantRate: 'N/A'
  };

  const compliantCount = db.prepare(
    "SELECT COUNT(*) as c FROM discrimination_records WHERE final_result = '合规'"
  ).get().c;
  const totalCount = db.prepare(
    "SELECT COUNT(*) as c FROM discrimination_records"
  ).get().c;
  stats.compliantRate = totalCount > 0
    ? Math.round((compliantCount / totalCount) * 100) + '%'
    : '0%';

  const recent = db.prepare(
    'SELECT * FROM discrimination_records ORDER BY id DESC LIMIT 6'
  ).all();

  const chartRaw = db.prepare(`
    SELECT date(created_at) as day,
           SUM(CASE WHEN final_result='合规' THEN 1 ELSE 0 END) as ok,
           SUM(CASE WHEN final_result='不合规' THEN 1 ELSE 0 END) as ng,
           SUM(CASE WHEN final_result='待人工' THEN 1 ELSE 0 END) as mb
    FROM discrimination_records
    WHERE created_at >= date('now', '-7 days')
    GROUP BY date(created_at)
    ORDER BY day
  `).all();

  const chartData = chartRaw.length > 0
    ? chartRaw.map(d => ({
        label: d.day.slice(-5),
        ok: d.ok,
        ng: d.ng,
        mb: d.mb
      }))
    : [];

  res.render('dashboard', { title: '仪表盘', user: req.user, stats, recent, chartData });
});

app.get('/dashboard', pageAuth, (req, res) => res.redirect('/'));

// 判别历史
app.get('/history', pageAuth, (req, res) => {
  const db = getDb();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const search = req.query.search || '';
  const filter = req.query.result || '';
  const pageSize = 20;

  let where = 'WHERE 1=1';
  const params = [];

  if (search) {
    where += ' AND (COALESCE(t.name,dr.template_name) LIKE ? OR input_text LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (filter) {
    where += ' AND final_result = ?';
    params.push(filter);
  }

  const total = db.prepare(`SELECT COUNT(*) as c FROM discrimination_records ${where}`).get(...params).c;
  const records = db.prepare(
    `SELECT dr.*, t.name AS template_name FROM discrimination_records dr LEFT JOIN templates t ON dr.template_id = t.id ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, (page - 1) * pageSize);

  const pages = Math.ceil(total / pageSize);

  res.render('history', {
    title: '判别历史',
    user: req.user,
    records,
    total,
    page,
    pages,
    search,
    filter
  });
});

// 模板管理
app.get('/templates', pageAuth, (req, res) => {
  const db = getDb();
  const templates = db.prepare('SELECT * FROM templates ORDER BY id').all();
  res.render('templates', { title: '模板管理', user: req.user, templates });
});

// 设备管理（F0 设备实体层）
app.get('/devices', pageAuth, (req, res) => {
  const db = getDb();
  const stats = db.prepare(`SELECT status, COUNT(*) as c FROM elevator_device GROUP BY status`).all();
  const byStatus = { NORMAL: 0, ATTENTION: 0, WARNING: 0, REPAIR: 0, SCRAPPED: 0 };
  stats.forEach(s => { byStatus[s.status] = s.c; });
  const total = db.prepare('SELECT COUNT(*) as c FROM elevator_device').get().c;
  res.render('devices', { title: '设备管理', user: req.user, stats: byStatus, total });
});

// 通用审批中枢（M0 业务流挂载点）
app.get('/approvals', pageAuth, (req, res) => {
  const db = getDb();
  const stats = db.prepare(`SELECT status, COUNT(*) as c FROM approval_workflow GROUP BY status`).all();
  const byStatus = { PENDING: 0, APPROVED: 0, REJECTED: 0, RECALLED: 0, CANCELLED: 0 };
  stats.forEach(s => { byStatus[s.status] = s.c; });
  const total = db.prepare('SELECT COUNT(*) as c FROM approval_workflow').get().c;
  res.render('approvals', { title: '审批中心', user: req.user, stats: byStatus, total });
});

// 知识库
app.get('/knowledge', pageAuth, (req, res) => {
  const db = getDb();
  const regulations = db.prepare('SELECT * FROM regulations ORDER BY id').all();
  res.render('knowledge', { title: '知识库', user: req.user, regulations });
});

// 人工审核
app.get('/audit', pageAuth, pageRole('auditor', 'admin'), (req, res) => {
  const db = getDb();
  const audits = db.prepare(`
    SELECT at.*, dr.template_name, dr.final_result, dr.user_email as submitter_email, dr.created_at as submitted_at
    FROM audit_tasks at
    LEFT JOIN discrimination_records dr ON at.record_id = dr.id
    WHERE at.status = 'pending'
    ORDER BY at.priority DESC, at.id
  `).all();
  res.render('audit', { title: '人工审核', user: req.user, audits });
});

// 模板研究
app.get('/research', pageAuth, pageRole('admin'), (req, res) => {
  const db = getDb();
  // 研究任务（文档对齐：template_research_task，旧 research_tasks 表已废弃）
  const tasks = db.prepare(`
    SELECT t.*, u.name as expert_name,
      (SELECT COUNT(*) FROM template_ai_suggestion WHERE task_id = t.id) as suggestion_count
    FROM template_research_task t
    LEFT JOIN users u ON t.expert_id = u.id
    ORDER BY t.created_at DESC
  `).all();
  res.render('research', { title: '模板研究', user: req.user, tasks });
});

// 司法留痕
app.get('/logs', pageAuth, roleMiddleware('admin', 'auditor'), (req, res) => {
  const db = getDb();
  const logs = db.prepare('SELECT * FROM operation_logs ORDER BY id DESC LIMIT 200').all();
  const chainLogs = logs.slice(0, 10);
  const logTotal = db.prepare('SELECT COUNT(*) as count FROM operation_logs').get().count;
  res.render('logs', { title: '司法留痕', user: req.user, logs, chainLogs, logTotal });
});

// 系统设置（个人账号与密码管理，所有登录用户可访问；页面与接口均不含任何管理员写操作）
app.get('/settings', pageAuth, (req, res) => {
  const db = getDb();
  const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  const isDefaultPwd = !!(u && u.password_hash === hashPassword('123456'));
  res.render('settings', { title: '系统设置', user: req.user, isDefaultPwd });
});

// 合规判别
app.get('/discriminate', pageAuth, (req, res) => {
  const db = getDb();
  const templates = db.prepare('SELECT id, name, category FROM templates WHERE status = ? ORDER BY id').all('published');
  res.render('discriminate', { title: '合规判别', user: req.user, templates });
});

// ==================== 移动端 H5 路由 ====================

app.get('/mobile', pageAuth, (req, res) => {
  const db = getDb();
  const stats = {
    todayDiscriminations: db.prepare(
      "SELECT COUNT(*) as c FROM discrimination_records WHERE date(created_at) = date('now')"
    ).get().c,
    pendingAudits: db.prepare(
      "SELECT COUNT(*) as c FROM audit_tasks WHERE status = 'pending'"
    ).get().c,
    activeTemplates: db.prepare(
      "SELECT COUNT(*) as c FROM templates WHERE status = 'published'"
    ).get().c,
    compliantRate: 'N/A'
  };

  const compliantCount = db.prepare(
    "SELECT COUNT(*) as c FROM discrimination_records WHERE final_result = '合规'"
  ).get().c;
  const totalCount = db.prepare(
    "SELECT COUNT(*) as c FROM discrimination_records"
  ).get().c;
  stats.compliantRate = totalCount > 0
    ? Math.round((compliantCount / totalCount) * 100) + '%'
    : '0%';

  const recent = db.prepare('SELECT * FROM discrimination_records ORDER BY id DESC LIMIT 6').all();
  res.render('mobile', { title: '移动端', currentTab: 'home', user: req.user, stats, recent, error: '' });
});

app.get('/mobile/discriminate', pageAuth, (req, res) => {
  const db = getDb();
  const tpls = db.prepare('SELECT id, name, category FROM templates WHERE status = ? ORDER BY id').all('published');
  res.render('mobile_discriminate', { title: '判别', currentTab: 'discriminate', user: req.user, tpls });
});

app.get('/mobile/history', pageAuth, (req, res) => {
  const db = getDb();
  const records = db.prepare('SELECT * FROM discrimination_records ORDER BY id DESC LIMIT 20').all();
  res.render('mobile_history', { title: '历史', currentTab: 'history', user: req.user, records });
});

app.get('/mobile/logs', pageAuth, (req, res) => {
  const db = getDb();
  const logs = db.prepare('SELECT * FROM operation_logs ORDER BY id DESC LIMIT 50').all();
  res.render('mobile_logs', { title: '留痕', currentTab: 'logs', user: req.user, logs });
});

app.get('/mobile/settings', pageAuth, (req, res) => {
  res.render('mobile_settings', { title: '设置', currentTab: 'settings', user: req.user });
});

// ==================== API: 用户 & 仪表盘 ====================

app.get('/api/user/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// 修改密码（SEC-03：提供将弱密码改为强密码的能力，并强制复杂度校验）
app.post('/api/user/change-password', authMiddleware, asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) throw new ValidationError('请输入原密码和新密码');
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) throw new UnauthorizedError('用户不存在');
  if (!verifyPassword(oldPassword, user.password_hash)) throw new UnauthorizedError('原密码错误');
  if (verifyPassword(newPassword, user.password_hash)) throw new ValidationError('新密码不能与原密码相同');
  const pwErr = validatePassword(newPassword);
  if (pwErr) throw new ValidationError(pwErr);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(hashPassword(newPassword), new Date().toISOString(), user.id);
  logOperation('修改密码', req.user.email, 'users', user.id, '用户修改登录密码');
  res.json({ success: true });
}));

app.get('/api/dashboard/stats', authMiddleware, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const stats = {
    todayDiscriminations: db.prepare(
      "SELECT COUNT(*) as c FROM discrimination_records WHERE date(created_at) = ?"
    ).get(today).c,
    pendingAudits: db.prepare(
      "SELECT COUNT(*) as c FROM audit_tasks WHERE status = 'pending'"
    ).get().c,
    activeTemplates: db.prepare(
      "SELECT COUNT(*) as c FROM templates WHERE status = 'published'"
    ).get().c,
    totalRecords: db.prepare(
      "SELECT COUNT(*) as c FROM discrimination_records"
    ).get().c
  };

  const compliantCount = db.prepare(
    "SELECT COUNT(*) as c FROM discrimination_records WHERE final_result = '合规'"
  ).get().c;
  stats.compliantRate = stats.totalRecords > 0
    ? Math.round((compliantCount / stats.totalRecords) * 100) + '%'
    : '0%';

  // 近 7 天趋势（旧→新）
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = d.toISOString().split('T')[0];
    const total = db.prepare('SELECT COUNT(*) as c FROM discrimination_records WHERE date(created_at) = ?').get(day).c;
    const compliant = db.prepare("SELECT COUNT(*) as c FROM discrimination_records WHERE date(created_at) = ? AND final_result = '合规'").get(day).c;
    const nonCompliant = db.prepare("SELECT COUNT(*) as c FROM discrimination_records WHERE date(created_at) = ? AND final_result = '不合规'").get(day).c;
    const pending = db.prepare("SELECT COUNT(*) as c FROM discrimination_records WHERE date(created_at) = ? AND final_result = '待人工'").get(day).c;
    last7Days.push({ label: (d.getMonth() + 1) + '-' + d.getDate(), total, compliant, nonCompliant, pending });
  }
  stats.last7Days = last7Days;

  res.json(stats);
});

// ==================== API: AI 分类 ====================

/**
 * AI 合规分类器（AI-01 / AI-02 / AI-03 / AI-04）
 *
 * 旧实现问题：
 *   - 硬编码 templateId 1~5 与模板名，模板库变动后直接指错或 404；
 *   - 无论如何都返回一个模板（默认 id=1, 0.75），没有置信度兵分线；
 *   - 不做字段提取，用户需全量手填。
 *
 * 新实现：Coze → Ollama → 本地语义打分器 三级降级，候选集来自数据库真实模板，
 *          低于置信度阈值时返回 needManualSelect=true 交由人工选择。
 *          AI 仅负责分类与字段提取，不产出任何合规结论。
 */
app.post('/api/ai/classify', authMiddleware, asyncHandler(async (req, res) => {
  const { text, description } = req.body;
  const inputText = text || description;

  if (!inputText) {
    throw new ValidationError('请输入问题描述');
  }

  const result = await cozeService.classify(inputText);

  const db = getDb();
  let template = null;
  let fields = [];
  if (result.templateId) {
    template = db.prepare('SELECT * FROM templates WHERE id = ? AND status != ?').get(result.templateId, 'archived');
    fields = withOptionsListAll(
      db.prepare('SELECT * FROM template_fields WHERE template_id = ? ORDER BY sort_order, id').all(result.templateId)
    );
  }

  logOperation(
    'AI分类',
    req.user.email,
    'ai',
    result.templateId || 0,
    `输入: "${String(inputText).substring(0, 100)}" → 分类: ${result.templateName || '未确定'} ` +
    `(置信度 ${(Number(result.confidence || 0) * 100).toFixed(1)}%, 提供方 ${result.provider}` +
    `${result.needManualSelect ? ', 低于阈值→转人工选择' : ''})`
  );

  res.json({
    templateId: result.templateId,
    templateName: result.templateName,
    confidence: result.confidence,
    threshold: result.threshold,
    needManualSelect: result.needManualSelect,
    provider: result.provider,
    reason: result.reason,
    matchedKeywords: result.matchedKeywords || [],
    candidates: result.candidates || [],
    extracted: result.extracted || {},
    extractEvidence: result.extractEvidence || {},
    template,
    fields
  });
}));

// ==================== API: AI 智能分析 ====================

app.post('/api/ai/analyze', authMiddleware, asyncHandler(async (req, res) => {
  const { text, template_id, use_ollama } = req.body;
  if (!text) throw new ValidationError('请输入分析内容');

  const result = await aiService.analyzeText(text, { template_id, use_ollama });
  logOperation(
    'AI分析',
    req.user.email,
    'ai',
    0,
    `AI分析: ${result.label} (${result.confidence}) 方法: ${result.method}`
  );
  res.json({ success: true, ...result });
}));

// ==================== API: AI 智能问答 ====================

app.post('/api/ai/ask', authMiddleware, asyncHandler(async (req, res) => {
  const { question, context } = req.body;
  if (!question) throw new ValidationError('请输入问题');

  const result = await aiService.askQuestion(question, context);
  res.json({ success: true, ...result });
}));

// ==================== API: AI 状态查询 ====================

app.get('/api/ai/status', authMiddleware, (req, res) => {
  const status = aiService.getStatus();
  const crawlerStatus = crawler.getCrawlerStatus();
  const classifier = cozeService.getStatus();
  res.json({
    ai: status,
    classifier,
    crawler: crawlerStatus,
    policy: 'AI 仅用于模板分类与字段提取；合规结论一律由确定性规则引擎生成'
  });
});

// ==================== API: 爬虫管理 ====================

app.post('/api/crawler/trigger', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const result = await crawler.triggerCrawl();
  res.json({ success: true, ...result });
}));

app.get('/api/crawler/status', authMiddleware, roleMiddleware('admin'), (req, res) => {
  res.json(crawler.getCrawlerStatus());
});

app.post('/api/crawler/start', authMiddleware, roleMiddleware('admin'), (req, res) => {
  crawler.startCrawler();
  res.json({ success: true, message: '定时爬虫已启动' });
});

app.post('/api/crawler/stop', authMiddleware, roleMiddleware('admin'), (req, res) => {
  crawler.stopCrawler();
  res.json({ success: true, message: '定时爬虫已停止' });
});

// ==================== API: 模板管理 ====================

app.get('/api/templates', authMiddleware, (req, res) => {
  const db = getDb();
  const { category, status, search } = req.query;
  const paging = parsePaging(req.query);

  const conditions = [];
  const params = [];
  if (category) { conditions.push('category = ?'); params.push(category); }
  if (status) { conditions.push('status = ?'); params.push(status); }
  if (search) { conditions.push('(name LIKE ? OR code LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) as count FROM templates ${where}`).get(...params).count;
  const out = pagedResult(paging, total, (limit, offset) =>
    db.prepare(`SELECT * FROM templates ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset)
  );
  out.data = dt.attachIsoAll(out.data, ['created_at', 'updated_at']);
  res.json(out);
});

app.get('/api/templates/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!template) throw new NotFoundError('模板不存在');

  // BUG-03：排序必须带上 id 作为稳定次序键，sort_order 重复时不会随机翻转
  const fields = withOptionsListAll(db.prepare(
    'SELECT * FROM template_fields WHERE template_id = ? ORDER BY sort_order, id'
  ).all(req.params.id));

  const rules = db.prepare(
    'SELECT * FROM template_rules WHERE template_id = ? ORDER BY priority DESC, id'
  ).all(req.params.id);

  res.json({ ...template, fields, rules });
});

app.post('/api/templates', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const { code, name, category, description, regulationIds, fields, icon, color, tags } = req.body;
  
  if (!code || !name || !category) {
    throw new ValidationError('缺少必填字段');
  }

  const validFieldTypes = ['text','number','date','select','textarea','checkbox','radio','file'];
  const createTemplateTx = db.transaction((p) => {
    const result = db.prepare(`
      INSERT INTO templates (code, name, category, version, description, regulation_ids, status, created_by, icon, color, tags)
      VALUES (?, ?, ?, 1, ?, ?, 'published', ?, ?, ?, ?)
    `).run(p.code, p.name, p.category, p.description || '', p.regulationIds || '', p.email, p.icon || null, p.color || null, p.tags || null);
    const templateId = result.lastInsertRowid;

    if (p.fields && Array.isArray(p.fields)) {
      const insertField = db.prepare(`
        INSERT INTO template_fields (template_id, field_name, field_label, field_type, required, sort_order, options, placeholder)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      // BUG-03：以数组下标作为权威顺序，仅当 sort_order 是合法数字时才采用
      p.fields.forEach((f, i) => {
        insertField.run(
          templateId,
          f.field_name,
          f.field_label,
          validFieldTypes.includes(f.field_type) ? f.field_type : 'text',
          f.required ? 1 : 0,
          resolveSortOrder(f, i),
          serializeFieldOptions(f.options_list != null ? f.options_list : f.options),
          f.placeholder || null
        );
      });
    }
    return templateId;
  });
  const templateId = createTemplateTx({ code, name, category, description, regulationIds, fields, email: req.user.email, icon, color, tags });

  logOperation('创建模板', req.user.email, 'templates', templateId, `创建模板: ${name}(${code})`);
  res.json({ success: true, id: templateId, message: '模板创建成功' });
}));

/**
 * BUG-03 修复：模板编辑时字段顺序丢失
 *
 * 旧实现：`f.sort_order || i`
 *   - sort_order 为 0 时被当成 falsy → 错误地用下标覆盖；
 *   - 前端会把从数据库读出的旧 sort_order（种子数据从 1 开始）原样回传，
 *     而新增字段没有 sort_order → 取下标（0,1,2…），
 *     两套编号体系混在一起产生重复值，保存后顺序完全错乱。
 * 新实现：只有合法有限数字才采用，否则一律以数组下标为准；
 *          写入前整体重新编号，保证 0..n-1 连续唯一；查询一律 ORDER BY sort_order, id。
 */
function resolveSortOrder(field, index) {
  const v = field && field.sort_order;
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : index;
}

/** 将字段数组按声明顺序重新编号为 0..n-1（稳定排序） */
function normalizeFieldOrder(fields) {
  return (fields || [])
    .map((f, i) => ({ f, key: resolveSortOrder(f, i), i }))
    .sort((a, b) => (a.key - b.key) || (a.i - b.i))
    .map((x, idx) => Object.assign({}, x.f, { sort_order: idx }));
}

app.put('/api/templates/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const { name, category, description, regulationIds, status, fields, tags } = req.body;

  const existing = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!existing) throw new NotFoundError('模板不存在');
  const fieldsBefore = db.prepare('SELECT field_name, field_label, field_type, required, sort_order, options FROM template_fields WHERE template_id = ? ORDER BY sort_order, id').all(req.params.id);

  const validFieldTypes = ['text','number','date','select','textarea','checkbox','radio','file'];

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE templates SET
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        description = COALESCE(?, description),
        regulation_ids = COALESCE(?, regulation_ids),
        status = COALESCE(?, status),
        tags = COALESCE(?, tags),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, category, description, regulationIds, status, tags, req.params.id);

    if (fields) {
      db.prepare('DELETE FROM template_fields WHERE template_id = ?').run(req.params.id);
      const insertField = db.prepare(`
        INSERT INTO template_fields (template_id, field_name, field_label, field_type, required, sort_order, options, placeholder, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      normalizeFieldOrder(fields).forEach((f, i) => {
        insertField.run(
          req.params.id,
          f.field_name,
          f.field_label,
          validFieldTypes.includes(f.field_type) ? f.field_type : 'text',
          f.required ? 1 : 0,
          i,
          serializeFieldOptions(f.options_list != null ? f.options_list : f.options),
          f.placeholder || null
        );
      });
    }
  });
  tx();

  // 清除规则缓存
  ruleEngine.clearCache(parseInt(req.params.id));

  const after = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  const fieldsAfter = db.prepare('SELECT field_name, field_label, field_type, required, sort_order, options FROM template_fields WHERE template_id = ? ORDER BY sort_order, id').all(req.params.id);

  // LOG-03：记录修改前后对比
  logOperation('更新模板', req.user.email, 'templates', req.params.id, `更新模板: ${after.name}(${after.code})`, {
    before: Object.assign({}, existing, { __fields: fieldsBefore }),
    after: Object.assign({}, after, { __fields: fieldsAfter })
  });
  res.json({ success: true, message: '模板更新成功' });
}));

app.delete('/api/templates/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!existing) throw new NotFoundError('模板不存在');

  const fieldsBefore = db.prepare('SELECT * FROM template_fields WHERE template_id = ? ORDER BY sort_order, id').all(req.params.id);
  db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);

  // 清除缓存
  ruleEngine.clearCache(parseInt(req.params.id));

  logOperation('删除模板', req.user.email, 'templates', req.params.id, `删除模板: ${existing.name}(${existing.code})`, {
    before: Object.assign({}, existing, { __fields: fieldsBefore }),
    after: null
  });
  res.json({ success: true, message: '模板已删除' });
}));

// ==================== API: 设备管理（F0 设备实体层） ====================

app.get('/api/devices', authMiddleware, (req, res) => {
  const db = getDb();
  const { status, deviceType, region, search } = req.query;
  const paging = parsePaging(req.query);
  const conditions = [];
  const params = [];
  if (status) { conditions.push('status = ?'); params.push(status); }
  if (deviceType) { conditions.push('device_type = ?'); params.push(deviceType); }
  if (region) { conditions.push('region_code = ?'); params.push(region); }
  if (search) {
    conditions.push('(device_code LIKE ? OR device_name LIKE ? OR registration_code LIKE ? OR location LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) as count FROM elevator_device ${where}`).get(...params).count;
  const out = pagedResult(paging, total, (limit, offset) =>
    db.prepare(`SELECT * FROM elevator_device ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset)
  );
  out.data = dt.attachIsoAll(out.data, ['created_at', 'updated_at', 'manufacture_date', 'install_date', 'last_inspection_date', 'next_inspection_date', 'evaluate_date']);
  res.json(out);
});

app.get('/api/devices/stats', authMiddleware, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT status, COUNT(*) as c FROM elevator_device GROUP BY status`).all();
  const byStatus = { NORMAL: 0, ATTENTION: 0, WARNING: 0, REPAIR: 0, SCRAPPED: 0 };
  rows.forEach(r => { byStatus[r.status] = r.c; });
  const total = db.prepare('SELECT COUNT(*) as c FROM elevator_device').get().c;
  res.json({ total, byStatus });
});

app.get('/api/devices/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const device = db.prepare('SELECT * FROM elevator_device WHERE id = ?').get(req.params.id);
  if (!device) throw new NotFoundError('设备不存在');
  const dynamics = db.prepare('SELECT * FROM device_dynamic_record WHERE device_id = ? ORDER BY id DESC LIMIT 20').all(req.params.id);
  res.json({ ...device, dynamics });
});

app.post('/api/devices', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const { deviceCode, deviceName, deviceType, registrationCode, brand, model, manufactureDate, installDate, location, regionCode, orgId, projectId, owner, maintenanceUnit, status, riskLevel, lastInspectionDate, nextInspectionDate, evaluateDate } = req.body;
  if (!deviceCode || !deviceName || !deviceType) throw new ValidationError('设备编号、名称、类型为必填');
  const id = db.prepare(`
    INSERT INTO elevator_device (device_code, device_name, device_type, registration_code, brand, model, manufacture_date, install_date, location, region_code, org_id, project_id, owner, maintenance_unit, status, risk_level, last_inspection_date, next_inspection_date, evaluate_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    deviceCode, deviceName, deviceType, registrationCode || null, brand || null, model || null,
    manufactureDate || null, installDate || null, location || null, regionCode || null,
    orgId || null, projectId || null, owner || null, maintenanceUnit || null,
    status || 'NORMAL', riskLevel || 'general',
    lastInspectionDate || null, nextInspectionDate || null, evaluateDate || null, req.user.email
  ).lastInsertRowid;
  logOperation('创建设备', req.user.email, 'elevator_device', id, `创建设备: ${deviceName}(${deviceCode})`);
  res.json({ success: true, id, message: '设备创建成功' });
}));

app.put('/api/devices/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM elevator_device WHERE id = ?').get(req.params.id);
  if (!existing) throw new NotFoundError('设备不存在');
  const { deviceCode, deviceName, deviceType, registrationCode, brand, model, manufactureDate, installDate, location, regionCode, orgId, projectId, owner, maintenanceUnit, status, riskLevel, lastInspectionDate, nextInspectionDate, evaluateDate } = req.body;
  if (!deviceCode || !deviceName || !deviceType) throw new ValidationError('设备编号、名称、类型为必填');
  db.prepare(`
    UPDATE elevator_device SET
      device_code = ?, device_name = ?, device_type = ?, registration_code = ?, brand = ?, model = ?,
      manufacture_date = ?, install_date = ?, location = ?, region_code = ?, org_id = ?, project_id = ?,
      owner = ?, maintenance_unit = ?, status = ?, risk_level = ?, last_inspection_date = ?, next_inspection_date = ?, evaluate_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    deviceCode, deviceName, deviceType, registrationCode || null, brand || null, model || null,
    manufactureDate || null, installDate || null, location || null, regionCode || null,
    orgId || null, projectId || null, owner || null, maintenanceUnit || null,
    status || 'NORMAL', riskLevel || 'general',
    lastInspectionDate || null, nextInspectionDate || null, evaluateDate || null, req.params.id
  );
  logOperation('更新设备', req.user.email, 'elevator_device', req.params.id, `更新设备: ${deviceName}(${deviceCode})`, { before: existing, after: db.prepare('SELECT * FROM elevator_device WHERE id = ?').get(req.params.id) });
  res.json({ success: true, message: '设备更新成功' });
}));

app.delete('/api/devices/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM elevator_device WHERE id = ?').get(req.params.id);
  if (!existing) throw new NotFoundError('设备不存在');
  db.prepare('DELETE FROM elevator_device WHERE id = ?').run(req.params.id);
  logOperation('删除设备', req.user.email, 'elevator_device', req.params.id, `删除设备: ${existing.device_name}(${existing.device_code})`, { before: existing, after: null });
  res.json({ success: true, message: '设备已删除' });
}));

// ==================== API: 通用审批中枢 M0 ====================

app.get('/api/approvals', authMiddleware, (req, res) => {
  const db = getDb();
  const { businessType, status } = req.query;
  const paging = parsePaging(req.query);
  const conditions = [];
  const params = [];
  if (businessType) { conditions.push('business_type = ?'); params.push(businessType); }
  if (status) { conditions.push('status = ?'); params.push(status); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) as count FROM approval_workflow ${where}`).get(...params).count;
  const out = pagedResult(paging, total, (limit, offset) =>
    db.prepare(`SELECT * FROM approval_workflow ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset)
  );
  out.data = dt.attachIsoAll(out.data, ['created_at', 'completed_at']);
  res.json(out);
});

app.get('/api/approvals/stats', authMiddleware, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT status, COUNT(*) as c FROM approval_workflow GROUP BY status`).all();
  const byStatus = { PENDING: 0, APPROVED: 0, REJECTED: 0, RECALLED: 0, CANCELLED: 0 };
  rows.forEach(r => { byStatus[r.status] = r.c; });
  const total = db.prepare('SELECT COUNT(*) as c FROM approval_workflow').get().c;
  res.json({ total, byStatus });
});

app.get('/api/approvals/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const aw = db.prepare('SELECT * FROM approval_workflow WHERE id = ?').get(req.params.id);
  if (!aw) throw new NotFoundError('审批单不存在');
  const nodes = db.prepare('SELECT * FROM approval_node WHERE approval_id = ? ORDER BY node_seq').all(req.params.id);
  res.json({ ...aw, nodes });
});

app.post('/api/approvals', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const { businessType, businessId, businessTitle, dualReview, nodes } = req.body;
  if (!businessType || businessId == null) throw new ValidationError('业务类型与业务ID为必填');
  if (!Array.isArray(nodes) || nodes.length === 0) throw new ValidationError('审批节点不能为空');
  const info = db.prepare(`INSERT INTO approval_workflow (business_type, business_id, business_title, status, current_node, dual_review, created_by) VALUES (?, ?, ?, 'PENDING', 1, ?, ?)`)
    .run(businessType, businessId, businessTitle || null, dualReview ? 1 : 0, req.user.email);
  const awId = info.lastInsertRowid;
  const insertNode = db.prepare(`INSERT INTO approval_node (approval_id, node_seq, node_name, approver_role, approver_id) VALUES (?, ?, ?, ?, ?)`);
  nodes.forEach((n, i) => insertNode.run(awId, i + 1, n.nodeName || ('节点' + (i + 1)), n.approverRole || null, n.approverId || null));
  logOperation('提交审批', req.user.email, 'approval_workflow', awId, `提交审批: ${businessType}#${businessId} (${nodes.length}节点)`);
  res.json({ success: true, id: awId, message: '审批单创建成功' });
}));

function canActOnNode(user, node) {
  if (user.role === 'admin' || user.role === 'auditor') return true;
  if (node.approver_id && node.approver_id === user.id) return true;
  return false;
}

app.post('/api/approvals/:id/nodes/:nodeSeq/approve', authMiddleware, asyncHandler(async (req, res) => {
  const db = getDb();
  const aw = db.prepare('SELECT * FROM approval_workflow WHERE id = ?').get(req.params.id);
  if (!aw) throw new NotFoundError('审批单不存在');
  if (aw.status !== 'PENDING') throw new ValidationError('该审批单已结束，无法操作');
  const seq = parseInt(req.params.nodeSeq, 10);
  if (seq !== aw.current_node) throw new ValidationError('只能处理当前待办节点');
  const node = db.prepare('SELECT * FROM approval_node WHERE approval_id = ? AND node_seq = ?').get(req.params.id, seq);
  if (!node || node.status !== 'PENDING') throw new ValidationError('节点状态异常');
  if (!canActOnNode(req.user, node)) throw new ForbiddenError('无审批权限');
  const { comment, aiComparisonSummary, aiConfidence } = req.body;
  const totalNodes = db.prepare('SELECT COUNT(*) as c FROM approval_node WHERE approval_id = ?').get(req.params.id).c;
  const tx = db.transaction(() => {
    db.prepare(`UPDATE approval_node SET status='APPROVED', approver_email=?, approval_result=?, comment=?, ai_comparison_summary=?, ai_confidence=?, decided_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(req.user.email, comment || '通过', comment || null, aiComparisonSummary || null, aiConfidence != null ? aiConfidence : null, node.id);
    if (seq < totalNodes) {
      db.prepare('UPDATE approval_workflow SET current_node = ? WHERE id = ?').run(seq + 1, req.params.id);
    } else {
      db.prepare(`UPDATE approval_workflow SET status='APPROVED', completed_at=CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
    }
  });
  tx();
  logOperation('审批通过', req.user.email, 'approval_workflow', req.params.id, `节点${seq}通过`);
  res.json({ success: true, message: '已通过' });
}));

app.post('/api/approvals/:id/nodes/:nodeSeq/reject', authMiddleware, asyncHandler(async (req, res) => {
  const db = getDb();
  const aw = db.prepare('SELECT * FROM approval_workflow WHERE id = ?').get(req.params.id);
  if (!aw) throw new NotFoundError('审批单不存在');
  if (aw.status !== 'PENDING') throw new ValidationError('该审批单已结束，无法操作');
  const seq = parseInt(req.params.nodeSeq, 10);
  if (seq !== aw.current_node) throw new ValidationError('只能处理当前待办节点');
  const node = db.prepare('SELECT * FROM approval_node WHERE approval_id = ? AND node_seq = ?').get(req.params.id, seq);
  if (!node || node.status !== 'PENDING') throw new ValidationError('节点状态异常');
  if (!canActOnNode(req.user, node)) throw new ForbiddenError('无审批权限');
  const { comment } = req.body;
  const tx = db.transaction(() => {
    db.prepare(`UPDATE approval_node SET status='REJECTED', approver_email=?, comment=?, decided_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(req.user.email, comment || '不通过', node.id);
    db.prepare(`UPDATE approval_workflow SET status='REJECTED', completed_at=CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
  });
  tx();
  logOperation('审批驳回', req.user.email, 'approval_workflow', req.params.id, `节点${seq}驳回`);
  res.json({ success: true, message: '已驳回' });
}));

app.post('/api/approvals/:id/recall', authMiddleware, asyncHandler(async (req, res) => {
  const db = getDb();
  const aw = db.prepare('SELECT * FROM approval_workflow WHERE id = ?').get(req.params.id);
  if (!aw) throw new NotFoundError('审批单不存在');
  if (aw.status !== 'PENDING') throw new ValidationError('该审批单已结束，无法撤回');
  if (req.user.role !== 'admin' && aw.created_by !== req.user.email) throw new ForbiddenError('仅创建人或管理员可撤回');
  db.prepare(`UPDATE approval_workflow SET status='RECALLED', completed_at=CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
  logOperation('撤回审批', req.user.email, 'approval_workflow', req.params.id, `撤回审批单#${req.params.id}`);
  res.json({ success: true, message: '已撤回' });
}));

// ==================== API: 模板规则管理 ====================

app.get('/api/templates/:id/rules', authMiddleware, (req, res) => {
  const db = getDb();
  const rules = db.prepare(
    'SELECT * FROM template_rules WHERE template_id = ? ORDER BY priority DESC, id'
  ).all(req.params.id);
  
  res.json({ data: rules.map(r => ({ ...r, config: JSON.parse(r.rule_config) })) });
});

app.post('/api/templates/:id/rules', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const { ruleName, ruleType, config, clauseRef, description, severity, priority, enabled } = req.body;
  
  if (!ruleName || !ruleType || !config) {
    throw new ValidationError('缺少必填字段');
  }

  const ruleId = ruleEngine.addRule(parseInt(req.params.id), {
    ruleName,
    ruleType,
    config,
    clauseRef,
    description,
    severity,
    priority,
    enabled,
    createdBy: req.user.email
  });

  logOperation('创建规则', req.user.email, 'template_rules', ruleId, `创建规则: ${ruleName}`);
  res.json({ success: true, id: ruleId, message: '规则创建成功' });
}));

app.put('/api/rules/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const { ruleName, ruleType, config, clauseRef, description, severity, priority, enabled } = req.body;
  
  const success = ruleEngine.updateRule(parseInt(req.params.id), {
    ruleName,
    ruleType,
    config,
    clauseRef,
    description,
    severity,
    priority,
    enabled
  });

  if (!success) throw new NotFoundError('规则不存在');

  logOperation('更新规则', req.user.email, 'template_rules', req.params.id, `更新规则: ${ruleName}`);
  res.json({ success: true, message: '规则更新成功' });
}));

app.delete('/api/rules/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const success = ruleEngine.deleteRule(parseInt(req.params.id));
  if (!success) throw new NotFoundError('规则不存在');

  logOperation('删除规则', req.user.email, 'template_rules', req.params.id, '删除规则');
  res.json({ success: true, message: '规则已删除' });
}));

app.post('/api/rules/test', authMiddleware, (req, res) => {
  const { ruleData, testData } = req.body;
  if (!ruleData) throw new ValidationError('缺少规则数据');
  const result = ruleEngine.testRule(ruleData, testData);
  res.json({ success: true, result });
});

// ==================== API: 合规判别 ====================

app.post('/api/discriminate', authMiddleware, asyncHandler(async (req, res) => {
  const { templateId, inputText, formData, templateName } = req.body;
  
  if (!templateId || !formData) {
    throw new ValidationError('缺少必填参数');
  }

  // 校验模板是否存在（未知模板返回 404，避免规则引擎内部崩溃）
  const tpl = getDb().prepare('SELECT id, name, version FROM templates WHERE id = ?').get(templateId);
  if (!tpl) throw new NotFoundError('模板不存在');

  // 1. 执行规则引擎（templateName 缺失时回退到库内模板名，保证硬编码规则可匹配）
  const result = ruleEngine.execute(formData, templateId, templateName || tpl.name);

  // 2. AI智能分析（异步）
  let aiResult = null;
  if (inputText || templateName) {
    const aiText = inputText || JSON.stringify(formData);
    try {
      aiResult = await aiService.analyzeText(aiText, { template_id: templateId });
    } catch (_) { /* AI分析失败不影响主流程 */ }
  }

  // 3. 保存判别记录（同时落库 IP / UA / 请求ID，满足司法留痕可追溯要求）
  const db = getDb();
  const recordResult = db.prepare(`
    INSERT INTO discrimination_records
      (template_id, template_name, template_version, input_text, form_data, ai_classification,
       rule_results, final_result, conclusion, clause_ref, user_email, user_name, audit_status,
       ip_address, user_agent, request_id, ai_confidence, ai_provider)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    templateId,
    templateName || tpl.name,
    tpl.version || '1',
    inputText || '',
    JSON.stringify(formData),
    JSON.stringify(aiResult || {}),
    JSON.stringify(result.executionLog),
    result.finalResult,
    result.conclusion,
    result.executionLog.filter(r => r.result !== '合规').map(r => r.clause).join('；') || '全部合规',
    req.user.email,
    req.user.name,
    result.needAudit ? 'pending' : 'approved',
    req.clientIp || null,
    (req.headers['user-agent'] || '').slice(0, 400) || null,
    req.requestId || null,
    aiResult && aiResult.confidence != null ? Number(aiResult.confidence) : null,
    aiResult && aiResult.method ? String(aiResult.method) : null
  );

  const recordId = recordResult.lastInsertRowid;

  // 4. 创建审核任务
  if (result.needAudit) {
    db.prepare(`
      INSERT INTO audit_tasks (record_id, task_type, priority, status, assigned_to, created_by)
      VALUES (?, 'discrimination', 'normal', 'pending', 'auditor@demo.com', ?)
    `).run(recordId, req.user.email);
  }

  // 5. 记录操作日志（写入新增记录快照，便于事后司法比对）
  const hashInfo = logOperation(
    '提交判别',
    req.user.email,
    'discrimination_records',
    recordId,
    `模板: ${templateName || tpl.name}, 结果: ${result.finalResult}, 通过: ${result.passCount}, 不通过: ${result.failCount}, 待人工: ${result.pendingCount}`,
    {
      before: null,
      after: {
        id: recordId,
        template_id: templateId,
        final_result: result.finalResult,
        conclusion: result.conclusion,
        form_data: formData,
        audit_status: result.needAudit ? 'pending' : 'approved'
      }
    }
  );

  res.json({
    success: true,
    id: recordId,
    finalResult: result.finalResult,
    conclusion: result.conclusion,
    passCount: result.passCount,
    failCount: result.failCount,
    pendingCount: result.pendingCount,
    totalRules: result.totalRules,
    executionLog: result.executionLog,
    needAudit: result.needAudit,
    hash: hashInfo.hash,
    timestamp: new Date().toISOString()
  });
}));

// 判别记录列表
app.get('/api/discrimination-records', authMiddleware, (req, res) => {
  const db = getDb();
  const { result: filterResult, auditStatus, search } = req.query;
  const paging = parsePaging(req.query);

  const conditions = [];
  const params = [];

  if (filterResult) {
    conditions.push('dr.final_result = ?');
    params.push(filterResult);
  }
  if (auditStatus) {
    conditions.push('dr.audit_status = ?');
    params.push(auditStatus);
  }
  if (search) {
    conditions.push('(COALESCE(t.name, dr.template_name) LIKE ? OR dr.input_text LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  // BUG-02：计数语句必须与数据语句使用**完全相同**的 FROM/JOIN，
  // 否则带搜索条件时会报 "no such column: t.name"，列表与分页全部失效。
  const FROM = 'FROM discrimination_records dr LEFT JOIN templates t ON dr.template_id = t.id';
  const total = db.prepare(`SELECT COUNT(*) as count ${FROM} ${where}`).get(...params).count;

  const out = pagedResult(paging, total, (limit, offset) =>
    db.prepare(`SELECT dr.*, COALESCE(t.name, dr.template_name) AS template_name ${FROM} ${where} ORDER BY dr.id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset)
  );

  out.data = dt.attachIsoAll(out.data, ['created_at', 'audit_at']);
  res.json(out);
});

// 判别记录详情
app.get('/api/discrimination-records/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const record = db.prepare('SELECT dr.*, t.name AS template_name FROM discrimination_records dr LEFT JOIN templates t ON dr.template_id = t.id WHERE dr.id = ?').get(req.params.id);
  if (!record) throw new NotFoundError('记录不存在');

  record.form_data = record.form_data ? JSON.parse(record.form_data) : {};
  record.rule_results = record.rule_results ? JSON.parse(record.rule_results) : [];

  const auditTask = db.prepare('SELECT * FROM audit_tasks WHERE record_id = ?').get(record.id);

  res.json({ record, auditTask });
});

// ==================== API: 规则引擎执行 ====================

app.post('/api/rule-engine/execute', authMiddleware, (req, res) => {
  const { templateId, templateName, formData } = req.body;
  if (!formData) throw new ValidationError('缺少表单数据');

  const result = ruleEngine.execute(formData, templateId || 1, templateName || '电梯维保合规性判别');

  logOperation(
    '规则执行',
    req.user.email,
    'rule_engine',
    templateId || 0,
    `执行 ${result.executionLog.length} 条规则，结果: ${result.finalResult}`
  );

  res.json(result);
});

// ==================== API: 知识库 ====================

app.get('/api/regulations', authMiddleware, (req, res) => {
  const db = getDb();
  const { level, category, status, reviewStatus, search, deviceType } = req.query;
  const paging = parsePaging(req.query, { pageSize: 50 });

  const conditions = [];
  const params = [];
  if (level) { conditions.push('r.level = ?'); params.push(normalizeRegulationLevel(level)); }
  if (category) { conditions.push('r.category = ?'); params.push(category); }
  if (status) { conditions.push('r.status = ?'); params.push(status); }
  if (reviewStatus) { conditions.push('COALESCE(r.review_status, \'approved\') = ?'); params.push(reviewStatus); }
  if (deviceType) { conditions.push('r.device_type LIKE ?'); params.push(`%${deviceType}%`); }
  // BUG-09 缓解：中文无分词，改为「逐字符串 AND 模糊」，支持空格分词与正文命中
  if (search) {
    const terms = String(search).trim().split(/\s+/).filter(Boolean).slice(0, 5);
    for (const t of terms) {
      conditions.push(`(r.name LIKE ? OR r.code LIKE ? OR r.source LIKE ? OR r.tags LIKE ? OR EXISTS (
        SELECT 1 FROM regulation_clauses c WHERE c.regulation_id = r.id AND (c.content LIKE ? OR c.title LIKE ?)
      ))`);
      params.push(`%${t}%`, `%${t}%`, `%${t}%`, `%${t}%`, `%${t}%`, `%${t}%`);
    }
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) as count FROM regulations r ${where}`).get(...params).count;
  const out = pagedResult(paging, total, (limit, offset) =>
    db.prepare(`
      SELECT r.*, (SELECT COUNT(*) FROM regulation_clauses c WHERE c.regulation_id = r.id) AS clause_count
      FROM regulations r ${where}
      ORDER BY r.id DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset)
  );
  out.data = dt.attachIsoAll(out.data, ['created_at', 'updated_at', 'reviewed_at']);
  out.levels = REGULATION_LEVELS;
  res.json(out);
});

// 知识库五层分类字典（KB-02）
app.get('/api/regulations/levels', authMiddleware, (req, res) => {
  const db = getDb();
  const counts = db.prepare("SELECT COALESCE(level,'未分类') AS level, COUNT(*) AS count FROM regulations GROUP BY level").all();
  const countMap = new Map(counts.map(c => [c.level, c.count]));
  res.json({
    success: true,
    data: REGULATION_LEVELS.map(l => Object.assign({}, l, { count: countMap.get(l.label) || 0 })),
    uncategorized: countMap.get('未分类') || 0,
    reviewStatuses: REGULATION_REVIEW_STATUSES
  });
});

// 法规详情（知识库编辑弹窗依赖此接口，旧版本缺失导致编辑按钮失效）
app.get('/api/regulations/:id(\\d+)', authMiddleware, (req, res) => {
  const db = getDb();
  const reg = db.prepare('SELECT * FROM regulations WHERE id = ?').get(req.params.id);
  if (!reg) throw new NotFoundError('法规不存在');
  const clauses = db.prepare('SELECT * FROM regulation_clauses WHERE regulation_id = ? ORDER BY sort_order, id').all(req.params.id);
  // 版本链（KB-05）
  const versions = db.prepare(`
    SELECT id, code, name, version, effective_date, expire_date, status, review_status, revision_note, created_at
    FROM regulations WHERE code = ? OR id = ? OR supersedes_id = ? OR superseded_by_id = ?
    ORDER BY id DESC
  `).all(reg.code, reg.id, reg.id, reg.id);

  res.json(Object.assign(dt.attachIso(reg, ['created_at', 'updated_at', 'reviewed_at']), {
    clauses,
    clause_count: clauses.length,
    versions
  }));
});

// 法规版本历史（KB-05）
app.get('/api/regulations/:id/versions', authMiddleware, (req, res) => {
  const db = getDb();
  const reg = db.prepare('SELECT * FROM regulations WHERE id = ?').get(req.params.id);
  if (!reg) throw new NotFoundError('法规不存在');

  // 沿 supersedes_id 向上回溯 + superseded_by_id 向下追踪，组成完整版本链
  const chain = [];
  const seen = new Set();
  let cur = reg;
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); chain.unshift(cur); cur = cur.supersedes_id ? db.prepare('SELECT * FROM regulations WHERE id = ?').get(cur.supersedes_id) : null; }
  cur = reg.superseded_by_id ? db.prepare('SELECT * FROM regulations WHERE id = ?').get(reg.superseded_by_id) : null;
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); chain.push(cur); cur = cur.superseded_by_id ? db.prepare('SELECT * FROM regulations WHERE id = ?').get(cur.superseded_by_id) : null; }

  res.json({
    success: true,
    current: reg.id,
    data: chain.map(r => ({
      id: r.id, code: r.code, name: r.name, version: r.version || '1.0',
      effective_date: r.effective_date, expire_date: r.expire_date,
      status: r.status, review_status: r.review_status || 'approved',
      revision_note: r.revision_note, created_at: r.created_at,
      is_current: r.id === reg.id
    }))
  });
});

app.get('/api/regulations/:id/clauses', authMiddleware, (req, res) => {
  const db = getDb();
  const regulation = db.prepare('SELECT * FROM regulations WHERE id = ?').get(req.params.id);
  if (!regulation) throw new NotFoundError('法规不存在');

  const clauses = db.prepare(
    'SELECT * FROM regulation_clauses WHERE regulation_id = ? ORDER BY sort_order, id'
  ).all(req.params.id);

  // 兼容两种消费方：knowledge.ejs 用 d.clauses；research.ejs 用 d.data
  res.json({ regulation, clauses, data: clauses, total: clauses.length });
});

// ==================== API: 审核管理 ====================

app.get('/api/audit-tasks', authMiddleware, roleMiddleware('auditor', 'admin'), (req, res) => {
  const db = getDb();
  const { status } = req.query;
  const paging = parsePaging(req.query);

  // BUG-02：计数与数据语句使用相同 FROM/JOIN
  const FROM = `FROM audit_tasks at LEFT JOIN discrimination_records dr ON at.record_id = dr.id`;
  const conditions = [];
  const params = [];
  if (status) { conditions.push('at.status = ?'); params.push(status); }
  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) as count ${FROM} ${where}`).get(...params).count;
  const out = pagedResult(paging, total, (limit, offset) =>
    db.prepare(`
      SELECT at.*, dr.template_name, dr.final_result,
             dr.user_email as submitter_email, dr.created_at as submitted_at
      ${FROM} ${where}
      ORDER BY at.priority DESC, at.id DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset)
  );
  out.data = dt.attachIsoAll(out.data, ['created_at', 'updated_at', 'submitted_at', 'completed_at']);
  res.json(out);
});

app.post('/api/audit-tasks/:id/action', authMiddleware, roleMiddleware('auditor', 'admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const { action, comment } = req.body;

  if (!['approve', 'reject'].includes(action)) {
    throw new ValidationError('无效操作');
  }

  const task = db.prepare('SELECT * FROM audit_tasks WHERE id = ?').get(req.params.id);
  if (!task) throw new NotFoundError('审核任务不存在');
  if (task.status !== 'pending') {
    throw new ValidationError('该任务已处理');
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  const recordAuditStatus = action === 'approve' ? 'approved' : 'rejected';

  // BUG-07：审核意见不再静默截断，超长时明确报错（TEXT 字段本身无长度限制）
  const commentText = comment == null ? '' : String(comment);
  if (commentText.length > 5000) throw new ValidationError('审核意见过长（上限 5000 字），请精简后提交');

  const recordBefore = db.prepare('SELECT id, audit_status, audit_by, audit_comment, final_result FROM discrimination_records WHERE id = ?').get(task.record_id);

  db.prepare('UPDATE audit_tasks SET status = ?, comment = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(newStatus, commentText, req.params.id);

  db.prepare('UPDATE discrimination_records SET audit_status = ?, audit_by = ?, audit_at = CURRENT_TIMESTAMP, audit_comment = ? WHERE id = ?')
    .run(recordAuditStatus, req.user.email, commentText, task.record_id);

  const taskAfter = db.prepare('SELECT * FROM audit_tasks WHERE id = ?').get(req.params.id);
  const recordAfter = db.prepare('SELECT id, audit_status, audit_by, audit_comment, final_result FROM discrimination_records WHERE id = ?').get(task.record_id);

  logOperation(
    `审核${action === 'approve' ? '通过' : '驳回'}`,
    req.user.email,
    'audit_tasks',
    req.params.id,
    `审核任务 #${req.params.id}, 记录 #${task.record_id}, 操作: ${action === 'approve' ? '批准' : '驳回'}`,
    {
      before: { task, record: recordBefore },
      after: { task: taskAfter, record: recordAfter }
    }
  );

  res.json({ success: true, message: `审核${action === 'approve' ? '通过' : '驳回'}成功` });
}));

// ==================== API: 司法留痕 ====================

app.get('/api/operation-logs', authMiddleware, roleMiddleware('admin', 'auditor'), (req, res) => {
  const paging = parsePaging(req.query, { maxPageSize: 500 });
  const result = getLogs(paging.page, paging.pageSize, {
    action: req.query.action,
    userEmail: req.query.userEmail,
    targetType: req.query.targetType,
    ip: req.query.ip,
    from: req.query.from,
    to: req.query.to,
    search: req.query.search
  });
  res.json(result);
});

app.post('/api/operation-logs/verify', authMiddleware, roleMiddleware('auditor', 'admin'), (req, res) => {
  const result = verifyChain();
  logOperation(
    '验证哈希链',
    req.user.email,
    'operation_logs',
    0,
    `链验证结果: ${result.isValid ? '通过' : '失败'}, 验证 ${result.totalBlocks} 个区块`
  );
  res.json(result);
});

// ==================== API: 研究任务（文档对齐：template_research_task） ====================
// 详见下方 /api/template-research 系列接口（列表 / 创建 / AI建议 / 专家修订 / 发布）
// 旧 /api/research-tasks（research_tasks 表）已废弃移除。

// ==================== API: 知识库管理（法规 + 条款 CRUD） ====================

app.post('/api/regulations', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const {
    code, name, source, effective_date, expire_date, category, tags,
    level, device_type, doc_no, issuer, version, source_url, revision_note, supersedes_id
  } = req.body;
  if (!code || !name) {
    throw new ValidationError('编码和名称不能为空');
  }

  // KB-02：五层分类归一化（未填时根据编码自动推断）
  const lvl = normalizeRegulationLevel(level, code);
  // KB-04：新增法规默认进入待审核，避免未核实内容直接参与合规判别
  const requireReview = getConfig('knowledge.require_review', true);
  const reviewStatus = requireReview ? 'pending' : 'approved';
  const status = requireReview ? 'draft' : 'active';

  try {
    const info = db.prepare(`
      INSERT INTO regulations
        (code, name, source, effective_date, expire_date, category, tags, status,
         level, device_type, doc_no, issuer, version, source_url, revision_note,
         supersedes_id, review_status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      code, name, source || null,
      dt.normalizeDateOnly(effective_date), dt.normalizeDateOnly(expire_date),
      category || null, tags || null, status,
      lvl, device_type || null, doc_no || null, issuer || null,
      version || '1.0', source_url || null, revision_note || null,
      supersedes_id ? parseInt(supersedes_id, 10) : null,
      reviewStatus, req.user.email
    );

    // 版本链：标记被替代的旧版本
    if (supersedes_id) {
      db.prepare('UPDATE regulations SET superseded_by_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(info.lastInsertRowid, parseInt(supersedes_id, 10));
    }

    const created = db.prepare('SELECT * FROM regulations WHERE id = ?').get(info.lastInsertRowid);
    logOperation('新建法规', req.user.email, 'regulations', info.lastInsertRowid,
      `创建法规: ${name}（${lvl}，审核状态: ${reviewStatus}）`,
      { before: null, after: created });

    res.json({
      success: true,
      message: requireReview ? '法规已提交，待人工审核后生效' : '法规创建成功',
      id: info.lastInsertRowid,
      level: lvl,
      review_status: reviewStatus
    });
  } catch (e) {
    if (e.message.indexOf('UNIQUE') !== -1) {
      throw new ValidationError('法规编码已存在（若为修订版本，请使用新编码并填写 supersedes_id）');
    }
    throw e;
  }
}));

app.put('/api/regulations/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const {
    code, name, source, effective_date, expire_date, category, tags, status,
    level, device_type, doc_no, issuer, version, source_url, revision_note
  } = req.body;
  const existing = db.prepare('SELECT * FROM regulations WHERE id = ?').get(req.params.id);
  if (!existing) throw new NotFoundError('法规不存在');

  db.prepare(`
    UPDATE regulations SET
      code = COALESCE(?, code),
      name = COALESCE(?, name),
      source = ?,
      effective_date = ?,
      expire_date = ?,
      category = ?,
      tags = ?,
      status = COALESCE(?, status),
      level = COALESCE(?, level),
      device_type = ?,
      doc_no = ?,
      issuer = ?,
      version = COALESCE(?, version),
      source_url = ?,
      revision_note = COALESCE(?, revision_note),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    code, name, source || null,
    dt.normalizeDateOnly(effective_date), dt.normalizeDateOnly(expire_date),
    category || null, tags || null, status,
    level ? normalizeRegulationLevel(level, code || existing.code) : null,
    device_type || null, doc_no || null, issuer || null,
    version || null, source_url || null, revision_note || null,
    req.params.id
  );

  const after = db.prepare('SELECT * FROM regulations WHERE id = ?').get(req.params.id);
  // LOG-03：修改前后对比入链
  logOperation('更新法规', req.user.email, 'regulations', req.params.id,
    '更新法规: ' + (name || existing.name),
    { before: existing, after });
  res.json({ success: true, message: '法规更新成功' });
}));

/**
 * KB-04：法规人工审核工作流
 * 管理员确认有效性，并补充设备类型与层级（需求文档 1.5）
 */
app.post('/api/regulations/:id/review', authMiddleware, roleMiddleware('admin', 'auditor'), asyncHandler(async (req, res) => {
  const db = getDb();
  const { decision, note, level, device_type } = req.body || {};
  if (!['approve', 'reject', 'pending'].includes(decision)) {
    throw new ValidationError('decision 必须为 approve / reject / pending');
  }
  const existing = db.prepare('SELECT * FROM regulations WHERE id = ?').get(req.params.id);
  if (!existing) throw new NotFoundError('法规不存在');
  if (decision === 'reject' && !String(note || '').trim()) {
    throw new ValidationError('驳回时必须填写审核意见');
  }

  const reviewStatus = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'pending';
  const newStatus = decision === 'approve' ? 'active' : decision === 'reject' ? 'archived' : 'draft';

  db.prepare(`
    UPDATE regulations SET
      review_status = ?, status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
      review_note = ?,
      level = COALESCE(?, level),
      device_type = COALESCE(?, device_type),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    reviewStatus, newStatus, req.user.email, note || null,
    level ? normalizeRegulationLevel(level, existing.code) : null,
    device_type || null,
    req.params.id
  );

  const after = db.prepare('SELECT * FROM regulations WHERE id = ?').get(req.params.id);
  logOperation(`法规审核${decision === 'approve' ? '通过' : decision === 'reject' ? '驳回' : '挂起'}`,
    req.user.email, 'regulations', req.params.id,
    `法规 #${req.params.id} ${existing.name} → ${reviewStatus}${note ? '；意见: ' + note : ''}`,
    { before: existing, after });

  res.json({ success: true, message: '审核已提交', review_status: reviewStatus, status: newStatus });
}));

/**
 * KB-05：创建法规新版本（旧版本自动归档并建立版本链）
 */
app.post('/api/regulations/:id/new-version', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const old = db.prepare('SELECT * FROM regulations WHERE id = ?').get(req.params.id);
  if (!old) throw new NotFoundError('法规不存在');

  const { code, version, effective_date, revision_note, copyClauses = true } = req.body || {};
  const newCode = code || `${old.code}-v${(parseFloat(old.version || '1.0') + 0.1).toFixed(1)}`;
  const newVersion = version || (parseFloat(old.version || '1.0') + 0.1).toFixed(1);

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO regulations
        (code, name, source, effective_date, category, tags, status, level, device_type,
         doc_no, issuer, version, revision_note, supersedes_id, review_status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      newCode, old.name, old.source, dt.normalizeDateOnly(effective_date) || old.effective_date,
      old.category, old.tags, old.level, old.device_type, old.doc_no, old.issuer,
      newVersion, revision_note || null, old.id, req.user.email
    );
    const newId = info.lastInsertRowid;

    db.prepare('UPDATE regulations SET superseded_by_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newId, old.id);

    if (copyClauses) {
      const clauses = db.prepare('SELECT * FROM regulation_clauses WHERE regulation_id = ? ORDER BY sort_order, id').all(old.id);
      const ins = db.prepare(`INSERT INTO regulation_clauses
        (regulation_id, clause_number, title, content, category, tags, severity, sort_order, effective_date, device_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      clauses.forEach(c => ins.run(newId, c.clause_number, c.title, c.content, c.category, c.tags, c.severity, c.sort_order, c.effective_date || null, c.device_type || null));
    }
    return newId;
  });
  const newId = tx();

  const created = db.prepare('SELECT * FROM regulations WHERE id = ?').get(newId);
  logOperation('创建法规新版本', req.user.email, 'regulations', newId,
    `基于 #${old.id}(${old.code} v${old.version || '1.0'}) 创建 → #${newId}(${newCode} v${newVersion})`,
    { before: old, after: created });

  res.json({ success: true, id: newId, code: newCode, version: newVersion, message: '新版本已创建，待审核后生效' });
}));

app.delete('/api/regulations/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM regulations WHERE id = ?').get(req.params.id);
  if (!existing) throw new NotFoundError('法规不存在');

  const clauses = db.prepare('SELECT * FROM regulation_clauses WHERE regulation_id = ?').all(req.params.id);
  db.prepare('DELETE FROM regulation_clauses WHERE regulation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM regulations WHERE id = ?').run(req.params.id);
  logOperation('删除法规', req.user.email, 'regulations', req.params.id,
    `删除法规: ${existing.name}（连带条款 ${clauses.length} 条）`,
    { before: Object.assign({}, existing, { __clauseCount: clauses.length }), after: null });
  res.json({ success: true, message: '法规删除成功' });
}));

app.post('/api/regulations/:id/clauses', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const regulationId = req.params.id;
  // KB-03：条款级结构化（编号 / 内容 / 生效日期 / 适用设备类型）
  const { clause_number, title, content, category, severity, effective_date, device_type, sort_order, tags } = req.body;
  const regulation = db.prepare('SELECT * FROM regulations WHERE id = ?').get(regulationId);
  if (!regulation) throw new NotFoundError('法规不存在');
  if (!clause_number || !content) {
    throw new ValidationError('条款编号和内容不能为空');
  }
  if (severity && !['mandatory', 'recommended', 'optional'].includes(severity)) {
    throw new ValidationError('无效的严重级别，应为 mandatory/recommended/optional');
  }

  const nextSort = Number.isFinite(parseInt(sort_order, 10))
    ? parseInt(sort_order, 10)
    : (db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM regulation_clauses WHERE regulation_id = ?').get(regulationId).n);

  const info = db.prepare(`
    INSERT INTO regulation_clauses
      (regulation_id, clause_number, title, content, category, tags, severity, sort_order, effective_date, device_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    regulationId, clause_number, title || null, content, category || null, tags || null,
    severity || 'mandatory', nextSort,
    dt.normalizeDateOnly(effective_date) || regulation.effective_date || null,
    device_type || regulation.device_type || null
  );

  const created = db.prepare('SELECT * FROM regulation_clauses WHERE id = ?').get(info.lastInsertRowid);
  logOperation('添加条款', req.user.email, 'regulation_clauses', info.lastInsertRowid,
    '添加到法规#' + regulationId + ': 第' + clause_number + '条',
    { before: null, after: created });
  res.json({ success: true, message: '条款添加成功', id: info.lastInsertRowid });
}));

app.put('/api/clauses/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const { clause_number, title, content, category, severity, effective_date, device_type, sort_order, tags } = req.body;
  const existing = db.prepare('SELECT * FROM regulation_clauses WHERE id = ?').get(req.params.id);
  if (!existing) throw new NotFoundError('条款不存在');

  db.prepare(`
    UPDATE regulation_clauses SET
      clause_number = COALESCE(?, clause_number),
      title = COALESCE(?, title),
      content = COALESCE(?, content),
      category = COALESCE(?, category),
      tags = COALESCE(?, tags),
      severity = COALESCE(?, severity),
      sort_order = COALESCE(?, sort_order),
      effective_date = COALESCE(?, effective_date),
      device_type = COALESCE(?, device_type)
    WHERE id = ?
  `).run(
    clause_number, title, content, category, tags, severity,
    Number.isFinite(parseInt(sort_order, 10)) ? parseInt(sort_order, 10) : null,
    dt.normalizeDateOnly(effective_date), device_type || null,
    req.params.id
  );

  const after = db.prepare('SELECT * FROM regulation_clauses WHERE id = ?').get(req.params.id);
  logOperation('更新条款', req.user.email, 'regulation_clauses', req.params.id,
    '更新条款#' + req.params.id + ': 第' + (clause_number || existing.clause_number) + '条',
    { before: existing, after });
  res.json({ success: true, message: '条款更新成功' });
}));

app.delete('/api/clauses/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM regulation_clauses WHERE id = ?').get(req.params.id);
  if (!existing) throw new NotFoundError('条款不存在');
  
  db.prepare('DELETE FROM regulation_clauses WHERE id = ?').run(req.params.id);
  logOperation('删除条款', req.user.email, 'regulation_clauses', req.params.id,
    '删除条款#' + req.params.id, { before: existing, after: null });
  res.json({ success: true, message: '条款删除成功' });
}));

// ==================== P0.1: 模板研究工作流（AI辅助专家设计） ====================

// 获取模板研究任务列表（支持分页和状态筛选）
app.get('/api/template-research', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const { status } = req.query;
  const paging = parsePaging(req.query);

  const where = ['1=1'];
  const params = [];
  if (status) { where.push('t.status = ?'); params.push(status); }
  const whereClause = 'WHERE ' + where.join(' AND ');

  const total = db.prepare('SELECT COUNT(*) as c FROM template_research_task t ' + whereClause).get(...params).c;
  const out = pagedResult(paging, total, (limit, offset) =>
    db.prepare(
      'SELECT t.*, u.name as expert_name, ' +
      '(SELECT COUNT(*) FROM template_ai_suggestion WHERE task_id = t.id) as suggestion_count, ' +
      "(SELECT COUNT(*) FROM template_ai_suggestion WHERE task_id = t.id AND final_output_json IS NOT NULL) as reviewed_count " +
      'FROM template_research_task t LEFT JOIN users u ON t.expert_id = u.id ' + whereClause +
      ' ORDER BY t.id DESC LIMIT ? OFFSET ?'
    ).all(...params, limit, offset)
  );
  out.data = dt.attachIsoAll(out.data, ['created_at', 'updated_at', 'completed_at']);
  out.success = true;
  res.json(out);
}));
// 获取单个模板研究任务详情
app.get('/api/template-research/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const task = db.prepare(`
    SELECT t.*, u.name as expert_name
    FROM template_research_task t
    LEFT JOIN users u ON t.expert_id = u.id
    WHERE t.id = ?
  `).get(req.params.id);
  if (!task) throw new NotFoundError('研究任务不存在');
  
  // 获取AI建议列表（按 id 降序，避免 created_at 同秒时顺序不稳定）
  const suggestions = db.prepare('SELECT * FROM template_ai_suggestion WHERE task_id = ? ORDER BY id DESC').all(req.params.id);
  
  // 获取关联的法规条款
  let clauses = [];
  if (task.selected_clause_ids) {
    const clauseIds = task.selected_clause_ids.split(',').map(id => parseInt(id.trim())).filter(id => id);
    if (clauseIds.length > 0) {
      clauses = db.prepare(`
        SELECT c.*, r.name as regulation_name
        FROM regulation_clauses c
        JOIN regulations r ON c.regulation_id = r.id
        WHERE c.id IN (${clauseIds.map(() => '?').join(',')})
      `).all(...clauseIds);
    }
  }
  
  res.json({ success: true, data: { ...task, suggestions, clauses } });
}));

// 创建模板研究任务
app.post('/api/template-research', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const { task_name, task_description, standards, selected_clause_ids, selected_clause_text } = req.body;
  if (!task_name) throw new ValidationError('任务名称不能为空');
  
  const result = db.prepare(`
    INSERT INTO template_research_task 
    (task_name, task_description, standards, selected_clause_ids, selected_clause_text, expert_id, expert_name, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)
  `).run(
    task_name,
    task_description || '',
    standards || '',
    selected_clause_ids || '',
    selected_clause_text || '',
    req.user.id,
    req.user.name || req.user.email,
    req.user.email
  );
  
  logOperation('创建模板研究任务', req.user.email, 'template_research_task', result.lastInsertRowid, `创建任务: ${task_name}`);
  res.json({ success: true, id: result.lastInsertRowid, message: '研究任务创建成功' });
}));

// P0.1: AI生成模板建议（核心功能）
app.post('/api/template-research/:id/ai-suggest', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM template_research_task WHERE id = ?').get(req.params.id);
  if (!task) throw new NotFoundError('研究任务不存在');
  
  // 构建AI提示词
  let prompt = `你是一个专业的特种设备安全管理专家。请根据以下标准和要求，辅助设计电梯模板。\n\n`;
  if (task.standards) {
    prompt += `【模板设计标准】\n${task.standards}\n\n`;
  }
  if (task.selected_clause_text) {
    prompt += `【相关法规条款】\n${task.selected_clause_text}\n\n`;
  }
  prompt += `请生成JSON格式的模板建议，包含以下内容：
{
  "template_name": "模板名称",
  "template_code": "TPL_ELEV_XXX_001",
  "device_type": "曳引电梯",
  "process_stage": "维保/检验/注册登记等",
  "fields": [
    {"name": "字段名", "label": "显示名称", "type": "text", "required": true, "options": ["选项1", "选项2"]}
  ],
  "rules": [
    {"condition": "字段名 比较符 值", "result": "合规/不合规", "message": "提示信息", "severity": "mandatory"}
  ],
  "output_template": "根据{{template_name}}，{{字段名}}..."
}

只输出JSON，不要其他文字。`;
  
  // 调用AI服务：Coze 优先 → Ollama → 离线模板骨架
  let aiResult = null;
  let modelName = '规则引擎（离线）';

  const cozeCfg = cozeService.cozeConfig();
  if (cozeCfg.enabled) {
    try {
      const raw = await cozeService.callCozeBot(prompt);
      const parsed = cozeService.extractJson(raw);
      if (parsed && Array.isArray(parsed.fields)) {
        aiResult = parsed;
        modelName = cozeCfg.workflowId ? 'coze-workflow' : 'coze-bot';
      }
    } catch (e) {
      console.log('[AI] Coze 生成模板建议失败，降级:', e.message);
    }
  }

  if (!aiResult) {
    try {
      const aiResponseText = await aiService.callOllama('qwen2.5:0.5b', prompt);
      if (aiResponseText) {
        const parsed = cozeService.extractJson(aiResponseText);
        if (parsed && Array.isArray(parsed.fields)) {
          aiResult = parsed;
          modelName = 'qwen2.5:0.5b';
        }
      }
    } catch (e) {
      console.log('[AI] Ollama调用失败，使用规则引擎生成建议:', e.message);
    }
  }
  
  // 如果AI失败，使用规则引擎生成基础建议
  if (!aiResult) {
    aiResult = {
      template_name: task.task_name || '电梯维保合规审核',
      template_code: `TPL_ELEV_MAINT_${String(task.id).padStart(3, '0')}`,
      device_type: '曳引电梯',
      process_stage: '维保',
      fields: [
        { name: 'maintenance_date', label: '维保日期', type: 'date', required: true },
        { name: 'maintenance_interval', label: '维保间隔（天）', type: 'number', required: true },
        { name: 'wire_rope_wear_rate', label: '钢丝绳磨损率（%）', type: 'number', required: true },
        { name: 'brake_status', label: '制动器状态', type: 'select', required: true, options: ['正常', '异常'] },
        { name: 'door_lock_status', label: '门锁状态', type: 'select', required: true, options: ['正常', '异常'] },
        { name: 'inspector_name', label: '维保人员', type: 'text', required: true },
        { name: 'maintenance_company', label: '维保单位', type: 'text', required: true }
      ],
      rules: [
        { condition: 'wire_rope_wear_rate <= 7', result: '合规', message: '钢丝绳磨损率未超限', severity: 'mandatory' },
        { condition: 'wire_rope_wear_rate > 7', result: '不合规', message: '钢丝绳磨损率超过7%，需立即更换', severity: 'mandatory' },
        { condition: 'maintenance_interval <= 15', result: '合规', message: '维保间隔符合要求', severity: 'mandatory' },
        { condition: 'maintenance_interval > 15', result: '不合规', message: '维保间隔超过15天', severity: 'mandatory' },
        { condition: 'brake_status == "正常"', result: '合规', message: '制动器状态正常', severity: 'mandatory' },
        { condition: 'brake_status == "异常"', result: '不合规', message: '制动器状态异常，需维修', severity: 'mandatory' }
      ],
      output_template: '根据{{template_name}}，钢丝绳磨损率为{{wire_rope_wear_rate}}%，维保间隔为{{maintenance_interval}}天，制动器状态{{brake_status}}。综合判定：{{final_result}}。'
    };
    modelName = '规则引擎（离线）';
  }
  
  // 保存AI建议记录
  const aiSuggestion = db.prepare(`
    INSERT INTO template_ai_suggestion 
    (task_id, input_prompt, ai_output_json, model_name, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(req.params.id, prompt, JSON.stringify(aiResult, null, 2), modelName);
  
  // 更新任务状态
  db.prepare('UPDATE template_research_task SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run('ai_generated', req.params.id);
  
  logOperation('AI生成模板建议', req.user.email, 'template_ai_suggestion', aiSuggestion.lastInsertRowid,
    `任务#${req.params.id} AI建议生成完成（模型: ${modelName}，字段 ${(aiResult.fields || []).length} 项，规则 ${(aiResult.rules || []).length} 条）`,
    { before: null, after: { suggestion_id: aiSuggestion.lastInsertRowid, model: modelName, ai_output: aiResult } });
  
  res.json({ 
    success: true, 
    message: 'AI建议生成成功',
    data: {
      suggestion_id: aiSuggestion.lastInsertRowid,
      suggestion: aiResult,
      model: modelName
    }
  });
}));

// P0.1: 专家修改AI建议
app.put('/api/template-research/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM template_research_task WHERE id = ?').get(req.params.id);
  if (!task) throw new NotFoundError('研究任务不存在');
  
  const { expert_modifications, expert_feedback, suggestion_id } = req.body;

  const sid = suggestion_id || (db.prepare('SELECT id FROM template_ai_suggestion WHERE task_id = ? ORDER BY id DESC LIMIT 1').get(req.params.id) || {}).id;
  let before = null;
  if (sid) {
    before = db.prepare('SELECT * FROM template_ai_suggestion WHERE id = ?').get(sid);
    db.prepare(`
      UPDATE template_ai_suggestion 
      SET expert_modifications = ?, expert_feedback = ?, status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      expert_modifications || '',
      expert_feedback || '',
      expert_modifications ? 'modified' : 'pending',
      req.user.email,
      sid
    );
  }
  
  // 更新任务状态
  db.prepare('UPDATE template_research_task SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run('expert_review', req.params.id);
  
  const after = sid ? db.prepare('SELECT * FROM template_ai_suggestion WHERE id = ?').get(sid) : null;
  logOperation('专家修改模板建议', req.user.email, 'template_research_task', req.params.id,
    `专家修改任务#${req.params.id}建议`, { before, after });
  res.json({ success: true, message: '修改已保存', suggestion_id: sid });
}));

/**
 * TR-03 / TR-04：专家逐条审阅 AI 建议（接受 / 拒绝 / 修改），并完整留痕差异
 *
 * 请求体：
 *   {
 *     decisions: {
 *       fields: [{ index, action: 'accept'|'reject'|'modify', value?: {...}, note?: '' }],
 *       rules:  [{ index, action, value?, note? }],
 *       meta:   { template_name?, template_code?, output_template? }
 *     },
 *     feedback: '专家总体意见'
 *   }
 * 返回：专家定稿 final_output_json + 与 AI 原始建议的差异摘要
 */
app.post('/api/template-research/:id/suggestions/:sid/review', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM template_research_task WHERE id = ?').get(req.params.id);
  if (!task) throw new NotFoundError('研究任务不存在');
  const suggestion = db.prepare('SELECT * FROM template_ai_suggestion WHERE id = ? AND task_id = ?').get(req.params.sid, req.params.id);
  if (!suggestion) throw new NotFoundError('AI 建议不存在');

  const { decisions = {}, feedback = '' } = req.body || {};
  let aiDraft = {};
  try { aiDraft = JSON.parse(suggestion.ai_output_json || '{}'); } catch (_) { aiDraft = {}; }

  // 按决策重建专家定稿
  const applyList = (originalList, decisionList) => {
    const orig = Array.isArray(originalList) ? originalList : [];
    const decs = Array.isArray(decisionList) ? decisionList : [];
    const byIndex = new Map(decs.map(d => [Number(d.index), d]));
    const out = [];
    const trace = [];
    orig.forEach((item, i) => {
      const d = byIndex.get(i);
      const action = d ? String(d.action || 'accept') : 'accept';
      if (action === 'reject') { trace.push({ index: i, action: 'reject', note: d && d.note || '' }); return; }
      if (action === 'modify' && d && d.value && typeof d.value === 'object') {
        out.push(d.value);
        trace.push({ index: i, action: 'modify', from: item, to: d.value, note: d.note || '' });
        return;
      }
      out.push(item);
      trace.push({ index: i, action: 'accept' });
    });
    // 专家新增项（index 超出原始长度）
    decs.filter(d => Number(d.index) >= orig.length && d.action !== 'reject' && d.value)
        .forEach(d => { out.push(d.value); trace.push({ index: Number(d.index), action: 'add', to: d.value, note: d.note || '' }); });
    return { list: out, trace };
  };

  const fieldsResult = applyList(aiDraft.fields, decisions.fields);
  const rulesResult = applyList(aiDraft.rules, decisions.rules);
  const meta = decisions.meta || {};

  const finalOutput = Object.assign({}, aiDraft, {
    template_name: meta.template_name || aiDraft.template_name,
    template_code: meta.template_code || aiDraft.template_code,
    output_template: meta.output_template || aiDraft.output_template,
    fields: fieldsResult.list,
    rules: rulesResult.list
  });

  const diffSummary = {
    fields: {
      ai: (aiDraft.fields || []).length,
      final: fieldsResult.list.length,
      accepted: fieldsResult.trace.filter(t => t.action === 'accept').length,
      rejected: fieldsResult.trace.filter(t => t.action === 'reject').length,
      modified: fieldsResult.trace.filter(t => t.action === 'modify').length,
      added: fieldsResult.trace.filter(t => t.action === 'add').length,
      trace: fieldsResult.trace
    },
    rules: {
      ai: (aiDraft.rules || []).length,
      final: rulesResult.list.length,
      accepted: rulesResult.trace.filter(t => t.action === 'accept').length,
      rejected: rulesResult.trace.filter(t => t.action === 'reject').length,
      modified: rulesResult.trace.filter(t => t.action === 'modify').length,
      added: rulesResult.trace.filter(t => t.action === 'add').length,
      trace: rulesResult.trace
    },
    metaChanged: Object.keys(meta).filter(k => meta[k] && meta[k] !== aiDraft[k]),
    reviewedBy: req.user.email,
    reviewedAt: new Date().toISOString()
  };

  const anyChange = diffSummary.fields.rejected + diffSummary.fields.modified + diffSummary.fields.added +
                    diffSummary.rules.rejected + diffSummary.rules.modified + diffSummary.rules.added +
                    diffSummary.metaChanged.length;

  db.prepare(`
    UPDATE template_ai_suggestion SET
      expert_decisions = ?, final_output_json = ?, diff_summary = ?,
      expert_feedback = ?, status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    JSON.stringify(decisions),
    JSON.stringify(finalOutput, null, 2),
    JSON.stringify(diffSummary),
    feedback || '',
    anyChange > 0 ? 'modified' : 'approved',
    req.user.email,
    req.params.sid
  );

  db.prepare('UPDATE template_research_task SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run('expert_review', req.params.id);

  // TR-04：大模型原始建议与专家修改的差异入链留痕
  logOperation('专家审阅AI建议', req.user.email, 'template_ai_suggestion', req.params.sid,
    `任务#${req.params.id} 建议#${req.params.sid}：字段 接受${diffSummary.fields.accepted}/拒绝${diffSummary.fields.rejected}/修改${diffSummary.fields.modified}/新增${diffSummary.fields.added}；` +
    `规则 接受${diffSummary.rules.accepted}/拒绝${diffSummary.rules.rejected}/修改${diffSummary.rules.modified}/新增${diffSummary.rules.added}`,
    { before: { ai_draft: aiDraft }, after: { final: finalOutput, diff: diffSummary } });

  res.json({ success: true, message: '审阅已保存', data: { final: finalOutput, diff: diffSummary } });
}));

// P0.1: 发布模板（核心功能）
app.put('/api/template-research/:id/publish', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM template_research_task WHERE id = ?').get(req.params.id);
  if (!task) throw new NotFoundError('研究任务不存在');
  
  // 获取最新AI建议（按 id 降序，created_at 同秒时也能稳定取最新一条）
  const suggestion = db.prepare('SELECT * FROM template_ai_suggestion WHERE task_id = ? ORDER BY id DESC LIMIT 1')
    .get(req.params.id);
  if (!suggestion) throw new ValidationError('没有可发布的AI建议');

  // TR-03：优先发布**专家定稿**（final_output_json），无定稿时才回退到 AI 原始建议。
  // 需求文档 2.3：必须由专家确认后入库，不得直接发布大模型输出。
  let aiData;
  let publishSource;
  try {
    if (suggestion.final_output_json) {
      aiData = JSON.parse(suggestion.final_output_json);
      publishSource = 'expert_final';
    } else {
      aiData = JSON.parse(suggestion.ai_output_json || '{}');
      publishSource = 'ai_draft';
    }
  } catch (e) {
    throw new ValidationError('建议内容解析失败，无法发布');
  }
  if (!aiData || !Array.isArray(aiData.fields) || aiData.fields.length === 0) {
    throw new ValidationError('建议中没有有效字段定义，无法发布');
  }
  
  // 生成唯一模板编码（避免与已有模板 UNIQUE 冲突）
  let baseCode = aiData.template_code || `TPL_${Date.now()}`;
  let tplCode = baseCode;
  let suffix = 1;
  while (db.prepare('SELECT 1 FROM templates WHERE code = ?').get(tplCode)) {
    tplCode = `${baseCode}_${suffix++}`;
  }

  // 发布整体包裹在事务中：任一步失败回滚，避免产生孤儿模板/字段
  const publishTx = db.transaction(() => {
    const templateResult = db.prepare(`
      INSERT INTO templates (code, name, category, description, regulation_ids, status, created_by)
      VALUES (?, ?, ?, ?, ?, 'draft', ?)
    `).run(
      tplCode,
      aiData.template_name || task.task_name,
      aiData.process_stage || '通用',
      task.task_description || '',
      task.selected_clause_ids || '',
      req.user.email
    );
    const templateId = templateResult.lastInsertRowid;

    // 创建模板字段
    if (aiData.fields && Array.isArray(aiData.fields)) {
      const fieldStmt = db.prepare(`
        INSERT INTO template_fields (template_id, field_name, field_label, field_type, required, options, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      aiData.fields.forEach((field, idx) => {
        fieldStmt.run(
          templateId,
          field.name,
          field.label,
          ['text','number','date','select','textarea','checkbox','radio','file'].includes(field.type) ? field.type : 'text',
          field.required ? 1 : 0,
          // BUG-05：选项统一归一化为 JSON 数组字符串，避免产生新的脏格式
          serializeFieldOptions(field.options),
          idx
        );
      });
    }

    // 创建模板规则
    if (aiData.rules && Array.isArray(aiData.rules)) {
      const ruleStmt = db.prepare(`
        INSERT INTO template_rules (template_id, rule_name, rule_type, rule_config, clause_ref, description, severity, priority, enabled, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);
      aiData.rules.forEach((rule, idx) => {
        const ruleConfig = { condition: rule.condition, result: rule.result, message: rule.message };
        ruleStmt.run(
          templateId,
          `规则${idx + 1}`,
          'COMPARE',
          JSON.stringify(ruleConfig),
          rule.ref_knowledge_ids || '',
          rule.message || '',
          ['mandatory','recommended','optional'].includes(rule.severity) ? rule.severity : 'mandatory',
          idx,
          req.user.email
        );
      });
    }

    // 更新研究任务状态
    db.prepare(`
      UPDATE template_research_task 
      SET status = ?, published_template_id = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run('published', templateId, req.params.id);

    // 更新AI建议状态
    db.prepare('UPDATE template_ai_suggestion SET status = ? WHERE id = ?').run('approved', suggestion.id);

    return templateId;
  });
  const templateId = publishTx();

  let diffSummary = null;
  try { diffSummary = suggestion.diff_summary ? JSON.parse(suggestion.diff_summary) : null; } catch (_) {}

  logOperation('发布模板', req.user.email, 'template_research_task', req.params.id,
    `发布模板#${templateId}: ${aiData.template_name}（来源: ${publishSource === 'expert_final' ? '专家定稿' : 'AI原始建议'}）`,
    {
      before: { task_status: task.status, published_template_id: task.published_template_id },
      after: { task_status: 'published', published_template_id: templateId, publish_source: publishSource, diff: diffSummary }
    });

  res.json({ 
    success: true, 
    message: publishSource === 'expert_final' ? '专家定稿已发布为正式模板' : '模板发布成功（未经专家逐条审阅，建议补充审阅记录）',
    data: {
      template_id: templateId,
      template_name: aiData.template_name,
      publish_source: publishSource,
      diff_summary: diffSummary
    }
  });
}));

// 删除研究任务
app.delete('/api/template-research/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM template_research_task WHERE id = ?').get(req.params.id);
  if (!task) throw new NotFoundError('研究任务不存在');
  db.prepare('DELETE FROM template_ai_suggestion WHERE task_id = ?').run(req.params.id);
  db.prepare('DELETE FROM template_research_task WHERE id = ?').run(req.params.id);
  logOperation('删除研究任务', req.user.email, 'template_research_task', req.params.id, `删除研究任务: ${task.task_name || req.params.id}`);
  res.json({ success: true, message: '研究任务已删除' });
}));

// ==================== P0.2: WORM存储索引系统（司法封存） ====================

// 获取WORM封存状态
app.get('/api/logs/worm-status', authMiddleware, roleMiddleware('auditor', 'admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  
  // 获取最新封存记录
  const latestSeal = db.prepare('SELECT * FROM worm_storage_index ORDER BY id DESC LIMIT 1').get();
  
  // 获取总日志数
  const totalLogs = db.prepare('SELECT COUNT(*) as count FROM operation_logs').get().count;
  
  // 获取未封存日志数
  const lastSealedId = latestSeal ? latestSeal.end_log_id : 0;
  const unsealedCount = db.prepare('SELECT COUNT(*) as count FROM operation_logs WHERE id > ?').get(lastSealedId).count;
  
  // 获取所有封存记录
  const seals = db.prepare('SELECT * FROM worm_storage_index ORDER BY id DESC LIMIT 20').all();
  
  res.json({
    success: true,
    data: {
      latest_seal: latestSeal,
      total_logs: totalLogs,
      unsealed_count: unsealedCount,
      seals: seals,
      ready_to_seal: unsealedCount >= 100 // 满100条可封存
    }
  });
}));

// 手动触发WORM封存（计算Merkle根）
app.post('/api/logs/seal', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const db = getDb();
  const crypto = require('crypto');
  
  // 获取最新封存记录
  const latestSeal = db.prepare('SELECT * FROM worm_storage_index ORDER BY id DESC LIMIT 1').get();
  const startLogId = latestSeal ? latestSeal.end_log_id + 1 : 1;
  
  // 获取待封存日志（最多100条）
  const logs = db.prepare(`
    SELECT * FROM operation_logs 
    WHERE id >= ? 
    ORDER BY id ASC 
    LIMIT 100
  `).all(startLogId);
  
  if (logs.length === 0) {
    throw new ValidationError('没有可封存的日志');
  }
  
  // 与种子封存一致：Merkle 树基于 operation_logs.hash（链式区块哈希）构建。
  const logHashes = logs.map(log => log.hash);
  
  // 计算Merkle根
  function computeMerkleRoot(hashes) {
    if (hashes.length === 0) return crypto.createHash('sha256').update('').digest('hex');
    if (hashes.length === 1) return hashes[0];
    
    const newLevel = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = hashes[i + 1] || left;
      const combined = left + right;
      newLevel.push(crypto.createHash('sha256').update(combined).digest('hex'));
    }
    return computeMerkleRoot(newLevel);
  }
  
  const merkleRoot = computeMerkleRoot(logHashes);
  const blockHash = crypto.createHash('sha256').update(merkleRoot + Date.now()).digest('hex');
  
  // 保存封存记录
  const endLogId = logs[logs.length - 1].id;
  const sealResult = db.prepare(`
    INSERT INTO worm_storage_index 
    (start_log_id, end_log_id, merkle_root, block_hash, sealed_by, record_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(startLogId, endLogId, merkleRoot, blockHash, req.user.email, logs.length);
  
  logOperation('WORM封存', req.user.email, 'worm_storage_index', sealResult.lastInsertRowid, 
    `封存日志#${startLogId}-#${endLogId}，共${logs.length}条，Merkle根: ${merkleRoot}`);
  
  res.json({
    success: true,
    message: '封存成功',
    data: {
      seal_id: sealResult.lastInsertRowid,
      start_log_id: startLogId,
      end_log_id: endLogId,
      record_count: logs.length,
      merkle_root: merkleRoot,
      block_hash: blockHash
    }
  });
}));

// 验证WORM封存完整性
app.get('/api/logs/verify-seal/:sealId', authMiddleware, roleMiddleware('auditor'), asyncHandler(async (req, res) => {
  const db = getDb();
  const crypto = require('crypto');
  
  const seal = db.prepare('SELECT * FROM worm_storage_index WHERE id = ?').get(req.params.sealId);
  if (!seal) throw new NotFoundError('封存记录不存在');
  
  // 重新计算Merkle根
  const logs = db.prepare(`
    SELECT * FROM operation_logs 
    WHERE id >= ? AND id <= ?
    ORDER BY id ASC
  `).all(seal.start_log_id, seal.end_log_id);
  
  // 与封存时一致：Merkle 树基于 operation_logs.hash（链式区块哈希）构建。
  // 字段级完整性由独立的 verifyChain() 校验（每块 hash = sha256(payload+prev_hash)），二者互补。
  const logHashes = logs.map(log => log.hash);
  
  function computeMerkleRoot(hashes) {
    if (hashes.length === 0) return crypto.createHash('sha256').update('').digest('hex');
    if (hashes.length === 1) return hashes[0];
    const newLevel = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = hashes[i + 1] || left;
      const combined = left + right;
      newLevel.push(crypto.createHash('sha256').update(combined).digest('hex'));
    }
    return computeMerkleRoot(newLevel);
  }
  
  const computedRoot = computeMerkleRoot(logHashes);
  const isValid = computedRoot === seal.merkle_root;
  
  res.json({
    success: true,
    data: {
      seal_id: seal.id,
      is_valid: isValid,
      stored_merkle_root: seal.merkle_root,
      computed_merkle_root: computedRoot,
      record_count: logs.length,
      sealed_at: seal.seal_time,
      sealed_by: seal.sealed_by
    }
  });
}));


// =========== P0.2: WORM存储索引系统 ===========

const crypto = require('crypto');

// 计算Merkle根
function computeMerkleRoot(hashes) {
  if (!hashes || hashes.length === 0) return crypto.createHash('sha256').update('empty').digest('hex');
  if (hashes.length === 1) return hashes[0];
  const pairs = [];
  for (let i = 0; i < hashes.length; i += 2) {
    const right = hashes[i + 1] || hashes[i];
    pairs.push(crypto.createHash('sha256').update(hashes[i] + right).digest('hex'));
  }
  return computeMerkleRoot(pairs);
}

// 手动触发WORM封存
app.post('/api/logs/worm-seal', authMiddleware, roleMiddleware('admin'), (req, res) => {
  const db = getDb();
  const SEALS_EVERY = 100;
  const lastSeal = db.prepare('SELECT end_log_id FROM worm_storage_index ORDER BY id DESC LIMIT 1').get();
  const startLogId = lastSeal ? lastSeal.end_log_id + 1 : 1;
  const logs = db.prepare('SELECT * FROM operation_logs WHERE id >= ? ORDER BY id ASC LIMIT ?').all(startLogId, SEALS_EVERY);
  if (logs.length === 0) return res.json({ code: 200, message: '没有需要封存的日志', data: { sealed: false, count: 0 } });

  const endLogId = logs[logs.length - 1].id;
  const merkleRoot = computeMerkleRoot(logs.map(l => l.hash));
  const blockHash = crypto.createHash('sha256').update(JSON.stringify({ startLogId, endLogId, merkleRoot, logCount: logs.length, timestamp: new Date().toISOString() })).digest('hex');

  const result = db.prepare('INSERT INTO worm_storage_index (start_log_id, end_log_id, merkle_root, block_hash, sealed_by, record_count) VALUES (?, ?, ?, ?, ?, ?)').run(startLogId, endLogId, merkleRoot, blockHash, req.user.email, logs.length);

  logOperation('WORM封存', req.user.email, 'worm_storage_index', result.lastInsertRowid, '封存区块#' + result.lastInsertRowid + '，日志ID: ' + startLogId + '-' + endLogId + '，记录数: ' + logs.length + '，Merkle根: ' + merkleRoot.substring(0, 16) + '...');
  res.json({ code: 200, message: '封存成功', data: { sealed: true, sealId: result.lastInsertRowid, startLogId, endLogId, merkleRoot, blockHash, recordCount: logs.length } });
});

// 验证WORM封存完整性
app.post('/api/logs/worm-verify', authMiddleware, roleMiddleware('auditor', 'admin'), (req, res) => {
  const db = getDb();
  const { sealId } = req.body;
  let seal = sealId ? db.prepare('SELECT * FROM worm_storage_index WHERE id = ?').get(sealId) : db.prepare('SELECT * FROM worm_storage_index ORDER BY id DESC LIMIT 1').get();
  if (!seal) return res.json({ code: 404, message: '封存记录不存在', data: null });

  const logs = db.prepare('SELECT * FROM operation_logs WHERE id >= ? AND id <= ? ORDER BY id ASC').all(seal.start_log_id, seal.end_log_id);
  const computedMerkleRoot = computeMerkleRoot(logs.map(l => l.hash));
  const isValid = computedMerkleRoot === seal.merkle_root;

  logOperation('WORM验证', req.user.email, 'worm_storage_index', seal.id, '验证封存区块#' + seal.id + '，结果: ' + (isValid ? '通过' : '失败'));
  res.json({ code: 200, message: isValid ? '封存验证通过' : '封存验证失败', data: { sealId: seal.id, startLogId: seal.start_log_id, endLogId: seal.end_log_id, storedMerkleRoot: seal.merkle_root, computedMerkleRoot, isValid, recordCount: logs.length, sealedAt: seal.seal_time } });
});

// =========== P1.1/P1.4: 知识库增强 & 模板管理增强API ===========

// 知识库统计
app.get('/api/knowledge/stats', authMiddleware, (req, res) => {
  const db = getDb();
  const byLevel = db.prepare("SELECT COALESCE(level, '未分类') as level, COUNT(*) as count FROM regulations GROUP BY level ORDER BY count DESC").all();
  const byCategory = db.prepare("SELECT COALESCE(category, '未分类') as category, COUNT(*) as count FROM regulations GROUP BY category ORDER BY count DESC").all();
  const totalRegulations = db.prepare('SELECT COUNT(*) as c FROM regulations').get().c;
  const totalClauses = db.prepare('SELECT COUNT(*) as c FROM regulation_clauses').get().c;
  res.json({ code: 200, message: 'success', data: { totalRegulations, totalClauses, byLevel, byCategory } });
});

// 条款列表（支持搜索）
app.get('/api/clauses', authMiddleware, (req, res) => {
  const db = getDb();
  const { regulationId, severity, search, page = 1, pageSize = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = ['1=1'];
  const params = [];
  if (regulationId) { where.push('rc.regulation_id = ?'); params.push(regulationId); }
  if (severity) { where.push('rc.severity = ?'); params.push(severity); }
  if (search) { where.push('(rc.content LIKE ? OR rc.title LIKE ? OR rc.clause_number LIKE ?)'); params.push('%' + search + '%', '%' + search + '%', '%' + search + '%'); }
  const clauses = db.prepare('SELECT rc.*, r.name as regulation_name, r.code as regulation_code FROM regulation_clauses rc LEFT JOIN regulations r ON rc.regulation_id = r.id WHERE ' + where.join(' AND ') + ' ORDER BY rc.regulation_id, rc.id LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
  const total = db.prepare('SELECT COUNT(*) as c FROM regulation_clauses rc WHERE ' + where.join(' AND ')).get(...params).c;
  res.json({ code: 200, message: 'success', data: clauses, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 模板版本历史
app.get('/api/templates/:id/versions', authMiddleware, (req, res) => {
  const db = getDb();
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!template) return res.status(404).json({ code: 404, message: '模板不存在', data: null });
  const versions = db.prepare('SELECT id, version, created_at, created_by, usage_count FROM templates WHERE code = ? ORDER BY version DESC').all(template.code);
  res.json({ code: 200, message: 'success', data: versions });
});

// 模板停用/启用
app.patch('/api/templates/:id/status', authMiddleware, roleMiddleware('admin'), (req, res) => {
  const db = getDb();
  const { status } = req.body;
  if (!['draft', 'published', 'archived'].includes(status)) return res.status(400).json({ code: 400, message: '无效的状态值', data: null });
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!template) return res.status(404).json({ code: 404, message: '模板不存在', data: null });
  db.prepare('UPDATE templates SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
  logOperation((status === 'archived' ? '停用' : status === 'published' ? '启用' : '更新') + '模板', req.user.email, 'templates', req.params.id, '模板 ' + template.name + ' 状态变更为 ' + status);
  res.json({ code: 200, message: '状态更新成功', data: null });
});

// 模板字段动态配置
app.get('/api/templates/:id/fields', authMiddleware, (req, res) => {
  const db = getDb();
  const fields = withOptionsListAll(db.prepare('SELECT * FROM template_fields WHERE template_id = ? ORDER BY sort_order, id').all(req.params.id));
  const rules = db.prepare('SELECT * FROM template_rules WHERE template_id = ? ORDER BY priority DESC, id').all(req.params.id);
  res.json({ code: 200, message: 'success', data: { fields, rules } });
});

app.put('/api/templates/:id/fields', authMiddleware, roleMiddleware('admin'), (req, res) => {
  const db = getDb();
  const { fields, rules } = req.body;
  const templateId = req.params.id;
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId);
  if (!template) return res.status(404).json({ code: 404, message: '模板不存在', data: null });

  if (Array.isArray(fields)) {
    db.prepare('DELETE FROM template_fields WHERE template_id = ?').run(templateId);
    const insertField = db.prepare('INSERT INTO template_fields (template_id, field_name, field_label, field_type, required, sort_order, options, default_value, placeholder, validation_rule, help_text, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
    // BUG-03：统一走 normalizeFieldOrder，写入连续 sort_order
    normalizeFieldOrder(fields).forEach((f, i) => {
      insertField.run(templateId, f.field_name, f.field_label, f.field_type, f.required !== false ? 1 : 0, i, serializeFieldOptions(f.options_list != null ? f.options_list : f.options), f.default_value || '', f.placeholder || '', f.validation_rule || '', f.help_text || '');
    });
  }

  if (Array.isArray(rules)) {
    rules.forEach(r => {
      if (r.id) {
        db.prepare('UPDATE template_rules SET rule_name=?, rule_type=?, rule_config=?, clause_ref=?, description=?, severity=?, priority=?, enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND template_id=?').run(r.rule_name, r.rule_type, JSON.stringify(r.config || {}), r.clause_ref || '', r.description || '', r.severity || 'mandatory', r.priority || 0, r.enabled !== false ? 1 : 0, r.id, templateId);
      } else {
        db.prepare('INSERT INTO template_rules (template_id, rule_name, rule_type, rule_config, clause_ref, description, severity, priority, enabled, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)').run(templateId, r.rule_name, r.rule_type, JSON.stringify(r.config || {}), r.clause_ref || '', r.description || '', r.severity || 'mandatory', r.priority || 0, req.user.email);
      }
    });
  }

  ruleEngine.clearCache(parseInt(templateId));
  logOperation('更新模板字段和规则', req.user.email, 'templates', templateId, '更新了模板 ' + template.name + ' 的字段和规则');
  res.json({ code: 200, message: '模板配置更新成功', data: null });
});

// =========== P0.3/P0.4: 规则测试 & 输出生成 ===========

// 规则测试
app.post('/api/rule-engine/test', authMiddleware, (req, res) => {
  const { ruleData, testData } = req.body;
  if (!ruleData || !testData) return res.status(400).json({ code: 400, message: '缺少规则数据或测试数据', data: null });
  const result = ruleEngine.testRule(ruleData, testData);
  res.json({ code: 200, message: 'success', data: result });
});

// 输出生成
app.post('/api/rule-engine/generate-output', authMiddleware, (req, res) => {
  const { template, result, fieldValues, format } = req.body;
  const output = ruleEngine.generateOutput(template, result, fieldValues);
  if (format === 'report') {
    const report = ruleEngine.generateComplianceReport(result, fieldValues, { template, format: 'text' });
    res.json({ code: 200, message: 'success', data: { output: report } });
  } else {
    res.json({ code: 200, message: 'success', data: { output } });
  }
});


// ==================== 404 处理 ====================
app.use(notFoundHandler);

// ==================== 全局错误处理 ====================
app.use(errorHandler);

// ==================== 启动服务器 ====================

function ensureSeeded() {
  const database = getDb();
  let cnt = 0;
  try { cnt = database.prepare('SELECT COUNT(*) AS c FROM users').get().c; }
  catch (e) { cnt = 0; }
  if (cnt === 0) {
    console.log('[启动] 数据库为空，执行首次初始化播种...');
    require('./seed');
  }
}

async function initServices() {
  // 确保数据库已初始化并播种（修复：全新容器/清空库时自动播种，避免空库导致登录失败）
  ensureSeeded();
  // 检查 Ollama
  await aiService.checkOllama();
  
  // 初始化 Transformers.js
  await aiService.initTransformersJS();
  
  // 启动定时爬虫
  if (getConfig('crawler.enabled', true)) {
    crawler.startCrawler();
  }

  console.log('\n[服务] AI引擎状态:', aiService.getStatus().method);
  console.log('[服务] 爬虫状态:', crawler.getCrawlerStatus().enabled ? '已启动' : '已停止');
}

// 设置进程异常处理
setupProcessHandlers();

app.listen(PORT, async () => {
  console.log(`\n🤖 特种设备安全管理AI系统 V4`);
  console.log(`📡 服务器已启动: http://localhost:${PORT}`);
  console.log(`🔑 演示账号:`);
  console.log(`   管理员: admin@demo.com / 123456`);
  console.log(`   审核员: auditor@demo.com / 123456`);
  console.log(`   用户:   user@demo.com / 123456`);
  console.log(`\n📊 系统模块:`);
  console.log(`   ├── 身份鉴权 (Cookie Session) ✅`);
  console.log(`   ├── 动态规则引擎 (数据库配置) ✅`);
  console.log(`   ├── AI智能分析 (Transformers.js本地) ✅`);
  console.log(`   ├── AI大模型 (Ollama+qwen2.5 本地) ✅`);
  console.log(`   ├── 行业爬虫 (定时抓取+增量更新) ✅`);
  console.log(`   ├── 司法留痕 (SHA-256哈希链) ✅`);
  console.log(`   ├── 审核工作流 ✅`);
  console.log(`   ├── 知识库管理 ✅`);
  console.log(`   ├── 安全防护 (XSS/输入验证/速率限制) ✅`);
  console.log(`   └── 统一错误处理 ✅`);
  console.log(`\n🌐 打开 http://localhost:${PORT} 即可访问\n`);

  initServices().catch(err => {
    console.error('[启动] 服务初始化失败:', err.message);
  });
});
