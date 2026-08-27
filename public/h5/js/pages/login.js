// login.js — 特安助 H5 登录页
// 依据 H5_REWRITE_CONTRACT.md 重写：账号/密码 → POST /api/login → Store.setAuth → #/
// 铁律：v-model 仅用于 input；模板内无裸 && || < >；页面禁止 SVG（用 emoji）；根节点 .page
window.Pages = window.Pages || {};

window.Pages.login = {
  name: 'login',
  props: ['query'],

  data: function () {
    return {
      account: '',
      password: '',
      showPwd: false,
      loading: false
    };
  },

  computed: {
    // 密码框类型：明文 / 密文
    pwdInputType: function () {
      return this.showPwd ? 'text' : 'password';
    },
    // 眼睛图标（emoji 替代 SVG）
    eyeIcon: function () {
      return this.showPwd ? '🙈' : '👁️';
    },
    // 登录按钮禁用态（空账号 / 空密码 / 加载中）—— 不放裸 || 到模板
    btnDisabled: function () {
      return this.loading || !this.account || !this.password;
    }
  },

  methods: {
    go: function (p) { utils.go(p); },

    // 已登录则直接进入工作台
    load: function () {
      if (Store.getToken()) { location.hash = '#/'; }
    },

    // 切换密码可见性
    togglePwd: function () { this.showPwd = !this.showPwd; },

    // 微信登录（暂未配置）
    onWechatLogin: function () {
      utils.toast('微信登录暂未配置');
    },

    // 账号密码登录
    onLogin: async function () {
      var self = this;
      if (!self.account) { utils.toast('请输入账号'); return; }
      if (!self.password) { utils.toast('请输入密码'); return; }

      self.loading = true;
      try {
        var res = await api.post('/api/login', {
          email: self.account,
          password: self.password
        });
        if (res && res.token && res.user) {
          Store.setAuth(res.token, res.user);
          utils.toast('登录成功');
          location.hash = '#/';
        } else {
          utils.toast((res && res.message) || '登录失败，请检查账号密码');
        }
      } catch (e) {
        // api 层已统一 toast（401/500/网络/业务错误）
      } finally {
        self.loading = false;
      }
    }
  },

  mounted: function () { this.load(); },

  template: `
<div class="page login-page">
  <div class="login-content" style="width:100%;max-width:320px;">
    <div class="login-logo-wrap" style="text-align:center;margin-bottom:18px;">
      <div class="login-logo-icon" style="font-size:46px;line-height:1;">🛡️</div>
      <h1 class="login-title">特安助</h1>
      <p class="login-sub">电梯安全管理平台</p>
    </div>

    <div class="login-form">
      <div class="login-input-wrap">
        <span class="login-ico">👤</span>
        <input class="login-input" type="text" v-model="account" placeholder="请输入账号 / 邮箱"
               autocomplete="username" @keyup.enter="onLogin" />
      </div>

      <div class="login-input-wrap">
        <span class="login-ico">🔒</span>
        <input class="login-input" :type="pwdInputType" v-model="password" placeholder="请输入密码"
               autocomplete="current-password" @keyup.enter="onLogin" />
        <span class="login-eye" :class="{ active: showPwd }" @click="togglePwd">{{ eyeIcon }}</span>
      </div>

      <button class="btn-primary" :disabled="btnDisabled" @click="onLogin">
        <span v-if="loading">登录中...</span>
        <span v-else>登 录</span>
      </button>

      <button class="login-wechat" @click="onWechatLogin">💬 微信登录</button>
    </div>

    <div class="login-foot">特安助 · 特种设备安全管理平台</div>
  </div>
</div>
`
};
