/**
 * 身份鉴权模块
 * 三类角色：user(普通用户)、auditor(审核员)、admin(管理员)
 *
 * 安全说明：
 *  - 会话令牌 ev3_tok = base64("<email>:<timestamp>") + "." + HMAC-SHA256(payload, 服务端密钥)
 *    带有服务端密钥签名，客户端无法伪造（SEC-01 修复：旧实现为明文 Base64，可直接篡改邮箱）。
 *  - 生产环境务必通过环境变量 SESSION_SECRET 注入强随机值；未配置时使用内置默认值
 *    （仅用于本地开发，部署到公网前必须覆盖，否则令牌仍可被同密钥伪造）。
 */
const crypto = require('crypto');
const { getDb } = require('./db');
const auditCtx = require('./utils/audit-context');

/** 把当前登录身份写入司法留痕上下文（供 logOperation 自动记录操作人/角色） */
function bindAuditIdentity(user) {
  if (!user) return;
  auditCtx.patch({ userEmail: user.email, userRole: user.role, userId: user.id });
}

// 会话签名密钥：生产环境务必通过环境变量 SESSION_SECRET 注入强随机值
const SESSION_SECRET = process.env.SESSION_SECRET || 'elevator-ai-dev-secret-change-me';

// 简单的密码哈希（生产环境应改用 bcrypt/argon2；此处为演示用 SHA-256 + 固定盐）
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'special-equipment-salt').digest('hex');
}

// 验证密码
function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

// 密码复杂度校验：返回 null 表示通过，否则返回错误提示（SEC-03 修复）
function validatePassword(pwd) {
  if (typeof pwd !== 'string' || pwd.length < 8) return '密码长度至少 8 位';
  if (!/[a-z]/.test(pwd)) return '密码需包含小写字母';
  if (!/[A-Z]/.test(pwd)) return '密码需包含大写字母';
  if (!/\d/.test(pwd)) return '密码需包含数字';
  if (!/[^A-Za-z0-9]/.test(pwd)) return '密码需包含特殊字符（如 !@#$%^&*）';
  return null;
}

// 登录
function login(email, password) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return { success: false, error: '用户不存在' };
  if (!verifyPassword(password, user.password_hash)) return { success: false, error: '密码错误' };

  return {
    success: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role }
  };
}

// 生成带签名的令牌： payload.signature
function generateToken(email) {
  const timestamp = Date.now();
  const payload = `${email}:${timestamp}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return Buffer.from(payload).toString('base64') + '.' + sig;
}

// 校验并解析令牌；失败（伪造 / 格式错误）返回 null
function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  const payload = Buffer.from(b64, 'base64').toString('utf-8');
  // 恒定时间比较，防时序侧信道攻击
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const idx = payload.lastIndexOf(':');
  if (idx < 0) return null;
  const email = payload.slice(0, idx);
  const timestamp = parseInt(payload.slice(idx + 1), 10);
  if (!email || isNaN(timestamp)) return null;
  return { email, timestamp };
}

// 鉴权中间件（支持 Authorization header、token query、ev3_tok cookie）
function authMiddleware(req, res, next) {
  let token = req.headers['authorization'] || req.query.token || (req.cookies && req.cookies['ev3_tok']);
  if (!token) return res.status(401).json({ error: '未登录，请先登录' });

  // 兼容标准 Authorization: Bearer <token>（HTTP 1.1 RFC 7235 规范）
  // 旧版直接 verifyToken(整 header) 会被 'Bearer ' 前缀污染 base64 解码，
  // 导致客户端 fetch 携带 Authorization 头鉴权 100% 失败（hash 路由 H5 全死）
  if (typeof token === 'string' && /^Bearer\s+/i.test(token)) {
    token = token.replace(/^Bearer\s+/i, '').trim();
  }

  const parsed = verifyToken(token);
  if (!parsed) return res.status(401).json({ error: '无效的登录凭证' });

  const elapsed = Date.now() - parsed.timestamp;
  // Token 24小时过期
  if (elapsed > 24 * 60 * 60 * 1000) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(parsed.email);
  if (!user) return res.status(401).json({ error: '用户不存在' });

  req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  bindAuditIdentity(req.user);
  next();
}

// 角色权限中间件
function roleMiddleware(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足，需要角色：' + roles.join('/') });
    }
    next();
  };
}

module.exports = {
  login,
  bindAuditIdentity,
  authMiddleware,
  roleMiddleware,
  generateToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  validatePassword
};
