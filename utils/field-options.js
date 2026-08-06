/**
 * 模板字段下拉选项解析工具（BUG-05 修复）
 *
 * 历史遗留：template_fields.options 列在不同种子/导入渠道下存在多种格式：
 *   1. JSON 数组字符串：'["是","否"]'
 *   2. 竖线分隔：      '客梯|货梯|医梯'
 *   3. 逗号分隔：      '正常,异常,需更换'
 *   4. 中文逗号/顿号/分号分隔：'正常，异常；需更换、待定'
 *   5. 带引号的逗号分隔：'"是","否"'
 *   6. 已经是数组（前端内存态）
 *
 * 旧实现直接 split(',')，导致 JSON 数组被切成 '["是' / '"否"]'，
 * 提交到规则引擎后与阈值（"是"/"否"）永远不相等 → 判别结论错误。
 *
 * 本模块提供唯一权威解析实现，服务端与前端（public/js/app.js）保持同一套规则。
 */

'use strict';

/** 去掉包裹的成对引号（含中文引号）与首尾空白 */
function stripQuotes(s) {
  let v = String(s == null ? '' : s).trim();
  // 反复剥离，兼容 '"「是」"' 这类多层包裹
  for (let i = 0; i < 3; i++) {
    const next = v.replace(/^\s*["'`“”‘’「」【】]+/, '').replace(/["'`“”‘’「」【】]+\s*$/, '').trim();
    if (next === v) break;
    v = next;
  }
  return v;
}

/**
 * 解析字段选项为字符串数组
 * @param {string|Array|null|undefined} raw
 * @returns {string[]} 去重、去空后的选项数组
 */
function parseFieldOptions(raw) {
  if (raw == null || raw === '') return [];

  // 情况 6：已经是数组
  if (Array.isArray(raw)) {
    return dedupe(raw.map(o => (o && typeof o === 'object' ? (o.value != null ? o.value : o.label) : o))
      .map(stripQuotes)
      .filter(Boolean));
  }

  const text = String(raw).trim();
  if (!text) return [];

  // 情况 1：JSON 数组 / JSON 对象数组
  if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return dedupe(parsed
          .map(o => (o && typeof o === 'object' ? (o.value != null ? o.value : o.label) : o))
          .map(stripQuotes)
          .filter(Boolean));
      }
      if (parsed && typeof parsed === 'object') {
        // {"是":1,"否":0} 之类
        return dedupe(Object.keys(parsed).map(stripQuotes).filter(Boolean));
      }
    } catch (_) {
      // JSON 解析失败 → 退化为「剥掉方括号后按分隔符切」
      const inner = text.replace(/^\[/, '').replace(/\]$/, '');
      return splitByDelimiter(inner);
    }
  }

  // 情况 2~5：按分隔符切分
  return splitByDelimiter(text);
}

/**
 * 按优先级选择分隔符：换行 > 竖线 > 分号类 > 逗号类
 * 注：逗号类同时包含英文逗号、中文逗号与顿号，
 *     因为人工录入常出现「正常，异常、待定」这类混用写法。
 */
function splitByDelimiter(text) {
  const s = String(text);
  let parts;
  if (/[\r\n]/.test(s)) parts = s.split(/[\r\n]+/);
  else if (s.indexOf('|') >= 0) parts = s.split('|');
  else if (/[;；]/.test(s)) parts = s.split(/[;；]/);
  else if (/[,，、]/.test(s)) parts = s.split(/[,，、]/);
  else parts = [s];
  return dedupe(parts.map(stripQuotes).filter(Boolean));
}

function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    const key = String(v);
    if (!seen.has(key)) { seen.add(key); out.push(key); }
  }
  return out;
}

/**
 * 归一化为入库格式（统一存 JSON 数组字符串，避免继续产生脏格式）
 * @returns {string|null}
 */
function serializeFieldOptions(raw) {
  const list = parseFieldOptions(raw);
  return list.length ? JSON.stringify(list) : null;
}

/**
 * 给字段行附加 options_list（数组），前端优先消费该字段
 */
function withOptionsList(field) {
  if (!field || typeof field !== 'object') return field;
  return Object.assign({}, field, { options_list: parseFieldOptions(field.options) });
}

function withOptionsListAll(fields) {
  return Array.isArray(fields) ? fields.map(withOptionsList) : [];
}

module.exports = {
  parseFieldOptions,
  serializeFieldOptions,
  withOptionsList,
  withOptionsListAll,
  stripQuotes
};
