/* 在 vm 沙箱里以「浏览器全局」语义加载 public/js/app.js，验证前端侧修复逻辑 */
const fs=require('fs'), vm=require('vm');
const sandbox={
  location:{pathname:'/history'},
  document:{querySelectorAll:()=>[],getElementById:()=>null,addEventListener:()=>{},createElement:()=>({classList:{add(){},remove(){},toggle(){}},style:{},querySelector:()=>({}),appendChild(){},remove(){}}),body:{appendChild(){},classList:{add(){},remove(){},toggle(){}}},documentElement:{}},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  setTimeout, clearTimeout, console,
  fetch:()=>Promise.resolve({json:()=>({})}),
  matchMedia:()=>({matches:false,addEventListener(){}}),
};
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox);
try{ vm.runInContext(fs.readFileSync('public/js/app.js','utf8'),sandbox); }
catch(e){ console.log('加载 app.js 时的非致命错误(DOM桩不完整):',e.message); }
const App=sandbox.App||sandbox.window.App;
if(!App){ console.error('App 未定义'); process.exit(1); }

let pass=0,fail=0;
function ok(n,c,e){ if(c){pass++;console.log('  ✅ '+n);} else {fail++;console.log('  ❌ '+n+(e?' → '+e:''));} }

console.log('\n【前端】BUG-05 App.parseOptions（下拉选项含引号/多格式）');
ok('JSON 数组 ["是","否"]', JSON.stringify(App.parseOptions('["是","否"]'))==='["是","否"]', JSON.stringify(App.parseOptions('["是","否"]')));
ok('竖线分隔', App.parseOptions('客梯|货梯|医梯').length===3);
ok('带引号逗号 "是","否"', JSON.stringify(App.parseOptions('"是","否"'))==='["是","否"]');
ok('中文标点混用 正常，异常、待定', App.parseOptions('正常，异常、待定').length===3, JSON.stringify(App.parseOptions('正常，异常、待定')));
ok('无残留方括号/引号', App.parseOptions('["合格","不合格"]').every(o=>!/[\[\]"]/.test(o)));
ok('破损 JSON 也能兜底', App.parseOptions('["是","否"').length===2, JSON.stringify(App.parseOptions('["是","否"')));
ok('fieldOptions 优先 options_list', JSON.stringify(App.fieldOptions({options_list:['A','B'],options:'X'}))==='["A","B"]');
ok('fieldOptions 回退 options', JSON.stringify(App.fieldOptions({options:'X|Y'}))==='["X","Y"]');
ok('去重', JSON.stringify(App.parseOptions('是,是,否'))==='["是","否"]');

console.log('\n【前端】BUG-04 时区格式化（TZ=Asia/Shanghai）');
const d=App.parseTs('2026-08-06 16:49:56');
ok('SQLite UTC 串按 UTC 解析', d&&d.toISOString()==='2026-08-06T16:49:56.000Z', d&&d.toISOString());
ok('GMT+8 正确显示为次日 00:49（旧实现会显示 16:49）', App.fmtDT('2026-08-06 16:49:56')==='2026-08-07 00:49', App.fmtDT('2026-08-06 16:49:56'));
ok('带 Z 的 ISO 同样正确', App.fmtDT('2026-08-06T16:49:56.000Z')==='2026-08-07 00:49', App.fmtDT('2026-08-06T16:49:56.000Z'));
ok('秒级格式化', App.fmtDTS('2026-08-06 16:49:56')==='2026-08-07 00:49:56', App.fmtDTS('2026-08-06 16:49:56'));
ok('纯日期不发生跨天偏移', App.fmtDate('2023-06-15')==='2023-06-15', App.fmtDate('2023-06-15'));
ok('recTime 优先取 _iso', App.recTime({created_at:'x',created_at_iso:'2026-01-01T00:00:00.000Z'},'created_at')==='2026-01-01T00:00:00.000Z');
ok('normDate 中文日期', App.normDate('2024年3月5日')==='2024-03-05', App.normDate('2024年3月5日'));
ok('normDate 斜杠日期', App.normDate('2024/3/5')==='2024-03-05', App.normDate('2024/3/5'));
ok('normDate 标准格式原样返回', App.normDate('2024-03-05')==='2024-03-05');
ok('todayLocal 为本地日期(非 UTC)', App.todayLocal()===new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-'+String(new Date().getDate()).padStart(2,'0'));
ok('空值兜底', App.fmtDT(null)==='--' && App.fmtDate('')==='--');

console.log('\n【前端】BUG-01 路径 → 侧栏页面映射');
ok('/history → history', App.currentPage()==='history', App.currentPage());
sandbox.location.pathname='/'; ok('/ → dashboard', App.currentPage()==='dashboard');
sandbox.location.pathname='/dashboard'; ok('/dashboard → dashboard', App.currentPage()==='dashboard');
sandbox.location.pathname='/mobile'; ok('/mobile → dashboard', App.currentPage()==='dashboard');
sandbox.location.pathname='/mobile/history'; ok('/mobile/history → history（旧实现会得到 mobile 而全部失配）', App.currentPage()==='history', App.currentPage());
sandbox.location.pathname='/knowledge'; ok('/knowledge → knowledge', App.currentPage()==='knowledge');

console.log('\n结果: '+pass+' 通过 / '+fail+' 失败\n');
process.exit(fail?1:0);
