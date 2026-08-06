/**
 * 司法留痕模块 - 哈希链 + 操作日志（v2）
 *
 * 需求文档 7 章要素：
 *   ✅ 操作人 / 角色              user_email / user_role
 *   ✅ 操作类型                   action
 *   ✅ 时间戳（UTC，链内一致）    timestamp
 *   ✅ IP 地址                    ip_address（LOG-01）
 *   ✅ 请求 / 响应摘要            request_digest / response_digest（LOG-02）
 *   ✅ 前后数据对比               data_before / data_after（LOG-03）
 *   ✅ SHA-256 哈希链             prev_hash → hash（LOG-04）
 *
 * 兼容性：v1（仅 action/user/target/detail）历史日志仍可通过 verifyChain() 校验，
 *         校验时先按 v2 载荷计算，失败再回退 v1 载荷，避免历史数据被误判为"篡改"。
 */
const crypto = require('crypto');
const { getDb } = require('./db');
const auditCtx = require('./utils/audit-context');
const { utcStamp, toIso } = require('./utils/datetime');

const GENESIS_HASH = '0x' + '0'.repeat(64);
const CHAIN_VERSION = 2;

// 计算SHA-256哈希
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function str(v) {
  return v == null ? '' : String(v);
}

/**
 * 统一序列化载荷（键顺序固定，null/undefined 归一为空串）
 * v2 在 v1 基础上追加司法要素字段。
 */
function buildPayload(v, row) {
  const base = {
    action: str(row.action),
    userEmail: str(row.user_email),
    targetType: str(row.target_type),
    targetId: str(row.target_id),
    detail: str(row.detail),
    prevHash: row.prev_hash,
    timestamp: str(row.timestamp)
  };
  if (v === 1) return base;
  return Object.assign(base, {
    userRole: str(row.user_role),
    ipAddress: str(row.ip_address),
    userAgent: str(row.user_agent),
    requestId: str(row.request_id),
    requestDigest: str(row.request_digest),
    responseDigest: str(row.response_digest),
    dataBefore: str(row.data_before),
    dataAfter: str(row.data_after),
    chainVersion: CHAIN_VERSION
  });
}

/**
 * 记录操作日志并生成哈希链
 *
 * @param {string} action      操作类型
 * @param {string} userEmail   操作人
 * @param {string} targetType  目标表/资源
 * @param {number|string} targetId 目标ID
 * @param {string} detail      文字说明
 * @param {object} [meta]      额外司法要素，可覆盖自动采集值：
 *        { ip, userAgent, requestId, userRole, request, response, before, after }
 *        - request/response：任意对象，内部自动脱敏并生成摘要
 *        - before/after：修改前后的数据行，内部自动生成差异对比
 */
function logOperation(action, userEmail, targetType, targetId, detail, meta) {
  const db = getDb();
  const m = meta || {};
  const ctx = auditCtx.current() || {};

  // ---- 1. 采集司法要素（显式 meta 优先，其次请求上下文） ----
  const ipAddress = m.ip || ctx.ip || null;
  const userAgent = m.userAgent || ctx.userAgent || null;
  const requestId = m.requestId || ctx.requestId || null;
  const userRole = m.userRole || ctx.userRole || null;

  // 请求摘要：优先使用显式传入，否则用上下文里中间件预计算的摘要
  let requestDigest = null;
  if (m.request !== undefined) {
    requestDigest = JSON.stringify(auditCtx.digest(m.request));
  } else if (ctx.requestDigest) {
    requestDigest = typeof ctx.requestDigest === 'string' ? ctx.requestDigest : JSON.stringify(ctx.requestDigest);
  }

  // 响应摘要：业务处理阶段通常尚未产生响应体，
  // 由 server.js 的 res.json 钩子在响应结束时补记一条「操作响应」链上日志。
  let responseDigest = null;
  if (m.response !== undefined) {
    responseDigest = JSON.stringify(auditCtx.digest(m.response));
  }

  // 前后数据对比
  let dataBefore = null;
  let dataAfter = null;
  if (m.before !== undefined || m.after !== undefined) {
    const diff = auditCtx.diffRecords(m.before, m.after);
    dataBefore = JSON.stringify(auditCtx.redact(m.before == null ? null : m.before));
    dataAfter = JSON.stringify({
      after: auditCtx.redact(m.after == null ? null : m.after),
      diff
    });
    if (dataBefore.length > 8000) dataBefore = dataBefore.slice(0, 8000) + '…';
    if (dataAfter.length > 8000) dataAfter = dataAfter.slice(0, 8000) + '…';
  }

  // ---- 2. 取上一条哈希，构链 ----
  const lastLog = db.prepare('SELECT hash FROM operation_logs ORDER BY id DESC LIMIT 1').get();
  const prevHash = lastLog ? lastLog.hash : GENESIS_HASH;
  const ts = utcStamp();

  const row = {
    action, user_email: userEmail, target_type: targetType, target_id: targetId, detail,
    prev_hash: prevHash, timestamp: ts,
    user_role: userRole, ip_address: ipAddress, user_agent: userAgent, request_id: requestId,
    request_digest: requestDigest, response_digest: responseDigest,
    data_before: dataBefore, data_after: dataAfter
  };

  const hash = sha256(JSON.stringify(buildPayload(CHAIN_VERSION, row)));

  db.prepare(`
    INSERT INTO operation_logs
      (action, user_email, user_role, target_type, target_id, detail,
       ip_address, user_agent, request_id, request_digest, response_digest,
       data_before, data_after, chain_version, prev_hash, hash, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    action, userEmail, userRole, targetType, targetId, detail,
    ipAddress, userAgent, requestId, requestDigest, responseDigest,
    dataBefore, dataAfter, CHAIN_VERSION, prevHash, hash, ts
  );

  // 记录到上下文，供响应钩子判断「本请求是否发生了业务操作」
  if (ctx && Array.isArray(ctx.loggedOps)) {
    ctx.loggedOps.push({ action, hash });
  }

  return { hash, prevHash, timestamp: ts, requestId };
}

/**
 * 校验单条日志的哈希（版本自适应）
 * @returns {{ok:boolean, computed:string, version:number}}
 */
function verifyRow(log) {
  const v2 = sha256(JSON.stringify(buildPayload(2, log)));
  if (v2 === log.hash) return { ok: true, computed: v2, version: 2 };
  const v1 = sha256(JSON.stringify(buildPayload(1, log)));
  if (v1 === log.hash) return { ok: true, computed: v1, version: 1 };
  // 以声明的链版本作为期望值报告
  const declared = log.chain_version === 1 ? v1 : v2;
  return { ok: false, computed: declared, version: log.chain_version || 2 };
}

// 验证哈希链完整性
function verifyChain(options) {
  const opts = options || {};
  const db = getDb();
  const logs = db.prepare('SELECT * FROM operation_logs ORDER BY id ASC').all();

  let prevHash = GENESIS_HASH;
  let isValid = true;
  const errors = [];
  const versionStats = { v1: 0, v2: 0 };

  for (const log of logs) {
    if (log.prev_hash !== prevHash) {
      isValid = false;
      errors.push({
        id: log.id,
        type: 'BROKEN_LINK',
        message: '与上一区块的哈希链断裂',
        expectedPrevHash: prevHash,
        actualPrevHash: log.prev_hash
      });
    }

    const r = verifyRow(log);
    if (r.version === 1) versionStats.v1++; else versionStats.v2++;
    if (!r.ok) {
      isValid = false;
      errors.push({
        id: log.id,
        type: 'HASH_MISMATCH',
        message: '区块内容被篡改（重算哈希不匹配）',
        expectedHash: r.computed,
        actualHash: log.hash
      });
    }

    prevHash = log.hash;
  }

  return {
    isValid,
    totalBlocks: logs.length,
    chainVersion: CHAIN_VERSION,
    versionStats,
    genesisHash: GENESIS_HASH,
    chainRoot: logs.length > 0 ? logs[logs.length - 1].hash : null,
    verifiedAt: new Date().toISOString(),
    errors: opts.maxErrors ? errors.slice(0, opts.maxErrors) : errors
  };
}

/** 反序列化摘要 JSON（失败时原样返回） */
function safeParse(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch (_) { return s; }
}

/** 把 DB 行转为对外展示结构 */
function shapeLog(log) {
  return Object.assign({}, log, {
    timestamp_iso: toIso(log.timestamp),
    request_digest_obj: safeParse(log.request_digest),
    response_digest_obj: safeParse(log.response_digest),
    data_before_obj: safeParse(log.data_before),
    data_after_obj: safeParse(log.data_after)
  });
}

// 获取操作日志列表（支持筛选）
function getLogs(page = 1, pageSize = 20, filters = {}) {
  const db = getDb();
  const p = Math.max(1, parseInt(page, 10) || 1);
  const ps = Math.min(500, Math.max(1, parseInt(pageSize, 10) || 20));
  const offset = (p - 1) * ps;

  const where = [];
  const params = [];
  if (filters.action) { where.push('action LIKE ?'); params.push(`%${filters.action}%`); }
  if (filters.userEmail) { where.push('user_email = ?'); params.push(filters.userEmail); }
  if (filters.targetType) { where.push('target_type = ?'); params.push(filters.targetType); }
  if (filters.ip) { where.push('ip_address = ?'); params.push(filters.ip); }
  if (filters.from) { where.push('timestamp >= ?'); params.push(filters.from); }
  if (filters.to) { where.push('timestamp <= ?'); params.push(filters.to); }
  if (filters.search) {
    where.push('(action LIKE ? OR detail LIKE ? OR user_email LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const logs = db.prepare(`SELECT * FROM operation_logs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, ps, offset);
  const total = db.prepare(`SELECT COUNT(*) as count FROM operation_logs ${whereSql}`).get(...params).count;

  return {
    data: logs.map(shapeLog),
    total,
    page: p,
    pageSize: ps,
    totalPages: Math.max(1, Math.ceil(total / ps))
  };
}

/** 按时间范围导出（审计导出 LOG-07） */
function exportLogs(filters = {}) {
  const db = getDb();
  const where = [];
  const params = [];
  if (filters.from) { where.push('timestamp >= ?'); params.push(filters.from); }
  if (filters.to) { where.push('timestamp <= ?'); params.push(filters.to); }
  if (filters.action) { where.push('action LIKE ?'); params.push(`%${filters.action}%`); }
  if (filters.userEmail) { where.push('user_email = ?'); params.push(filters.userEmail); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const logs = db.prepare(`SELECT * FROM operation_logs ${whereSql} ORDER BY id ASC`).all(...params);
  return logs;
}

module.exports = {
  logOperation,
  verifyChain,
  verifyRow,
  getLogs,
  exportLogs,
  shapeLog,
  sha256,
  GENESIS_HASH,
  CHAIN_VERSION
};
