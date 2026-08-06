/**
 * 日期时间工具（BUG-04 时区处理修复）
 *
 * 问题根因：
 *   SQLite `CURRENT_TIMESTAMP` 写入的是 **UTC** 且格式为 'YYYY-MM-DD HH:MM:SS'（无时区标记）。
 *   浏览器 `new Date('2026-08-06 16:49:56')` 按 **本地时区** 解析 → GMT+8 环境下整体偏差 8 小时。
 *
 * 解决策略（服务端）：
 *   1. 所有写入统一走 `utcStamp()`，保持 UTC 存储（便于跨时区部署与哈希链一致性）。
 *   2. 所有出参附加 ISO8601（带 Z）字段，前端据此本地化显示，不再自行猜测时区。
 *   3. **纯日期字段**（YYYY-MM-DD，如检验日期）不做任何时区换算，避免"跨天漂移"。
 */

'use strict';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SQLITE_DT_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

/** 当前时间的 SQLite UTC 字符串（与 CURRENT_TIMESTAMP 同格式） */
function utcStamp(d) {
  const dt = d instanceof Date ? d : new Date();
  return dt.toISOString().replace('T', ' ').replace(/\..+$/, '');
}

/**
 * 把 SQLite 的 UTC 时间串安全转为 Date 对象（显式按 UTC 解析）
 * @param {string|Date|null} value
 * @returns {Date|null}
 */
function parseDbTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  if (!s) return null;

  // 已带时区信息（Z 或 ±HH:MM）→ 直接交给 Date
  if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // 纯日期：按 UTC 零点，调用方需自行决定是否本地化
  if (DATE_ONLY_RE.test(s)) {
    const d = new Date(s + 'T00:00:00Z');
    return isNaN(d.getTime()) ? null : d;
  }

  const m = s.match(SQLITE_DT_RE);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
    return isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/** SQLite UTC 串 → ISO8601（带 Z），供前端本地化 */
function toIso(value) {
  const d = parseDbTimestamp(value);
  return d ? d.toISOString() : null;
}

/**
 * 判断是否为「纯日期」值（不参与时区换算）
 */
function isDateOnly(value) {
  return typeof value === 'string' && DATE_ONLY_RE.test(value.trim());
}

/**
 * 归一化任意日期输入为 'YYYY-MM-DD'（不做时区偏移）
 * 支持：2024-06-15 / 2024/6/15 / 2024年6月15日 / 20240615
 */
function normalizeDateOnly(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (DATE_ONLY_RE.test(s)) return s;

  let m = s.match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;

  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // ISO 带时间：截取日期部分（按 UTC，避免本地化跨天）
  const d = parseDbTimestamp(s);
  if (d) return d.toISOString().slice(0, 10);
  return null;
}

/**
 * 日期比较：把日期归一为「当日 UTC 零点」的时间戳，规避时区跨天问题
 * @returns {number|null} epoch ms
 */
function dateToEpochDay(value) {
  const norm = normalizeDateOnly(value);
  if (!norm) return null;
  return Date.UTC(+norm.slice(0, 4), +norm.slice(5, 7) - 1, +norm.slice(8, 10));
}

/** 两个日期相差的天数（b - a），非法输入返回 null */
function diffDays(a, b) {
  const ea = dateToEpochDay(a);
  const eb = dateToEpochDay(b);
  if (ea == null || eb == null) return null;
  return Math.round((eb - ea) / 86400000);
}

/** 今天（服务器本地时区）的 YYYY-MM-DD */
function todayLocal() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 给记录对象批量附加 *_iso 字段
 * @param {object} row
 * @param {string[]} keys 时间字段名
 */
function attachIso(row, keys) {
  if (!row || typeof row !== 'object') return row;
  const out = Object.assign({}, row);
  for (const k of keys) {
    if (out[k] != null && !isDateOnly(out[k])) {
      out[k + '_iso'] = toIso(out[k]);
    }
  }
  return out;
}

function attachIsoAll(rows, keys) {
  return Array.isArray(rows) ? rows.map(r => attachIso(r, keys)) : rows;
}

module.exports = {
  utcStamp,
  parseDbTimestamp,
  toIso,
  isDateOnly,
  normalizeDateOnly,
  dateToEpochDay,
  diffDays,
  todayLocal,
  attachIso,
  attachIsoAll,
  DATE_ONLY_RE
};
