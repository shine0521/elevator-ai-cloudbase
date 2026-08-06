/**
 * 演示数据扩展生成器
 * 在 seed.js 基础上注入大量真实场景数据，保持哈希链完整
 * 运行：node seed-demo-data.js
 */
const path = require('path');
const Database = require('better-sqlite3');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data.db');
const SALT = 'special-equipment-salt';

function hashPassword(p){ return crypto.createHash('sha256').update(p + SALT).digest('hex'); }
function coerce(v){ return v === undefined || v === null ? '' : String(v); }
function sev(m){ return m==='high'?'mandatory':m==='mid'?'recommended':m==='low'?'optional':m; }
function fresult(r){ return r==='compliant'?'合规':r==='needs_review'?'待人工':'不合规'; }
function pad(n,w){ return String(n).padStart(w,'0'); }
function rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randInt(a,b){ return a + Math.floor(Math.random()*(b-a+1)); }
function pick(arr, n){ const c=[...arr]; const r=[]; for(let i=0;i<n&&c.length;i++) r.push(c.splice(Math.floor(Math.random()*c.length),1)[0]); return r; }
function isoMinus(daysAgo, hour=10, min=0){
  const d = new Date('2026-07-12T03:00:00+08:00');
  d.setDate(d.getDate()-daysAgo);
  d.setHours(hour, min, Math.floor(Math.random()*60), 0);
  return d.toISOString().replace('T',' ').replace(/\..+/,'');
}
function fmtTs(d){ return d.toISOString().replace('T',' ').replace(/\..+/,''); }

// ============= 0. 幂等守卫 =============
function generateDemoData(db){
const uCount = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
if (uCount > 3) {
  console.log('⚠️ 检测到已扩展过（users='+uCount+'），跳过以防重复。');
  return;
}
console.log('▶ 开始扩展演示数据...');

// ============= 1. USERS (12 个) =============
console.log('  [1/8] 用户表...');
const existingUsers = db.prepare('SELECT id FROM users').all().map(r=>r.id);
const newUsers = [
  // existing 3: admin, auditor, user (id 1,2,3)
  { email:'super@demo.com',    name:'赵总',   role:'admin',   dept:'集团总部',      phone:'13900000001' },
  { email:'audit_lead@demo.com', name:'孙审', role:'auditor', dept:'审核中心',      phone:'13900000002' },
  { email:'audit_li@demo.com',  name:'李审',  role:'auditor', dept:'审核中心',      phone:'13900000003' },
  { email:'op_wangjf@demo.com', name:'王江峰', role:'user',  dept:'万科物业·设备部', phone:'13900000011' },
  { email:'op_zhangle@demo.com',name:'张乐',  role:'user',   dept:'龙湖物业·工程部', phone:'13900000012' },
  { email:'op_lvcheng@demo.com',name:'吕诚',  role:'user',   dept:'绿城物业·运营部', phone:'13900000013' },
  { email:'op_chenmin@demo.com',name:'陈敏',  role:'user',   dept:'碧桂园物业·客服部', phone:'13900000014' },
  { email:'op_zhaoyu@demo.com', name:'赵宇',  role:'user',   dept:'招商物业·安全部', phone:'13900000015' },
  { email:'op_liuhe@demo.com',  name:'刘赫',  role:'user',   dept:'中海物业·维保部', phone:'13900000016' }
];
const insUser = db.prepare(`INSERT INTO users (email,password_hash,name,role,phone,department,login_count,status,created_at,updated_at,last_login) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const userIds = { admin:1, auditor:2, user:3 };
newUsers.forEach((u,i) => {
  const loginCount = randInt(5, 80);
  const last = isoMinus(randInt(0,3), randInt(8,20));
  const res = insUser.run(u.email, hashPassword('123456'), u.name, u.role, u.phone, u.dept, loginCount, 'active', isoMinus(60+i), isoMinus(0,10), last);
  userIds[u.email] = res.lastInsertRowid;
});
console.log('    +'+newUsers.length+' 用户, 总计 ' + db.prepare('SELECT COUNT(*) as n FROM users').get().n);

// ============= 2. REGULATIONS (7 个) + CLAUSES (80) =============
console.log('  [2/8] 法规表 + 条款...');
const newRegs = [
  { code:'GB_T10060_2011', name:'电梯安装验收规范', source:'GB', level:'推荐性国标', doc:'GB/T 10060-2011', issuer:'国家质检总局', effective:'2011-12-01', cat:'安装验收',
    clauses:[
      {n:'4.1',t:'机房环境',c:'机房应当通风良好，温度保持在5~40°C，配备应急照明和消防器材。',sev:'mid',cat:'环境'},
      {n:'4.3',t:'控制柜安装',c:'控制柜安装应牢固、垂直，接地可靠，接地电阻不大于4Ω。',sev:'high',cat:'安装'},
      {n:'4.5',t:'曳引机安装',c:'曳引机安装应符合技术文件要求，承重梁两端应搁置在建筑结构上。',sev:'high',cat:'安装'},
      {n:'5.2',t:'导轨安装',c:'导轨安装应牢固、垂直，导轨接头处不应有连续缝隙。',sev:'high',cat:'安装'},
      {n:'5.4',t:'限速器',c:'限速器动作速度应符合铭牌要求，钢丝绳应张紧。',sev:'high',cat:'安全装置'},
      {n:'5.6',t:'缓冲器',c:'缓冲器安装应牢固，液压缓冲器油位应正常。',sev:'mid',cat:'安全装置'},
      {n:'6.3',t:'层门系统',c:'层门门锁电气安全装置应有效，门扇间隙应符合要求。',sev:'high',cat:'层门'},
      {n:'6.5',t:'运行试验',c:'电梯应进行空载、满载、超载运行试验，各项功能应正常。',sev:'mid',cat:'试验'}
    ]},
  { code:'GB_16899_2011', name:'自动扶梯和自动人行道安全规范', source:'GB', level:'强制性国标', doc:'GB 16899-2011', issuer:'国家质检总局', effective:'2012-08-01', cat:'自动扶梯',
    clauses:[
      {n:'5.2',t:'梯级踏板',c:'梯级或踏板应保持完整，无破损、变形。',sev:'high',cat:'梯级'},
      {n:'5.4',t:'扶手带',c:'扶手带应完好，张紧度应适当，运行速度应与梯级同步。',sev:'mid',cat:'扶手'},
      {n:'5.6',t:'梳齿板',c:'梳齿板梳齿应完好，与梯级齿槽啮合深度应不小于6mm。',sev:'high',cat:'梳齿'},
      {n:'5.8',t:'围裙板',c:'围裙板与梯级之间的间隙应不大于4mm。',sev:'high',cat:'围裙'},
      {n:'6.1',t:'紧急停止',c:'紧急停止按钮应设置在出入口附近明显位置。',sev:'high',cat:'急停'},
      {n:'6.3',t:'扶手带入口',c:'扶手带入口应设置防夹装置或警示标识。',sev:'mid',cat:'入口'},
      {n:'7.2',t:'超速保护',c:'超速保护装置和非操纵逆转保护装置应有效。',sev:'high',cat:'保护'},
      {n:'7.4',t:'检修控制',c:'检修控制装置应能在紧急情况下停止自动扶梯。',sev:'mid',cat:'检修'}
    ]},
  { code:'TSG_08_2017', name:'特种设备使用管理规则', source:'TSG', level:'部门规章', doc:'TSG 08-2017', issuer:'国家质检总局', effective:'2017-07-01', cat:'通用管理',
    clauses:[
      {n:'2.1',t:'使用登记',c:'特种设备在投入使用前或者投入使用后30日内，使用单位应当办理使用登记。',sev:'high',cat:'登记'},
      {n:'2.3',t:'安全管理人员',c:'使用单位应当设置特种设备安全管理机构或者配备专职、兼职安全管理人员。',sev:'high',cat:'人员'},
      {n:'3.2',t:'操作规程',c:'使用单位应当制定操作规程，并张贴在操作位置附近。',sev:'mid',cat:'规程'},
      {n:'3.4',t:'应急预案',c:'使用单位应当制定特种设备事故应急预案，并定期演练。',sev:'high',cat:'应急'},
      {n:'4.1',t:'日常检查',c:'使用单位应当对在用特种设备进行日常检查，发现异常及时处理。',sev:'mid',cat:'检查'},
      {n:'4.3',t:'维护保养',c:'使用单位应当按照安全技术规范的要求，在检验合格有效期届满前一个月向检验机构提出定期检验申请。',sev:'high',cat:'维保'},
      {n:'5.2',t:'隐患排查',c:'使用单位应当建立隐患排查治理制度，定期开展隐患排查。',sev:'mid',cat:'隐患'},
      {n:'5.4',t:'记录保存',c:'特种设备运行记录、故障记录等应当保存至设备报废。',sev:'low',cat:'档案'}
    ]}
];

const insReg = db.prepare(`INSERT INTO regulations (code,name,source,effective_date,category,status,view_count,created_by,created_at,updated_at,level,device_type,doc_no,issuer) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insClause = db.prepare(`INSERT INTO regulation_clauses (regulation_id,clause_number,title,content,category,severity,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?)`);
newRegs.forEach((r,i) => {
  const t = isoMinus(80-i*3);
  const res = insReg.run(r.code, r.name, r.source, r.effective, r.cat, 'active', randInt(100,1500), 'system', t, t, r.level, '电梯/自动扶梯', r.doc, r.issuer);
  const rid = res.lastInsertRowid;
  r.clauses.forEach((cl,j) => insClause.run(rid, cl.n, cl.t, cl.c, cl.cat, sev(cl.sev), j+1, t));
});
console.log('    +'+newRegs.length+' 法规, +'+(newRegs.reduce((s,r)=>s+r.clauses.length,0))+' 条款, 总计法规 ' + db.prepare('SELECT COUNT(*) as n FROM regulations').get().n + ' 条款 ' + db.prepare('SELECT COUNT(*) as n FROM regulation_clauses').get().n);

// ============= 3. TEMPLATES (4 个新增 → 9 个) =============
console.log('  [3/8] 模板表 + 字段 + 规则...');
const newTemplates = [
  { code:'TPL_ELEV_MAINT_002', name:'电梯半年维护保养', cat:'维护保养', desc:'按 TSG T7001 与厂家手册执行的半年期专项维护保养', color:'#0ea5e9', icon:'Wrench',
    fields:[
      {n:'device_code',l:'设备编号',t:'text',r:true,ph:'例如 EV-2018-0058'},
      {n:'device_type',l:'设备类型',t:'select',r:true,o:'客梯|货梯|医梯|观光梯|自动扶梯',d:'客梯'},
      {n:'location',l:'使用地点',t:'text',r:true,ph:'如 XX 大厦 1 号楼'},
      {n:'maint_date',l:'维保日期',t:'date',r:true},
      {n:'maint_company',l:'维保单位',t:'text',r:true,ph:'如 XX 电梯工程有限公司'},
      {n:'maint_person',l:'维保人员',t:'text',r:true},
      {n:'maint_person_cert',l:'维保人员证号',t:'text',r:true,ph:'TSY-XXXX-XXXX'},
      {n:'items_brake',l:'制动器检查',t:'select',r:true,o:'合格|不合格|待整改',d:'合格'},
      {n:'items_traction',l:'曳引机及钢丝绳',t:'select',r:true,o:'合格|不合格|待整改',d:'合格'},
      {n:'items_door',l:'门系统',t:'select',r:true,o:'合格|不合格|待整改',d:'合格'},
      {n:'items_safety',l:'安全保护装置',t:'select',r:true,o:'合格|不合格|待整改',d:'合格'},
      {n:'conclusion',l:'保养结论',t:'select',r:true,o:'合格|不合格|部分合格',d:'合格'}
    ],
    rules:[
      {name:'维保人员资质',type:'EXISTS',config:{field:'maint_person_cert',pattern:'TSY-',passResult:'合规',failResult:'不合规'},clause:'TSG T7001-2023 4.3',sev:'high',pri:1},
      {name:'安全保护装置必检',type:'EXISTS',config:{field:'items_safety',values:['合格','待整改'],passResult:'合规',failResult:'待人工'},clause:'TSG T7001-2023 5.2',sev:'high',pri:2},
      {name:'制动器状态判定',type:'COMPARE',config:{field:'items_brake',operator:'==',threshold:'不合格',passResult:'不合规',failResult:'合规'},clause:'TSG T7001-2023 4.5',sev:'high',pri:3},
      {name:'全部合格',type:'COMBINE',config:{logic:'AND',rules:[{field:'items_brake',operator:'==',threshold:'合格'},{field:'items_traction',operator:'==',threshold:'合格'},{field:'items_door',operator:'==',threshold:'合格'},{field:'items_safety',operator:'==',threshold:'合格'}],passResult:'合规',failResult:'待人工'},clause:'TSG T7001-2023 7.1',sev:'low',pri:9}
    ]
  },
  { code:'TPL_ELEV_MOD_001', name:'电梯改造评估申请', cat:'改造修理', desc:'电梯重大改造前的合规性评估申请', color:'#f59e0b', icon:'Hammer',
    fields:[
      {n:'device_code',l:'设备编号',t:'text',r:true,ph:'EV-XXXX-XXXX'},
      {n:'use_unit',l:'使用单位',t:'text',r:true},
      {n:'mod_type',l:'改造类型',t:'select',r:true,o:'控制系统升级|曳引机更换|门系统改造|信号系统改造|其他'},
      {n:'mod_reason',l:'改造原因',t:'textarea',r:true},
      {n:'mod_company',l:'改造施工单位',t:'text',r:true},
      {n:'mod_company_license',l:'施工单位许可证号',t:'text',r:true,ph:'TS-XXXX-XXXX'},
      {n:'est_cost',l:'预算费用（万元）',t:'number',r:true},
      {n:'expected_days',l:'预计停梯天数',t:'number',r:true},
      {n:'passenger_impact',l:'乘客影响方案',t:'textarea',r:false},
      {n:'safety_assess',l:'安全评估意见',t:'textarea',r:true}
    ],
    rules:[
      {name:'施工单位资质',type:'EXISTS',config:{field:'mod_company_license',pattern:'TS-',passResult:'合规',failResult:'不合规'},clause:'TSG T5002-2017 2.1',sev:'high',pri:1},
      {name:'预算合理性',type:'RANGE',config:{field:'est_cost',min:1,max:500,passResult:'合规',failResult:'不合规'},clause:'TSG T5002-2017 4.1',sev:'mid',pri:2},
      {name:'停梯时长',type:'RANGE',config:{field:'expected_days',min:1,max:60,passResult:'合规',failResult:'待人工'},clause:'TSG T5002-2017 3.4',sev:'mid',pri:3},
      {name:'安全评估必填',type:'EXISTS',config:{field:'safety_assess',minLength:30,passResult:'合规',failResult:'待人工'},clause:'TSG T5002-2017 4.2',sev:'high',pri:4}
    ]
  },
  { code:'TPL_ELEV_DRILL_001', name:'电梯应急演练记录', cat:'应急管理', desc:'电梯困人、火灾、地震等应急演练记录', color:'#ef4444', icon:'AlertTriangle',
    fields:[
      {n:'drill_type',l:'演练类型',t:'select',r:true,o:'电梯困人|火灾应急|地震应急|水浸应急|停电应急'},
      {n:'drill_date',l:'演练日期',t:'date',r:true},
      {n:'location',l:'演练地点',t:'text',r:true},
      {n:'participants',l:'参与人数',t:'number',r:true},
      {n:'response_time',l:'响应时间（分钟）',t:'number',r:true},
      {n:'release_time',l:'解救时间（分钟）',t:'number',r:true},
      {n:'commander',l:'现场指挥',t:'text',r:true},
      {n:'drill_result',l:'演练结果',t:'select',r:true,o:'优秀|良好|合格|不合格'},
      {n:'problems',l:'存在问题',t:'textarea',r:false},
      {n:'improvement',l:'改进措施',t:'textarea',r:false}
    ],
    rules:[
      {name:'响应时间合规',type:'RANGE',config:{field:'response_time',min:0,max:30,passResult:'合规',failResult:'不合规'},clause:'TSG 08-2017 3.4',sev:'high',pri:1},
      {name:'解救时间合规',type:'RANGE',config:{field:'release_time',min:0,max:60,passResult:'合规',failResult:'不合规'},clause:'TSG 08-2017 3.4',sev:'high',pri:2},
      {name:'演练结果必填',type:'EXISTS',config:{field:'drill_result',passResult:'合规',failResult:'待人工'},clause:'TSG 08-2017 3.4',sev:'mid',pri:3}
    ]
  },
  { code:'TPL_ELEV_SCRAP_001', name:'电梯报废评估申请', cat:'报废处置', desc:'达到设计使用年限或安全性能下降的电梯报废评估', color:'#6b7280', icon:'Trash2',
    fields:[
      {n:'device_code',l:'设备编号',t:'text',r:true},
      {n:'use_unit',l:'使用单位',t:'text',r:true},
      {n:'mfg_date',l:'制造日期',t:'date',r:true},
      {n:'commission_date',l:'投入使用日期',t:'date',r:true},
      {n:'service_years',l:'已使用年限',t:'number',r:true},
      {n:'scrap_reason',l:'报废原因',t:'select',r:true,o:'达到设计使用年限|严重事故|主要部件失效|能耗过高|其他'},
      {n:'last_inspection',l:'上次检验日期',t:'date',r:true},
      {n:'last_inspection_result',l:'上次检验结论',t:'select',r:true,o:'合格|复检合格|不合格'},
      {n:'residual_value',l:'评估残值（万元）',t:'number',r:false},
      {n:'scrap_remark',l:'报废说明',t:'textarea',r:true}
    ],
    rules:[
      {name:'使用年限校验',type:'RANGE',config:{field:'service_years',min:0,max:30,passResult:'合规',failResult:'待人工'},clause:'TSG 08-2017 4.3',sev:'mid',pri:1},
      {name:'检验结论必填',type:'EXISTS',config:{field:'last_inspection_result',values:['合格','复检合格','不合格'],passResult:'合规',failResult:'待人工'},clause:'TSG 08-2017 4.3',sev:'high',pri:2},
      {name:'报废说明完整',type:'EXISTS',config:{field:'scrap_remark',minLength:20,passResult:'合规',failResult:'待人工'},clause:'TSG 08-2017 5.4',sev:'mid',pri:3}
    ]
  }
];
const insTpl = db.prepare(`INSERT INTO templates (code,name,category,version,description,regulation_ids,status,created_by,usage_count,tags,icon,color,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insField = db.prepare(`INSERT INTO template_fields (template_id,field_name,field_label,field_type,required,sort_order,options,default_value,placeholder,validation_rule,help_text,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
const insRule = db.prepare(`INSERT INTO template_rules (template_id,rule_name,rule_type,rule_config,clause_ref,description,severity,priority,enabled,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
newTemplates.forEach((tp,i) => {
  const t = isoMinus(30-i*2);
  const res = insTpl.run(tp.code, tp.name, tp.cat, 1, tp.desc, '[]', 'published', 'system', randInt(20,200), tp.cat, tp.icon, tp.color, t, t);
  const tid = res.lastInsertRowid;
  tp.fields.forEach((f,j) => insField.run(tid, f.n, f.l, f.t, f.r?1:0, j+1, f.o||null, f.d||null, f.ph||null, null, null, t));
  tp.rules.forEach((r,j) => insRule.run(tid, r.name, r.type, JSON.stringify(r.config), r.clause, r.name, sev(r.sev), r.pri, 1, 'system', t, t));
});
console.log('    +'+newTemplates.length+' 模板, +'+(newTemplates.reduce((s,tp)=>s+tp.fields.length+tp.rules.length,0))+' 字段+规则, 总计模板 ' + db.prepare('SELECT COUNT(*) as n FROM templates').get().n);

// ============= 4. RESEARCH TASKS =============
console.log('  [4/8] 模板研究任务 + AI 建议...');
const newResearch = [
  { name:'自动扶梯月度巡检模板', desc:'面向商超、地铁站场景的自动扶梯月度快速巡检', expert:'super@demo.com', std:'GB 16899-2011',
    status:'expert_review', suggestions:[
      {model:'qwen2.5:0.5b', json:{template_name:'自动扶梯月度巡检', template_code:'TPL_ESCAL_MONTH_001', fields:[{n:'device_code',l:'设备编号',t:'text'},{n:'drift_date',l:'巡检日期',t:'date'},{n:'comb_plate',l:'梳齿板',t:'select'},{n:'handrail',l:'扶手带',t:'select'},{n:'step_chain',l:'梯级链',t:'select'}], rules:[{name:'梳齿必检',type:'EXISTS'}], output_template:'巡检日期：{{drift_date}} 设备：{{device_code}} 梳齿板：{{comb_plate}} 扶手带：{{handrail}}'}}
    ]
  },
  { name:'载货电梯专项检查', desc:'针对工厂、仓库载货电梯的专项年度检查', expert:'audit_lead@demo.com', std:'TSG T7001-2023',
    status:'ai_generated', suggestions:[
      {model:'qwen2.5:0.5b', json:{template_name:'载货电梯专项检查', template_code:'TPL_FREIGHT_001', fields:[{n:'load_weight',l:'额定载重',t:'number'},{n:'brake_test',l:'制动试验',t:'select'}], rules:[{name:'制动必测',type:'EXISTS'}], output_template:'载重：{{load_weight}} 制动：{{brake_test}}'}}
    ]
  },
  { name:'电梯能耗监测', desc:'统计电梯能耗与碳排放的合规判别模板', expert:'super@demo.com', std:'TSG 08-2017',
    status:'published', suggestions:[
      {model:'qwen2.5:0.5b', json:{template_name:'电梯能耗监测', template_code:'TPL_ELEV_ENERGY_001', fields:[{n:'month_kwh',l:'月耗电',t:'number'}], rules:[], output_template:'月耗电：{{month_kwh}}kWh'}}
    ]
  },
  { name:'老旧电梯风险评估', desc:'使用 15 年以上老旧电梯的风险等级评估', expert:'audit_li@demo.com', std:'GB 7588-2020',
    status:'expert_review', suggestions:[
      {model:'qwen2.5:0.5b', json:{template_name:'老旧电梯风险评估', template_code:'TPL_OLD_ELEV_001', fields:[{n:'service_year',l:'使用年限',t:'number'},{n:'risk_level',l:'风险等级',t:'select'}], rules:[{name:'年限校验',type:'RANGE'}], output_template:'使用{{service_year}}年，风险等级{{risk_level}}'}}
    ]
  }
];
const insRT = db.prepare(`INSERT INTO template_research_task (task_name,task_description,expert_id,expert_name,standards,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`);
const insSug = db.prepare(`INSERT INTO template_ai_suggestion (task_id,input_prompt,ai_output_json,model_name,tokens_used,status,created_at) VALUES (?,?,?,?,?,?,?)`);
newResearch.forEach((r,i) => {
  const t = isoMinus(randInt(5,25));
  const res = insRT.run(r.name, r.desc, userIds[r.expert]||1, r.expert, r.std, r.status, 'system', t, t);
  const tid = res.lastInsertRowid;
  r.suggestions.forEach(s => {
    insSug.run(tid, '基于'+r.std+'生成本'+r.name+'模板', JSON.stringify(s.json), s.model, randInt(200,800), 'pending', t);
  });
});
console.log('    +'+newResearch.length+' 研究任务, +'+newResearch.reduce((s,r)=>s+r.suggestions.length,0)+' AI 建议');

// ============= 5. DISCRIMINATION RECORDS (~280) =============
console.log('  [5/8] 判别记录（~280 条）...');
const allTemplates = db.prepare('SELECT id, code, name FROM templates').all();
const allSubmitters = db.prepare(`SELECT email, name FROM users WHERE role='user' AND status='active'`).all();
const allAuditors = db.prepare(`SELECT email, name FROM users WHERE role IN ('auditor','admin') AND status='active'`).all();

const scenarios = {
  'TPL_ELEV_REG_001':[
    {txt:'本次申请办理 XX 商业中心 1 号楼乘客电梯的使用登记。该电梯为蒂森克虏伯品牌，型号 TIGRA-2，2024 年 6 月出厂，2024 年 8 月安装完成，2024 年 9 月投入使用。设备编号 EV-2024-0088，额定载重 1000kg，速度 1.75m/s，10 层 10 站。使用单位为 XX 物业管理有限公司。已取得制造许可证、安装改造修理许可证、产品合格证、监督检验证书。', result:'compliant', w:60},
    {txt:'办理 XX 花园小区 3 号楼电梯使用登记，设备编号 EV-2018-0125，奥的斯品牌 GeN2，2018 年 5 月出厂。使用单位 XX 物业，营业执照号 91310000XXXXXXXX。', result:'compliant', w:30},
    {txt:'使用单位 XX 公司，电梯制造日期 2020 年 3 月，安装日期 2020 年 8 月。本次登记缺少监督检验证书，制造许可证编号格式不符。', result:'non_compliant', w:8},
    {txt:'电梯首次使用登记。设备已使用 3 年，但产品合格证遗失，待补充。', result:'needs_review', w:12}
  ],
  'TPL_ELEV_MAINT_001':[
    {txt:'设备 EV-2019-0042 半月维保记录。维保日期 2026-07-08，维保人员李建国（TSY-3301-0042），维保单位 XX 电梯工程公司。检查项目：制动器合格、曳引钢丝绳合格、门系统正常、安全保护装置有效。结论：合格。', result:'compliant', w:50},
    {txt:'半月维保：制动器间隙超标（0.8mm），已要求整改。', result:'non_compliant', w:5},
    {txt:'维保人员证件即将到期，请关注。', result:'needs_review', w:8}
  ],
  'TPL_ELEV_INSP_001':[
    {txt:'设备 EV-2020-0078 定期检验申请。本次为年度检验，上次检验日期 2025-08-15，结论合格。本次检验由 XX 检验中心承担，检验人员王志强（检验师证号 TJY-2018-0234）。检验项目齐全：机房、井道、层门、底坑、整机运行。', result:'compliant', w:40},
    {txt:'定期检验发现限速器动作速度超标，需复检。', result:'needs_review', w:10}
  ],
  'TPL_ELEV_FAULT_001':[
    {txt:'设备 EV-2019-0156 发生故障：3 楼层门不能正常关闭，门机控制器报警 E23，初步判断门光幕故障，已临时停梯等待维修。', result:'needs_review', w:25},
    {txt:'电梯困人 2 人，救援人员 8 分钟内到达，15 分钟内解救完成，无人员伤亡。', result:'compliant', w:15},
    {txt:'电梯冲顶事故，已上报，待调查。', result:'non_compliant', w:3}
  ],
  'TPL_ELEV_SAFE_001':[
    {txt:'安全部件月度检查：限速器、缓冲器、安全钳、门锁、限速器钢丝绳，全部正常。', result:'compliant', w:30},
    {txt:'限速器钢丝绳有断股情况，已停梯。', result:'non_compliant', w:4}
  ],
  'TPL_ELEV_MAINT_002':[
    {txt:'半年维保：设备 EV-2018-0091，维保人员陈敏（TSY-3302-0117），维保单位 XX 工程公司。检查项目全部合格。', result:'compliant', w:25}
  ],
  'TPL_ELEV_MOD_001':[
    {txt:'申请对设备 EV-2017-0023 进行控制系统升级改造，改造单位 XX 电梯工程公司（许可证号 TS-3101-2018-0023），预算 35 万元，预计停梯 15 天。', result:'compliant', w:15},
    {txt:'改造预算 800 万元，需重新评估。', result:'non_compliant', w:2}
  ],
  'TPL_ELEV_DRILL_001':[
    {txt:'电梯困人应急演练，地点 XX 大厦，参与 12 人，响应 5 分钟，解救 18 分钟，结果良好。', result:'compliant', w:20}
  ],
  'TPL_ELEV_SCRAP_001':[
    {txt:'设备 EV-2008-0012 已使用 18 年，达到设计使用年限，申请报废。上次检验日期 2025-12-10，结论不合格。', result:'compliant', w:12}
  ]
};

const insRec = db.prepare(`INSERT INTO discrimination_records
  (template_id,template_name,input_text,form_data,ai_classification,rule_results,final_result,conclusion,clause_ref,user_email,user_name,audit_status,created_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

// 按权重展开场景池
function expandScenarios(){
  const pool = [];
  for (const [tcode, scs] of Object.entries(scenarios)) {
    const tpl = allTemplates.find(t => t.code === tcode);
    if (!tpl) continue;
    scs.forEach(sc => { for (let i=0; i<sc.w; i++) pool.push({tpl, scenario: sc}); });
  }
  return pool;
}
const scPool = expandScenarios();

const target = 280;
let recCount = 0;
const createdRecIds = [];
for (let i=0; i<target; i++) {
  const pick = scPool[Math.floor(Math.random()*scPool.length)];
  const submitter = allSubmitters[Math.floor(Math.random()*allSubmitters.length)];
  const daysAgo = Math.floor(Math.random() * 30);
  const hour = 8 + Math.floor(Math.random()*10);
  const min = Math.floor(Math.random()*60);
  const created = isoMinus(daysAgo, hour, min);

  const formData = JSON.stringify({scenario_template: pick.tpl.code, generated_at: created});
  const aiCls = JSON.stringify({method:'rule_engine', template_match: pick.tpl.code, confidence: 0.7 + Math.random()*0.3});
  const ruleResults = JSON.stringify({matched: 1+Math.floor(Math.random()*3), total: pick.tpl.code.includes('MINT')?5:3, severity: pick.scenario.result==='non_compliant'?'high':'low'});
  let conclusion = '';
  if (pick.scenario.result === 'compliant') conclusion = '符合规范要求。';
  else if (pick.scenario.result === 'needs_review') conclusion = '需转人工审核进一步判定。';
  else conclusion = '存在合规问题，请补充材料或整改。';

  const auditStatus = pick.scenario.result === 'needs_review' ? 'pending' : (Math.random() < 0.3 ? 'pending' : 'approved');

  const res = insRec.run(
    pick.tpl.id, pick.tpl.name, pick.scenario.txt, formData, aiCls, ruleResults,
    fresult(pick.scenario.result), conclusion, 'TSG系列相关条款', submitter.email, submitter.name,
    auditStatus, created
  );
  createdRecIds.push({id: res.lastInsertRowid, result: pick.scenario.result, created, templateId: pick.tpl.id, submitter: submitter.email});
  recCount++;
}
console.log('    +'+recCount+' 判别记录, 总计 ' + db.prepare('SELECT COUNT(*) as n FROM discrimination_records').get().n);

// ============= 6. AUDIT TASKS (~65) =============
console.log('  [6/8] 审核任务（~65 条）...');
const needsReviewRecs = createdRecIds.filter(r => r.result === 'needs_review' || r.result === 'non_compliant');
const insAT = db.prepare(`INSERT INTO audit_tasks
  (record_id,task_type,priority,status,assigned_to,assigned_at,started_at,completed_at,comment,created_by,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);

let atCount = 0;
needsReviewRecs.forEach((rec, i) => {
  const auditor = allAuditors[Math.floor(Math.random()*allAuditors.length)];
  const status = Math.random() < 0.7 ? (Math.random() < 0.85 ? 'approved' : 'rejected') : 'pending';
  const assignedAt = rec.created;
  // 在记录创建之后、今天之前随机生成处理时间
  const createdDaysAgo = daysBetween(rec.created);
  const procOffset = randInt(0, Math.min(createdDaysAgo, 4));
  const startedAt = status !== 'pending' ? isoMinus(Math.max(0, createdDaysAgo - procOffset), 11, randInt(0,59)) : null;
  const completedAt = status !== 'pending' ? isoMinus(Math.max(0, createdDaysAgo - procOffset - 1), 15, randInt(0,59)) : null;
  const priority = rec.result === 'non_compliant' ? 'high' : (Math.random() < 0.3 ? 'high' : 'normal');
  const comment = status === 'approved' ? '经人工复核，符合规范要求。' :
                  status === 'rejected' ? '材料不完整或与规范不符，退回补充。' : '';
  insAT.run(rec.id, 'discrimination', priority, status, auditor.email, assignedAt, startedAt, completedAt, comment, 'system', rec.created, completedAt || rec.created);
  atCount++;
});
console.log('    +'+atCount+' 审核任务, 总计 ' + db.prepare('SELECT COUNT(*) as n FROM audit_tasks').get().n);

function daysBetween(ts){
  const a = new Date('2026-07-12T03:00:00+08:00') - new Date(ts.replace(' ','T')+'+08:00');
  return Math.floor(a / 86400000);
}

// ============= 7. OPERATION LOGS (~700 + 完整哈希链) =============
console.log('  [7/8] 操作日志（~700 条 + 哈希链）...');
// 拿最后一条日志的 hash 作起点
const lastLog = db.prepare('SELECT hash FROM operation_logs ORDER BY id DESC LIMIT 1').get();
let prevHash = lastLog ? lastLog.hash : '0'.repeat(64);
const actions = ['login','logout','view_dashboard','view_history','view_template','view_knowledge','create_record','submit_record','view_audit','audit_approve','audit_reject','verify_chain','worm_seal','export_log','update_settings','crawler_trigger'];
let logCount = 0;
const insLog = db.prepare(`INSERT INTO operation_logs
  (action,user_email,user_name,target_type,target_id,detail,ip_address,user_agent,request_id,prev_hash,hash,timestamp)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
const allUsersForLog = db.prepare(`SELECT email,name,role FROM users WHERE status='active'`).all();

const targetLogs = 700;
for (let i=0; i<targetLogs; i++) {
  const u = allUsersForLog[Math.floor(Math.random()*allUsersForLog.length)];
  const action = actions[Math.floor(Math.random()*actions.length)];
  const targetType = action.startsWith('view_') ? 'page' : (action.includes('record') ? 'record' : (action.includes('audit') ? 'audit' : (action.includes('chain')||action.includes('worm') ? 'log' : 'system')));
  const targetId = targetType === 'record' ? (Math.floor(Math.random()*createdRecIds.length)+1) : null;
  const ip = `192.168.${randInt(1,254)}.${randInt(1,254)}`;
  const ua = rand(['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0','Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148','PostmanRuntime/7.36.0','curl/8.4.0']);
  const reqId = crypto.randomBytes(8).toString('hex');
  const detail = action==='login' ? JSON.stringify({ip, ua_short: ua.slice(0,30)}) : (action.startsWith('view_') ? JSON.stringify({page: action}) : JSON.stringify({auto: true}));
  const ts = isoMinus(randInt(0,30), randInt(0,23), randInt(0,59));

  // 必须与 hash-chain.js 中 logOperation 的 payload 完全一致（驼峰键，无 ip/ua/reqId）
  const payload = JSON.stringify({
    action: String(action),
    userEmail: String(u.email),
    targetType: targetType == null ? '' : String(targetType),
    targetId: targetId == null ? '' : String(targetId),
    detail: detail == null ? '' : String(detail),
    prevHash: prevHash,
    timestamp: ts
  });
  const hash = crypto.createHash('sha256').update(payload).digest('hex');
  insLog.run(action, u.email, u.name, targetType, targetId, detail, ip, ua, reqId, prevHash, hash, ts);
  prevHash = hash;
  logCount++;
}
console.log('    +'+logCount+' 操作日志, 总计 ' + db.prepare('SELECT COUNT(*) as n FROM operation_logs').get().n);

// ============= 8. WORM SEAL =============
console.log('  [8/8] WORM 封存记录...');
const insWorm = db.prepare(`INSERT INTO worm_storage_index
  (start_log_id,end_log_id,merkle_root,block_hash,seal_time,sealed_by,status,record_count,note)
  VALUES (?,?,?,?,?,?,?,?,?)`);
// 取日志分段，按 100 条一封存
const logsForSeal = db.prepare(`SELECT id, hash FROM operation_logs ORDER BY id ASC`).all();
function merkleRoot(hashes){
  if (!hashes.length) return '';
  let layer = hashes.slice();
  while (layer.length > 1) {
    const next = [];
    for (let i=0; i<layer.length; i+=2) {
      const l = layer[i], r = layer[i+1] || l;
      next.push(crypto.createHash('sha256').update(l+r).digest('hex'));
    }
    layer = next;
  }
  return layer[0];
}
const seals = [];
for (let s=0; s<logsForSeal.length; s+=120) {
  const seg = logsForSeal.slice(s, s+120);
  if (seg.length < 50) break;
  const mr = merkleRoot(seg.map(x=>x.hash));
  const bh = crypto.createHash('sha256').update(mr + seg[0].id + seg[seg.length-1].id).digest('hex');
  const sealTime = isoMinus(Math.floor((logsForSeal.length - s)/30), 18, 30);
  insWorm.run(seg[0].id, seg[seg.length-1].id, mr, bh, sealTime, 'system', 'sealed', seg.length, `封存第 ${seals.length+1} 段，共 ${seg.length} 条日志`);
  seals.push({start: seg[0].id, end: seg[seg.length-1].id, count: seg.length});
}
console.log('    +'+seals.length+' WORM 封存, 总计 ' + db.prepare('SELECT COUNT(*) as n FROM worm_storage_index').get().n);

console.log('\n✅ 演示数据扩展完成');
}

module.exports = { generateDemoData };

// 独立运行入口：node seed-demo-data.js
if (require.main === module) {
  const standaloneDb = new Database(DB_PATH);
  standaloneDb.pragma('journal_mode = WAL');
  standaloneDb.pragma('foreign_keys = ON');
  generateDemoData(standaloneDb);
  standaloneDb.close();
}
