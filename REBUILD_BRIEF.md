# UI 重构共享指引（子代理必读）

你正在重构一个 Express + EJS 的「特种设备电梯安全管理 AI 系统」前端。设计系统已重建完成，你的任务是**用新设计系统重写指定的 .ejs 视图文件，同时 100% 保留原有功能逻辑**（fetch 调用、API 路径、表单处理、点击处理器、弹窗逻辑、数据处理）。

## 必读参考文件
1. `/Users/a0000/special-equipment-v3/backend/public/css/app.css` — 完整设计系统（类清单见下）
2. `/Users/a0000/special-equipment-v3/backend/views/dashboard.ejs` — **新风格范本**（看它如何用 partials、stats 网格、卡片、表格、模态、App.js 助手）
3. `/Users/a0000/special-equipment-v3/backend/views/partials/head.ejs`、`sidebar.ejs`、`topbar.ejs` — 外壳 partials（已重建，直接 include）
4. `/Users/a0000/special-equipment-v3/backend/public/js/app.js` — 共享助手

## 设计系统类清单（直接套用）
- 外壳：`shell` `side` `side-it`（带 `data-page` 属性用于高亮）`main` `topbar` `crumb` `usr` `usr-menu`
- 页头：`page-hd` `pt`（标题）`pd`（副标题）
- 统计卡：`stats` `stat` `tone-blue/green/amber/red/purple` `si`（图标圆角方块）`sv`（大数字）`sl`（标签）`tr`（趋势）
- 卡片：`card` `card-h` `card-t`（标题，含 `<svg>` 图标）`card-b`（内容）
- 表格：`tbl-wrap` `tbl` `thead` `tbody` `clickable`（行可点）`cell-main` `cell-soft` `mono` `sub`
- 徽章：`tag` + `ok/ng/mb/info/purple/gray/blue`（带彩色圆点前缀）
- 按钮：`btn` + `btn-p/s/d/w/o/ghost` + `btn-sm/xs/block`；内联图标用 `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path .../></svg>`
- 表单：`field` `label` `hint` `inp` `sel` `txta` `chk`
- 结果：`res-hero` + `ok/ng/mb`（含 `.ic` 圆 + `.ttl` + `.rdc`）
- 规则：`rule` + `pass/fail`（`.rh` `.rn` `.rd` `.rf` `.rc`）
- 手风琴：`acc` > `.ah`（按钮）`.ab`（内容）
- 时间线：`timeline` `tl-item` + `ok/seal`（`.tl-dot` `.tl-t` `.tl-d` `.tl-m`）
- 步骤条：`steps` `step` + `done/active`（`.sc` `.st` `.sd`）
- 模态：`overlay` + `id` `modal` `modal-h` `.mt` `.x` `modal-b` `modal-f`
- 抽屉：`drawer` + `id` `drawer-h` `drawer-b` `drawer-mask` + `id-mask`
- 分页：`pg`（`<a>`/`<span>`，`.on`/`.dis`）
- 空态：`empty`（`.ei` `.et` `.ed`）
- 提示：`alert` + `info/ok/warn/danger`
- 进度/图：`prog`（`>i`）`bars` `bar`（`bar-col` `bar-lbl` `bar-val`）
- 哈希盒：`hash-box`（`hb` `.hid` `.hact` `.hval`，`.seal` 变体）
- 工具：`row` `col` `grid-2` `grid-3` `mt/mt-s/mt-l` `mb/mb-s/mb-l` `flex` `between` `center` `gap/gap-s` `wrap` `right` `muted` `soft` `t-sm` `t-xs` `fw-6` `fw-7` `mono` `nowrap` `hide` `divider` `kv`（`.k` `.v`）

## 桌面页面标准骨架
```ejs
<%- include('partials/head') %>
<div class="shell">
<%- include('partials/sidebar', {user: user}) %>
<main class="main">
  <%- include('partials/topbar', {user: user, title: '页面名'}) %>
  <div class="content">
    <div class="page-hd">
      <div><div class="pt">页面标题</div><div class="pd">副标题/说明</div></div>
      <div class="flex gap-s">[操作按钮]</div>
    </div>
    <div class="card">
      <div class="card-h"><div class="ct"><svg.../>区块标题</div>[右侧操作]</div>
      <div class="card-b">...内容...</div>
    </div>
  </div>
</main>
</div>
[模态/抽屉]
<script> ...原有逻辑... </script>
<%- include('partials/foot') %>
```

## 硬性规则
1. **保留功能**：逐行读懂原文件，所有 `fetch`/`XMLHttpRequest`、API 路径、请求体、响应字段处理、事件处理器（`onclick="xxx()"`、`window.xxx=`、`addEventListener`）、模态打开/关闭逻辑必须原样保留。只改 HTML 结构与 CSS 类。
2. **用 App.js 助手**：所有 fetch 可改写为 `App.api(url, {method, body})`（自动加 cookie + JSON 头）。**不要改 API 的 URL 和响应字段名**。
3. **模态**：旧 `<div class="modal-overlay" id="x" style="display:none">` 改为 `<div class="overlay" id="x"><div class="modal">...<button class="x" onclick="App.closeModal('x')">✕</button>...</div></div>`，打开用 `App.openModal('x')`。点击遮罩自动关闭（已内置）。
4. **移除旧类与 emoji 标题**：旧 `stat` `card-t` 里的 emoji、`.tag-ok/.tag-ng`、`.btn-p` 里的 emoji、`.modal-overlay/.mht/.mc`、`.spinner`（可用 `<span class="spinner">` 保留）、`.rr*/.bars/.bar-col`（旧）等全部换成新类。标题用 SVG 图标替代 emoji（卡片标题图标放在 `.ct` 内，CSS 已设定 `svg{stroke:var(--primary)}`；需要其他颜色可给外层加 `style="color:var(--xxx)"`）。
5. **不碰 server.js**：只改分配给你的 .ejs 文件。不要运行/重启 `node server.js`（避免端口冲突）；EJS 是按需渲染，改完即生效，由总控统一验证。
6. **角色感知**：侧栏已按 `user.role` 自动显示/隐藏菜单，页面无需自行判断（除非页面内有角色相关按钮，保留原有逻辑）。
7. **响应式**：卡片/表格在窄屏自动堆叠（已有 CSS），移动端侧栏变抽屉（顶部菜单按钮已内置）。

## 通用视觉要点
- 主色蓝 `#2f6bff`，语义色 绿/红/琥珀。
- 圆角偏大（卡片 16px、按钮 10px），留白充足，阴影柔和。
- 图标一律用 24x24 线性 SVG（stroke=currentColor），不要用 emoji 做标题/按钮主视觉。
- 表格斑马/悬停已有；结果态用彩色 `tag`；关键数字用 `stat` 卡或 `kv`。
