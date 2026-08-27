// 日管控记录（历史孤儿页，极简占位，避免路由缺页报错）
window.Pages.daily = {
  name: 'daily',
  props: ['query'],
  data: function () { return {}; },
  computed: {},
  methods: {
    goCheck: function () { utils.go('/check'); }
  },
  mounted: function () {},
  template: `
  <div class="page">
    <div class="empty-state">
      <div class="empty-icon">📋</div>
      <div class="empty-title">日管控记录</div>
      <div class="empty-sub">请前往「检查」查看日管控列表</div>
      <button class="btn-primary" @click="goCheck">前往检查</button>
    </div>
  </div>`
};
