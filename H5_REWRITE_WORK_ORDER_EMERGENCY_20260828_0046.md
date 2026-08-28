# H5 重写子任务交付物 — work_order / emergency 四个页面

## 任务
按 `H5_REWRITE_CONTRACT.md` 重写 4 个 H5 页面，消除白屏/闪退，对齐后端 API 与状态机。

## 关键发现（根因级）
- 经核对 `router.js`/`app.js`/`index.html`：根组件用 `<component :is="view" :query="query">` 把 `query` 作为 **prop** 传入页面。
- 但项目内 **所有页面原先都未声明 `props:['query']`（也无 `name`）**，导致 `this.query` 恒为 `undefined`，**所有依赖 query.id 的详情/处置页静默失效**（detail 直接跳回列表）。
- 本次重写严格补上 `name` 与 `props:['query']`，这是修复白屏的核心改动。

## 交付文件（均通过 `node --check`）
| 文件 | 行数 | 要点 |
|---|---|---|
| `public/h5/js/pages/work_order.js` | 119 | 契约#13：api.getWorkOrders({status})；tab(pending/rectifying/verifying/closed+全部)；项显 order_no/device_name/hazard_desc/risk_level/status；点进 `/work_order_detail?id=` |
| `public/h5/js/pages/work_order_detail.js` | 287 | 契约#14：pending→填整改描述+照片→api.submitRectify；rectifying/verifying→验收通过/不通过→api.post verify {verifyDescription,verifyPhotos,pass}（true→closed / false→打回pending）；closed→完整信息 |
| `public/h5/js/pages/emergency.js` | 178 | 契约#15：api.get('/api/mobile/emergencies',{status})；tab(responding/processing/recovering/completed+全部)；项显 event_no/device_name/alarm_type/trapped_count/status/start_time；4 阶段进度条；点进 `/emergency_form?id=` |
| `public/h5/js/pages/emergency_form.js` | 329 | 契约#16：无 id=上报（设备搜索选择/alarmType 下拉 8 类/被困人数/位置/描述→api.post 拿 id 进处置）；有 id=处置（4 阶段 responding→processing→recovering→completed，api.put 推进 + 每阶段 api.post logs {stepSeq,stepName,action,photos}）；步骤条显示当前阶段 |

## 铁律合规核验
- `v-model` 仅出现在 `<input>/<select>/<textarea>`（整改/验收意见 textarea、设备搜索/位置/被困人数 input、报警类型 select）。**无** 动态键字段 / radio / checkbox 用法，故规则#2 不适用。
- 模板内 **无裸 `&& || < >`**：扫描确认所有 `&&/||/< >` 均在 JS 逻辑（computed/methods/注释）中；模板表达式/属性内零出现。
- **无 SVG**（页面内图标用 emoji/css）。
- 根节点均为单一 `<div class="page">`（`em`/`ef` 用于进度条作用域样式）。
- 列表遍历 `:key="item.id"`；无内嵌 `<style>`。

## 其他改动
- `public/h5/css/app.css` 末尾追加 `.log-item/.log-head/.log-step/.log-action`（处置日志样式，契约允许补类）。基座 app.js/store.js/api.js/utils.js/router.js/field.js/index.html 未改动。

## 自检命令
`node --check` 4 文件全 OK；`grep -E '&&|\|\|'` 模板段为空；`props:['query']` 4 文件均存在。
