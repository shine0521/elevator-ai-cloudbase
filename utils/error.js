/**
 * 错误处理模块
 * 
 * 提供统一的错误类型和错误处理中间件
 */

/**
 * 基础应用错误类
 */
class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // 标识可预期的操作错误
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode
    };
  }
}

/**
 * 验证错误 (400)
 */
class ValidationError extends AppError {
  constructor(message = '输入数据验证失败', errors = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

/**
 * 认证错误 (401)
 */
class UnauthorizedError extends AppError {
  constructor(message = '未授权访问，请先登录') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * 权限错误 (403)
 */
class ForbiddenError extends AppError {
  constructor(message = '权限不足，无法访问此资源') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * 资源不存在错误 (404)
 */
class NotFoundError extends AppError {
  constructor(message = '请求的资源不存在') {
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * 冲突错误 (409)
 */
class ConflictError extends AppError {
  constructor(message = '资源冲突') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * 速率限制错误 (429)
 */
class RateLimitError extends AppError {
  constructor(message = '请求过于频繁，请稍后再试') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * 内部服务器错误 (500)
 */
class InternalError extends AppError {
  constructor(message = '服务器内部错误') {
    super(message, 500, 'INTERNAL_ERROR');
    this.isOperational = false;
  }
}

/**
 * 服务不可用错误 (503)
 */
class ServiceUnavailableError extends AppError {
  constructor(message = '服务暂时不可用') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

/**
 * 异步处理器包装函数
 * 自动捕获异步错误并传递给 Express 错误处理中间件
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * 全局错误处理中间件
 */
function errorHandler(err, req, res, next) {
  // 默认值
  err.statusCode = err.statusCode || 500;
  err.code = err.code || 'INTERNAL_ERROR';

  // 记录错误日志
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${err.code}: ${err.message}`;
  
  if (err.statusCode >= 500 || !err.isOperational) {
    // 服务器错误或非预期错误：记录完整堆栈
    console.error(logMessage);
    console.error(err.stack);
  } else {
    // 客户端错误：仅记录消息
    console.log(logMessage);
  }

  // 开发环境返回详细信息
  const isDev = process.env.NODE_ENV === 'development';

  // API 请求返回 JSON
  if (req.path.startsWith('/api')) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      ...(err.errors && { errors: err.errors }),
      ...(isDev && { stack: err.stack })
    });
  }

  // 页面请求渲染错误页
  res.status(err.statusCode).render('error', {
    title: '错误',
    message: err.isOperational ? err.message : '服务器内部错误',
    code: err.code,
    statusCode: err.statusCode,
    ...(isDev && { stack: err.stack })
  });
}

/**
 * 404 处理中间件
 */
function notFoundHandler(req, res, next) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      success: false,
      error: 'API 接口不存在',
      code: 'NOT_FOUND',
      path: req.path
    });
  }
  
  res.status(404).render('error', {
    title: '页面不存在',
    message: '请求的页面不存在',
    code: 'NOT_FOUND',
    statusCode: 404
  });
}

/**
 * 未捕获异常处理
 */
function setupProcessHandlers() {
  // 未捕获的 Promise 拒绝
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION] ', reason);
    // 不退出进程，记录错误即可
  });

  // 未捕获的异常
  process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION] ', err);
    // 严重错误，退出进程
    process.exit(1);
  });
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalError,
  ServiceUnavailableError,
  asyncHandler,
  errorHandler,
  notFoundHandler,
  setupProcessHandlers
};
