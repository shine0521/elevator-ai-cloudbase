#!/usr/bin/env node
/**
 * 全栈数据打通 - 阶段1：完整种子数据
 * 目标：把"电梯安全SaaS"13张空表 + 关联表灌入真实仿真数据
 *  - 50 台电梯
 *  - 12 组织(已有 12 用户不再重建)
 *  - 30 天日管控 × 50 = 1500 条(85%合规) + 检查项明细
 *  - 12 周排查
 *  - 6 月调度
 *  - 20 隐患(low/general/major/critical 全分布)
 *  - 15 工单(全状态)
 *  - 5 应急事件 + 救援记录
 *  - 8 审批流(含AI转审)
 *  - 50 消息
 *  - 500 预警事件
 *  - devices_update_by_ai/device_document_index 若干
 *
 * 设计原则：
 *  - 业务闭环：日管控 fail → 自动建隐患 → 自动建工单(已联)
 *  - 隐患 → 工单：status 对齐 (pending→pending / rectifying→rectifying / verifying→verifying / closed→closed)
 *  - 应急 → 消息 + 审批
 *  - 所有编号符合 UNIQUE 约束
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || __dirname.replace(/\/scripts$/, '');
const DB_PATH = path.join(DATA_DIR, 'data.db');

/**
 * 幂等种子函数：可被 server.js 启动钩子复用（共享同一 db 连接，避免 CloudBase 持久卷 WAL 冲突）
 * @param {import('better-sqlite3').Database} database 已打开的 db 实例
 * @returns {object} 汇总
 */
function runSeedFull(database) {
  const db = database;
  if (!db) throw new Error('seed_full: db 实例缺失');
  db.pragma('foreign_keys = ON');

  const run = db.transaction(() => {
  // ---- 1. 组织 ----
  const orgCount = db.prepare('SELECT COUNT(*) c FROM organizations').get().c;
  if (orgCount === 0) {
    const orgStmt = db.prepare(`INSERT INTO organizations (name, org_type, parent_id, region_code, level, status) VALUES (?,?,?,?,?,?)`);
    const orgs = [
      ['特安助总部', 'HQ', null, 'HQ', 1, 'active'],
      ['华东区域', 'REGIONAL', 1, 'EAST', 2, 'active'],
      ['华北区域', 'REGIONAL', 1, 'NORTH', 2, 'active'],
      ['华南区域', 'REGIONAL', 1, 'SOUTH', 2, 'active'],
      ['上海分公司', 'SUBSIDIARY', 2, 'SH', 3, 'active'],
      ['杭州分公司', 'SUBSIDIARY', 2, 'HZ', 3, 'active'],
      ['北京分公司', 'SUBSIDIARY', 3, 'BJ', 3, 'active'],
      ['广州分公司', 'SUBSIDIARY', 4, 'GZ', 3, 'active'],
      ['上海中心项目', 'PROJECT', 5, 'SH01', 4, 'active'],
      ['杭州亚运项目', 'PROJECT', 6, 'HZ01', 4, 'active'],
      ['北京总部大厦', 'PROJECT', 7, 'BJ01', 4, 'active'],
      ['广州塔项目', 'PROJECT', 8, 'GZ01', 4, 'active'],
    ];
    for (const o of orgs) orgStmt.run(...o);
    console.log('  组织: +12');
  } else {
    console.log('  组织: 已存在 ' + orgCount + ' 条(跳过)');
  }
  const orgIds = db.prepare('SELECT id FROM organizations ORDER BY id').all().map(r => r.id);

  // ---- 2. 用户 ----
  const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const users = db.prepare('SELECT id, email, name, role FROM users ORDER BY id').all();
  console.log('  用户: 已存在 ' + userCount + ' 条(复用)');
  const operatorIds = users.filter(u => u.role === 'user').map(u => u.id);
  const auditorIds = users.filter(u => u.role === 'auditor').map(u => u.id);
  const adminIds = users.filter(u => u.role === 'admin').map(u => u.id);
  const allIds = users.map(u => u.id);
  const pickOp = (i) => operatorIds[i % operatorIds.length];
  const pickAud = (i) => auditorIds[i % auditorIds.length];

  // ---- 3. 设备 50 台 ----
  const devCount = db.prepare('SELECT COUNT(*) c FROM elevator_device').get().c;
  if (devCount > 0) { console.log('  设备: 已存在 ' + devCount + ' 台(清空重建)'); db.prepare('DELETE FROM elevator_device').run(); }
  const devTypes = ['曳引电梯', '曳引电梯', '曳引电梯', '自动扶梯', '自动人行道', '杂物电梯', '液压电梯'];
  const brands = ['奥的斯', '三菱', '日立', '通力', '蒂森', '迅达', '东芝'];
  const regions = ['上海', '杭州', '北京', '广州'];
  const projects = ['上海中心', '杭州亚运村', '北京国贸', '广州塔', '陆家嘴金融城', '钱江新城', '中关村', '珠江新城'];
  const devStmt = db.prepare(`INSERT INTO elevator_device
    (device_code, device_name, device_type, registration_code, brand, model, manufacture_date, install_date,
     location, region_code, org_id, project_id, owner, maintenance_unit, status, risk_level,
     last_inspection_date, next_inspection_date, evaluate_date, created_by)
    VALUES (@device_code,@device_name,@device_type,@registration_code,@brand,@model,@manufacture_date,@install_date,
     @location,@region_code,@org_id,@project_id,@owner,@maintenance_unit,@status,@risk_level,
     @last_inspection_date,@next_inspection_date,@evaluate_date,@created_by)`);
  const statuses = ['NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'ATTENTION', 'ATTENTION', 'WARNING', 'REPAIR'];
  const riskLevels = ['general', 'general', 'general', 'major', 'critical'];
  const devIds = [];
  const year = 2023;
  for (let i = 0; i < 50; i++) {
    const dt = devTypes[i % devTypes.length];
    const region = regions[i % regions.length];
    const proj = projects[i % projects.length];
    const orgId = orgIds[4 + (i % 8)];
    const seq = String(i + 1).padStart(4, '0');
    const code = `EV-${year}-${seq}`;
    const status = statuses[i % statuses.length];
    const risk = (status === 'REPAIR' || status === 'WARNING') ? (riskLevels[i % riskLevels.length] === 'general' ? 'major' : riskLevels[i % riskLevels.length]) : 'general';
    const mfg = `20${15 + (i % 9)}-0${1 + (i % 9)}-1${i % 9}`;
    const install = `20${16 + (i % 8)}-0${1 + (i % 9)}-1${i % 9}`;
    const lastInsp = `2026-0${1 + (i % 8)}-1${i % 8}`;
    const nextInsp = `2026-${String(1 + (i % 11)).padStart(2, '0')}-1${i % 8}`;
    const info = devStmt.run({
      device_code: code,
      device_name: `${proj}${dt}${seq}`,
      device_type: dt,
      registration_code: `REG-${seq}`,
      brand: brands[i % brands.length],
      model: `${brands[i % brands.length]}-${1000 + i}`,
      manufacture_date: mfg,
      install_date: install,
      location: `${region}市${proj}`,
      region_code: ['SH', 'HZ', 'BJ', 'GZ'][i % 4],
      org_id: orgId,
      project_id: null,
      owner: `${proj}物业`,
      maintenance_unit: `${brands[i % brands.length]}维保`,
      status: status,
      risk_level: risk,
      last_inspection_date: lastInsp,
      next_inspection_date: nextInsp,
      evaluate_date: `2026-0${1 + (i % 6)}-1${i % 9}`,
      created_by: 'system'
    });
    devIds.push(info.lastInsertRowid);
  }
  console.log('  设备: +50 (status=' + statuses.join(',') + ')');

  // 4. 设备文档 + AI更新记录
  const diStmt = db.prepare(`INSERT INTO device_document_index (device_id, doc_id, doc_type, is_latest) VALUES (?,?,?,?)`);
  const duStmt = db.prepare(`INSERT INTO device_update_by_ai (device_id, source_type, source_id, field_name, old_value, new_value, updated_by, created_at) VALUES (?,?,?,?,?,?,?,?)`);
  const drStmt = db.prepare(`INSERT INTO device_dynamic_record (device_id, record_type, title, content, operator, created_at) VALUES (?,?,?,?,?,?)`);
  for (let i = 0; i < 20; i++) {
    const did = devIds[i];
    diStmt.run(did, `DOC-${did}-2026`, '检验报告', 1);
    if (i % 3 === 0) duStmt.run(did, 'AI', `SRC-${did}`, 'risk_level', 'general', 'major', 'AI_ENGINE', `2026-0${1 + (i % 8)}-1${i % 9}`);
    drStmt.run(did, 'AI_UPDATE', 'AI动态调整风险等级', `设备 EV-${2023}-${String(i + 1).padStart(4, '0')} 风险等级由 general 调整为 major`, 'AI_ENGINE', `2026-0${1 + (i % 8)}-1${i % 9}`);
  }
  console.log('  设备文档/AI更新/动态: +20/+7/+20');

  // ---- 5. 日管控 30天 × 50台 ----
  const diCount = db.prepare('SELECT COUNT(*) c FROM daily_inspection').get().c;
  if (diCount > 0) { console.log('  日管控: 已存在 ' + diCount + ' (清空重建)'); db.prepare('DELETE FROM daily_inspection').run(); db.prepare('DELETE FROM inspection_item').run(); }

  const insStmt = db.prepare(`INSERT INTO daily_inspection
    (inspection_no, device_id, check_date, inspector_id, inspector_name, template_id, template_version,
     status, gps_location, total_items, passed_items, failed_items, review_required, signature, submitted_at)
    VALUES (@inspection_no,@device_id,@check_date,@inspector_id,@inspector_name,@template_id,@template_version,
     @status,@gps_location,@total_items,@passed_items,@failed_items,@review_required,@signature,@submitted_at)`);
  const itemStmt = db.prepare(`INSERT INTO inspection_item
    (inspection_id, field_id, item_seq, item_name, item_category, item_type, input_value, standard_value,
     compare_rule, compare_result, ai_confidence, ai_action, review_required, fail_reason)
    VALUES (@inspection_id,@field_id,@item_seq,@item_name,@item_category,@item_type,@input_value,@standard_value,
     @compare_rule,@compare_result,@ai_confidence,@ai_action,@review_required,@fail_reason)`);

  const SAFETY_ITEMS = [
    { name: '层门关闭并锁紧', cat: '设备', std: '正常' },
    { name: '钢丝绳磨损率', cat: '设备', std: '≤7%' },
    { name: '限速器校验有效', cat: '设备', std: '在校验期' },
    { name: '制动器工作正常', cat: '设备', std: '无异常' },
    { name: '底坑无积水杂物', cat: '环境', std: '清洁' },
    { name: '应急照明有效', cat: '设备', std: '正常' },
    { name: '轿厢平层精度', cat: '设备', std: '±5mm' },
    { name: '报警装置有效', cat: '设备', std: '正常' },
  ];

  let insSeq = 0;
  let totalIns = 0;
  let failInsCount = 0;
  const days = 30;
  for (let d = days; d >= 1; d--) {
    const date = new Date(2026, 7, 1); // 2026-08-01 baseline
    date.setDate(1 + (days - d));
    const dateStr = date.toISOString().slice(0, 10);
    for (let i = 0; i < 50; i++) {
      const did = devIds[i];
      const dev = db.prepare('SELECT device_code, risk_level FROM elevator_device WHERE id=?').get(did);
      // 85% 合规，15% 有 fail
      const isFail = (i * days + d) % 7 === 0 || (dev.risk_level !== 'general' && (i + d) % 5 === 0);
      const totalItems = 8;
      const failed = isFail ? (1 + (i % 3)) : 0;
      const passed = totalItems - failed;
      const status = isFail ? 'submitted' : (d % 9 === 0 ? 'reviewed' : 'submitted');
      const reviewReq = isFail ? 1 : 0;
      insSeq++;
      const no = `INS-${dateStr.replace(/-/g, '')}-${String(insSeq).padStart(3, '0')}`;
      const insId = insStmt.run({
        inspection_no: no, device_id: did, check_date: dateStr,
        inspector_id: pickOp(i + d), inspector_name: users[pickOp(i + d) - 1] ? users[pickOp(i + d) - 1].name : '操作员',
        template_id: 1, template_version: 1, status: status, gps_location: JSON.stringify({ lat: 31.2 + i * 0.01, lng: 121.4 + i * 0.01, address: dev.location }),
        total_items: totalItems, passed_items: passed, failed_items: failed, review_required: reviewReq,
        signature: `sig_${insSeq}.png`, submitted_at: dateStr + ' 09:30:00'
      }).lastInsertRowid;
      // 检查项明细
      for (let s = 0; s < totalItems; s++) {
        const it = SAFETY_ITEMS[s];
        const itemFail = isFail && s < failed;
        itemStmt.run({
          inspection_id: insId, field_id: null, item_seq: s + 1, item_name: it.name, item_category: it.cat,
          item_type: 'check', input_value: itemFail ? '异常' : '正常', standard_value: it.std,
          compare_rule: JSON.stringify({ op: 'eq', std: it.std }),
          compare_result: itemFail ? 'fail' : 'pass',
          ai_confidence: itemFail ? 0.82 + (i % 3) * 0.05 : 0.95,
          ai_action: itemFail ? 'TRIGGER_REVIEW' : null,
          review_required: itemFail ? 1 : 0,
          fail_reason: itemFail ? `${it.name}检测不达标` : null
        });
      }
      totalIns++;
      if (isFail) failInsCount++;
    }
  }
  console.log(`  日管控: +${totalIns} (含 fail ${failInsCount}) | 检查项 +${totalIns * 8}`);

  // ---- 6. 周排查 12 次 ----
  const wkCount = db.prepare('SELECT COUNT(*) c FROM weekly_inspection').get().c;
  if (wkCount > 0) { db.prepare('DELETE FROM weekly_inspection').run(); }
  const wkStmt = db.prepare(`INSERT INTO weekly_inspection
    (inspection_no, device_id, week_no, inspector_id, inspector_name, template_id, template_version, status, gps_location, total_items, passed_items, failed_items, review_required, signature, submitted_at)
    VALUES (@inspection_no,@device_id,@week_no,@inspector_id,@inspector_name,@template_id,@template_version,@status,@gps_location,@total_items,@passed_items,@failed_items,@review_required,@signature,@submitted_at)`);
  for (let w = 1; w <= 12; w++) {
    const did = devIds[w % 50];
    const fail = w % 4 === 0 ? 2 : 0;
    wkStmt.run({
      inspection_no: `WK-2026-W${String(w).padStart(2, '0')}-001`,
      device_id: did, week_no: `2026-W${String(w).padStart(2, '0')}`,
      inspector_id: pickOp(w), inspector_name: users[pickOp(w) - 1] ? users[pickOp(w) - 1].name : '操作员',
      template_id: 2, template_version: 1, status: w % 5 === 0 ? 'completed' : 'ongoing',
      gps_location: null, total_items: 12, passed_items: 12 - fail, failed_items: fail, review_required: fail > 0 ? 1 : 0,
      signature: `wsig_${w}.png`, submitted_at: `2026-0${1 + (w % 8)}-1${w % 8} 14:00:00`
    });
  }
  console.log('  周排查: +12');

  // ---- 7. 月调度 6 次 ----
  const mdCount = db.prepare('SELECT COUNT(*) c FROM monthly_dispatch').get().c;
  if (mdCount > 0) { db.prepare('DELETE FROM monthly_dispatch').run(); }
  const mdStmt = db.prepare(`INSERT INTO monthly_dispatch (dispatch_no, dispatch_month, host_id, host_name, overview, topics, attendees, summary, status, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  for (let m = 1; m <= 6; m++) {
    const month = `2026-0${m}`;
    const host = pickAud(m);
    mdStmt.run(
      `MON-${month}`, month, host, users[host - 1].name,
      JSON.stringify({ checkCount: 50 * (30 - m), hazardCount: 3 + m, rectifyRate: 95 - m, accidentCount: 0 }),
      JSON.stringify(['日管控执行分析', '隐患排查治理', '应急能力建设']),
      JSON.stringify([{ id: host, name: users[host - 1].name }]),
      `本月完成检查 ${50 * (30 - m)} 次，发现隐患 ${3 + m} 项，整改率 ${95 - m}%。`,
      m % 3 === 0 ? 'completed' : 'draft', pickAud(m)
    );
  }
  console.log('  月调度: +6');

  // ---- 8. 隐患 20 + 工单 15 ----
  const hzCount = db.prepare('SELECT COUNT(*) c FROM hazard_check_list').get().c;
  if (hzCount > 0) { db.prepare('DELETE FROM hazard_check_list').run(); db.prepare('DELETE FROM work_order').run(); }
  const hzStmt = db.prepare(`INSERT INTO hazard_check_list
    (hazard_no, device_id, hazard_type, description, lse_L, lse_S, lse_E, risk_B, risk_level, rectify_advice, deadline, rectify_owner_id, rectify_owner_name, photos, status, finder_id, finder_name, find_time, gps_location)
    VALUES (@hazard_no,@device_id,@hazard_type,@description,@lse_L,@lse_S,@lse_E,@risk_B,@risk_level,@rectify_advice,@deadline,@rectify_owner_id,@rectify_owner_name,@photos,@status,@finder_id,@finder_name,@find_time,@gps_location)`);
  const woStmt = db.prepare(`INSERT INTO work_order (order_no, hazard_id, device_id, status, rectify_description, rectify_by, rectify_at, verify_description, verify_by, verify_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);

  const hzTypes = ['设备', '环境', '人员', '管理'];
  const hzDescs = ['门机控制器异响', '底坑渗水', '维保人员无证上岗', '巡检记录缺失', '钢丝绳断丝超标', '限速器超期未校验', '轿厢照明失效', '应急按钮卡滞'];
  const riskMap = [
    { level: 'low', L: 2, S: 1, E: 2 },
    { level: 'general', L: 3, S: 2, E: 3 },
    { level: 'major', L: 4, S: 3, E: 4 },
    { level: 'critical', L: 5, S: 5, E: 5 },
  ];
  const hzStatuses = ['pending', 'rectifying', 'verifying', 'closed', 'pending', 'rectifying', 'verifying', 'closed', 'pending', 'rectifying', 'verifying', 'closed', 'pending', 'rectifying', 'verifying', 'closed', 'pending', 'rectifying', 'verifying', 'closed'];
  let createdHaz = 0;
  let createdWO = 0;
  for (let i = 0; i < 20; i++) {
    const did = devIds[i % 50];
    const rm = riskMap[i % 4];
    const desc = hzDescs[i % hzDescs.length];
    const status = hzStatuses[i];
    const finder = pickOp(i);
    const rectOwner = pickOp(i + 2);
    const findDate = `2026-0${1 + (i % 8)}-1${i % 9}`;
    const hazId = hzStmt.run({
      hazard_no: `HAZ-202608${String(i % 9 + 1).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`,
      device_id: did, hazard_type: hzTypes[i % 4], description: desc,
      lse_L: rm.L, lse_S: rm.S, lse_E: rm.E, risk_B: rm.L * rm.S * rm.E, risk_level: rm.level,
      rectify_advice: `建议：${desc}限期整改`,
      deadline: `2026-0${1 + (i % 8)}-2${i % 8}`,
      rectify_owner_id: rectOwner, rectify_owner_name: users[rectOwner - 1].name,
      photos: JSON.stringify([{ url: `https://storage/h${i}.jpg`, note: desc }]),
      status: status, finder_id: finder, finder_name: users[finder - 1].name,
      find_time: findDate + ' 10:00:00', gps_location: JSON.stringify({ lat: 31.2, lng: 121.4 })
    }).lastInsertRowid;
    createdHaz++;
    // 工单：与隐患 status 对齐
    if (status !== 'pending' || i < 15) {
      const woStatus = status === 'pending' ? 'pending' : status;
      const rectifyAt = (woStatus === 'rectifying' || woStatus === 'verifying' || woStatus === 'closed') ? findDate + ' 15:00:00' : null;
      const verifyAt = (woStatus === 'verifying' || woStatus === 'closed') ? findDate + ' 17:00:00' : null;
      woStmt.run(
        `WO-202608${String(i % 9 + 1).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`,
        hazId, did, woStatus,
        woStatus === 'pending' ? null : `已按方案整改：${desc}`,
        woStatus === 'pending' ? null : rectOwner, rectifyAt,
        woStatus === 'verifying' || woStatus === 'closed' ? '已现场复核，整改合格' : null,
        woStatus === 'verifying' || woStatus === 'closed' ? pickAud(i) : null, verifyAt
      );
      createdWO++;
    }
  }
  console.log(`  隐患: +${createdHaz} | 工单: +${createdWO}`);

  // ---- 9. 应急 5 + 救援 ----
  const emCount = db.prepare('SELECT COUNT(*) c FROM emergency_event').get().c;
  if (emCount > 0) { db.prepare('DELETE FROM emergency_event').run(); db.prepare('DELETE FROM rescue_log').run(); }
  const emStmt = db.prepare(`INSERT INTO emergency_event (event_no, device_id, alarm_type, alarm_source, trapped_count, location, description, status, start_time, end_time, responder_id, notified_users, emergency_contact, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const rlStmt = db.prepare(`INSERT INTO rescue_log (event_id, step_seq, step_name, action, operator_id, photos) VALUES (?,?,?,?,?,?)`);
  const alarmTypes = ['困人', '困人', '火灾', '扶梯伤人', '停电'];
  const emStatuses = ['completed', 'completed', 'recovering', 'completed', 'responding'];
  for (let i = 0; i < 5; i++) {
    const did = devIds[i * 10];
    const startT = `2026-0${1 + (i % 8)}-1${i % 9} 1${i % 9}:0${i % 6}:00`;
    const endT = emStatuses[i] === 'completed' ? `2026-0${1 + (i % 8)}-1${i % 9} 1${i % 9}:2${i % 6}:00` : null;
    const evId = emStmt.run(
      `EMG-202608${String(i % 9 + 1).padStart(2, '0')}-00${i + 1}`,
      did, alarmTypes[i], '物联报警', i % 2 + 1,
      db.prepare('SELECT location FROM elevator_device WHERE id=?').get(did).location,
      `${alarmTypes[i]}事件，已启动应急预案`,
      emStatuses[i], startT, endT, pickOp(i),
      JSON.stringify([users[pickOp(i) - 1].email]), '119',
      pickOp(i)
    ).lastInsertRowid;
    // 救援步骤
    const steps = ['接警响应', '到达现场', '确认安全', '实施救援', '恢复运行'];
    const nSteps = emStatuses[i] === 'responding' ? 1 : (emStatuses[i] === 'recovering' ? 3 : 5);
    for (let s = 0; s < nSteps; s++) {
      rlStmt.run(evId, s + 1, steps[s], `步骤${s + 1}：${steps[s]}完成`, pickOp(i), null);
    }
  }
  console.log('  应急: +5 | 救援: +若干');

  // ---- 10. 审批 8 ----
  const awCount = db.prepare('SELECT COUNT(*) c FROM approval_workflow').get().c;
  if (awCount > 0) { db.prepare('DELETE FROM approval_workflow').run(); db.prepare('DELETE FROM approval_node').run(); }
  const awStmt = db.prepare(`INSERT INTO approval_workflow (business_type, business_id, business_title, status, current_node, dual_review, created_by, created_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?)`);
  const anStmt = db.prepare(`INSERT INTO approval_node (approval_id, node_seq, node_name, approver_role, approver_id, approver_email, status, approval_result, comment, ai_comparison_summary, ai_confidence, decided_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const bizTypes = [
    { t: 'HAZARD', title: '隐患整改方案审批' },
    { t: 'EMERGENCY', title: '应急预案启动审批' },
    { t: 'WORK_ORDER', title: '重大维修工单审批' },
    { t: 'DEVICE_SCRAP', title: '设备报废审批' },
  ];
  const awStatuses = ['PENDING', 'APPROVED', 'PENDING', 'REJECTED', 'APPROVED', 'PENDING', 'APPROVED', 'PENDING'];
  for (let i = 0; i < 8; i++) {
    const bt = bizTypes[i % bizTypes.length];
    const status = awStatuses[i];
    const createdAt = `2026-0${1 + (i % 8)}-1${i % 9} 09:00:00`;
    const completedAt = status === 'PENDING' ? null : createdAt.replace('09:00', '16:00');
    const awId = awStmt.run(bt.t, i + 1, bt.title, status, status === 'PENDING' ? 1 : 2, i % 3 === 0 ? 1 : 0, users[pickOp(i) - 1].email, createdAt, completedAt).lastInsertRowid;
    // 节点
    const nNodes = 2;
    for (let n = 1; n <= nNodes; n++) {
      const nodeStatus = status === 'PENDING' ? (n === 1 ? 'PENDING' : 'PENDING') : (status === 'REJECTED' && n === 1 ? 'REJECTED' : 'APPROVED');
      const decided = nodeStatus === 'PENDING' ? null : createdAt.replace('09:00', '1' + n + ':0' + n);
      anStmt.run(
        awId, n, n === 1 ? '部门初审' : '合规复核',
        n === 1 ? 'operator' : 'auditor',
        n === 1 ? pickOp(i) : pickAud(i),
        users[n === 1 ? pickOp(i) - 1 : pickAud(i) - 1].email,
        nodeStatus,
        nodeStatus === 'APPROVED' ? '同意' : (nodeStatus === 'REJECTED' ? '不符合规范' : null),
        nodeStatus === 'PENDING' ? null : '审批意见：材料齐全，符合规范要求。',
        nodeStatus === 'PENDING' ? null : 'AI比对: 材料齐全，符合 TSG T5001-2023',
        0.91, decided
      );
    }
  }
  console.log('  审批: +8 | 节点 +16');

  // ---- 11. 消息 50 ----
  const msgCount = db.prepare('SELECT COUNT(*) c FROM messages').get().c;
  if (msgCount > 0) { db.prepare('DELETE FROM messages').run(); }
  const msgStmt = db.prepare(`INSERT INTO messages (user_email, category, title, content, related_type, related_id, is_read) VALUES (?,?,?,?,?,?,?)`);
  const cats = ['approval', 'warning', 'workorder', 'system', 'emergency'];
  for (let i = 0; i < 50; i++) {
    const u = users[i % users.length];
    const cat = cats[i % cats.length];
    const titles = {
      approval: '您有一条审批待处理', warning: '设备预警：风险等级上升',
      workorder: '工单状态更新', system: '系统通知', emergency: '应急事件通知'
    };
    msgStmt.run(u.email, cat, titles[cat], `这是一条${titles[cat]}（#${i + 1}）`, cat, String(i + 1), i % 3 === 0 ? 1 : 0);
  }
  console.log('  消息: +50');

  // ---- 12. 预警 500 ----
  const weCount = db.prepare('SELECT COUNT(*) c FROM warning_event').get().c;
  if (weCount > 0) { db.prepare('DELETE FROM warning_event').run(); }
  const weStmt = db.prepare(`INSERT INTO warning_event (device_id, warning_type, warning_level, warning_item, trigger_source, source_id, actual_value, action_required, notified_users, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const weTypes = ['STATUS', 'THRESHOLD', 'DEADLINE', 'TREND'];
  const weLevels = ['low', 'medium', 'high', 'urgent', 'critical'];
  const weItems = ['钢丝绳磨损率', '限速器校验', '下次检验日期', '故障频次趋势', '制动器温升'];
  for (let i = 0; i < 500; i++) {
    const did = devIds[i % 50];
    const lvl = weLevels[i % 5];
    const status = i % 4 === 0 ? 'OPEN' : (i % 4 === 1 ? 'ACKNOWLEDGED' : 'RESOLVED');
    weStmt.run(
      did, weTypes[i % 4], lvl, weItems[i % 5], 'sensor', 'sensor_' + i,
      (8 + i % 5) + '%', '请安排专项检查',
      JSON.stringify([users[pickOp(i) - 1].email]), status,
      `2026-0${1 + (i % 8)}-1${i % 9} 1${i % 9}:0${i % 6}:00`
    );
  }
  console.log('  预警: +500');

  // ---- 汇总 ----
  const summary = {
    organizations: db.prepare('SELECT COUNT(*) c FROM organizations').get().c,
    elevator_device: db.prepare('SELECT COUNT(*) c FROM elevator_device').get().c,
    daily_inspection: db.prepare('SELECT COUNT(*) c FROM daily_inspection').get().c,
    inspection_item: db.prepare('SELECT COUNT(*) c FROM inspection_item').get().c,
    weekly_inspection: db.prepare('SELECT COUNT(*) c FROM weekly_inspection').get().c,
    monthly_dispatch: db.prepare('SELECT COUNT(*) c FROM monthly_dispatch').get().c,
    hazard_check_list: db.prepare('SELECT COUNT(*) c FROM hazard_check_list').get().c,
    work_order: db.prepare('SELECT COUNT(*) c FROM work_order').get().c,
    emergency_event: db.prepare('SELECT COUNT(*) c FROM emergency_event').get().c,
    rescue_log: db.prepare('SELECT COUNT(*) c FROM rescue_log').get().c,
    approval_workflow: db.prepare('SELECT COUNT(*) c FROM approval_workflow').get().c,
    approval_node: db.prepare('SELECT COUNT(*) c FROM approval_node').get().c,
    messages: db.prepare('SELECT COUNT(*) c FROM messages').get().c,
    warning_event: db.prepare('SELECT COUNT(*) c FROM warning_event').get().c,
  };
  console.log('\n=== 数据汇总 ===');
  console.log(JSON.stringify(summary, null, 2));
  return summary;
});

  return run();
}

module.exports = runSeedFull;

// 直接 node scripts/seed_full.js 时：用本地 data.db 连接
if (require.main === module) {
  console.log('=== Seed Full ===');
  console.log('DB_PATH:', DB_PATH);
  if (!fs.existsSync(DB_PATH)) { console.error('data.db not found'); process.exit(1); }
  const localDb = new Database(DB_PATH);
  try {
    const r = runSeedFull(localDb);
    console.log('\n✅ 阶段1完成');
  } catch (e) {
    console.error('\n❌ 失败:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}
