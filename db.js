/**
 * 数据库模块 - SQLite数据库管理
 * 
 * 表结构（9张核心表）：
 *   1. users - 用户表
 *   2. regulations - 法规表
 *   3. regulation_clauses - 法规条款表
 *   4. templates - 模板表
 *   5. template_fields - 模板字段表
 *   6. template_rules - 模板规则表（新增）
 *   7. discrimination_records - 判别记录表
 *   8. audit_tasks - 审核任务表
 *   9. operation_logs - 操作日志表
 *  10. research_tasks - 研究任务表
 *  11. system_config - 系统配置表（新增）
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 持久化存储路径
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname);
const DB_PATH = path.join(DATA_DIR, 'data.db');
let db;

/**
 * 获取数据库实例（单例）
 */
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    // 性能优化：WAL模式
    db.pragma('journal_mode = WAL');
    // 数据完整性：外键约束
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

/**
 * 初始化所有表
 */
function initTables() {
  db.exec(`
    -- 1. 用户表
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','auditor','admin')),
      avatar TEXT,
      phone TEXT,
      department TEXT,
      last_login DATETIME,
      login_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive','locked')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. 法规表（知识库）
    CREATE TABLE IF NOT EXISTS regulations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      source TEXT,
      effective_date DATE,
      expire_date DATE,
      category TEXT,
      tags TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','archived','draft')),
      view_count INTEGER DEFAULT 0,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. 法规条款表
    CREATE TABLE IF NOT EXISTS regulation_clauses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      regulation_id INTEGER NOT NULL REFERENCES regulations(id) ON DELETE CASCADE,
      clause_number TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      category TEXT,
      tags TEXT,
      severity TEXT DEFAULT 'mandatory' CHECK(severity IN ('mandatory','recommended','optional')),
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. 模板表
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      description TEXT,
      regulation_ids TEXT,
      status TEXT DEFAULT 'published' CHECK(status IN ('draft','review','published','archived')),
      created_by TEXT,
      usage_count INTEGER DEFAULT 0,
      tags TEXT,
      icon TEXT,
      color TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 5. 模板字段表
    CREATE TABLE IF NOT EXISTS template_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL,
      field_label TEXT NOT NULL,
      field_type TEXT NOT NULL CHECK(field_type IN ('text','number','date','select','textarea','checkbox','radio')),
      required INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      options TEXT,
      default_value TEXT,
      placeholder TEXT,
      validation_rule TEXT,
      help_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 6. 模板规则表（新增：支持动态规则配置）
    CREATE TABLE IF NOT EXISTS template_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      rule_name TEXT NOT NULL,
      rule_type TEXT NOT NULL CHECK(rule_type IN ('COMPARE','EXISTS','RANGE','COMBINE','REGEX','CUSTOM')),
      rule_config TEXT NOT NULL,
      clause_ref TEXT,
      description TEXT,
      severity TEXT DEFAULT 'mandatory' CHECK(severity IN ('mandatory','recommended','optional')),
      priority INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 7. 判别记录表
    CREATE TABLE IF NOT EXISTS discrimination_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER REFERENCES templates(id),
      template_name TEXT,
      template_version TEXT DEFAULT '1',
      input_text TEXT,
      form_data TEXT,
      ai_classification TEXT,
      rule_results TEXT,
      final_result TEXT NOT NULL CHECK(final_result IN ('合规','不合规','待人工')),
      conclusion TEXT,
      reject_reason TEXT,
      clause_ref TEXT,
      user_email TEXT,
      user_name TEXT,
      audit_status TEXT DEFAULT 'pending' CHECK(audit_status IN ('pending','approved','rejected')),
      audit_by TEXT,
      audit_at DATETIME,
      audit_comment TEXT,
      hash TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 8. 审核任务表
    CREATE TABLE IF NOT EXISTS audit_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER REFERENCES discrimination_records(id) ON DELETE CASCADE,
      task_type TEXT DEFAULT 'discrimination' CHECK(task_type IN ('discrimination','template_review','regulation_review')),
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','approved','rejected','cancelled')),
      assigned_to TEXT,
      assigned_at DATETIME,
      started_at DATETIME,
      completed_at DATETIME,
      comment TEXT,
      attachments TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 9. 操作日志表（司法留痕）
    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      user_email TEXT,
      user_name TEXT,
      target_type TEXT,
      target_id INTEGER,
      detail TEXT,
      ip_address TEXT,
      user_agent TEXT,
      request_id TEXT,
      prev_hash TEXT,
      hash TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 10. 研究任务表
    CREATE TABLE IF NOT EXISTS research_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      regulation_ids TEXT,
      ai_draft TEXT,
      expert_changes TEXT,
      status TEXT DEFAULT 'created' CHECK(status IN ('created','ai_generated','expert_review','published','archived')),
      template_id INTEGER REFERENCES templates(id),
      created_by TEXT,
      assigned_to TEXT,
      due_date DATE,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 11. 系统配置表（新增）
    CREATE TABLE IF NOT EXISTS system_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT UNIQUE NOT NULL,
      config_value TEXT,
      config_type TEXT DEFAULT 'string' CHECK(config_type IN ('string','number','boolean','json')),
      description TEXT,
      is_public INTEGER DEFAULT 0,
      updated_by TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ==================== P0新增表 ====================

    -- 12. 模板研究任务表（P0.1：模板研究工作流）
    CREATE TABLE IF NOT EXISTS template_research_task (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_name VARCHAR(100) NOT NULL,
      task_description TEXT,
      expert_id INTEGER,
      expert_name VARCHAR(100),
      standards TEXT,
      selected_clause_ids VARCHAR(500),
      selected_clause_text TEXT,
      status VARCHAR(20) DEFAULT 'draft' CHECK(status IN ('draft','ai_generated','expert_review','published','archived')),
      published_template_id INTEGER,
      created_by VARCHAR(100),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    -- 13. AI建议记录表（P0.1：AI辅助模板设计）
    CREATE TABLE IF NOT EXISTS template_ai_suggestion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES template_research_task(id) ON DELETE CASCADE,
      input_prompt TEXT,
      ai_output_json TEXT,
      expert_modifications TEXT,
      expert_feedback TEXT,
      model_name VARCHAR(50),
      tokens_used INTEGER,
      status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','modified')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 14. WORM存储索引表（P0.2：司法封存）
    CREATE TABLE IF NOT EXISTS worm_storage_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_log_id INTEGER NOT NULL,
      end_log_id INTEGER NOT NULL,
      merkle_root VARCHAR(64) NOT NULL,
      block_hash VARCHAR(64),
      seal_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      sealed_by VARCHAR(100),
      status VARCHAR(20) DEFAULT 'sealed' CHECK(status IN ('sealed','verified','exported')),
      record_count INTEGER DEFAULT 0,
      note TEXT
    );

    -- 15. 知识库增强字段（P1.1：知识库增强）
    -- 注：knowledge_article 表名在原需求中不存在，法规相关表已在上方定义
    -- 以下增强字段通过 ALTER TABLE 添加（使用 SQLite 兼容语法）

    -- ==================== 索引优化 ====================
    
    -- 用户相关
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    
    -- 法规相关
    CREATE INDEX IF NOT EXISTS idx_regulations_code ON regulations(code);
    CREATE INDEX IF NOT EXISTS idx_regulations_category ON regulations(category);
    CREATE INDEX IF NOT EXISTS idx_regulations_status ON regulations(status);
    CREATE INDEX IF NOT EXISTS idx_clauses_regulation ON regulation_clauses(regulation_id);
    CREATE INDEX IF NOT EXISTS idx_clauses_category ON regulation_clauses(category);
    
    -- 模板相关
    CREATE INDEX IF NOT EXISTS idx_templates_code ON templates(code);
    CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
    CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status);
    CREATE INDEX IF NOT EXISTS idx_fields_template ON template_fields(template_id);
    CREATE INDEX IF NOT EXISTS idx_rules_template ON template_rules(template_id);
    CREATE INDEX IF NOT EXISTS idx_rules_enabled ON template_rules(enabled);
    
    -- 判别记录相关
    CREATE INDEX IF NOT EXISTS idx_disc_records_template ON discrimination_records(template_id);
    CREATE INDEX IF NOT EXISTS idx_disc_records_result ON discrimination_records(final_result);
    CREATE INDEX IF NOT EXISTS idx_disc_records_audit ON discrimination_records(audit_status);
    CREATE INDEX IF NOT EXISTS idx_disc_records_user ON discrimination_records(user_email);
    CREATE INDEX IF NOT EXISTS idx_disc_records_created ON discrimination_records(created_at DESC);
    
    -- 审核任务相关
    CREATE INDEX IF NOT EXISTS idx_audit_tasks_record ON audit_tasks(record_id);
    CREATE INDEX IF NOT EXISTS idx_audit_tasks_status ON audit_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_audit_tasks_assigned ON audit_tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_audit_tasks_created ON audit_tasks(created_at DESC);
    
    -- 操作日志相关
    CREATE INDEX IF NOT EXISTS idx_op_logs_hash ON operation_logs(hash);
    CREATE INDEX IF NOT EXISTS idx_op_logs_timestamp ON operation_logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_op_logs_user ON operation_logs(user_email);
    CREATE INDEX IF NOT EXISTS idx_op_logs_action ON operation_logs(action);
    CREATE INDEX IF NOT EXISTS idx_op_logs_target ON operation_logs(target_type, target_id);
    
    -- 研究任务相关
    CREATE INDEX IF NOT EXISTS idx_research_status ON research_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_research_created ON research_tasks(created_at DESC);

    -- 模板研究任务相关（P0.1）
    CREATE INDEX IF NOT EXISTS idx_template_research_status ON template_research_task(status);
    CREATE INDEX IF NOT EXISTS idx_template_research_created ON template_research_task(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_template_research_expert ON template_research_task(expert_id);
    CREATE INDEX IF NOT EXISTS idx_ai_suggestion_task ON template_ai_suggestion(task_id);
    CREATE INDEX IF NOT EXISTS idx_ai_suggestion_status ON template_ai_suggestion(status);

    -- WORM存储索引相关（P0.2）
    CREATE INDEX IF NOT EXISTS idx_worm_start_log ON worm_storage_index(start_log_id);
    CREATE INDEX IF NOT EXISTS idx_worm_end_log ON worm_storage_index(end_log_id);
    CREATE INDEX IF NOT EXISTS idx_worm_seal_time ON worm_storage_index(seal_time DESC);
    CREATE INDEX IF NOT EXISTS idx_worm_status ON worm_storage_index(status);

    -- ==================== F0 设备实体层（2.0 新增） ====================
    -- 电梯设备主表（V2.1 第13章 elevator_device，全系统挂载点）
    CREATE TABLE IF NOT EXISTS elevator_device (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_code TEXT UNIQUE NOT NULL,
      device_name TEXT NOT NULL,
      device_type TEXT NOT NULL CHECK(device_type IN ('曳引电梯','液压电梯','自动扶梯','自动人行道','杂物电梯','其他')),
      registration_code TEXT,
      brand TEXT,
      model TEXT,
      manufacture_date DATE,
      install_date DATE,
      location TEXT,
      region_code TEXT,
      org_id INTEGER,
      project_id INTEGER,
      owner TEXT,
      maintenance_unit TEXT,
      status TEXT DEFAULT 'NORMAL' CHECK(status IN ('NORMAL','ATTENTION','WARNING','REPAIR','SCRAPPED')),
      risk_level TEXT DEFAULT 'general' CHECK(risk_level IN ('general','major','critical')),
      last_inspection_date DATE,
      next_inspection_date DATE,
      evaluate_date DATE,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 设备动态记录表（V2.1 device_dynamic_record；后续由日管控/维保/预警写入）
    CREATE TABLE IF NOT EXISTS device_dynamic_record (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES elevator_device(id) ON DELETE CASCADE,
      record_type TEXT NOT NULL,
      title TEXT,
      content TEXT,
      operator TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_device_code ON elevator_device(device_code);
    CREATE INDEX IF NOT EXISTS idx_device_status ON elevator_device(status);
    CREATE INDEX IF NOT EXISTS idx_device_type ON elevator_device(device_type);
    CREATE INDEX IF NOT EXISTS idx_device_region ON elevator_device(region_code);
    CREATE INDEX IF NOT EXISTS idx_device_org ON elevator_device(org_id);
    CREATE INDEX IF NOT EXISTS idx_device_dynamic_device ON device_dynamic_record(device_id);

    -- ==================== M0 通用审批中枢（2.0 新增，业务流挂载点） ====================
    -- 审批单主表：business_type+business_id 关联任意业务记录，节点序列驱动审批流
    CREATE TABLE IF NOT EXISTS approval_workflow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_type TEXT NOT NULL,
      business_id INTEGER NOT NULL,
      business_title TEXT,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','RECALLED','CANCELLED')),
      current_node INTEGER DEFAULT 1,
      dual_review INTEGER DEFAULT 0,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    -- 审批节点表：每个节点记录审批人/结果/AI比对摘要/置信度（R2 零错误容忍）
    CREATE TABLE IF NOT EXISTS approval_node (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      approval_id INTEGER NOT NULL REFERENCES approval_workflow(id) ON DELETE CASCADE,
      node_seq INTEGER NOT NULL,
      node_name TEXT NOT NULL,
      approver_role TEXT,
      approver_id INTEGER,
      approver_email TEXT,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','SKIPPED')),
      approval_result TEXT,
      comment TEXT,
      ai_comparison_summary TEXT,
      ai_confidence REAL,
      decided_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_aw_biz ON approval_workflow(business_type, business_id);
    CREATE INDEX IF NOT EXISTS idx_aw_status ON approval_workflow(status);
    CREATE INDEX IF NOT EXISTS idx_an_approval ON approval_node(approval_id);

    -- ==================== M1 模板全生命周期（2.0 新增，叠加于 templates） ====================
    -- 模板版本快照（取代单表 version 字段，支持历史/回滚/区域）
    CREATE TABLE IF NOT EXISTS template_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      name TEXT,
      category TEXT,
      description TEXT,
      region_code TEXT,
      status TEXT DEFAULT 'published',
      is_selectable INTEGER DEFAULT 1,
      effective_date DATE,
      previous_version_id INTEGER,
      fields_json TEXT,
      rules_json TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 模板预警参数（4 类：threshold/deadline/status/trend）
    CREATE TABLE IF NOT EXISTS template_warning_params (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      param_type TEXT NOT NULL CHECK(param_type IN ('threshold','deadline','status','trend')),
      param_key TEXT,
      label TEXT,
      operator TEXT,
      threshold_value TEXT,
      urgency_level TEXT DEFAULT 'medium' CHECK(urgency_level IN ('low','medium','high','urgent','critical')),
      action TEXT DEFAULT 'notify',
      enabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 模板区域变体（regional-matcher：global→regional→subsidiary→project）
    CREATE TABLE IF NOT EXISTS template_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      region_code TEXT NOT NULL,
      name TEXT,
      description TEXT,
      added_fields_json TEXT,
      added_rules_json TEXT,
      status TEXT DEFAULT 'published',
      is_selectable INTEGER DEFAULT 1,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tv_template ON template_versions(template_id);
    CREATE INDEX IF NOT EXISTS idx_twp_template ON template_warning_params(template_id);
    CREATE INDEX IF NOT EXISTS idx_tvar_base_region ON template_variants(base_template_id, region_code);

    -- ==================== M2 AI 文档生成引擎（2.0 新增，黄金闭环） ====================
    -- 生成的文档（PDF+Word + SHA-256）
    CREATE TABLE IF NOT EXISTS generated_document (
      doc_id TEXT PRIMARY KEY,
      doc_type TEXT,
      doc_title TEXT,
      doc_number TEXT,
      pdf_file_path TEXT,
      word_file_path TEXT,
      pdf_hash TEXT,
      word_hash TEXT,
      generated_by TEXT DEFAULT 'AI_ENGINE',
      effective_date DATE,
      status TEXT DEFAULT 'GENERATED',
      device_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 设备维度文档索引（按设备编号可查全部关联文档）
    CREATE TABLE IF NOT EXISTS device_document_index (
      index_id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      doc_id TEXT NOT NULL,
      doc_type TEXT,
      is_latest INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- AI 对设备库的每次字段更新（前值→后值，留痕）
    CREATE TABLE IF NOT EXISTS device_update_by_ai (
      update_id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      source_type TEXT,
      source_id TEXT,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      updated_by TEXT DEFAULT 'AI_ENGINE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_gd_type ON generated_document(doc_type);
    CREATE INDEX IF NOT EXISTS idx_gd_device ON generated_document(device_id);
    CREATE INDEX IF NOT EXISTS idx_ddi_device ON device_document_index(device_id);
    CREATE INDEX IF NOT EXISTS idx_ddi_doc ON device_document_index(doc_id);
    CREATE INDEX IF NOT EXISTS idx_dua_device ON device_update_by_ai(device_id);

    -- ==================== M3 设备预警引擎（2.0 新增） ====================
    -- 预警事件（设备状态变化/阈值超限触发，不可物理删除）
    CREATE TABLE IF NOT EXISTS warning_event (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER REFERENCES elevator_device(id) ON DELETE CASCADE,
      warning_type TEXT NOT NULL CHECK(warning_type IN ('STATUS','THRESHOLD','DEADLINE','TREND')),
      warning_level TEXT NOT NULL CHECK(warning_level IN ('low','medium','high','urgent','critical')),
      warning_item TEXT,
      trigger_source TEXT,
      source_id TEXT,
      warning_config_id INTEGER,
      threshold_value TEXT,
      actual_value TEXT,
      action_required TEXT,
      notified_users TEXT,
      notification_time DATETIME,
      status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED')),
      acknowledged_by TEXT,
      acknowledged_at DATETIME,
      resolved_by TEXT,
      resolved_at DATETIME,
      resolve_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 通知日志（消息推送记录）
    CREATE TABLE IF NOT EXISTS notification_log (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER REFERENCES warning_event(event_id) ON DELETE CASCADE,
      user_email TEXT,
      channel TEXT DEFAULT 'system',
      message TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_we_device ON warning_event(device_id);
    CREATE INDEX IF NOT EXISTS idx_we_status ON warning_event(status);
    CREATE INDEX IF NOT EXISTS idx_we_level ON warning_event(warning_level);
    CREATE INDEX IF NOT EXISTS idx_we_created ON warning_event(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_nl_event ON notification_log(event_id);
  `);

  // P0.1/P1.1: 为法规表添加增强字段（SQLite不支持IF NOT EXISTS，需try-catch）
  try {
    db.exec(`ALTER TABLE regulations ADD COLUMN level VARCHAR(20) DEFAULT '标准';`);
  } catch (e) { /* 字段已存在 */ }
  try {
    db.exec(`ALTER TABLE regulations ADD COLUMN device_type VARCHAR(100);`);
  } catch (e) { /* 字段已存在 */ }
  try {
    db.exec(`ALTER TABLE regulations ADD COLUMN doc_no VARCHAR(50);`);
  } catch (e) { /* 字段已存在 */ }
  try {
    db.exec(`ALTER TABLE regulations ADD COLUMN issuer VARCHAR(100);`);
  } catch (e) { /* 字段已存在 */ }

  runMigrations();

  // 创建增强字段索引（需在字段添加后创建）
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_regulations_level ON regulations(level);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_regulations_device_type ON regulations(device_type);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_regulations_doc_no ON regulations(doc_no);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_clauses_severity ON regulation_clauses(severity);`);
  } catch (e) { /* 索引已存在 */ }

  // 初始化系统配置
  initSystemConfig();
}

/**
 * 增量迁移：为已有库补齐新增列（SQLite 的 ADD COLUMN 无 IF NOT EXISTS，逐条 try）
 */
function addColumn(table, columnDef) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`);
    return true;
  } catch (e) {
    if (!/duplicate column name/i.test(e.message)) {
      console.warn(`[DB] ALTER TABLE ${table} ADD ${columnDef} 失败:`, e.message);
    }
    return false;
  }
}

function runMigrations() {
  // ---------- 司法留痕增强（LOG-01/02/03） ----------
  addColumn('operation_logs', `user_role VARCHAR(20)`);
  addColumn('operation_logs', `request_digest TEXT`);
  addColumn('operation_logs', `response_digest TEXT`);
  addColumn('operation_logs', `data_before TEXT`);
  addColumn('operation_logs', `data_after TEXT`);
  addColumn('operation_logs', `chain_version INTEGER DEFAULT 1`);

  // ---------- 模板实例版本关联（TM-03：需求 8.3 template_instance.template_version） ----------
  addColumn('discrimination_records', `template_version TEXT DEFAULT '1'`);

  // ---------- 知识库增强：五层分类 + 版本管理 + 审核流程（KB-02/04/05） ----------
  addColumn('regulations', `version VARCHAR(20) DEFAULT '1.0'`);
  addColumn('regulations', `revision_note TEXT`);
  addColumn('regulations', `supersedes_id INTEGER`);
  addColumn('regulations', `superseded_by_id INTEGER`);
  addColumn('regulations', `review_status VARCHAR(20) DEFAULT 'approved'`);
  addColumn('regulations', `reviewed_by VARCHAR(100)`);
  addColumn('regulations', `reviewed_at DATETIME`);
  addColumn('regulations', `review_note TEXT`);
  addColumn('regulations', `source_url TEXT`);

  // ---------- 条款结构化增强（KB-03） ----------
  addColumn('regulation_clauses', `effective_date DATE`);
  addColumn('regulation_clauses', `device_type VARCHAR(100)`);
  addColumn('regulation_clauses', `parent_clause_id INTEGER`);

  // ---------- 模板字段增强（排序稳定性 BUG-03） ----------
  addColumn('template_fields', `updated_at DATETIME`);

  // ---------- AI 建议专家审阅决策留痕（TR-03/TR-04） ----------
  addColumn('template_ai_suggestion', `expert_decisions TEXT`);
  addColumn('template_ai_suggestion', `final_output_json TEXT`);
  addColumn('template_ai_suggestion', `diff_summary TEXT`);
  addColumn('template_ai_suggestion', `reviewed_by VARCHAR(100)`);
  addColumn('template_ai_suggestion', `reviewed_at DATETIME`);

  // ---------- 判别记录：AI 置信度与提供方（AI-04） ----------
  addColumn('discrimination_records', `ai_confidence REAL`);
  addColumn('discrimination_records', `ai_provider VARCHAR(30)`);
  addColumn('discrimination_records', `request_id VARCHAR(40)`);

  migrateFieldTypeFile();

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_op_logs_ip ON operation_logs(ip_address);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_op_logs_request ON operation_logs(request_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_regulations_review ON regulations(review_status);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_fields_sort ON template_fields(template_id, sort_order, id);`);
  } catch (e) { /* 索引已存在 */ }
}

/**
 * TM-01：需求定义的字段类型为「文本/数字/日期/枚举/文件」5 种，
 * 旧表 CHECK 约束缺 'file'。SQLite 无法直接修改 CHECK，需重建表。
 * 重建在事务内完成，失败自动回滚，不会丢数据。
 */
function migrateFieldTypeFile() {
  let sql = '';
  try {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='template_fields'").get();
    sql = row ? String(row.sql || '') : '';
  } catch (e) { return; }
  if (!sql || sql.includes("'file'")) return; // 已支持

  const cols = db.prepare('PRAGMA table_info(template_fields)').all().map(c => c.name);
  const colList = cols.join(', ');

  try {
    const tx = db.transaction(() => {
      db.exec('PRAGMA foreign_keys = OFF;');
      db.exec(`
        CREATE TABLE template_fields__new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
          field_name TEXT NOT NULL,
          field_label TEXT NOT NULL,
          field_type TEXT NOT NULL CHECK(field_type IN ('text','number','date','select','textarea','checkbox','radio','file')),
          required INTEGER DEFAULT 1,
          sort_order INTEGER DEFAULT 0,
          options TEXT,
          default_value TEXT,
          placeholder TEXT,
          validation_rule TEXT,
          help_text TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME
        );
      `);
      const newCols = db.prepare('PRAGMA table_info(template_fields__new)').all().map(c => c.name);
      const shared = cols.filter(c => newCols.includes(c));
      db.exec(`INSERT INTO template_fields__new (${shared.join(', ')}) SELECT ${shared.join(', ')} FROM template_fields;`);
      db.exec('DROP TABLE template_fields;');
      db.exec('ALTER TABLE template_fields__new RENAME TO template_fields;');
      db.exec('CREATE INDEX IF NOT EXISTS idx_fields_template ON template_fields(template_id);');
      db.exec('PRAGMA foreign_keys = ON;');
    });
    tx();
    console.log('[DB] template_fields 已升级：支持 file 字段类型（原有列: ' + colList + '）');
  } catch (e) {
    console.warn('[DB] template_fields 升级失败（已回滚，不影响现有功能）:', e.message);
    try { db.exec('PRAGMA foreign_keys = ON;'); } catch (_) {}
    try { db.exec('DROP TABLE IF EXISTS template_fields__new;'); } catch (_) {}
  }
}

/**
 * 知识库五层分类体系（KB-02，需求文档 1.3）
 * 顺序即效力层级，数字越小效力越高。
 */
const REGULATION_LEVELS = [
  { key: 'law',          label: '法律',     rank: 1, description: '全国人大及其常委会制定，如《特种设备安全法》' },
  { key: 'regulation',   label: '行政法规', rank: 2, description: '国务院制定，如《特种设备安全监察条例》' },
  { key: 'national_std', label: '国家标准', rank: 3, description: 'GB / GB-T 系列，如 GB 7588' },
  { key: 'industry_std', label: '行业标准', rank: 4, description: 'TSG / JG 等行业规范，如 TSG T7001' },
  { key: 'local_std',    label: '地方标准', rank: 5, description: 'DB 系列地方标准与地方监管文件' }
];

const REGULATION_LEVEL_LABELS = REGULATION_LEVELS.map(l => l.label);
const REGULATION_REVIEW_STATUSES = ['draft', 'pending', 'approved', 'rejected'];

/** 把任意输入归一化为五层分类之一（无法识别时按编码推断，再兜底“行业标准”） */
function normalizeRegulationLevel(input, code) {
  const raw = String(input == null ? '' : input).trim();
  if (raw) {
    const byLabel = REGULATION_LEVELS.find(l => l.label === raw);
    if (byLabel) return byLabel.label;
    const byKey = REGULATION_LEVELS.find(l => l.key === raw.toLowerCase());
    if (byKey) return byKey.label;
    if (/条例|行政法规/.test(raw)) return '行政法规';
    if (/国标|国家/.test(raw)) return '国家标准';
    if (/行标|行业/.test(raw)) return '行业标准';
    if (/地方|省|市/.test(raw)) return '地方标准';
    if (/法$|法律/.test(raw)) return '法律';
  }
  const c = String(code == null ? '' : code).toUpperCase().trim();
  if (/^GB/.test(c)) return '国家标准';
  if (/^(TSG|JG|JB|NB)/.test(c)) return '行业标准';
  if (/^DB/.test(c)) return '地方标准';
  return '行业标准';
}

/**
 * 初始化系统配置
 */
function initSystemConfig() {
  const defaultConfigs = [
    { key: 'system.name', value: '特种设备电梯安全管理AI系统', type: 'string', description: '系统名称', is_public: 1 },
    { key: 'system.version', value: '4.0.0', type: 'string', description: '系统版本', is_public: 1 },
    { key: 'audit.auto_assign', value: 'true', type: 'boolean', description: '是否自动分配审核任务', is_public: 0 },
    { key: 'audit.timeout_hours', value: '48', type: 'number', description: '审核超时时间（小时）', is_public: 0 },
    { key: 'ai.default_method', value: 'transformers', type: 'string', description: 'AI默认方法（transformers/ollama/keywords）', is_public: 0 },
    { key: 'crawler.enabled', value: 'true', type: 'boolean', description: '是否启用爬虫', is_public: 0 },
    { key: 'crawler.interval_hours', value: '24', type: 'number', description: '爬虫执行间隔（小时）', is_public: 0 },
    { key: 'security.login_max_attempts', value: '5', type: 'number', description: '最大登录尝试次数', is_public: 0 },
    { key: 'security.login_lock_minutes', value: '15', type: 'number', description: '登录锁定时间（分钟）', is_public: 0 },
    { key: 'session.timeout_hours', value: '24', type: 'number', description: '会话超时时间（小时）', is_public: 0 },
    // ---- AI 分类器（需求文档模块4）----
    { key: 'ai.provider', value: 'auto', type: 'string', description: 'AI分类提供方（auto/coze/ollama/local）', is_public: 0 },
    { key: 'ai.confidence_threshold', value: '0.7', type: 'number', description: 'AI分类置信度阈值，低于则引导人工选择模板', is_public: 1 },
    { key: 'ai.extract_enabled', value: 'true', type: 'boolean', description: '是否启用AI字段自动提取', is_public: 1 },
    { key: 'coze.api_base', value: 'https://api.coze.cn', type: 'string', description: 'Coze 开放平台地址', is_public: 0 },
    { key: 'coze.bot_id', value: '', type: 'string', description: 'Coze Bot ID（为空则使用本地兜底分类器）', is_public: 0 },
    { key: 'coze.timeout_ms', value: '20000', type: 'number', description: 'Coze 调用超时（毫秒）', is_public: 0 },
    // ---- 司法留痕 ----
    { key: 'audit.log_request_digest', value: 'true', type: 'boolean', description: '是否记录请求摘要', is_public: 0 },
    { key: 'audit.log_response_digest', value: 'true', type: 'boolean', description: '是否记录响应摘要', is_public: 0 },
    { key: 'audit.seal_batch_size', value: '100', type: 'number', description: 'WORM封存批大小', is_public: 0 },
    // ---- 知识库 ----
    { key: 'knowledge.require_review', value: 'true', type: 'boolean', description: '新增法规是否需要人工审核后才生效', is_public: 0 }
  ];
  
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO system_config (config_key, config_value, config_type, description, is_public)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  for (const config of defaultConfigs) {
    stmt.run(config.key, config.value, config.type, config.description, config.is_public);
  }
}

/**
 * 获取系统配置
 */
function getConfig(key, defaultValue = null) {
  const row = db.prepare('SELECT config_value, config_type FROM system_config WHERE config_key = ?').get(key);
  if (!row) return defaultValue;
  
  // 类型转换
  switch (row.config_type) {
    case 'number':
      return parseFloat(row.config_value);
    case 'boolean':
      return row.config_value === 'true';
    case 'json':
      try {
        return JSON.parse(row.config_value);
      } catch {
        return defaultValue;
      }
    default:
      return row.config_value;
  }
}

/**
 * 设置系统配置
 */
function setConfig(key, value, updatedBy = 'system') {
  const row = db.prepare('SELECT config_type FROM system_config WHERE config_key = ?').get(key);
  if (!row) return false;
  
  let configValue = value;
  if (row.config_type === 'json' && typeof value === 'object') {
    configValue = JSON.stringify(value);
  }
  
  db.prepare(`
    UPDATE system_config 
    SET config_value = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE config_key = ?
  `).run(configValue, updatedBy, key);
  
  return true;
}

/**
 * 关闭数据库连接
 */
function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

/** 批量读取配置（带默认值） */
function getConfigs(keysWithDefaults) {
  const out = {};
  for (const [k, def] of Object.entries(keysWithDefaults)) {
    out[k] = getConfig(k, def);
  }
  return out;
}

module.exports = {
  getDb,
  getConfig,
  getConfigs,
  setConfig,
  closeDb,
  REGULATION_LEVELS,
  REGULATION_LEVEL_LABELS,
  REGULATION_REVIEW_STATUSES,
  normalizeRegulationLevel
};
