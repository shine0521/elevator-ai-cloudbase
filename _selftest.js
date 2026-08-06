const BASE = 'http://localhost:3000';
const fs = require('fs');
const cookies = { admin: '/tmp/c_adm', auditor: '/tmp/c_aud', user: '/tmp/c_usr', none: null };
async function login(email, jar) {
  const r = await fetch(BASE + '/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password:'123456'}) });
  const setC = r.headers.get('set-cookie');
  if (jar && setC) fs.writeFileSync(jar, setC.split(';')[0]);
  return r.status;
}
function ck(role){ const j=cookies[role]; return j && fs.existsSync(j) ? fs.readFileSync(j,'utf8').trim() : ''; }
async function call(method, path, role, body, timeoutMs=15000) {
  const headers = { 'Content-Type':'application/json' };
  const c = ck(role); if (c) headers['Cookie'] = c;
  const opt = { method, headers };
  if (body !== undefined) opt.body = JSON.stringify(body);
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(BASE + path, { ...opt, signal: ctrl.signal });
    const txt = await r.text();
    let json=null; try{json=JSON.parse(txt)}catch(e){}
    return { status:r.status, json, txt: txt.slice(0,200), isJson:!!json };
  } catch(e){ return { status:'ERR:'+e.name, txt:e.message }; }
  finally { clearTimeout(t); }
}
const fails = [];
function rec(name, status, expect, extra='') {
  const ok = (Array.isArray(expect) ? expect.includes(status) : status===expect);
  if (!ok) fails.push({name, status, expect, extra});
  console.log((ok?'  ✅':'  ❌') + ` ${name} → ${status}${ok?'':' (期望 '+JSON.stringify(expect)+')'} ${extra}`);
}

(async () => {
  await login('admin@demo.com','/tmp/c_adm');
  await login('auditor@demo.com','/tmp/c_aud');
  await login('user@demo.com','/tmp/c_usr');

  console.log('\n=== 页面 (GET) — fetch 自动跟随 302，正常应 200 ===');
  const pages = [
    ['/login','none'],['/','admin'],['/dashboard','admin'],['/history','admin'],['/templates','admin'],
    ['/knowledge','admin'],['/audit','auditor'],['/audit','user',403],['/research','admin'],['/research','auditor',403],
    ['/logs','admin'],['/settings','admin'],['/discriminate','admin'],
    ['/mobile','admin'],['/mobile/discriminate','admin'],['/mobile/history','admin'],['/mobile/logs','admin'],['/mobile/settings','admin'],
  ];
  for (const p of pages) { const [path,role,exp=200]=p; const r=await call('GET',path,role); rec(`页面 ${path} [${role}]`, r.status, exp); }

  console.log('\n=== 基础 GET API ===');
  const gapi = [
    ['/api/health','none',200],['/api/user/me','admin',200],['/api/dashboard/stats','admin',200],
    ['/api/templates','admin',200],['/api/templates/1','admin',200],['/api/templates/9','admin',200],['/api/templates/999','admin',404],
    ['/api/templates/1/rules','admin',200],['/api/templates/1/fields','admin',200],['/api/templates/1/versions','admin',200],
    ['/api/regulations','admin',200],['/api/regulations/1/clauses','admin',200],['/api/clauses','admin',200],
    ['/api/discrimination-records','admin',200],['/api/discrimination-records/50','admin',200],['/api/discrimination-records/999','admin',404],
    ['/api/audit-tasks','auditor',200],['/api/operation-logs','admin',200],['/api/knowledge/stats','admin',200],
    ['/api/ai/status','admin',200],['/api/crawler/status','admin',200],['/api/crawler/status','auditor',403],
    ['/api/logs/worm-status','auditor',200],['/api/logs/verify-seal/6','auditor',200],['/api/logs/verify-seal/999','auditor',404],
    ['/api/template-research','admin',200],['/api/template-research/1','admin',200],['/api/template-research/1','auditor',403],
  ];
  for (const [p,role,exp] of gapi) { const r=await call('GET',p,role); rec(`GET ${p} [${role}]`, r.status, exp); if(r.status!==exp) fails[fails.length-1].extra=(r.json&&r.json.error)||r.txt; }

  console.log('\n=== 判别 / 规则引擎 API (POST) ===');
  let r = await call('POST','/api/discriminate','admin',{templateId:1,formData:{manufacturing_unit:'上海三菱',use_reg_cert:'梯31-沪A12345',elevator_model:'MAXIE',inspection_pass:'是',registration_date:'2026-05-10'}});
  rec('POST /api/discriminate 合法', r.status, 200); if(r.status===200) rec('  └ success', r.json.success, true);
  r = await call('POST','/api/discriminate','admin',{}); rec('POST /api/discriminate 缺参', r.status, 400);
  r = await call('POST','/api/discriminate','admin',{templateId:999,formData:{}}); rec('POST /api/discriminate 未知模板(应404非500)', r.status, [400,404]);
  r = await call('POST','/api/rule-engine/test','admin',{ruleData:{rule_type:'COMPARE',config:{field:'x',operator:'REGEX',threshold:'^A'}},testData:{x:'AB'}}); rec('POST /api/rule-engine/test', r.status, 200);
  r = await call('POST','/api/rule-engine/execute','admin',{formData:{a:1},templateId:1}); rec('POST /api/rule-engine/execute', r.status, 200);
  r = await call('POST','/api/rule-engine/generate-output','admin',{templateId:1,result:'合规',formData:{}}); rec('POST /api/rule-engine/generate-output', r.status, [200,400]);

  console.log('\n=== AI 模块 (POST, 长超时) ===');
  r = await call('POST','/api/ai/classify','admin',{text:'电梯未按规定进行定期检验'},30000); rec('POST /api/ai/classify', r.status, [200,400]);
  r = await call('POST','/api/ai/extract','admin',{text:'使用单位：测试公司，设备编号：DT-001'},30000); rec('POST /api/ai/extract', r.status, [200,400]);
  r = await call('POST','/api/ai/analyze','admin',{recordId:50},30000); rec('POST /api/ai/analyze', r.status, [200,400]);
  r = await call('POST','/api/ai/ask','admin',{question:'电梯安全注意事项'},30000); rec('POST /api/ai/ask', r.status, [200,400]);

  console.log('\n=== 模板 / 规则 CRUD（按真实契约字段名）===');
  let r_tpl = await call('POST','/api/templates','admin',{code:'SELFTEST_'+Date.now(),name:'自检临时模板',category:'TEST',description:'x',fields:[{field_name:'f1',field_label:'F1',field_type:'text',required:true}]});
  rec('POST /api/templates 创建', r_tpl.status, [200,201]);
  let newTplId = r_tpl.json && r_tpl.json.id;
  if (newTplId) {
    r = await call('PUT',`/api/templates/${newTplId}`,'admin',{name:'自检临时模板2'}); rec('PUT /api/templates/:id', r.status, [200,400]);
    r = await call('PATCH',`/api/templates/${newTplId}/status`,'admin',{status:'active'}); rec('PATCH templates/:id/status', r.status, [200,400]);
    r = await call('DELETE',`/api/templates/${newTplId}`,'admin'); rec('DELETE /api/templates/:id', r.status, [200,204,400]);
  }
  let r_rule = await call('POST','/api/templates/1/rules','admin',{ruleName:'自检规则',ruleType:'COMPARE',config:{field:'x',operator:'EQ',threshold:'1'},clauseRef:''});
  rec('POST /api/templates/1/rules 创建', r_rule.status, [200,201]);
  let newRuleId = r_rule.json && r_rule.json.id;
  if (newRuleId) {
    r = await call('PUT',`/api/rules/${newRuleId}`,'admin',{ruleName:'自检规则2',ruleType:'COMPARE',config:{field:'x',operator:'EQ',threshold:'2'}}); rec('PUT /api/rules/:id', r.status, [200,400]);
    r = await call('DELETE',`/api/rules/${newRuleId}`,'admin'); rec('DELETE /api/rules/:id', r.status, [200,204,400]);
  }
  r = await call('POST','/api/rules/test','admin',{ruleData:{rule_type:'COMPARE',config:{field:'x',operator:'EQ',threshold:'1'}},testData:{x:'1'}}); rec('POST /api/rules/test 合法', r.status, 200);

  console.log('\n=== 审核工作流 (POST) ===');
  r = await call('POST','/api/audit-tasks/10/action','auditor',{action:'approve',comment:'自检通过'}); rec('POST /api/audit-tasks/:id/action approve', r.status, [200,400]);
  r = await call('POST','/api/audit-tasks/10/action','auditor',{action:'reject',comment:'自检驳回'}); rec('POST /api/audit-tasks/:id/action reject', r.status, [200,400]);
  r = await call('POST','/api/audit-tasks/999/action','auditor',{action:'approve'}); rec('POST /api/audit-tasks/999 (不存在)', r.status, [404,400]);

  console.log('\n=== 法规 CRUD ===');
  let r_reg = await call('POST','/api/regulations','admin',{code:'TSG-SELFTEST-'+Date.now(),name:'自检法规',version:'1.0',publish_date:'2026-01-01',effective_date:'2026-02-01',status:'active'});
  rec('POST /api/regulations', r_reg.status, [200,201]);
  let newReg = r_reg.json && r_reg.json.id;
  if (newReg) {
    r = await call('PUT',`/api/regulations/${newReg}`,'admin',{name:'自检法规2'}); rec('PUT /api/regulations/:id (无code应200)', r.status, [200,400]);
    r = await call('POST',`/api/regulations/${newReg}/clauses`,'admin',{clause_number:'1.1',title:'条款',content:'内容',severity:'mandatory'}); rec('POST /api/regulations/:id/clauses', r.status, [200,201]);
    let newClause = r.json && r.json.id;
    if (newClause){ r = await call('PUT',`/api/clauses/${newClause}`,'admin',{content:'内容2'}); rec('PUT /api/clauses/:id', r.status, [200,400]); r = await call('DELETE',`/api/clauses/${newClause}`,'admin'); rec('DELETE /api/clauses/:id', r.status, [200,204,400]); }
    r = await call('DELETE',`/api/regulations/${newReg}`,'admin'); rec('DELETE /api/regulations/:id', r.status, [200,204,400]);
  }

  console.log('\n=== 研究任务 CRUD（含新增 DELETE）===');
  let r_res = await call('POST','/api/template-research','admin',{task_name:'自检研究',task_type:'IMPROVE',target_template_id:1,research_goal:'测试',status:'draft'});
  rec('POST /api/template-research', r_res.status, [200,201]);
  let newRes = r_res.json && r_res.json.id;
  if (newRes) {
    r = await call('POST',`/api/template-research/${newRes}/ai-suggest`,'admin',{}); rec('POST /api/template-research/:id/ai-suggest', r.status, [200,400]);
    r = await call('PUT',`/api/template-research/${newRes}`,'admin',{status:'reviewing'}); rec('PUT /api/template-research/:id', r.status, [200,400]);
    r = await call('PUT',`/api/template-research/${newRes}/publish`,'admin',{}); rec('PUT /api/template-research/:id/publish', r.status, [200,400]);
    r = await call('DELETE',`/api/template-research/${newRes}`,'admin'); rec('DELETE /api/template-research/:id (新增路由)', r.status, [200,204,400]);
  }

  console.log('\n=== 日志导出 / WORM 封存 ===');
  r = await call('POST','/api/logs/export','auditor',{format:'json',startDate:'2026-01-01',endDate:'2026-12-31'}); rec('POST /api/logs/export', r.status, [200,400]);
  r = await call('POST','/api/operation-logs/verify','auditor',{}); rec('POST /api/operation-logs/verify', r.status, 200); if(r.json) rec('  └ isValid', r.json.isValid, true);
  r = await call('POST','/api/logs/seal','admin',{}); rec('POST /api/logs/seal', r.status, [200,400]);
  r = await call('POST','/api/logs/worm-seal','admin',{}); rec('POST /api/logs/worm-seal', r.status, [200,400]);
  r = await call('POST','/api/logs/worm-verify','auditor',{sealId:6}); rec('POST /api/logs/worm-verify', r.status, [200,400]);

  console.log('\n=== 爬取 / 触发 ===');
  r = await call('POST','/api/crawler/trigger','admin',{type:'regulations'}); rec('POST /api/crawler/trigger', r.status, [200,400,500]);
  r = await call('POST','/api/crawler/start','admin',{}); rec('POST /api/crawler/start', r.status, [200,400]);
  r = await call('POST','/api/crawler/stop','admin',{}); rec('POST /api/crawler/stop', r.status, [200,400]);

  console.log('\n=== 鉴权 / 越权 ===');
  r = await call('GET','/api/templates','none'); rec('未登录访问 /api/templates', r.status, [401,403]);
  r = await call('POST','/api/templates','user',{name:'x'}); rec('user 越权创建模板', r.status, [403,401]);
  r = await call('GET','/api/template-research','user'); rec('user 越权访问研究', r.status, [403,401]);

  console.log(`\n═══════ 失败项: ${fails.length} ═══════`);
  for (const f of fails) console.log(`  ❌ ${f.name} → ${f.status} (期望 ${JSON.stringify(f.expect)}) ${f.extra||''}`);
  process.exit(0);
})();
