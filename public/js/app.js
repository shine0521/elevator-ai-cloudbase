/* 共享前端助手 — 电梯安全管理 AI 系统 */
(function(){
  window.App = window.App || {};

  // Toast
  App.toast = function(msg, type){
    type = type || 'info';
    var icons = {ok:'<path d="M20 6L9 17l-5-5"/>',err:'<path d="M12 8v4m0 4h.01"/><circle cx="12" cy="12" r="9"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 16v-4m0-4h.01"/>'};
    var t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = (icons[type]?'<svg viewBox="0 0 24 24" fill="none" stroke-width="2">'+icons[type]+'</svg>':'')+'<span></span>';
    t.querySelector('span').textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function(){ t.classList.add('show'); });
    setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 320); }, 2600);
  };

  // Modal
  App.openModal = function(id){ var m=document.getElementById(id); if(m) m.classList.add('show'); };
  App.closeModal = function(id){ var m=document.getElementById(id); if(m) m.classList.remove('show'); };

  // Drawer
  App.openDrawer = function(id){ var d=document.getElementById(id); var mk=document.getElementById(id+'-mask'); if(d) d.classList.add('show'); if(mk) mk.classList.add('show'); };
  App.closeDrawer = function(id){ var d=document.getElementById(id); var mk=document.getElementById(id+'-mask'); if(d) d.classList.remove('show'); if(mk) mk.classList.remove('show'); };

  // Confirm
  App.confirm = function(text, onYes){
    var ov = document.getElementById('__confirm');
    if(!ov){
      ov = document.createElement('div'); ov.id='__confirm'; ov.className='overlay';
      ov.innerHTML = '<div class="modal" style="max-width:380px"><div class="modal-b" style="font-size:14px;line-height:1.7" id="__cmsg"></div><div class="modal-f"><button class="btn btn-ghost btn-sm" onclick="App.closeModal(\'__confirm\')">取消</button><button class="btn btn-d btn-sm" id="__cyes">确定</button></div></div>';
      document.body.appendChild(ov);
    }
    document.getElementById('__cmsg').textContent = text;
    ov.classList.add('show');
    document.getElementById('__cyes').onclick = function(){ App.closeModal('__confirm'); onYes && onYes(); };
  };

  // fetch 封装（携带 cookie）
  App.api = function(url, opts){
    opts = opts || {};
    opts.credentials = 'include';
    opts.headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
    return fetch(url, opts).then(function(r){ return r.json(); });
  };

  /* =========================================================
   * BUG-05 修复：下拉选项解析
   * options 存在多种历史格式：JSON 数组 / 竖线 / 逗号 / 中文标点 / 带引号。
   * 旧实现直接 split(',')，会把 '["是","否"]' 切成 '["是' / '"否"]'，
   * 提交后与规则阈值永远不相等 → 判别结论错误。
   * 本函数与服务端 utils/field-options.js 保持同一套规则。
   * ========================================================= */
  function stripQuotes(s){
    var v = String(s==null?'':s).trim();
    for(var i=0;i<3;i++){
      var next = v.replace(/^\s*["'`\u201c\u201d\u2018\u2019\u300c\u300d\u3010\u3011]+/,'')
                  .replace(/["'`\u201c\u201d\u2018\u2019\u300c\u300d\u3010\u3011]+\s*$/,'').trim();
      if(next===v) break;
      v = next;
    }
    return v;
  }
  function dedupe(arr){
    var seen={}, out=[];
    arr.forEach(function(v){ var k=String(v); if(!seen[k]){ seen[k]=1; out.push(k); } });
    return out;
  }
  function splitByDelimiter(text){
    var s = String(text), parts;
    if(/[\r\n]/.test(s))      parts = s.split(/[\r\n]+/);
    else if(s.indexOf('|')>=0) parts = s.split('|');
    else if(/[;\uff1b]/.test(s)) parts = s.split(/[;\uff1b]/);
    // 逗号类同时含英文逗号/中文逗号/顿号，兼容「正常，异常、待定」混用写法
    else if(/[,\uff0c\u3001]/.test(s)) parts = s.split(/[,\uff0c\u3001]/);
    else parts = [s];
    return dedupe(parts.map(stripQuotes).filter(Boolean));
  }
  App.parseOptions = function(raw){
    if(raw==null || raw==='') return [];
    if(Object.prototype.toString.call(raw)==='[object Array]'){
      return dedupe(raw.map(function(o){
        return (o && typeof o==='object') ? (o.value!=null?o.value:o.label) : o;
      }).map(stripQuotes).filter(Boolean));
    }
    var text = String(raw).trim();
    if(!text) return [];
    if((text.charAt(0)==='[' && text.charAt(text.length-1)===']') ||
       (text.charAt(0)==='{' && text.charAt(text.length-1)==='}')){
      try{
        var parsed = JSON.parse(text);
        if(Object.prototype.toString.call(parsed)==='[object Array]'){
          return dedupe(parsed.map(function(o){
            return (o && typeof o==='object') ? (o.value!=null?o.value:o.label) : o;
          }).map(stripQuotes).filter(Boolean));
        }
        if(parsed && typeof parsed==='object'){
          return dedupe(Object.keys(parsed).map(stripQuotes).filter(Boolean));
        }
      }catch(e){
        return splitByDelimiter(text.replace(/^\[/,'').replace(/\]$/,''));
      }
    }
    return splitByDelimiter(text);
  };
  /** 字段行 → 选项数组（优先用服务端已解析好的 options_list） */
  App.fieldOptions = function(field){
    if(!field) return [];
    if(Object.prototype.toString.call(field.options_list)==='[object Array]') return field.options_list;
    return App.parseOptions(field.options);
  };

  /* =========================================================
   * BUG-04 修复：时区处理
   * SQLite CURRENT_TIMESTAMP 写入的是 **UTC** 且无时区标记（'YYYY-MM-DD HH:MM:SS'），
   * 而 new Date('2026-08-06 16:49:56') 按**本地时区**解析 → GMT+8 下整体偏差 8 小时。
   * 纯日期（YYYY-MM-DD，如检验日期）不做任何时区换算，避免跨天漂移。
   * ========================================================= */
  var DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
  var SQLITE_DT = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

  App.isDateOnly = function(v){ return typeof v==='string' && DATE_ONLY.test(v.trim()); };

  /** 把后端时间值安全转为 Date（无时区标记的一律按 UTC 解析） */
  App.parseTs = function(v){
    if(v==null || v==='') return null;
    if(v instanceof Date) return isNaN(v.getTime())?null:v;
    var s = String(v).trim();
    if(!s) return null;
    if(/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)){
      var d0 = new Date(s); return isNaN(d0.getTime())?null:d0;
    }
    if(DATE_ONLY.test(s)){
      var p = s.split('-');
      return new Date(+p[0], +p[1]-1, +p[2]); // 纯日期：本地零点，不做偏移
    }
    var m = s.match(SQLITE_DT);
    if(m){
      return new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +(m[6]||0)));
    }
    var d = new Date(s);
    return isNaN(d.getTime())?null:d;
  };

  function pad2(n){ return String(n).padStart(2,'0'); }

  /** 格式化为本地时间 'YYYY-MM-DD HH:mm'（优先用后端下发的 *_iso） */
  App.fmtDT = function(v, fallback){
    var d = App.parseTs(v);
    if(!d) return fallback===undefined?'--':fallback;
    return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+' '+pad2(d.getHours())+':'+pad2(d.getMinutes());
  };
  /** 格式化为 'YYYY-MM-DD HH:mm:ss' */
  App.fmtDTS = function(v, fallback){
    var d = App.parseTs(v);
    if(!d) return fallback===undefined?'--':fallback;
    return App.fmtDT(v)+':'+pad2(d.getSeconds());
  };
  /** 仅日期 'YYYY-MM-DD' */
  App.fmtDate = function(v, fallback){
    if(App.isDateOnly(v)) return String(v).trim();
    var d = App.parseTs(v);
    if(!d) return fallback===undefined?'--':fallback;
    return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
  };
  /** 从记录中取时间字段：优先 key+'_iso'，其次 key */
  App.recTime = function(rec, key){
    if(!rec) return null;
    return rec[key+'_iso'] != null ? rec[key+'_iso'] : rec[key];
  };
  /** 本地今天 YYYY-MM-DD（给 <input type=date> 用，切勿用 toISOString 会跨天） */
  App.todayLocal = function(){
    var d = new Date();
    return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
  };
  /** 归一化任意日期输入为 YYYY-MM-DD（不做时区偏移） */
  App.normDate = function(v){
    if(v==null || v==='') return '';
    var s = String(v).trim();
    if(DATE_ONLY.test(s)) return s;
    var m = s.match(/^(\d{4})[-\/\u5e74.](\d{1,2})[-\/\u6708.](\d{1,2})/);
    if(m) return m[1]+'-'+pad2(m[2])+'-'+pad2(m[3]);
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if(m) return m[1]+'-'+m[2]+'-'+m[3];
    var d = App.parseTs(s);
    return d ? App.fmtDate(d) : '';
  };

  document.addEventListener('click', function(e){
    // 关闭模态（点遮罩）
    if(e.target.classList && e.target.classList.contains('overlay')) e.target.classList.remove('show');
    // 用户菜单
    var um = document.getElementById('usrMenu');
    if(um && !e.target.closest('.usr')) um.classList.remove('show');
    // 手风琴
    var ah = e.target.closest && e.target.closest('.acc>.ah');
    if(ah){
      var acc = ah.parentElement;
      var b = acc.querySelector('.ab');
      if(b){ acc.classList.toggle('open'); ah.classList.toggle('open'); b.classList.toggle('open'); }
    }
    // 侧栏移动端关闭
    if(e.target.id==='sideMask'){ document.getElementById('sideBar').classList.remove('open'); e.target.classList.remove('show'); }
  });

  // 侧栏切换（移动端）
  App.toggleSide = function(){
    var s=document.getElementById('sideBar'), m=document.getElementById('sideMask');
    if(s) s.classList.toggle('open'); if(m) m.classList.toggle('show');
  };
  // 用户菜单
  App.toggleUser = function(e){ e.stopPropagation(); var m=document.getElementById('usrMenu'); if(m) m.classList.toggle('show'); };

  // 侧栏高亮（BUG-01：路径 → data-page 的映射集中维护，避免首页等别名路径失配）
  var PATH_ALIAS = {
    '': 'dashboard',
    'dashboard': 'dashboard',
    'index': 'dashboard',
    'mobile': 'dashboard',
    'discriminate': 'discriminate',
    'history': 'history',
    'templates': 'templates',
    'knowledge': 'knowledge',
    'audit': 'audit',
    'research': 'research',
    'logs': 'logs',
    'settings': 'settings'
  };
  App.currentPage = function(){
    var segs = location.pathname.replace(/^\//,'').split('/').filter(Boolean);
    // /mobile/history → 取 history；/mobile → dashboard
    var key = segs.length > 1 && segs[0] === 'mobile' ? segs[1] : (segs[0] || '');
    return PATH_ALIAS[key] || key || 'dashboard';
  };
  function hl(){
    var p = App.currentPage();
    document.querySelectorAll('.side-it').forEach(function(a){
      a.classList.toggle('on', a.getAttribute('data-page')===p);
    });
  }
  document.addEventListener('DOMContentLoaded', hl);
  if(document.readyState!=='loading') hl();
})();
