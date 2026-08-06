-- 种子数据：演示账号、示例法规、模板、判别记录
-- 密码 hash = SHA256("123456" + "special-equipment-salt") = 14c1937d2a7e58cbbcec9f87eac58afe530df36d0b9629a34b59de736f409f0a

-- 1. 演示用户
INSERT OR IGNORE INTO users (id, email, name, password_hash, role) VALUES
  (1, 'admin@demo.com', '系统管理员', '14c1937d2a7e58cbbcec9f87eac58afe530df36d0b9629a34b59de736f409f0a', 'admin'),
  (2, 'auditor@demo.com', '审核员张三', '14c1937d2a7e58cbbcec9f87eac58afe530df36d0b9629a34b59de736f409f0a', 'auditor'),
  (3, 'user@demo.com', '普通用户李四', '14c1937d2a7e58cbbcec9f87eac58afe530df36d0b9629a34b59de736f409f0a', 'user');

-- 2. 法规 (字段: code, name, description, source_url, effective_date)
INSERT OR IGNORE INTO regulations (id, code, name, description, source_url, effective_date) VALUES
  (1, 'TSG T5001-2023', '电梯维护保养规则', '电梯的维护保养规范与要求', 'https://samr.gov.cn/', '2023-06-01'),
  (2, 'TSG T7001-2023', '电梯监督检验和定期检验规则', '电梯检验与定期检查规范', 'https://samr.gov.cn/', '2023-06-01'),
  (3, 'GB 7588-2020', '电梯制造与安装安全规范', '电梯制造与安装的国家标准', 'https://samr.gov.cn/', '2020-12-01');

-- 3. 法规条款 (字段: regulation_id, clause_number, clause_content, keywords)
INSERT OR IGNORE INTO regulation_clauses (id, regulation_id, clause_number, clause_content, keywords) VALUES
  (1, 1, '第8条', '电梯的日常维护保养周期不应超过15天。', '维保周期,日常维护,15天'),
  (2, 1, '第15条', '电梯钢丝绳磨损率不应超过7%，当磨损率超过7%时应立即更换。', '钢丝绳,磨损,7%,报废'),
  (3, 1, '第20条', '发生一般故障时，维保单位应在24小时内响应并处理。', '故障处理,24小时,响应'),
  (4, 1, '第25条', '电梯应急救援响应时间不应超过30分钟。', '应急救援,30分钟,响应时间'),
  (5, 1, '第30条', '限速器应在校验有效期内，校验周期不超过2年。', '限速器,校验,2年'),
  (6, 2, '第1.2条', '在用电梯的定期检验周期为1年。', '定期检验,1年,周期'),
  (7, 2, '第6.3条', '电梯层门和轿门应正常关闭并锁紧，门机系统应有防夹人保护装置。', '门机系统,防夹,门锁'),
  (8, 2, '第8.2条', '限速器应在校验有效期内，校验周期不超过2年。', '限速器,校验,2年'),
  (9, 2, '第12.5条', '门机系统出现故障时，电梯应不能正常启动或在就近楼层停靠开门。', '门机故障,启动,停靠'),
  (10, 2, '第45条', '制动器应能够在电梯正常运行时可靠制动。', '制动器,可靠制动'),
  (11, 3, '第12条', '电梯应设有电气安全装置，包括门锁、限速器、安全钳、缓冲器等安全开关。', '电气安全,门锁,限速器,安全钳'),
  (12, 3, '第5.8条', '电梯应设有紧急制动装置，在紧急情况下能可靠制停电梯。', '紧急制动,制停'),
  (13, 3, '第12.4.2条', '所有参与向轿厢施加制动的制动器机械部件应至少分成两组装设。', '制动器,两组,机械部件');

-- 4. 判别模板 (字段: name, description, fields, status)
INSERT OR IGNORE INTO templates (id, name, description, fields, status) VALUES
  (1, '电梯维保合规性判别', '基于TSG T5001-2023，判别电梯维护保养的合规性', '[{"name":"wire_rope_wear_rate","label":"钢丝绳磨损率(%)","type":"number","required":true},{"name":"maintenance_interval","label":"维保间隔天数","type":"number","required":true},{"name":"brake_status","label":"制动器状态","type":"text","required":true},{"name":"door_status","label":"门机系统状态","type":"text","required":true},{"name":"governor_calibrated","label":"限速器是否在校验期内","type":"text","required":true}]', 'published'),
  (2, '电梯定期检验申报审核', '基于TSG T7001-2023，审核电梯定期检验申报合规性', '[{"name":"inspection_interval","label":"距上次检验天数","type":"number","required":true},{"name":"inspection_qualified","label":"检验机构是否具备资质","type":"text","required":true},{"name":"report_complete","label":"检验报告是否完整","type":"text","required":true}]', 'published'),
  (3, '电梯故障报修判别', '基于TSG T5001-2023第20条，判别电梯故障的紧急程度与处置要求', '[{"name":"fault_type","label":"故障类型","type":"text","required":true},{"name":"fault_severity","label":"故障严重程度","type":"text","required":true},{"name":"response_time","label":"维保响应时间(小时)","type":"number","required":true},{"name":"rescue_time","label":"应急救援时间(分钟)","type":"number","required":true}]', 'published'),
  (4, '电梯安全部件巡检', '基于GB 7588-2020，巡检电梯关键安全部件状态', '[{"name":"brake_parts_count","label":"制动器组数","type":"number","required":true},{"name":"emergency_brake_test","label":"紧急制动测试结果","type":"text","required":true},{"name":"electrical_safety_test","label":"电气安全装置测试","type":"text","required":true}]', 'published');

-- 5. 规则引擎规则 (字段: rule_name, module_type, keywords)
INSERT OR IGNORE INTO rule_engine_rules (id, rule_name, module_type, keywords) VALUES
  (1, '钢丝绳磨损超标', '电梯维保合规性判别', '钢丝绳,磨损,7%,TSG T5001-2023第15条,不合规'),
  (2, '钢丝绳磨损预警', '电梯维保合规性判别', '钢丝绳,磨损,5%,预警,需关注'),
  (3, '维保超期', '电梯维保合规性判别', '维保,15天,TSG T5001-2023第8条,不合规'),
  (4, '限速器校验过期', '电梯维保合规性判别', '限速器,校验,过期,TSG T5001-2023第30条,不合规'),
  (5, '超期未检', '电梯定期检验申报审核', '检验,1年,TSG T7001-2023第1.2条,不合规'),
  (6, '应急救援超时', '电梯故障报修判别', '应急救援,30分钟,TSG T5001-2023第25条,不合规'),
  (7, '响应超时', '电梯故障报修判别', '响应,24小时,TSG T5001-2023第20条,不合规'),
  (8, '制动器单组失效', '电梯安全部件巡检', '制动器,两组,GB 7588-2020第12.4.2条,不合规');

-- 6. 判别记录样例 (字段: module_name, record_content, ai_result, ai_confidence, ai_reason, matched_rule, final_result, created_by, created_at)
INSERT OR IGNORE INTO discrimination_records (id, module_name, record_content, ai_result, ai_confidence, ai_reason, matched_rule, final_result, created_by, created_at) VALUES
  (1, '电梯维保合规性判别', '{"template":"TPL_ELEV_001","data":{"wire_rope_wear_rate":8.5,"maintenance_interval":15,"brake_status":"正常","door_status":"正常","governor_calibrated":"是"}}', '不合规', 95, '检测到钢丝绳磨损率8.5%，超过7%安全阈值', 'WEAR_CRITICAL', '不合规', 3, '2026-07-04 09:30:00'),
  (2, '电梯维保合规性判别', '{"template":"TPL_ELEV_001","data":{"wire_rope_wear_rate":3.2,"maintenance_interval":12,"brake_status":"正常","door_status":"正常","governor_calibrated":"是"}}', '合规', 92, '所有指标均在安全阈值内', '', '合规', 3, '2026-07-04 10:15:00'),
  (3, '电梯定期检验申报审核', '{"template":"TPL_ELEV_002","data":{"inspection_interval":400,"inspection_qualified":"是","report_complete":"是"}}', '不合规', 96, '距上次检验400天，超过1年定期检验周期', 'INSPECTION_OVERDUE', '不合规', 3, '2026-07-04 11:00:00'),
  (4, '电梯故障报修判别', '{"template":"TPL_ELEV_003","data":{"fault_type":"门机故障","fault_severity":"一般","response_time":6,"rescue_time":45}}', '不合规', 94, '应急救援时间45分钟，超过30分钟要求', 'RESCUE_TIMEOUT', '待人工', 3, '2026-07-04 14:20:00'),
  (5, '电梯安全部件巡检', '{"template":"TPL_ELEV_004","data":{"brake_parts_count":2,"emergency_brake_test":"通过","electrical_safety_test":"通过"}}', '合规', 91, '所有安全部件测试通过', '', '合规', 3, '2026-07-04 15:30:00'),
  (6, '电梯维保合规性判别', '{"template":"TPL_ELEV_001","data":{"wire_rope_wear_rate":6.0,"maintenance_interval":10,"brake_status":"正常","door_status":"正常","governor_calibrated":"是"}}', '需关注', 78, '钢丝绳磨损率6.0%，接近7%阈值', 'WEAR_WARN', '待人工', 3, '2026-07-04 16:45:00');

-- 7. 审核任务
INSERT OR IGNORE INTO audit_tasks (id, record_id, status, assigned_to, priority, created_at) VALUES
  (1, 1, 'pending', 2, 'high', '2026-07-04 09:30:00'),
  (2, 3, 'pending', 2, 'high', '2026-07-04 11:00:00'),
  (3, 4, 'pending', 2, 'normal', '2026-07-04 14:20:00'),
  (4, 6, 'pending', NULL, 'normal', '2026-07-04 16:45:00');

-- 8. 哈希链初始化（首块）字段: block_index, table_name, record_id, description, timestamp, prev_hash, hash, operator
INSERT OR IGNORE INTO hash_chain (id, block_index, table_name, record_id, description, timestamp, prev_hash, hash, operator) VALUES
  (1, 1, 'system', 0, '系统初始化-种子数据导入', '2026-07-05 01:30:00', '0000000000000000000000000000000000000000000000000000000000000000', 'genesis_seed_block_000000000000000000000000000000000000000000000000000', 'system');
