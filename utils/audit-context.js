/**
 * 司法留痕请求上下文（LOG-01 / LOG-02 / LOG-03）
 *
 * 目的：让 `logOperation()` 在不改动近 50 处调用点的前提下，
 *       自动带上「操作人 IP / User-Agent / 请求 ID / 请求摘要 / 响应摘要」等司法要素。
 *
 * 实现：Node 原生 AsyncLocalStorage，在 Express 中间件里为每个请求建立一份上下文，
 *       同一异步调用链内的任何 logOperation 都能读到。
 */

'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const storage = new AsyncLocalStorage();

/** 需要脱敏的字段名（不进摘要原文，只记录 [REDACTED]） */
const SENSITIVE_KEYS = [
  'password', 'oldpassword', 'newpassword', 'password_hash', 'passwordhash',
  'token', 'authorization', 'cookie', 'secret', 'api_key', 'apikey', 'access_token'
];

function isSensitive(key) {
  const k = String(key || '').toLowerCase();
  return SENSITIVE_KEYS.some(s => k.includes(s));
}

/** 深度脱敏（不改动原对象） */
function redact(value, depth = 0) {
  if (depth > 6) return '[DEPTH_LIMIT]';
  if (value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map(v => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = isSensitive(k) ? '[REDACTED]' : redact(value[k], depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) {
    return value.slice(0, 2000) + `…[truncated ${value.length - 2000}]`;
  }
  return value;
}

function sha256(s) {
  return crypto.createHash('sha256').update(String(s == null ? '' : s)).digest('hex');
}

/**
 * 生成「摘要」对象：{ size, sha256, preview }
 * preview 为脱敏后的截断 JSON，便于人工审计；sha256 为完整脱敏体的指纹，便于机器校验。
 */
function digest(payload, previewLimit = 600) {
  let normalized;
  try {
    normalized = JSON.stringify(redact(payload));
  } catch (_) {
    normalized = String(payload);
  }
  if (normalized === undefined) normalized = '';
  return {
    size: Buffer.byteLength(normalized, 'utf8'),
    sha256: sha256(normalized),
    preview: normalized.length > previewLimit ? normalized.slice(0, previewLimit) + '…' : normalized
  };
}

/** 提取真实客户端 IP（兼容反向代理 / CloudBase / Railway） */
function extractIp(req) {
  if (!req) return null;
  const headers = req.headers || {};
  const xff = headers['x-forwarded-for'];
  if (xff) {
    const first = String(xff).split(',')[0].trim();
    if (first) return normalizeIp(first);
  }
  const candidates = [
    headers['x-real-ip'],
    headers['cf-connecting-ip'],
    headers['x-client-ip'],
    headers['x-appengine-user-ip'],
    req.ip,
    req.connection && req.connection.remoteAddress,
    req.socket && req.socket.remoteAddress
  ];
  for (const c of candidates) {
    if (c) return normalizeIp(String(c));
  }
  return null;
}

/** ::ffff:127.0.0.1 → 127.0.0.1 */
function normalizeIp(ip) {
  const s = String(ip).trim();
  return s.startsWith('::ffff:') ? s.slice(7) : s;
}

function newRequestId() {
  return crypto.randomBytes(12).toString('hex');
}

/** 在上下文中运行（Express 中间件用） */
function run(ctx, fn) {
  return storage.run(ctx, fn);
}

/** 读取当前上下文（无上下文时返回 null，例如定时任务/启动脚本） */
function current() {
  return storage.getStore() || null;
}

/** 合并补充信息到当前上下文 */
function patch(patchObj) {
  const ctx = current();
  if (ctx && patchObj) Object.assign(ctx, patchObj);
  return ctx;
}

/**
 * 计算「修改前 / 修改后」差异（LOG-03）
 * 只保留发生变化的键，避免日志膨胀。
 */
function diffRecords(before, after) {
  const b = redact(before || {});
  const a = redact(after || {});
  const keys = new Set([...Object.keys(b || {}), ...Object.keys(a || {})]);
  const changes = {};
  for (const k of keys) {
    // 忽略无意义的自动字段
    if (k === 'updated_at') continue;
    const bv = b ? b[k] : undefined;
    const av = a ? a[k] : undefined;
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      changes[k] = { before: bv === undefined ? null : bv, after: av === undefined ? null : av };
    }
  }
  return {
    changedKeys: Object.keys(changes),
    changedCount: Object.keys(changes).length,
    changes
  };
}

module.exports = {
  run,
  current,
  patch,
  digest,
  redact,
  sha256,
  extractIp,
  newRequestId,
  diffRecords,
  isSensitive
};
