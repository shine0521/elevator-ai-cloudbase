// 模板 9 种比对项类型 → 小程序组件映射（供 M-04 / M-06 模板动态渲染引擎使用）
const FIELD_TYPES = {
  text:           { label: '文本',   component: 'input' },
  number:         { label: '数字',   component: 'input', inputType: 'digit' },
  date:           { label: '日期',   component: 'picker', mode: 'date' },
  select:         { label: '下拉',   component: 'picker' },
  textarea:       { label: '多行',   component: 'textarea' },
  checkbox:       { label: '勾选',   component: 'checkbox' },
  radio:          { label: '单选',   component: 'radio' },
  file:           { label: '文件',   component: 'upload' },
  photo:          { label: '拍照',   component: 'camera' },
  signature:      { label: '签名',   component: 'signature' },
  ai_recognition: { label: 'AI识别', component: 'ai' },
  sensor_data:    { label: '传感器', component: 'sensor' },
  computed:       { label: '计算',   component: 'computed' }
};
module.exports = { FIELD_TYPES };
