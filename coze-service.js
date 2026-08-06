/**
 * AI 合规分类器（需求文档 模块4）
 *
 * 职责边界（非常重要）：
 *   AI **只做两件事**：① 把自然语言问题映射到模板类别；② 从文本中抽取字段值。
 *   **判别结论一律由确定性规则引擎产出**，AI 不参与合规/不合规的判定。
 *
 * 实现分层（自动降级，任何一层失败都不影响主流程）：
 *   1. Coze 扣子（配置了 COZE_API_TOKEN + bot_id 时启用）
 *   2. Ollama 本地大模型（已部署时启用）
 *   3. 本地语义打分器（TF 加权关键词 + 模板元数据匹配，完全离线，永远可用）
 *
 * 置信度（AI-04）：
 *   低于 `ai.confidence_threshold` 时返回 needManualSelect=true 与候选模板列表，
 *   由前端引导用户手动选择，绝不"猜一个"直接进规则引擎。
 */

'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { getDb, getConfig } = require('./db');
const { parseFieldOptions } = require('./utils/field-options');
const { normalizeDateOnly } = require('./utils/datetime');

// ==================== 配置 ====================

function cozeConfig() {
  const token = process.env.COZE_API_TOKEN || process.env.COZE_TOKEN || '';
  const botId = process.env.COZE_BOT_ID || getConfig('coze.bot_id', '') || '';
  const apiBase = process.env.COZE_API_BASE || getConfig('coze.api_base', 'https://api.coze.cn');
  const timeoutMs = Number(process.env.COZE_TIMEOUT_MS || getConfig('coze.timeout_ms', 20000)) || 20000;
  const workflowId = process.env.COZE_WORKFLOW_ID || '';
  return {
    token, botId, apiBase, timeoutMs, workflowId,
    enabled: !!(token && (botId || workflowId))
  };
}

function confidenceThreshold() {
  const v = Number(getConfig('ai.confidence_threshold', 0.7));
  return isNaN(v) ? 0.7 : Math.min(0.99, Math.max(0.1, v));
}

function preferredProvider() {
  return String(process.env.AI_PROVIDER || getConfig('ai.provider', 'auto') || 'auto').toLowerCase();
}

// ==================== HTTP 工具 ====================

function requestJson(urlStr, { method = 'POST', headers = {}, body = null, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject(new Error('非法的 API 地址: ' + urlStr)); }
    const lib = u.protocol === 'http:' ? http : https;
    const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));

    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search,
      method,
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }, payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}, headers)
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; if (data.length > 4 * 1024 * 1024) req.destroy(new Error('响应体过大')); });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        }
        try { resolve(JSON.parse(data)); }
        catch (_) { resolve({ raw: data }); }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('请求超时 ' + timeoutMs + 'ms')); });
    if (payload) req.write(payload);
    req.end();
  });
}

/** 从大模型输出里提取第一个 JSON 对象 */
function extractJson(text) {
  if (!text) return null;
  const s = String(text);
  // 优先 ```json fenced block
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced) candidates.push(fenced[1]);
  const braced = s.match(/\{[\s\S]*\}/);
  if (braced) candidates.push(braced[0]);
  candidates.push(s);
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(String(c).trim());
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) { /* next */ }
  }
  return null;
}

// ==================== Coze 调用 ====================

/**
 * 调用 Coze Bot（v3 非流式对话接口）
 * @returns {Promise<string>} 模型文本输出
 */
async function callCozeBot(prompt, { userId = 'elevator-system' } = {}) {
  const cfg = cozeConfig();
  if (!cfg.enabled) throw new Error('Coze 未配置');

  // 优先 workflow（结构化输出更稳）
  if (cfg.workflowId) {
    const resp = await requestJson(`${cfg.apiBase}/v1/workflow/run`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeoutMs: cfg.timeoutMs,
      body: { workflow_id: cfg.workflowId, parameters: { input: prompt } }
    });
    if (resp && resp.code && resp.code !== 0) throw new Error(`Coze workflow 错误: ${resp.msg || resp.code}`);
    return typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data || resp);
  }

  const chat = await requestJson(`${cfg.apiBase}/v3/chat`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    timeoutMs: cfg.timeoutMs,
    body: {
      bot_id: cfg.botId,
      user_id: userId,
      stream: false,
      auto_save_history: true,
      additional_messages: [{ role: 'user', content: prompt, content_type: 'text' }]
    }
  });

  if (chat && chat.code && chat.code !== 0) throw new Error(`Coze 错误: ${chat.msg || chat.code}`);
  const conversationId = chat && chat.data && chat.data.conversation_id;
  const chatId = chat && chat.data && chat.data.id;
  if (!conversationId || !chatId) throw new Error('Coze 响应缺少会话标识');

  // 轮询直到完成
  const deadline = Date.now() + cfg.timeoutMs;
  let status = chat.data.status;
  while (status !== 'completed' && Date.now() < deadline) {
    await sleep(700);
    const r = await requestJson(
      `${cfg.apiBase}/v3/chat/retrieve?chat_id=${encodeURIComponent(chatId)}&conversation_id=${encodeURIComponent(conversationId)}`,
      { method: 'GET', headers: { Authorization: `Bearer ${cfg.token}` }, timeoutMs: cfg.timeoutMs }
    );
    status = r && r.data && r.data.status;
    if (status === 'failed' || status === 'requires_action') {
      throw new Error('Coze 任务未成功完成: ' + status);
    }
  }
  if (status !== 'completed') throw new Error('Coze 轮询超时');

  const msgs = await requestJson(
    `${cfg.apiBase}/v3/chat/message/list?chat_id=${encodeURIComponent(chatId)}&conversation_id=${encodeURIComponent(conversationId)}`,
    { method: 'GET', headers: { Authorization: `Bearer ${cfg.token}` }, timeoutMs: cfg.timeoutMs }
  );
  const list = (msgs && msgs.data) || [];
  const answer = list.filter(m => m.type === 'answer' && m.role === 'assistant').map(m => m.content).join('\n');
  if (!answer) throw new Error('Coze 未返回回答');
  return answer;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ==================== 模板元数据 ====================

/** 读取全部可用模板 + 字段，作为分类候选集（不再硬编码模板ID） */
function loadTemplateCatalog() {
  const db = getDb();
  const templates = db.prepare(`
    SELECT id, code, name, category, description, tags, status
    FROM templates
    WHERE status != 'archived'
    ORDER BY id
  `).all();

  const fieldRows = db.prepare('SELECT * FROM template_fields ORDER BY template_id, sort_order, id').all();
  const byTpl = new Map();
  for (const f of fieldRows) {
    if (!byTpl.has(f.template_id)) byTpl.set(f.template_id, []);
    byTpl.get(f.template_id).push(f);
  }

  return templates.map(t => Object.assign({}, t, { fields: byTpl.get(t.id) || [] }));
}

// ==================== 本地兜底分类器 ====================

/**
 * 业务同义词表：把口语描述映射到模板关键词，弥补纯字面匹配的不足。
 * 命中 anchors 中任意词即为该主题加分。
 */
const TOPIC_ANCHORS = [
  { topic: '使用登记', anchors: ['登记', '注册', '注册代码', '使用登记证', '备案', '建档', '新装', '投用'] },
  { topic: '维保',     anchors: ['维保', '保养', '半月', '月保', '季保', '年保', '润滑', '钢丝绳', '磨损', '曳引', '维护'] },
  { topic: '检验',     anchors: ['检验', '年检', '定期检验', '监督检验', '检验报告', '检验结论', '复检', '到期'] },
  { topic: '故障',     anchors: ['故障', '报修', '困人', '救援', '停梯', '异响', '急停', '关人', '维修'] },
  { topic: '安全部件', anchors: ['限速器', '安全钳', '制动器', '缓冲器', '门锁', '门机', '安全回路', '部件'] },
  { topic: '改造',     anchors: ['改造', '升级', '更换主机', '重大维修', '加装'] },
  { topic: '演练',     anchors: ['演练', '应急', '预案', '培训', '消防'] },
  { topic: '报废',     anchors: ['报废', '拆除', '停用', '注销'] }
];

/** 简单中文分词：按 2~4 字滑窗 + 英文/数字词 */
function tokenize(text) {
  const s = String(text || '');
  const tokens = new Set();
  const latin = s.match(/[A-Za-z0-9][A-Za-z0-9._-]*/g) || [];
  latin.forEach(t => tokens.add(t.toLowerCase()));
  const han = s.replace(/[^\u4e00-\u9fa5]+/g, ' ').split(/\s+/).filter(Boolean);
  for (const seg of han) {
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= seg.length; i++) tokens.add(seg.slice(i, i + n));
    }
    if (seg.length === 1) tokens.add(seg);
  }
  return tokens;
}

/**
 * 本地分类：对每个模板计算匹配分（模板名/分类/描述/标签/字段标签 + 主题锚点）
 */
function localClassify(text, catalog) {
  const tokens = tokenize(text);
  const lower = String(text || '').toLowerCase();

  const scored = catalog.map(t => {
    let score = 0;
    const hits = [];

    const weightedSources = [
      { text: t.name, w: 3.0 },
      { text: t.category, w: 1.5 },
      { text: t.tags, w: 1.2 },
      { text: t.description, w: 0.8 }
    ];
    for (const src of weightedSources) {
      const val = String(src.text || '');
      if (!val) continue;
      for (const tok of tokenize(val)) {
        if (tok.length >= 2 && tokens.has(tok)) { score += src.w * (tok.length >= 3 ? 1.3 : 1); hits.push(tok); }
      }
    }

    // 字段标签命中（说明用户描述里提到了该模板需要的要素）
    for (const f of t.fields || []) {
      const label = String(f.field_label || '').replace(/[（(].*?[)）]/g, '');
      if (label.length >= 2 && lower.includes(label.toLowerCase())) { score += 1.6; hits.push(label); }
    }

    // 主题锚点
    for (const g of TOPIC_ANCHORS) {
      const tplText = `${t.name} ${t.category} ${t.tags || ''} ${t.description || ''}`;
      if (!tplText.includes(g.topic)) continue;
      for (const a of g.anchors) {
        if (lower.includes(a.toLowerCase())) { score += 2.2; hits.push(a); }
      }
    }

    return { template: t, score, hits: Array.from(new Set(hits)).slice(0, 12) };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];
  if (!top || top.score <= 0) {
    return { candidates: scored.slice(0, 3), best: null, confidence: 0 };
  }

  // 置信度 = 绝对分饱和度 × 与次优的区分度
  const saturation = Math.min(1, top.score / 12);           // 12 分认为信息足够
  const margin = second && second.score > 0
    ? Math.min(1, (top.score - second.score) / Math.max(top.score, 1) + 0.35)
    : 1;
  const confidence = Math.max(0.2, Math.min(0.95, saturation * 0.65 + margin * 0.35));

  return {
    best: top,
    candidates: scored.filter(s => s.score > 0).slice(0, 4),
    confidence: Math.round(confidence * 100) / 100
  };
}

// ==================== 字段提取 ====================

const UNIT_HINTS = [
  { re: /额定载重(?:量)?\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:kg|KG|千克|公斤)?/, key: 'load' },
  { re: /额定速度\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:m\/s|米\/秒)?/i, key: 'speed' },
  { re: /(\d+)\s*层/, key: 'floor' },
  { re: /(?:使用|运行)\s*(?:年限|年数)?\s*[:：]?\s*(\d+(?:\.\d+)?)\s*年/, key: 'years' },
  { re: /磨损(?:率)?\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%?/, key: 'wear' },
  { re: /间隔\s*[:：]?\s*(\d+)\s*天/, key: 'interval' }
];

const DATE_RE = /(\d{4}\s*[-/年.]\s*\d{1,2}\s*[-/月.]\s*\d{1,2}\s*日?)/g;

/**
 * 从自然语言中抽取模板字段值（AI-02）
 * 策略：标签直接匹配 → 类型感知正则 → 枚举选项匹配 → 单位提示兜底
 * @returns {{values:Object, evidence:Object}}
 */
function localExtractFields(text, fields) {
  const values = {};
  const evidence = {};
  const src = String(text || '');
  if (!src || !Array.isArray(fields)) return { values, evidence };

  const allDates = [];
  let m;
  const dateRe = new RegExp(DATE_RE.source, 'g');
  while ((m = dateRe.exec(src)) !== null) {
    const norm = normalizeDateOnly(m[1].replace(/\s+/g, ''));
    if (norm) allDates.push({ raw: m[1], value: norm, index: m.index });
  }
  let dateCursor = 0;

  for (const f of fields) {
    const name = f.field_name;
    const label = String(f.field_label || name || '').replace(/[（(].*?[)）]/g, '').trim();
    const type = f.field_type;

    // ---- 1. 「标签: 值」直接命中 ----
    if (label) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const direct = src.match(new RegExp(escaped + '\\s*(?:为|是|:|：)\\s*([^\\s,，。；;]{1,40})'));
      if (direct && direct[1]) {
        const v = cleanValue(direct[1], type);
        if (v !== null && v !== '') {
          values[name] = v;
          evidence[name] = { method: 'label-match', matched: direct[0] };
          continue;
        }
      }
    }

    // ---- 2. 枚举：在文本中找命中的选项 ----
    if (type === 'select' || type === 'radio') {
      const opts = parseFieldOptions(f.options);
      const near = label && src.includes(label) ? src.slice(src.indexOf(label), src.indexOf(label) + 60) : src;
      const hit = opts.find(o => o && near.includes(o)) || opts.find(o => o && src.includes(o));
      if (hit) {
        values[name] = hit;
        evidence[name] = { method: 'enum-match', matched: hit };
        continue;
      }
      continue;
    }

    // ---- 3. 日期：按标签就近取；否则按出现顺序分配 ----
    if (type === 'date') {
      if (label && src.includes(label)) {
        const seg = src.slice(src.indexOf(label), src.indexOf(label) + 60);
        const dm = seg.match(new RegExp(DATE_RE.source));
        if (dm) {
          const norm = normalizeDateOnly(dm[1].replace(/\s+/g, ''));
          if (norm) { values[name] = norm; evidence[name] = { method: 'date-near-label', matched: dm[1] }; continue; }
        }
      }
      if (dateCursor < allDates.length) {
        values[name] = allDates[dateCursor].value;
        evidence[name] = { method: 'date-order', matched: allDates[dateCursor].raw };
        dateCursor++;
      }
      continue;
    }

    // ---- 4. 数字：标签就近的数字 → 单位提示 ----
    if (type === 'number') {
      if (label) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nm = src.match(new RegExp(escaped + '[^\\d\\-]{0,8}(\\d+(?:\\.\\d+)?)'));
        if (nm) { values[name] = nm[1]; evidence[name] = { method: 'number-near-label', matched: nm[0] }; continue; }
      }
      const hint = UNIT_HINTS.find(h => guessNumberKey(name, label) === h.key);
      if (hint) {
        const hm = src.match(hint.re);
        if (hm) { values[name] = hm[1]; evidence[name] = { method: 'unit-hint', matched: hm[0] }; continue; }
      }
      continue;
    }

    // ---- 5. 文本：仅在有明确标签上下文时提取，避免误抓 ----
    if (label && src.includes(label)) {
      const seg = src.slice(src.indexOf(label) + label.length, src.indexOf(label) + label.length + 40);
      const tm = seg.match(/^[\s:：为是]*([^\s,，。；;]{2,30})/);
      if (tm && tm[1]) {
        values[name] = tm[1];
        evidence[name] = { method: 'text-near-label', matched: tm[1] };
      }
    }
  }

  return { values, evidence };
}

function guessNumberKey(fieldName, label) {
  const s = `${fieldName} ${label}`.toLowerCase();
  if (/load|载重|载荷/.test(s)) return 'load';
  if (/speed|速度/.test(s)) return 'speed';
  if (/floor|层/.test(s)) return 'floor';
  if (/year|年限/.test(s)) return 'years';
  if (/wear|磨损/.test(s)) return 'wear';
  if (/interval|间隔/.test(s)) return 'interval';
  return null;
}

function cleanValue(raw, type) {
  let v = String(raw == null ? '' : raw).trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
  if (type === 'number') {
    const m = v.match(/-?\d+(?:\.\d+)?/);
    return m ? m[0] : null;
  }
  if (type === 'date') return normalizeDateOnly(v);
  return v;
}

// ==================== 对外主接口 ====================

/**
 * 合规分类（AI-01/AI-03/AI-04）
 * @param {string} text 用户自然语言描述
 * @returns {Promise<object>}
 */
async function classify(text) {
  const input = String(text || '').trim();
  const catalog = loadTemplateCatalog();
  const threshold = confidenceThreshold();
  const provider = preferredProvider();

  if (!input) {
    return {
      provider: 'none', confidence: 0, threshold,
      needManualSelect: true, templateId: null, templateName: null,
      candidates: catalog.slice(0, 5).map(t => ({ templateId: t.id, templateName: t.name, score: 0 })),
      reason: '输入为空'
    };
  }
  if (!catalog.length) {
    return {
      provider: 'none', confidence: 0, threshold,
      needManualSelect: true, templateId: null, templateName: null,
      candidates: [], reason: '模板库为空'
    };
  }

  // ---------- 1. 远程大模型（Coze 优先） ----------
  const cfg = cozeConfig();
  const wantRemote = provider === 'auto' || provider === 'coze';
  if (wantRemote && cfg.enabled) {
    try {
      const prompt = buildClassifyPrompt(input, catalog);
      const raw = await callCozeBot(prompt);
      const parsed = extractJson(raw);
      const shaped = shapeRemoteClassification(parsed, catalog, input, threshold, 'coze');
      if (shaped) return shaped;
      console.warn('[AI] Coze 返回无法解析，降级本地分类器');
    } catch (e) {
      console.warn('[AI] Coze 分类失败，降级本地分类器:', e.message);
    }
  }

  // ---------- 2. Ollama ----------
  if (provider === 'auto' || provider === 'ollama') {
    try {
      const aiService = require('./ai-service');
      if (aiService.getStatus().ollama) {
        const prompt = buildClassifyPrompt(input, catalog);
        const raw = await aiService.callOllama('qwen2.5:0.5b', prompt);
        const parsed = extractJson(raw);
        const shaped = shapeRemoteClassification(parsed, catalog, input, threshold, 'ollama');
        if (shaped) return shaped;
      }
    } catch (e) {
      console.warn('[AI] Ollama 分类失败，降级本地分类器:', e.message);
    }
  }

  // ---------- 3. 本地兜底 ----------
  const local = localClassify(input, catalog);
  const best = local.best;
  const confidence = local.confidence;
  const needManual = !best || confidence < threshold;
  const chosen = best ? best.template : null;
  const extract = chosen ? localExtractFields(input, chosen.fields) : { values: {}, evidence: {} };

  return {
    provider: 'local',
    confidence,
    threshold,
    needManualSelect: needManual,
    templateId: chosen ? chosen.id : null,
    templateName: chosen ? chosen.name : null,
    matchedKeywords: best ? best.hits : [],
    candidates: local.candidates.map(c => ({
      templateId: c.template.id,
      templateName: c.template.name,
      category: c.template.category,
      score: Math.round(c.score * 100) / 100
    })),
    extracted: extract.values,
    extractEvidence: extract.evidence,
    reason: needManual
      ? `置信度 ${confidence} 低于阈值 ${threshold}，请人工确认模板`
      : '本地语义匹配'
  };
}

function buildClassifyPrompt(text, catalog) {
  const list = catalog.map(t => {
    const fieldSpec = (t.fields || []).map(f => {
      const opts = parseFieldOptions(f.options);
      return `      - ${f.field_name}(${f.field_label}, ${f.field_type}${opts.length ? ', 可选值: ' + opts.join('/') : ''})`;
    }).join('\n');
    return `  * id=${t.id} | ${t.name} | 分类:${t.category || '-'}\n${fieldSpec || '      - (无字段)'}`;
  }).join('\n');

  return `你是特种设备（电梯）安全管理系统的分类器。你的任务**只有两个**：
(1) 把用户描述映射到下列模板之一；(2) 从描述中抽取该模板所需字段的值。
**严禁**输出任何"合规/不合规"的判断结论——结论由确定性规则引擎生成。

可选模板清单：
${list}

用户描述：
"""
${text.slice(0, 2000)}
"""

严格输出如下 JSON（不要任何解释文字、不要 markdown 代码块）：
{
  "template_id": <整数, 从上面清单里选; 无法确定填 null>,
  "confidence": <0到1的小数, 表示映射把握>,
  "matched_keywords": ["命中的关键词"],
  "candidates": [{"template_id": <整数>, "confidence": <0-1>}],
  "extracted": {"字段名": "抽取到的值（日期用 YYYY-MM-DD，数字只给数值，枚举必须取可选值之一）"}
}`;
}

/** 校验并规整远程模型输出，非法则返回 null 触发降级 */
function shapeRemoteClassification(parsed, catalog, input, threshold, provider) {
  if (!parsed || typeof parsed !== 'object') return null;

  const byId = new Map(catalog.map(t => [t.id, t]));
  let tid = parsed.template_id != null ? parseInt(parsed.template_id, 10) : null;
  if (!byId.has(tid)) tid = null;

  let confidence = Number(parsed.confidence);
  if (isNaN(confidence)) confidence = tid ? 0.6 : 0;
  confidence = Math.max(0, Math.min(1, confidence));

  const tpl = tid ? byId.get(tid) : null;

  // 字段值必须落在模板定义内，且枚举值必须合法；否则丢弃该字段（防止模型幻觉污染规则引擎）
  const extracted = {};
  const dropped = [];
  if (tpl && parsed.extracted && typeof parsed.extracted === 'object') {
    const fieldMap = new Map((tpl.fields || []).map(f => [f.field_name, f]));
    for (const [k, v] of Object.entries(parsed.extracted)) {
      const f = fieldMap.get(k);
      if (!f || v == null || v === '') { dropped.push(k); continue; }
      if (f.field_type === 'select' || f.field_type === 'radio') {
        const opts = parseFieldOptions(f.options);
        if (opts.length && !opts.includes(String(v))) { dropped.push(k); continue; }
      }
      const cleaned = cleanValue(v, f.field_type);
      if (cleaned === null || cleaned === '') { dropped.push(k); continue; }
      extracted[k] = cleaned;
    }
  }

  // 远程没抽到的字段，用本地提取补齐（互补而非覆盖）
  if (tpl) {
    const localEx = localExtractFields(input, tpl.fields);
    for (const [k, v] of Object.entries(localEx.values)) {
      if (extracted[k] === undefined) extracted[k] = v;
    }
  }

  const candidates = Array.isArray(parsed.candidates)
    ? parsed.candidates
        .map(c => ({ id: parseInt(c.template_id, 10), conf: Number(c.confidence) || 0 }))
        .filter(c => byId.has(c.id))
        .map(c => ({
          templateId: c.id,
          templateName: byId.get(c.id).name,
          category: byId.get(c.id).category,
          score: Math.round(c.conf * 100) / 100
        }))
    : [];

  if (!candidates.length && tpl) {
    candidates.push({ templateId: tpl.id, templateName: tpl.name, category: tpl.category, score: confidence });
  }

  return {
    provider,
    confidence: Math.round(confidence * 100) / 100,
    threshold,
    needManualSelect: !tpl || confidence < threshold,
    templateId: tpl ? tpl.id : null,
    templateName: tpl ? tpl.name : null,
    matchedKeywords: Array.isArray(parsed.matched_keywords) ? parsed.matched_keywords.slice(0, 12) : [],
    candidates,
    extracted,
    droppedFields: dropped,
    reason: !tpl
      ? '大模型未能确定模板，请人工选择'
      : (confidence < threshold ? `置信度 ${confidence} 低于阈值 ${threshold}，请人工确认模板` : `${provider} 分类`)
  };
}

/**
 * 字段提取（供 /api/ai/extract 使用）
 * @param {string} text
 * @param {number|null} templateId
 */
async function extractFields(text, templateId) {
  const db = getDb();
  const fields = templateId
    ? db.prepare('SELECT * FROM template_fields WHERE template_id = ? ORDER BY sort_order, id').all(templateId)
    : [];

  const cfg = cozeConfig();
  const provider = preferredProvider();

  if (fields.length && cfg.enabled && (provider === 'auto' || provider === 'coze')) {
    try {
      const spec = fields.map(f => {
        const opts = parseFieldOptions(f.options);
        return `  - ${f.field_name} (${f.field_label}, ${f.field_type}${opts.length ? ', 可选值: ' + opts.join('/') : ''})`;
      }).join('\n');
      const prompt = `从下面的文本中抽取字段值，只输出 JSON 对象（键为字段名）。找不到的字段请省略，不要编造。
日期输出 YYYY-MM-DD；数字只输出数值；枚举必须取给定可选值之一。

字段定义：
${spec}

文本：
"""
${String(text).slice(0, 2000)}
"""`;
      const raw = await callCozeBot(prompt);
      const parsed = extractJson(raw);
      if (parsed && typeof parsed === 'object') {
        const values = {};
        const fieldMap = new Map(fields.map(f => [f.field_name, f]));
        for (const [k, v] of Object.entries(parsed)) {
          const f = fieldMap.get(k);
          if (!f || v == null || v === '') continue;
          if (f.field_type === 'select' || f.field_type === 'radio') {
            const opts = parseFieldOptions(f.options);
            if (opts.length && !opts.includes(String(v))) continue;
          }
          const cleaned = cleanValue(v, f.field_type);
          if (cleaned !== null && cleaned !== '') values[k] = cleaned;
        }
        const localEx = localExtractFields(text, fields);
        for (const [k, v] of Object.entries(localEx.values)) {
          if (values[k] === undefined) values[k] = v;
        }
        return { provider: 'coze', values, evidence: localEx.evidence, fields };
      }
    } catch (e) {
      console.warn('[AI] Coze 字段提取失败，降级本地:', e.message);
    }
  }

  const localEx = localExtractFields(text, fields);
  return { provider: 'local', values: localEx.values, evidence: localEx.evidence, fields };
}

/** AI 能力层状态（供 /api/ai/status 与系统设置页展示） */
function getStatus() {
  const cfg = cozeConfig();
  return {
    provider: preferredProvider(),
    confidenceThreshold: confidenceThreshold(),
    coze: {
      enabled: cfg.enabled,
      apiBase: cfg.apiBase,
      botConfigured: !!cfg.botId,
      workflowConfigured: !!cfg.workflowId,
      tokenConfigured: !!cfg.token,
      hint: cfg.enabled ? 'Coze 已接入' : '未配置 COZE_API_TOKEN / coze.bot_id，使用本地兜底分类器'
    },
    fallback: 'local-semantic-scorer'
  };
}

module.exports = {
  classify,
  extractFields,
  localClassify,
  localExtractFields,
  loadTemplateCatalog,
  getStatus,
  cozeConfig,
  confidenceThreshold,
  callCozeBot,
  extractJson,
  tokenize
};
