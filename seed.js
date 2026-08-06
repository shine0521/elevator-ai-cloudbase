/**
 * 数据初始化脚本 v4.0（文档对齐版）
 *
 * 严格对齐《特种设备安全管理AI系统Demo开发方案》需求文档：
 *   - 8 章数据库模型
 *   - 7.4 初始 4 个模板：REG 使用登记 / MAINT 半月维保 / INSP 定期检验 / FAULT 故障报修
 *   - 3 部核心电梯法规（TSG T5001-2023 / TSG T7001-2023 / GB 7588-2020）
 *   - 研究任务（template_research_task + template_ai_suggestion，含 AI 建议 vs 专家修改对比）
 *   - 覆盖全部判别状态（合规 / 不合规 / 待人工）的演示记录
 *
 * 预置账号：admin@demo.com / auditor@demo.com / user@demo.com（密码均 123456）
 */

const { getDb } = require('./db');
const { hashPassword } = require('./auth');
const { logOperation } = require('./hash-chain');

console.log('🔧 开始初始化数据库 v4.0（文档对齐版）...\n');

const db = getDb();

// ==================== 0. 清空旧数据（含废弃研究表） ====================
const tables = [
  'operation_logs', 'worm_storage_index', 'audit_tasks', 'discrimination_records',
  'template_rules', 'template_fields', 'templates',
  'template_ai_suggestion', 'template_research_task', 'research_tasks',
  'regulation_clauses', 'regulations', 'users'
];
console.log('📦 清空旧数据...');
for (const t of tables) {
  db.prepare(`DELETE FROM ${t}`).run();
  try { db.prepare(`DELETE FROM sqlite_sequence WHERE name='${t}'`).run(); } catch (_) {}
}
console.log('  ✅ 已清空旧数据\n');

// ==================== 1. 创建用户 ====================
console.log('👥 创建用户账号...');
const insertUser = db.prepare(
  'INSERT INTO users (email, password_hash, name, role, department, status) VALUES (?, ?, ?, ?, ?, ?)'
);
insertUser.run('admin@demo.com', hashPassword('123456'), '系统管理员', 'admin', '质量管理部', 'active');
insertUser.run('auditor@demo.com', hashPassword('123456'), '审核员张三', 'auditor', '审核部', 'active');
insertUser.run('user@demo.com', hashPassword('123456'), '普通用户李四', 'user', '维保部', 'active');
console.log('  ✅ 预置 3 个账号（密码均为 123456）：admin / auditor / user\n');

// ==================== 2. 创建法规数据 ====================
console.log('📚 创建法规数据...');
const insertRegulation = db.prepare(
  'INSERT INTO regulations (code, name, source, effective_date, category, tags, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
const insertClause = db.prepare(
  'INSERT INTO regulation_clauses (regulation_id, clause_number, title, content, category, severity, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
);

const regulations = [
  {
    code: 'TSG T5001-2023',
    name: '电梯维护保养规则',
    source: '国家市场监督管理总局',
    effective_date: '2023-06-01',
    category: '维护保养',
    tags: '维保,保养,日常维护',
    clauses: [
      { num: '第8条', title: '维保周期', content: '电梯的日常维护保养周期不应超过15天。使用单位应当按照规定在维保周期届满前完成维护保养。', cat: '维保周期', sev: 'mandatory', order: 1 },
      { num: '第15条', title: '钢丝绳', content: '电梯钢丝绳磨损率不应超过7%。当钢丝绳磨损率超过7%时，应立即更换。', cat: '安全部件', sev: 'mandatory', order: 2 },
      { num: '第20条', title: '故障处理', content: '发生一般故障时，维保单位应在24小时内响应并处理。发生严重故障时，应立即停止使用电梯并报告相关部门。', cat: '故障处理', sev: 'mandatory', order: 3 },
      { num: '第25条', title: '应急救援', content: '电梯应急救援响应时间不应超过30分钟。使用单位应制定应急预案并定期演练。', cat: '应急救援', sev: 'mandatory', order: 4 },
      { num: '第30条', title: '限速器', content: '限速器应在有效校验期内，校验周期不超过2年。安全钳应与限速器联动可靠。', cat: '安全部件', sev: 'mandatory', order: 5 },
      { num: '第3条', title: '使用管理', content: '使用单位应对电梯的使用安全负责，建立安全管理制度，配备专职安全管理人员，并办理使用登记。', cat: '管理制度', sev: 'mandatory', order: 6 }
    ]
  },
  {
    code: 'TSG T7001-2023',
    name: '电梯监督检验和定期检验规则',
    source: '国家市场监督管理总局',
    effective_date: '2023-06-01',
    category: '检验检测',
    tags: '检验,定期检验,监督检验',
    clauses: [
      { num: '第1.2条', title: '检验周期', content: '在用电梯的定期检验周期为1年。使用单位应在检验合格有效期届满前1个月向检验机构申报检验。', cat: '检验周期', sev: 'mandatory', order: 1 },
      { num: '第6.3条', title: '门机系统', content: '电梯层门和轿门应正常关闭并锁紧，门机系统应有防夹人保护装置，门锁电气安全装置应可靠有效。', cat: '安全部件', sev: 'mandatory', order: 2 },
      { num: '第8.2条', title: '限速器校验', content: '限速器应在校验有效期内，校验周期不超过2年。限速器动作速度应符合设计要求。', cat: '安全校验', sev: 'mandatory', order: 3 },
      { num: '第12.5条', title: '门机故障', content: '门机系统出现故障时，电梯应不能正常启动或在就近楼层停靠开门。门锁回路应独立可靠。', cat: '故障处理', sev: 'mandatory', order: 4 },
      { num: '第45条', title: '制动器', content: '制动器应能够在电梯正常运行时可靠制动，制动器动作应灵活可靠，制动闸瓦磨损不应超过允许值。', cat: '安全部件', sev: 'mandatory', order: 5 }
    ]
  },
  {
    code: 'GB 7588-2020',
    name: '电梯制造与安装安全规范',
    source: '国家标准化管理委员会',
    effective_date: '2020-12-01',
    category: '设计规范',
    tags: '设计,安装,制造',
    clauses: [
      { num: '第12条', title: '电气安全装置', content: '电梯应设有电气安全装置，包括门锁、限速器、安全钳、缓冲器等安全开关，任一安全装置动作时应立即使电梯停止。', cat: '电气安全', sev: 'mandatory', order: 1 },
      { num: '第5.8条', title: '紧急制动', content: '电梯应设有紧急制动装置，在紧急情况下能可靠制停电梯。制动距离应符合设计要求。', cat: '紧急制动', sev: 'mandatory', order: 2 },
      { num: '第12.4.2条', title: '制动器要求', content: '所有参与向轿厢施加制动的制动器机械部件应至少分成两组装设。如果一组部件不起作用，应仍有足够的制动力使额定载重量的轿厢减速。', cat: '制动器', sev: 'mandatory', order: 3 }
    ]
  }
];

let totalClauses = 0;
for (const reg of regulations) {
  const result = insertRegulation.run(
    reg.code, reg.name, reg.source, reg.effective_date,
    reg.category, reg.tags, 'active'
  );
  for (const clause of reg.clauses) {
    insertClause.run(
      result.lastInsertRowid, clause.num, clause.title, clause.content,
      clause.cat, clause.sev, clause.order
    );
    totalClauses++;
  }
}
console.log(`  ✅ 预置 ${regulations.length} 部法规，共 ${totalClauses} 条条款\n`);

// 法规条款 id 映射（供研究任务关联）：
// TSG T5001-2023: 8条=1, 15条=2, 20条=3, 25条=4, 30条=5, 3条=6
// TSG T7001-2023: 1.2条=7, 6.3条=8, 8.2条=9, 12.5条=10, 45条=11
// GB 7588-2020:  12条=12, 5.8条=13, 12.4.2条=14

// ==================== 3. 创建模板（文档 7.4 严格对齐） ====================
console.log('📋 创建模板（文档 7.4 初始模板）...');
const insertTemplate = db.prepare(`
  INSERT INTO templates (code, name, category, version, description, regulation_ids, status, created_by, usage_count, icon, color)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertField = db.prepare(`
  INSERT INTO template_fields (template_id, field_name, field_label, field_type, required, sort_order, options, default_value, placeholder)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertRule = db.prepare(`
  INSERT INTO template_rules (template_id, rule_name, rule_type, rule_config, clause_ref, description, severity, priority, enabled, created_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// 辅助：插入一组字段
function addFields(tplId, fields) {
  for (const f of fields) {
    insertField.run(
      tplId, f.name, f.label, f.type, f.required ? 1 : 0,
      f.order, f.options ? JSON.stringify(f.options) : null,
      f.default || null, f.placeholder || null
    );
  }
}
// 辅助：插入一组规则（COMPARE）
function addCompareRules(tplId, rules) {
  for (const r of rules) {
    insertRule.run(
      tplId, r.name, 'COMPARE',
      JSON.stringify({ field: r.field, operator: r.operator, threshold: r.threshold, passResult: '合规', failResult: r.failResult }),
      r.clause, r.desc, 'mandatory', r.priority || 5, 1, 'system'
    );
  }
}

// ---- 模板 1：TPL_ELEV_REG_001 使用登记合规审核 ----
const regTpl = insertTemplate.run(
  'TPL_ELEV_REG_001', '使用登记合规审核', '注册登记', 1,
  '基于《特种设备使用管理规则》，审核电梯使用登记办理的合规性（制造单位资质、检验合格、登记证号规范）。',
  '1,3', 'published', 'admin@demo.com', 38, '📝', '#9b59b6'
);
addFields(regTpl.lastInsertRowid, [
  { name: 'manufacturing_unit', label: '制造单位', type: 'text', required: 1, order: 1, placeholder: '电梯整机制造单位全称' },
  { name: 'use_reg_cert', label: '使用登记证号', type: 'text', required: 1, order: 2, placeholder: '如：梯31-沪A12345' },
  { name: 'elevator_model', label: '设备型号', type: 'text', required: 1, order: 3, placeholder: '电梯型号' },
  { name: 'inspection_pass', label: '是否监督检验合格', type: 'select', required: 1, order: 4, options: ['是', '否'] },
  { name: 'registration_date', label: '使用登记日期', type: 'date', required: 1, order: 5 }
]);
addCompareRules(regTpl.lastInsertRowid, [
  { name: '监督检验合格检查', field: 'inspection_pass', operator: '==', threshold: '是', failResult: '不合规', clause: 'TSG T5001-2023 第3条', desc: '使用登记前须经监督检验合格', priority: 10 }
]);
// 使用登记证号规范检查（REGEX 规则）：证号须为规范格式
insertRule.run(
  regTpl.lastInsertRowid, '使用登记证号规范检查', 'REGEX',
  JSON.stringify({ field: 'use_reg_cert', pattern: '^[\\u4e00-\\u9fa5A-Za-z0-9\\-]{4,}$', passResult: '合规', failResult: '不合规' }),
  'TSG T5001-2023 第3条', '使用登记证号应规范填写', 'mandatory', 9, 1, 'system'
);
// 制造单位填写检查（EXISTS 规则）：制造单位须明确
insertRule.run(
  regTpl.lastInsertRowid, '制造单位填写检查', 'EXISTS',
  JSON.stringify({ field: 'manufacturing_unit', passResult: '合规', failResult: '待人工' }),
  'TSG T5001-2023 第3条', '制造单位应明确', 'mandatory', 8, 1, 'system'
);

// ---- 模板 2：TPL_ELEV_MAINT_001 半月维保记录审核 ----
const maintTpl = insertTemplate.run(
  'TPL_ELEV_MAINT_001', '半月维保记录审核', '维保合规', 1,
  '基于 TSG T5001-2023，审核电梯半月（≤15天）维护保养记录及关键安全部件状态。',
  '1,2,3', 'published', 'admin@demo.com', 126, '🔧', '#409eff'
);
addFields(maintTpl.lastInsertRowid, [
  { name: 'wire_rope_wear_rate', label: '钢丝绳磨损率(%)', type: 'number', required: 1, order: 1, placeholder: '请输入 0-100 之间的数值' },
  { name: 'maintenance_interval', label: '维保间隔天数', type: 'number', required: 1, order: 2, placeholder: '距上次维保的天数' },
  { name: 'brake_status', label: '制动器状态', type: 'select', required: 1, order: 3, options: ['正常', '异常', '需更换'] },
  { name: 'door_status', label: '门机系统状态', type: 'select', required: 1, order: 4, options: ['正常', '异常', '需维修'] },
  { name: 'governor_calibrated', label: '限速器是否在校验期内', type: 'select', required: 1, order: 5, options: ['是', '否'] }
]);
addCompareRules(maintTpl.lastInsertRowid, [
  { name: '钢丝绳磨损率检查', field: 'wire_rope_wear_rate', operator: '<=', threshold: 7, failResult: '不合规', clause: 'TSG T5001-2023 第15条', desc: '钢丝绳磨损率应不超过7%', priority: 10 },
  { name: '维保间隔检查', field: 'maintenance_interval', operator: '<=', threshold: 15, failResult: '待人工', clause: 'TSG T5001-2023 第8条', desc: '维保间隔应不超过15天', priority: 9 },
  { name: '制动器状态检查', field: 'brake_status', operator: '==', threshold: '正常', failResult: '不合规', clause: 'GB 7588-2020 第12.4.2条', desc: '制动器必须处于正常工作状态', priority: 10 },
  { name: '门机系统检查', field: 'door_status', operator: '==', threshold: '正常', failResult: '待人工', clause: 'TSG T7001-2023 第6.3条', desc: '门机系统应正常关闭并锁紧', priority: 8 },
  { name: '限速器校验检查', field: 'governor_calibrated', operator: '==', threshold: '是', failResult: '不合规', clause: 'TSG T7001-2023 第8.2条', desc: '限速器应在有效校验期内', priority: 9 }
]);

// ---- 模板 3：TPL_ELEV_INSP_001 定期检验申报审核 ----
const inspTpl = insertTemplate.run(
  'TPL_ELEV_INSP_001', '定期检验申报审核', '检验审核', 1,
  '基于 TSG T7001-2023，审核电梯定期检验申报的及时性与机构资质合规性。',
  '2', 'published', 'admin@demo.com', 64, '📄', '#67c23a'
);
addFields(inspTpl.lastInsertRowid, [
  { name: 'inspection_interval', label: '距上次检验天数', type: 'number', required: 1, order: 1, placeholder: '距离上次定期检验的天数' },
  { name: 'inspection_qualified', label: '检验机构是否具备资质', type: 'select', required: 1, order: 2, options: ['是', '否'] },
  { name: 'report_complete', label: '检验报告是否完整', type: 'select', required: 1, order: 3, options: ['是', '否'] }
]);
addCompareRules(inspTpl.lastInsertRowid, [
  { name: '检验周期检查', field: 'inspection_interval', operator: '<=', threshold: 365, failResult: '不合规', clause: 'TSG T7001-2023 第1.2条', desc: '定期检验周期应不超过1年', priority: 10 },
  { name: '检验机构资质检查', field: 'inspection_qualified', operator: '==', threshold: '是', failResult: '不合规', clause: 'TSG Z7001-2023 第3条', desc: '检验机构应具备相应资质', priority: 10 },
  { name: '检验报告完整性检查', field: 'report_complete', operator: '==', threshold: '是', failResult: '待人工', clause: 'TSG T7001-2023 第1.2条', desc: '检验报告应完整', priority: 8 }
]);

// ---- 模板 4：TPL_ELEV_FAULT_001 故障报修合规判别 ----
const faultTpl = insertTemplate.run(
  'TPL_ELEV_FAULT_001', '故障报修合规判别', '故障处理', 1,
  '基于 TSG T5001-2023，判别电梯故障报修处理的及时性与应急响应合规性。',
  '1', 'published', 'admin@demo.com', 52, '⚠️', '#e6a23c'
);
addFields(faultTpl.lastInsertRowid, [
  { name: 'fault_level', label: '故障等级', type: 'select', required: 1, order: 1, options: ['一般', '严重'] },
  { name: 'emergency_response', label: '应急响应时间(分钟)', type: 'number', required: 1, order: 2, placeholder: '接到报修后的响应时间' },
  { name: 'report_timely', label: '是否及时上报', type: 'select', required: 1, order: 3, options: ['是', '否'] }
]);
addCompareRules(faultTpl.lastInsertRowid, [
  { name: '故障等级判定', field: 'fault_level', operator: '==', threshold: '一般', failResult: '待人工', clause: 'TSG T5001-2023 第20条', desc: '一般故障可在维保中处理', priority: 8 },
  { name: '应急响应检查', field: 'emergency_response', operator: '<=', threshold: 30, failResult: '待人工', clause: 'TSG T5001-2023 第25条', desc: '应急救援响应时间应不超过30分钟', priority: 9 },
  { name: '及时上报检查', field: 'report_timely', operator: '==', threshold: '是', failResult: '不合规', clause: 'TSG T5001-2023 第20条', desc: '故障应及时上报', priority: 8 }
]);

// ---- 模板 5（增强）：TPL_ELEV_SAFE_001 安全部件检查判别 ----
const safeTpl = insertTemplate.run(
  'TPL_ELEV_SAFE_001', '安全部件检查判别', '安全检查', 1,
  '综合 TSG T5001-2023 与 GB 7588-2020，判别电梯关键安全部件（钢丝绳/限速器/制动器/门机/安全钳）状态。',
  '1,3', 'published', 'admin@demo.com', 29, '🛡️', '#f56c6c'
);
addFields(safeTpl.lastInsertRowid, [
  { name: 'wire_rope_wear_rate', label: '钢丝绳磨损率(%)', type: 'number', required: 1, order: 1, placeholder: '请输入 0-100 之间的数值' },
  { name: 'governor_calibrated', label: '限速器校验状态', type: 'select', required: 1, order: 2, options: ['有效', '过期', '未校验'] },
  { name: 'brake_status', label: '制动器状态', type: 'select', required: 1, order: 3, options: ['正常', '异常', '需更换'] },
  { name: 'door_status', label: '门机系统状态', type: 'select', required: 1, order: 4, options: ['正常', '异常', '需维修'] },
  { name: 'safety_gear_status', label: '安全钳状态', type: 'select', required: 1, order: 5, options: ['正常', '异常', '需更换'] }
]);
addCompareRules(safeTpl.lastInsertRowid, [
  { name: '钢丝绳磨损率检查', field: 'wire_rope_wear_rate', operator: '<=', threshold: 7, failResult: '不合规', clause: 'TSG T5001-2023 第15条', desc: '钢丝绳磨损率应不超过7%', priority: 10 },
  { name: '限速器校验检查', field: 'governor_calibrated', operator: '==', threshold: '有效', failResult: '不合规', clause: 'TSG T7001-2023 第8.2条', desc: '限速器应在有效校验期内', priority: 10 },
  { name: '制动器状态检查', field: 'brake_status', operator: '==', threshold: '正常', failResult: '不合规', clause: 'GB 7588-2020 第12.4.2条', desc: '制动器必须正常工作', priority: 10 },
  { name: '门机系统检查', field: 'door_status', operator: '==', threshold: '正常', failResult: '待人工', clause: 'TSG T7001-2023 第6.3条', desc: '门机系统应正常', priority: 8 },
  { name: '安全钳状态检查', field: 'safety_gear_status', operator: '==', threshold: '正常', failResult: '不合规', clause: 'TSG T5001-2023 第30条', desc: '安全钳应正常', priority: 9 }
]);

console.log('  ✅ 预置 5 套模板（文档 7.4 初始 4 套 + 安全部件增强 1 套）\n');

// ==================== 4. 研究任务（文档 8.2 对齐） ====================
console.log('🔬 创建模板研究任务（template_research_task + template_ai_suggestion）...');
const insertResearch = db.prepare(`
  INSERT INTO template_research_task
    (task_name, task_description, expert_id, expert_name, standards, selected_clause_ids, selected_clause_text, status, published_template_id, created_by, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertSuggestion = db.prepare(`
  INSERT INTO template_ai_suggestion
    (task_id, input_prompt, ai_output_json, expert_modifications, model_name, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

// 任务 1：半月维保（已发布，published_template_id = 模板2）
const maintClausesText = 'TSG T5001-2023 第8条：维保周期不超过15天。第15条：钢丝绳磨损率不超过7%。\nTSG T7001-2023 第6.3条：门机系统正常关闭并锁紧。第8.2条：限速器在校验有效期内。\nGB 7588-2020 第12.4.2条：制动器正常工作。';
const maintSuggestion = {
  template_name: '半月维保记录审核',
  template_code: 'TPL_ELEV_MAINT_001',
  device_type: '曳引电梯',
  process_stage: '维保',
  fields: [
    { name: 'wire_rope_wear_rate', label: '钢丝绳磨损率(%)', type: 'number', required: true },
    { name: 'maintenance_interval', label: '维保间隔天数', type: 'number', required: true },
    { name: 'brake_status', label: '制动器状态', type: 'select', required: true, options: ['正常', '异常', '需更换'] },
    { name: 'door_status', label: '门机系统状态', type: 'select', required: true, options: ['正常', '异常', '需维修'] },
    { name: 'governor_calibrated', label: '限速器是否在校验期内', type: 'select', required: true, options: ['是', '否'] }
  ],
  rules: [
    { condition: 'wire_rope_wear_rate <= 7', result: '合规', message: '钢丝绳磨损率未超限', severity: 'mandatory' },
    { condition: 'wire_rope_wear_rate > 7', result: '不合规', message: '钢丝绳磨损率超过7%，需立即更换', severity: 'mandatory' },
    { condition: 'maintenance_interval <= 15', result: '合规', message: '维保间隔符合要求', severity: 'mandatory' },
    { condition: 'maintenance_interval > 15', result: '待人工', message: '维保间隔超过15天', severity: 'mandatory' },
    { condition: 'brake_status == "正常"', result: '合规', message: '制动器状态正常', severity: 'mandatory' },
    { condition: 'brake_status != "正常"', result: '不合规', message: '制动器状态异常，需维修', severity: 'mandatory' },
    { condition: 'door_status == "正常"', result: '合规', message: '门机系统正常', severity: 'mandatory' },
    { condition: 'door_status != "正常"', result: '待人工', message: '门机系统异常', severity: 'mandatory' },
    { condition: 'governor_calibrated == "是"', result: '合规', message: '限速器在校验期内', severity: 'mandatory' },
    { condition: 'governor_calibrated != "是"', result: '不合规', message: '限速器不在校验期内', severity: 'mandatory' }
  ],
  output_template: '根据{{template_name}}，钢丝绳磨损率{{wire_rope_wear_rate}}%、维保间隔{{maintenance_interval}}天、制动器{{brake_status}}、门机{{door_status}}、限速器{{governor_calibrated}}。综合判定：{{final_result}}。'
};
const r1 = insertResearch.run(
  '电梯半月维保记录模板研究',
  '研究并提出电梯半月（≤15天）维护保养记录的合规性审核模板，明确关键安全部件检查项与判定阈值。',
  1, '系统管理员',
  '1. 判别项须覆盖 TSG T5001-2023 第8/15条；2. 阈值严格引用法规数值；3. 缺失项转人工审核；4. 输出须引用法规条款。',
  '1,2,8,9,14', maintClausesText, 'published', maintTpl.lastInsertRowid, 'admin@demo.com',
  '2026-06-20 10:00:00', '2026-06-20 15:30:00'
);
insertSuggestion.run(
  r1.lastInsertRowid,
  '【标准】...【条款】...请生成维保记录审核模板JSON',
  JSON.stringify(maintSuggestion, null, 2),
  '专家将 rules 中部分 "不合规" 调整为 "待人工"（门机异常），其余采纳。',
  'qwen2.5:0.5b', 'approved', '2026-06-20 11:00:00'
);

// 任务 2：故障报修（AI 已生成建议，待专家审阅）
const faultClausesText = 'TSG T5001-2023 第20条：一般故障24h内响应处理，严重故障立即停用并上报。第25条：应急救援响应不超过30分钟。';
const faultSuggestion = {
  template_name: '故障报修合规判别',
  template_code: 'TPL_ELEV_FAULT_001',
  device_type: '曳引电梯',
  process_stage: '故障处理',
  fields: [
    { name: 'fault_level', label: '故障等级', type: 'select', required: true, options: ['一般', '严重'] },
    { name: 'emergency_response', label: '应急响应时间(分钟)', type: 'number', required: true },
    { name: 'report_timely', label: '是否及时上报', type: 'select', required: true, options: ['是', '否'] }
  ],
  rules: [
    { condition: 'fault_level == "一般"', result: '合规', message: '一般故障可在维保处理', severity: 'mandatory' },
    { condition: 'fault_level == "严重"', result: '待人工', message: '严重故障须立即停用并上报', severity: 'mandatory' },
    { condition: 'emergency_response <= 30', result: '合规', message: '应急响应及时', severity: 'mandatory' },
    { condition: 'emergency_response > 30', result: '待人工', message: '应急响应超30分钟', severity: 'mandatory' },
    { condition: 'report_timely == "是"', result: '合规', message: '已及时上报', severity: 'mandatory' },
    { condition: 'report_timely == "否"', result: '不合规', message: '未及时上报', severity: 'mandatory' }
  ],
  output_template: '根据{{template_name}}，故障等级{{fault_level}}、应急响应{{emergency_response}}分钟、上报{{report_timely}}。综合判定：{{final_result}}。'
};
const r2 = insertResearch.run(
  '电梯故障报修合规模板研究',
  '研究电梯故障报修处理的合规性判别模板，明确故障分级与应急响应时限判定。',
  1, '系统管理员',
  '1. 区分一般/严重故障处理路径；2. 应急响应时限引用第25条30分钟；3. 严重故障必须转人工。',
  '3,4', faultClausesText, 'ai_generated', null, 'admin@demo.com',
  '2026-06-21 09:00:00', '2026-06-21 09:30:00'
);
insertSuggestion.run(
  r2.lastInsertRowid,
  '【标准】...【条款】...请生成故障报修判别模板JSON',
  JSON.stringify(faultSuggestion, null, 2),
  null, 'qwen2.5:0.5b', 'pending', '2026-06-21 09:30:00'
);

console.log('  ✅ 预置 2 个研究任务（1 个已发布 / 1 个 AI 建议待专家审阅）\n');

// ==================== 5. 生成判别记录示例（覆盖全状态） ====================
console.log('📝 生成判别记录示例...');
const insertRecord = db.prepare(`
  INSERT INTO discrimination_records
    (template_id, template_name, input_text, form_data, rule_results, final_result, conclusion, clause_ref, user_email, user_name, audit_status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertAudit = db.prepare(`
  INSERT INTO audit_tasks (record_id, task_type, priority, status, assigned_to, created_by)
  VALUES (?, 'discrimination', 'normal', 'pending', 'auditor@demo.com', ?)
`);

const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();

const sampleRecords = [
  { tid: 2, tname: '半月维保记录审核', input: '曳引电梯维保检查，钢丝绳磨损率5%，维保间隔12天，制动器正常，门机正常，限速器已校验',
    form: { wire_rope_wear_rate: 5, maintenance_interval: 12, brake_status: '正常', door_status: '正常', governor_calibrated: '是' },
    result: '合规', audit: 'approved', d: 1 },
  { tid: 2, tname: '半月维保记录审核', input: '电梯钢丝绳磨损率9%，超出7%标准，需立即更换',
    form: { wire_rope_wear_rate: 9, maintenance_interval: 10, brake_status: '正常', door_status: '正常', governor_calibrated: '是' },
    result: '不合规', audit: 'approved', d: 2 },
  { tid: 2, tname: '半月维保记录审核', input: '维保间隔已 20 天，门机状态异常待查',
    form: { wire_rope_wear_rate: 4, maintenance_interval: 20, brake_status: '正常', door_status: '异常', governor_calibrated: '是' },
    result: '待人工', audit: 'pending', d: 0 },
  { tid: 3, tname: '定期检验申报审核', input: '电梯定期检验申报，距上次检验380天，已超1年',
    form: { inspection_interval: 380, inspection_qualified: '是', report_complete: '是' },
    result: '不合规', audit: 'approved', d: 3 },
  { tid: 3, tname: '定期检验申报审核', input: '定期检验申报，距上次检验300天，机构有资质，报告完整',
    form: { inspection_interval: 300, inspection_qualified: '是', report_complete: '否' },
    result: '待人工', audit: 'pending', d: 1 },
  { tid: 4, tname: '故障报修合规判别', input: '电梯故障，应急响应时间45分钟，超过30分钟',
    form: { fault_level: '一般', emergency_response: 45, report_timely: '是' },
    result: '待人工', audit: 'pending', d: 0 },
  { tid: 4, tname: '故障报修合规判别', input: '一般故障，应急响应25分钟，已及时上报',
    form: { fault_level: '一般', emergency_response: 25, report_timely: '是' },
    result: '合规', audit: 'approved', d: 4 },
  { tid: 1, tname: '使用登记合规审核', input: '新装电梯，监督检验合格，使用登记证号规范，制造单位明确',
    form: { manufacturing_unit: '上海三菱电梯有限公司', use_reg_cert: '梯31-沪A12345', elevator_model: 'MAXIE 1000', inspection_pass: '是', registration_date: '2026-05-10' },
    result: '合规', audit: 'approved', d: 5 },
  { tid: 1, tname: '使用登记合规审核', input: '使用登记办理，但监督检验尚未合格',
    form: { manufacturing_unit: '奥的斯电梯', use_reg_cert: '', elevator_model: 'Gen3', inspection_pass: '否', registration_date: '2026-06-01' },
    result: '不合规', audit: 'approved', d: 1 },
  { tid: 5, tname: '安全部件检查判别', input: '安全部件检查，钢丝绳磨损率3%，限速器有效，制动器正常，门机正常，安全钳正常',
    form: { wire_rope_wear_rate: 3, governor_calibrated: '有效', brake_status: '正常', door_status: '正常', safety_gear_status: '正常' },
    result: '合规', audit: 'approved', d: 2 },
  { tid: 5, tname: '安全部件检查判别', input: '限速器校验过期，制动器异常',
    form: { wire_rope_wear_rate: 2, governor_calibrated: '过期', brake_status: '异常', door_status: '正常', safety_gear_status: '正常' },
    result: '不合规', audit: 'approved', d: 6 }
];

let recId = 0;
for (const r of sampleRecords) {
  const rid = insertRecord.run(
    r.tid, r.tname, r.input, JSON.stringify(r.form), JSON.stringify([]),
    r.result, `经规则引擎判定，该${r.tname}结果为：${r.result}。`,
    '', r.audit === 'pending' ? 'user@demo.com' : 'user@demo.com',
    '普通用户李四', r.audit, daysAgo(r.d)
  ).lastInsertRowid;
  if (r.audit === 'pending') {
    insertAudit.run(rid, 'user@demo.com');
  }
  recId = rid;
}
console.log(`  ✅ 预置 ${sampleRecords.length} 条判别记录（合规/不合规/待人工全覆盖）\n`);

// ==================== 6. 记录初始化日志（哈希链） ====================
console.log('🔗 记录初始化日志...');
logOperation('系统初始化', 'system', 'system', 0, '数据库 v4.0（文档对齐版）初始化完成');
logOperation('用户创建', 'system', 'users', 1, '创建管理员账号 admin@demo.com');
logOperation('用户创建', 'system', 'users', 2, '创建审核员账号 auditor@demo.com');
logOperation('用户创建', 'system', 'users', 3, '创建用户账号 user@demo.com');

console.log('  ✅ 操作日志已记录到哈希链\n');

// ==================== 演示数据扩展（大量真实场景） ====================
console.log('\n🔧 扩展演示数据（大量真实场景，保持哈希链完整）...');
try {
  const { generateDemoData } = require('./seed-demo-data');
  generateDemoData(db);
} catch (e) {
  console.error('⚠️ 演示数据扩展失败:', e.message);
}

// ==================== 完成 ====================
console.log('═══════════════════════════════════════');
console.log('✅ 数据库初始化完成（文档对齐版）！');
console.log('═══════════════════════════════════════');
console.log('\n📊 数据统计:');
console.log(`   - 用户: 3 个`);
console.log(`   - 法规: ${regulations.length} 部`);
console.log(`   - 条款: ${totalClauses} 条`);
console.log(`   - 模板: 5 套（文档 7.4 初始 4 套 + 安全部件增强）`);
console.log(`   - 研究任务: 2 个`);
console.log(`   - 判别记录: ${sampleRecords.length} 条`);
console.log(`   - 审核任务: ${sampleRecords.filter(r => r.audit === 'pending').length} 条`);
console.log('\n🔑 演示账号（密码均为 123456）:');
console.log('   - admin@demo.com（管理员）');
console.log('   - auditor@demo.com（审核员）');
console.log('   - user@demo.com（普通用户）');
console.log('\n🚀 运行 npm start 启动服务器\n');
