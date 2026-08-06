/**
 * 安全中间件模块
 * 
 * 提供 XSS 防护、输入验证、速率限制等安全功能
 */

const xss = require('xss');

/**
 * XSS 过滤配置
 */
const xssOptions = {
  whiteList: {
    // 允许的安全标签
    a: ['href', 'title', 'target'],
    img: ['src', 'alt', 'title'],
    br: [],
    p: [],
    strong: [],
    em: [],
    u: [],
    ol: ['start'],
    ul: [],
    li: [],
    h1: [],
    h2: [],
    h3: [],
    h4: [],
    h5: [],
    h6: [],
    blockquote: [],
    code: [],
    pre: [],
    table: ['border', 'cellspacing', 'cellpadding'],
    thead: [],
    tbody: [],
    tr: [],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan']
  },
  stripIgnoreTag: true,      // 过滤非白名单标签
  stripIgnoreTagBody: false, // 不保留非白名单标签内容
  css: false                 // 不过滤 CSS
};

/**
 * 递归清理对象中的 XSS
 */
function sanitizeObject(obj) {
  if (typeof obj === 'string') {
    return xss(obj, xssOptions);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const sanitized = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // 也清理 key
        const sanitizedKey = xss(key, xssOptions);
        sanitized[sanitizedKey] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * XSS 防护中间件
 */
function xssSanitizer(req, res, next) {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  next();
}

/**
 * 输入验证中间件生成器
 */
function validateInput(rules) {
  return (req, res, next) => {
    const errors = [];
    
    for (const [field, fieldRules] of Object.entries(rules)) {
      const value = req.body[field] || req.query[field] || req.params[field];
      
      // 必填检查
      if (fieldRules.required && (value === undefined || value === null || value === '')) {
        errors.push({ field, message: `${field} 是必填字段` });
        continue;
      }
      
      // 如果值存在，进行其他验证
      if (value !== undefined && value !== null && value !== '') {
        // 类型检查
        if (fieldRules.type) {
          switch (fieldRules.type) {
            case 'number':
              if (isNaN(Number(value))) {
                errors.push({ field, message: `${field} 必须是数字` });
              }
              break;
            case 'email':
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailRegex.test(value)) {
                errors.push({ field, message: `${field} 格式不正确` });
              }
              break;
            case 'integer':
              if (!Number.isInteger(Number(value))) {
                errors.push({ field, message: `${field} 必须是整数` });
              }
              break;
            case 'boolean':
              if (!['true', 'false', '1', '0', true, false].includes(value)) {
                errors.push({ field, message: `${field} 必须是布尔值` });
              }
              break;
            case 'array':
              if (!Array.isArray(value)) {
                errors.push({ field, message: `${field} 必须是数组` });
              }
              break;
            case 'object':
              if (typeof value !== 'object' || Array.isArray(value)) {
                errors.push({ field, message: `${field} 必须是对象` });
              }
              break;
          }
        }
        
        // 长度检查
        if (fieldRules.minLength && String(value).length < fieldRules.minLength) {
          errors.push({ field, message: `${field} 长度不能少于 ${fieldRules.minLength} 个字符` });
        }
        if (fieldRules.maxLength && String(value).length > fieldRules.maxLength) {
          errors.push({ field, message: `${field} 长度不能超过 ${fieldRules.maxLength} 个字符` });
        }
        
        // 数值范围检查
        if (fieldRules.min !== undefined && Number(value) < fieldRules.min) {
          errors.push({ field, message: `${field} 不能小于 ${fieldRules.min}` });
        }
        if (fieldRules.max !== undefined && Number(value) > fieldRules.max) {
          errors.push({ field, message: `${field} 不能大于 ${fieldRules.max}` });
        }
        
        // 正则检查
        if (fieldRules.pattern) {
          const regex = new RegExp(fieldRules.pattern);
          if (!regex.test(value)) {
            errors.push({ field, message: fieldRules.patternMessage || `${field} 格式不正确` });
          }
        }
        
        // 枚举值检查
        if (fieldRules.enum && !fieldRules.enum.includes(value)) {
          errors.push({ field, message: `${field} 必须是以下值之一: ${fieldRules.enum.join(', ')}` });
        }
        
        // 自定义验证函数
        if (fieldRules.validate && typeof fieldRules.validate === 'function') {
          const customError = fieldRules.validate(value);
          if (customError) {
            errors.push({ field, message: customError });
          }
        }
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: '输入数据验证失败',
        code: 'VALIDATION_ERROR',
        errors
      });
    }
    
    next();
  };
}

/**
 * 简单的内存速率限制器
 */
class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 15 * 60 * 1000; // 默认15分钟
    this.max = options.max || 100; // 默认最多100次请求
    this.message = options.message || '请求过于频繁，请稍后再试';
    this.requests = new Map();
    
    // 定期清理过期记录
    setInterval(() => {
      this.cleanup();
    }, this.windowMs);
  }
  
  getKey(req) {
    // 使用 IP + User-Agent 作为唯一标识
    return req.ip || req.connection.remoteAddress || 'unknown';
  }
  
  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      if (now - record.startTime > this.windowMs) {
        this.requests.delete(key);
      }
    }
  }
  
  middleware() {
    return (req, res, next) => {
      const key = this.getKey(req);
      const now = Date.now();
      
      let record = this.requests.get(key);
      
      if (!record || now - record.startTime > this.windowMs) {
        // 新窗口期
        record = {
          startTime: now,
          count: 0
        };
        this.requests.set(key, record);
      }
      
      record.count++;
      
      // 设置响应头
      res.setHeader('X-RateLimit-Limit', this.max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, this.max - record.count));
      res.setHeader('X-RateLimit-Reset', new Date(record.startTime + this.windowMs).toISOString());
      
      if (record.count > this.max) {
        return res.status(429).json({
          success: false,
          error: this.message,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((record.startTime + this.windowMs - now) / 1000)
        });
      }
      
      next();
    };
  }
}

/**
 * 请求日志中间件
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // 设置请求 ID
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  
  // 记录请求
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${req.ip}`);
  
  // 响应完成后记录
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
}

/**
 * 安全头设置中间件
 */
function securityHeaders(req, res, next) {
  // 防止点击劫持
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  
  // 防止 MIME 类型嗅探
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS 保护
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // 内容安全策略（简化版）
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;");
  
  // Referrer 策略
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
}

module.exports = {
  xssSanitizer,
  validateInput,
  RateLimiter,
  requestLogger,
  securityHeaders,
  sanitizeObject
};
