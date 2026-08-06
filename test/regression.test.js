#!/usr/bin/env node
/**
 * P0/P1/P2 缺陷修复回归测试
 *
 * 用法：先启动服务（PORT=3199 node server.js），再执行：
 *   node test/regression.test.js  [baseUrl]
 *
 * 覆盖：
 *   BUG-01 导航链接 / BUG-02 分页 / BUG-03 字段顺序 / BUG-04 时区 / BUG-05 下拉选项
 *   BUG-06 一键填充 DOM / BUG-07 长文本 / BUG-08 导出
 *   LOG-01~04 司法留痕（IP / 请求响应摘要 / 前后对比 / 哈希链）
 *   AI-01~04 分类器 / TR-01~04 模板研究 / KB-02~05 知识库
 */

'use strict';

const path = require('path');
const BASE = process.argv[2] || 'http://localhost:3199';

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (extra ? ' → ' + extra : '')); console.log(`  ❌ ${name}${extra ? ' → ' + extra : ''}`); }
}
function section(t) { console.log(`\n\x1b[1m${t}\x1b[0m`); }

let cookie = '';
async function api(pathname, opts = {}) {
  // 注意：headers 必须在 opts 展开**之后**合并，否则 opts.headers 会整体覆盖掉 Cookie
  const init = Object.assign({}, opts);
  init.headers = Object.assign({ 'Content-Type': 'application/json', Cookie: cookie }, opts.headers || {});
  init.redirect = opts.redirect || 'manual';
  const res = await fetch(BASE + pathname, init);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString('utf8');
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* html/csv */ }
  return { status: res.status, headers: res.headers, json, text, buf };
}
/** 字节级判断 UTF-8 BOM（fetch 的 res.text() 会自动剔除 BOM，不能用字符串判） */
function hasBom(r) {
  return r.buf && r.buf.length >= 3 && r.buf[0] === 0xEF && r.buf[1] === 0xBB && r.buf[2] === 0xBF;
}

(async function main() {
  console.log(`\n=== 电梯安全管理系统 · 缺陷修复回归测试 ===\n目标: ${BASE}`);

  // ---------- 单元级：不依赖服务 ----------
  section('【单元】BUG-05 下拉选项解析（utils/field-options.js）');
  const { parseFieldOptions, serializeFieldOptions } = require(path.join(__dirname, '..', 'utils', 'field-options'));
  ok('JSON 数组 ["是","否"] → ["是","否"]', JSON.stringify(parseFieldOptions('["是","否"]')) === '["是","否"]', JSON.stringify(parseFieldOptions('["是","否"]')));
  ok('竖线分隔 客梯|货梯 → 2项', parseFieldOptions('客梯|货梯|医梯').length === 3);
  ok('逗号分隔 正常,异常 → 2项', JSON.stringify(parseFieldOptions('正常,异常')) === '["正常","异常"]');
  ok('带引号逗号 "是","否" → 去引号', JSON.stringify(parseFieldOptions('"是","否"')) === '["是","否"]');
  ok('中文逗号/顿号', parseFieldOptions('正常，异常、待定').length === 3);
  ok('对象数组 [{label,value}]', JSON.stringify(parseFieldOptions([{ label: 'A', value: 'a' }])) === '["a"]');
  ok('空值 → []', parseFieldOptions(null).length === 0 && parseFieldOptions('').length === 0);
  ok('归一化写库为 JSON 数组', serializeFieldOptions('客梯|货梯') === '["客梯","货梯"]');

  section('【单元】BUG-04 时区处理（utils/datetime.js）');
  const dtu = require(path.join(__dirname, '..', 'utils', 'datetime'));
  ok('SQLite UTC 串按 UTC 解析', dtu.toIso('2026-08-06 16:49:56') === '2026-08-06T16:49:56.000Z', dtu.toIso('2026-08-06 16:49:56'));
  ok('纯日期不被时区偏移', dtu.normalizeDateOnly('2023-06-15') === '2023-06-15');
  ok('中文日期归一化', dtu.normalizeDateOnly('2023年6月5日') === '2023-06-05', dtu.normalizeDateOnly('2023年6月5日'));
  ok('斜杠日期归一化', dtu.normalizeDateOnly('2024/6/1') === '2024-06-01');
  ok('日期差计算正确', dtu.diffDays('2024-01-01', '2024-03-01') === 60, String(dtu.diffDays('2024-01-01', '2024-03-01')));

  section('【单元】BUG-04 规则引擎日期比较');
  const engine = require(path.join(__dirname, '..', 'rule-engine'));
  ok('识别日期型值', engine.isDateLike('2024-06-15') === true && engine.isDateLike('7') === false);
  ok('同年份日期可正确比较（旧实现会误判相等）', engine.compareAsDate('2024-01-01', '2024-06-15', '<') === true);
  ok('跨日比较不受时区影响', engine.compareAsDate('2024-06-15', '2024-06-15', '==') === true);
  ok('大于比较', engine.compareAsDate('2025-01-01', '2024-12-31', '>') === true);
  ok('支持 today 相对阈值', typeof engine.compareAsDate('2000-01-01', 'today', '<') === 'boolean');

  section('【单元】LOG-03 前后数据对比');
  const actx = require(path.join(__dirname, '..', 'utils', 'audit-context'));
  const d1 = actx.diffRecords({ name: 'A', status: 'draft' }, { name: 'A', status: 'active' });
  ok('仅记录变化字段', d1.changedCount === 1 && d1.changes.status.before === 'draft' && d1.changes.status.after === 'active');
  ok('敏感字段脱敏', JSON.stringify(actx.redact({ password: '123456', a: 1 })) === '{"password":"[REDACTED]","a":1}');
  ok('摘要含 sha256 与大小', (() => { const g = actx.digest({ a: 1 }); return !!g.sha256 && g.size > 0; })());
  ok('X-Forwarded-For 取首个 IP', actx.extractIp({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } }) === '1.2.3.4');
  ok('IPv6 映射地址归一化', actx.extractIp({ headers: {}, socket: { remoteAddress: '::ffff:127.0.0.1' } }) === '127.0.0.1');

  // ---------- 接口级 ----------
  section('【接口】登录');
  const login = await api('/api/login', { method: 'POST', body: JSON.stringify({ email: 'admin@demo.com', password: '123456' }) });
  ok('管理员登录成功', login.json && login.json.success === true, JSON.stringify(login.json).slice(0, 120));
  if (!login.json || !login.json.success) { report(); return; }
  // 令牌含 base64 填充 '='，必须 URL 编码（服务端 cookie 解析会 decodeURIComponent）
  cookie = 'ev3_tok=' + encodeURIComponent(login.json.token);
  ok('登录后会话可用', (await api('/api/user/me')).status === 200);

  section('【接口】BUG-02 分页与搜索');
  const p1 = await api('/api/discrimination-records?page=1&pageSize=5');
  ok('第1页返回 5 条', p1.json && p1.json.data.length === 5, p1.json && String(p1.json.data.length));
  const p2 = await api('/api/discrimination-records?page=2&pageSize=5');
  ok('第2页与第1页数据不同', p2.json && p1.json && p2.json.data[0].id !== p1.json.data[0].id);
  ok('totalPages 计算正确', p1.json && p1.json.totalPages === Math.ceil(p1.json.total / 5));
  const srch = await api('/api/discrimination-records?page=1&search=' + encodeURIComponent('维保'));
  ok('搜索不再报 SQL 错误（原 no such column: t.name）', srch.status === 200 && srch.json && Array.isArray(srch.json.data), JSON.stringify(srch.json).slice(0, 140));
  const bad = await api('/api/discrimination-records?page=abc&pageSize=-5');
  ok('非法分页参数被兜底', bad.status === 200 && bad.json.page === 1 && bad.json.pageSize > 0, JSON.stringify(bad.json && { p: bad.json.page, s: bad.json.pageSize }));
  const over = await api('/api/discrimination-records?page=99999&pageSize=5');
  ok('超界页回落到最后一页且非空', over.json && over.json.data.length > 0 && over.json.page === over.json.totalPages);
  const at = await api('/api/audit-tasks?page=1&pageSize=2&status=pending');
  ok('审核任务分页正常', at.status === 200 && at.json && Array.isArray(at.json.data));

  section('【接口】BUG-05 下拉选项（options_list）');
  const tpl2 = await api('/api/templates/2');
  const selField = tpl2.json && tpl2.json.fields.find(f => f.field_type === 'select');
  ok('select 字段带 options_list 数组', !!(selField && Array.isArray(selField.options_list)));
  ok('JSON 数组选项被正确拆分（无 [ " 残留）',
    !!(selField && selField.options_list.length >= 2 && selField.options_list.every(o => !/[\[\]"]/.test(o))),
    selField && JSON.stringify(selField.options_list));
  const tpl6 = await api('/api/templates/6');
  const pipeField = tpl6.json && (tpl6.json.fields || []).find(f => f.field_name === 'device_type');
  ok('竖线分隔选项被正确拆分', !!(pipeField && pipeField.options_list.length === 5), pipeField && JSON.stringify(pipeField.options_list));

  section('【接口】BUG-03 模板字段顺序');
  const beforeT = await api('/api/templates/1');
  const origFields = beforeT.json.fields.map(f => f.field_name);
  // 反转顺序 + 追加新字段（新字段无 sort_order，旧实现会与历史编号冲突）
  const reordered = beforeT.json.fields.slice().reverse().map((f, i) => Object.assign({}, f, { sort_order: i }));
  reordered.push({ field_name: 'zz_test_field', field_label: '回归测试字段', field_type: 'text', required: false });
  const putRes = await api('/api/templates/1', { method: 'PUT', body: JSON.stringify({ fields: reordered }) });
  ok('保存模板成功', putRes.json && putRes.json.success === true);
  const afterT = await api('/api/templates/1');
  const newOrder = afterT.json.fields.map(f => f.field_name);
  ok('字段顺序与提交顺序完全一致',
    JSON.stringify(newOrder) === JSON.stringify(origFields.slice().reverse().concat(['zz_test_field'])),
    JSON.stringify(newOrder));
  ok('sort_order 重建为 0..n-1 连续唯一',
    afterT.json.fields.every((f, i) => f.sort_order === i));
  // 还原
  await api('/api/templates/1', { method: 'PUT', body: JSON.stringify({ fields: beforeT.json.fields.map((f, i) => Object.assign({}, f, { sort_order: i })) }) });
  const restored = await api('/api/templates/1');
  ok('还原成功', JSON.stringify(restored.json.fields.map(f => f.field_name)) === JSON.stringify(origFields));

  section('【接口】BUG-04 时间字段 ISO 化');
  const recs = await api('/api/discrimination-records?page=1&pageSize=1');
  const rec0 = recs.json.data[0];
  ok('列表附带 created_at_iso', !!rec0.created_at_iso, String(rec0.created_at_iso));
  ok('ISO 与 UTC 原值一致（未被本地时区二次偏移）',
    rec0.created_at_iso === new Date(rec0.created_at.replace(' ', 'T') + 'Z').toISOString(),
    rec0.created_at + ' vs ' + rec0.created_at_iso);

  section('【接口】AI-01~04 分类器');
  const cls = await api('/api/ai/classify', { method: 'POST', body: JSON.stringify({ text: '这台电梯的钢丝绳磨损率为 8.5%，维保间隔 20 天，制动器状态异常' }) });
  ok('分类接口返回 200', cls.status === 200, JSON.stringify(cls.json).slice(0, 160));
  ok('返回置信度与阈值', cls.json && typeof cls.json.confidence === 'number' && typeof cls.json.threshold === 'number');
  ok('返回候选模板列表', cls.json && Array.isArray(cls.json.candidates));
  ok('返回 needManualSelect 决策位（AI-04）', cls.json && typeof cls.json.needManualSelect === 'boolean');
  ok('命中维保类模板', cls.json && cls.json.templateName && /维保/.test(cls.json.templateName), cls.json && cls.json.templateName);
  ok('字段自动提取非空（AI-02）', cls.json && cls.json.extracted && Object.keys(cls.json.extracted).length > 0, JSON.stringify(cls.json && cls.json.extracted));
  const vague = await api('/api/ai/classify', { method: 'POST', body: JSON.stringify({ text: '你好' }) });
  ok('模糊输入触发人工选择', vague.json && vague.json.needManualSelect === true, JSON.stringify(vague.json && { c: vague.json.confidence, n: vague.json.needManualSelect }));

  const ext = await api('/api/ai/extract', { method: 'POST', body: JSON.stringify({ text: '钢丝绳磨损率 6.2%，维保间隔 10 天，制动器状态正常，维保日期 2024-05-20', templateId: 2 }) });
  ok('字段提取接口返回 200', ext.status === 200);
  ok('提取数值字段', ext.json && ext.json.extracted && Object.keys(ext.json.extracted).length >= 2, JSON.stringify(ext.json && ext.json.extracted));
  ok('枚举值合法（在选项内）', (() => {
    const e = (ext.json && ext.json.extracted) || {};
    return !e.brake_status || ['正常', '异常', '需更换'].includes(e.brake_status);
  })(), JSON.stringify(ext.json && ext.json.extracted));
  const st = await api('/api/ai/status');
  ok('AI 状态含 classifier 分区', st.json && st.json.classifier && st.json.classifier.coze);

  section('【接口】LOG-01/02/03/04 司法留痕');
  const logsBefore = await api('/api/operation-logs?page=1&pageSize=1');
  const totalBefore = logsBefore.json.total;
  // 触发一次带前后对比的修改
  await api('/api/regulations/1', { method: 'PUT', body: JSON.stringify({ name: '回归测试-临时改名', source: 'REGRESSION' }) });
  const logs = await api('/api/operation-logs?page=1&pageSize=10');
  const updLog = logs.json.data.find(l => l.action === '更新法规');
  ok('日志数增加', logs.json.total > totalBefore);
  ok('LOG-01 记录 IP 地址', !!(updLog && updLog.ip_address), updLog && String(updLog.ip_address));
  ok('LOG-01 记录 User-Agent', !!(updLog && updLog.user_agent));
  ok('LOG-01 记录操作人角色', updLog && updLog.user_role === 'admin', updLog && String(updLog.user_role));
  ok('LOG-02 记录请求摘要（含 sha256）', !!(updLog && updLog.request_digest_obj && updLog.request_digest_obj.sha256));
  ok('LOG-02 记录 request_id', !!(updLog && updLog.request_id));
  const respLog = logs.json.data.find(l => l.action === '操作响应');
  ok('LOG-02 记录响应摘要（成对的响应链上日志）', !!(respLog && respLog.response_digest_obj && respLog.response_digest_obj.sha256));
  ok('LOG-03 记录前后数据对比', !!(updLog && updLog.data_after_obj && updLog.data_after_obj.diff && updLog.data_after_obj.diff.changedCount > 0),
    updLog && JSON.stringify(updLog.data_after_obj && updLog.data_after_obj.diff && updLog.data_after_obj.diff.changedKeys));
  ok('LOG-03 变更含 name 字段', !!(updLog && updLog.data_after_obj.diff.changes && updLog.data_after_obj.diff.changes.name));
  ok('LOG-04 chain_version = 2', updLog && updLog.chain_version === 2, updLog && String(updLog.chain_version));
  const verify = await api('/api/operation-logs/verify', { method: 'POST' });
  ok('LOG-04 哈希链校验通过（v1 历史日志兼容）', verify.json && verify.json.isValid === true,
    verify.json && JSON.stringify(verify.json.errors && verify.json.errors.slice(0, 2)));
  ok('哈希链版本统计可见', verify.json && verify.json.versionStats && typeof verify.json.versionStats.v2 === 'number');
  // 还原法规名
  await api('/api/regulations/1', { method: 'PUT', body: JSON.stringify({ name: '特种设备安全监察条例' }) });

  section('【接口】BUG-08 / LOG-07 导出');
  const expJson = await api('/api/logs/export?format=json');
  ok('日志 JSON 导出成功', expJson.status === 200 && /"chain_verification"/.test(expJson.text));
  ok('导出附带哈希链校验结果', /"isValid"/.test(expJson.text));
  const expCsv = await api('/api/logs/export?format=csv');
  ok('日志 CSV 导出成功且带 BOM（Excel 不乱码）', expCsv.status === 200 && hasBom(expCsv), String(expCsv.status));
  ok('CSV 含 IP 列', /ip_address/.test(expCsv.text));
  const recCsv = await api('/api/discrimination-records/export?format=csv');
  ok('判别记录 CSV 导出成功', recCsv.status === 200 && hasBom(recCsv), String(recCsv.status));

  section('【接口】KB-02/03/04/05 知识库');
  const lv = await api('/api/regulations/levels');
  ok('五层分类体系可用', lv.json && lv.json.data.length === 5, lv.json && JSON.stringify(lv.json.data.map(x => x.label)));
  ok('层级含效力 rank', lv.json && lv.json.data[0].rank === 1 && lv.json.data[0].label === '法律');
  const regDetail = await api('/api/regulations/1');
  ok('法规详情接口存在（原缺失导致编辑按钮失效）', regDetail.status === 200 && regDetail.json.id === 1, String(regDetail.status));
  ok('详情含条款与版本链', regDetail.json && Array.isArray(regDetail.json.clauses) && Array.isArray(regDetail.json.versions));

  const newReg = await api('/api/regulations', { method: 'POST', body: JSON.stringify({ code: 'REG-TEST-' + Date.now(), name: '回归测试法规', level: '', source: 'test' }) });
  ok('新建法规成功', newReg.json && newReg.json.success === true, JSON.stringify(newReg.json).slice(0, 120));
  ok('KB-02 未填层级时按编码自动推断', newReg.json && !!newReg.json.level, newReg.json && newReg.json.level);
  ok('KB-04 新建法规默认进入待审核', newReg.json && newReg.json.review_status === 'pending', newReg.json && newReg.json.review_status);
  const newRegId = newReg.json.id;

  const rejectRes = await api(`/api/regulations/${newRegId}/review`, { method: 'POST', body: JSON.stringify({ decision: 'reject' }) });
  ok('KB-04 驳回未填意见被拒绝', rejectRes.status === 400, String(rejectRes.status));
  const approveRes = await api(`/api/regulations/${newRegId}/review`, { method: 'POST', body: JSON.stringify({ decision: 'approve', note: '回归测试通过', level: '国家标准' }) });
  ok('KB-04 审核通过', approveRes.json && approveRes.json.review_status === 'approved');
  const afterReview = await api('/api/regulations/' + newRegId);
  ok('审核后状态转为 active', afterReview.json.status === 'active', afterReview.json.status);
  ok('审核可补充层级', afterReview.json.level === '国家标准', afterReview.json.level);
  ok('记录审核人', !!afterReview.json.reviewed_by);

  const nv = await api(`/api/regulations/${newRegId}/new-version`, { method: 'POST', body: JSON.stringify({ revision_note: '回归测试新版' }) });
  ok('KB-05 创建新版本成功', nv.json && nv.json.success === true, JSON.stringify(nv.json).slice(0, 120));
  const chain = await api(`/api/regulations/${newRegId}/versions`);
  ok('KB-05 版本链包含 2 个版本', chain.json && chain.json.data.length === 2, chain.json && String(chain.json.data.length));
  const oldAfter = await api('/api/regulations/' + newRegId);
  ok('KB-05 旧版本被标记为已被替代', !!oldAfter.json.superseded_by_id);

  // KB-03 条款结构化
  const cl = await api(`/api/regulations/${newRegId}/clauses`, {
    method: 'POST',
    body: JSON.stringify({ clause_number: '1.1', title: '测试条款', content: '测试内容', severity: 'mandatory', effective_date: '2024-01-01', device_type: '曳引电梯' })
  });
  ok('KB-03 条款可带生效日期与设备类型', cl.json && cl.json.success === true);
  const clList = await api(`/api/regulations/${newRegId}/clauses`);
  const c0 = clList.json.clauses[0];
  ok('KB-03 条款结构化字段落库', !!(c0 && c0.effective_date === '2024-01-01' && c0.device_type === '曳引电梯'), JSON.stringify(c0 && { e: c0.effective_date, d: c0.device_type }));
  ok('条款接口同时兼容 clauses/data 两种字段（research 页依赖 data）', Array.isArray(clList.json.data));

  // 中文多关键词搜索
  const kbSearch = await api('/api/regulations?search=' + encodeURIComponent('特种设备'));
  ok('知识库搜索可用（含条款正文命中）', kbSearch.status === 200 && Array.isArray(kbSearch.json.data));

  // 清理
  await api('/api/regulations/' + nv.json.id, { method: 'DELETE' });
  await api('/api/regulations/' + newRegId, { method: 'DELETE' });

  section('【接口】TR-01~04 模板研究与专家审阅');
  const task = await api('/api/template-research', { method: 'POST', body: JSON.stringify({ task_name: '回归测试研究任务', task_description: '自动化测试', standards: 'TSG T7001' }) });
  ok('TR-01 创建研究任务', task.json && task.json.success === true);
  const taskId = task.json.id;
  const sug = await api(`/api/template-research/${taskId}/ai-suggest`, { method: 'POST' });
  ok('TR-02 生成 AI 模板建议', sug.json && sug.json.success === true, JSON.stringify(sug.json).slice(0, 120));
  const sid = sug.json.data.suggestion_id;
  ok('建议含字段定义', sug.json.data.suggestion && Array.isArray(sug.json.data.suggestion.fields) && sug.json.data.suggestion.fields.length > 0);

  const review = await api(`/api/template-research/${taskId}/suggestions/${sid}/review`, {
    method: 'POST',
    body: JSON.stringify({
      decisions: {
        fields: [
          { index: 0, action: 'accept' },
          { index: 1, action: 'reject', note: '该字段与现行规程重复' },
          { index: 2, action: 'modify', value: { name: 'wire_rope_wear_rate', label: '钢丝绳磨损率(%)【专家修订】', type: 'number', required: true }, note: '补充单位' }
        ],
        rules: [{ index: 0, action: 'accept' }]
      },
      feedback: '整体可用，个别字段需调整'
    })
  });
  ok('TR-03 专家逐条审阅成功', review.json && review.json.success === true, JSON.stringify(review.json).slice(0, 140));
  const diff = review.json.data.diff;
  ok('TR-04 差异统计正确（1 拒绝 1 修改）', diff.fields.rejected === 1 && diff.fields.modified === 1, JSON.stringify(diff.fields));
  ok('TR-04 差异含逐条轨迹', Array.isArray(diff.fields.trace) && diff.fields.trace.length > 0);
  ok('专家定稿字段数 = AI 字段数 - 1', review.json.data.final.fields.length === diff.fields.ai - 1);
  ok('专家修改内容已生效', /专家修订/.test(JSON.stringify(review.json.data.final.fields)));

  const detail = await api(`/api/template-research/${taskId}`);
  const s0 = detail.json.data.suggestions.find(s => s.id === sid);
  ok('定稿与差异已持久化', !!(s0 && s0.final_output_json && s0.diff_summary));
  ok('记录审阅人', !!(s0 && s0.reviewed_by));

  const pub = await api(`/api/template-research/${taskId}/publish`, { method: 'PUT' });
  ok('TR-01 发布模板成功', pub.json && pub.json.success === true, JSON.stringify(pub.json).slice(0, 140));
  ok('发布来源为专家定稿（而非 AI 原始稿）', pub.json.data.publish_source === 'expert_final', pub.json.data.publish_source);
  const pubTpl = await api('/api/templates/' + pub.json.data.template_id);
  ok('发布模板字段顺序连续', pubTpl.json.fields.every((f, i) => f.sort_order === i));
  ok('发布模板选项已归一化为数组', pubTpl.json.fields.every(f => Array.isArray(f.options_list)));

  // 清理
  await api('/api/templates/' + pub.json.data.template_id, { method: 'DELETE' });
  await api('/api/template-research/' + taskId, { method: 'DELETE' });

  section('【接口】BUG-07 长文本 & 判别主流程');
  const disc = await api('/api/discriminate', {
    method: 'POST',
    body: JSON.stringify({
      templateId: 2,
      templateName: '电梯半月维保记录审核',
      inputText: '钢丝绳磨损率 9%，维保间隔 20 天',
      formData: { wire_rope_wear_rate: '9', maintenance_interval: '20', brake_status: '异常', door_status: '正常', governor_calibrated: '是' }
    })
  });
  ok('判别提交成功', disc.json && disc.json.success === true, JSON.stringify(disc.json).slice(0, 140));
  ok('返回哈希（司法留痕）', !!(disc.json && disc.json.hash));
  ok('规则引擎给出确定性结论', !!(disc.json && disc.json.finalResult));
  const discRec = await api('/api/discrimination-records/' + disc.json.id);
  ok('判别记录落库含 IP（司法留痕）', !!(discRec.json && discRec.json.record.ip_address), discRec.json && String(discRec.json.record.ip_address));

  section('【接口】BUG-01 导航链接');
  const PC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';
  const pages = ['/', '/discriminate', '/history', '/templates', '/knowledge', '/logs', '/settings', '/audit', '/research'];
  for (const p of pages) {
    const r = await api(p, { headers: { 'User-Agent': PC_UA } });
    ok(`页面 ${p} 正常渲染（非登录页/非重定向）`, r.status === 200 && /id="sideBar"/.test(r.text), String(r.status));
  }
  const dash = await api('/dashboard', { headers: { 'User-Agent': PC_UA } });
  ok('/dashboard 仍兼容（302 到 /）', dash.status === 302, String(dash.status));

  const home = await api('/', { headers: { 'User-Agent': PC_UA } });
  ok('侧边栏首页链接直指 /（不再走 /dashboard 二次跳转）',
    /href="\/" class="side-it[^"]*" data-page="dashboard"/.test(home.text),
    (home.text.match(/href="[^"]*" class="side-it[^"]*" data-page="dashboard"/) || ['未匹配'])[0]);
  ok('服务端直接输出选中态 .on（不依赖 JS）', /href="\/" class="side-it on" data-page="dashboard"/.test(home.text));
  const hist = await api('/history', { headers: { 'User-Agent': PC_UA } });
  ok('判别历史页选中态正确', /class="side-it on" data-page="history"/.test(hist.text));
  ok('同时只有一个选中项', (hist.text.match(/class="side-it on"/g) || []).length === 1,
    String((hist.text.match(/class="side-it on"/g) || []).length));

  section('【接口】移动端导航（BUG-01 移动端分支）');
  const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
  const mRedirect = await api('/history', { headers: { 'User-Agent': IPHONE_UA } });
  ok('移动端访问 PC 路由自动跳转移动版', mRedirect.status === 302, String(mRedirect.status));
  const mHome = await api('/mobile', { headers: { 'User-Agent': IPHONE_UA } });
  ok('移动端首页可访问', mHome.status === 200, String(mHome.status));
  const mTpl = await api('/templates', { headers: { 'User-Agent': IPHONE_UA } });
  ok('移动端侧栏链接指向移动版路由（避免二次重定向）',
    mTpl.status === 200 && /href="\/mobile" class="side-it[^"]*" data-page="dashboard"/.test(mTpl.text),
    (mTpl.text.match(/href="[^"]*" class="side-it[^"]*" data-page="dashboard"/) || ['未匹配'])[0]);

  report();
})().catch(e => {
  console.error('\n测试执行异常:', e);
  process.exit(1);
});

function report() {
  console.log(`\n${'='.repeat(52)}`);
  console.log(`结果: \x1b[32m${pass} 通过\x1b[0m / \x1b[31m${fail} 失败\x1b[0m`);
  if (failures.length) {
    console.log('\n失败项:');
    failures.forEach(f => console.log('  - ' + f));
  }
  console.log('='.repeat(52) + '\n');
  process.exit(fail > 0 ? 1 : 0);
}
