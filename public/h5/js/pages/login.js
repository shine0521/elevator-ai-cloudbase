window.Pages = window.Pages || {};
window.Pages.login = {
  template: `
<div class="login-page">
  <div class="logo-wrap">
    <div class="logo">特安助</div>
    <div class="sub">特种设备电梯安全管理</div>
  </div>

  <div v-if="mode === 'account'" class="login-form">
    <div class="field"><input type="email" placeholder="邮箱" v-model="email" @input="onEmail" /></div>
    <div class="field"><input type="password" placeholder="密码" v-model="password" @input="onPwd" /></div>
    <button class="btn-primary" @click="accountLogin">登录</button>
    <div class="muted tip" v-if="wechatTip">{{wechatTip}}</div>
  </div>

  <div v-if="mode === 'wechat'" class="login-form">
    <button class="btn-primary" @click="wechatLogin">微信一键登录</button>
    <div class="muted tip">{{wechatTip}}</div>
  </div>

  <div class="switch" @click="switchMode">
    {{ mode === 'wechat' ? '使用账号密码登录' : '使用微信登录' }}
  </div>
</div>
  `,
  data() {
    return {
      mode: 'account',
      email: '',
      password: '',
      wechatTip: ''
    };
  },
  mounted() {
    if (Store.state.token) {
      utils.go('/');
    }
  },
  methods: {
    switchMode() {
      this.mode = this.mode === 'wechat' ? 'account' : 'wechat';
      this.wechatTip = '';
    },
    onEmail(e) { this.email = e.target.value; },
    onPwd(e) { this.password = e.target.value; },
    wechatLogin() {
      this.wechatTip = '微信登录需配置网页授权，请使用账号密码登录';
      this.mode = 'account';
    },
    async accountLogin() {
      if (!this.email || !this.password) {
        utils.toast('请输入账号密码');
        return;
      }
      try {
        const d = await api.post('/api/login', { email: this.email, password: this.password });
        if (d.success) {
          Store.setAuth(d.token, d.user);
          utils.go('/');
        } else {
          utils.toast(d.error || '登录失败');
        }
      } catch (e) {
        utils.toast(e.message || '网络错误');
      }
    }
  }
};
