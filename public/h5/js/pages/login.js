// login.js — 电梯安全管理 AI 系统 H5 登录页
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md 重写
// 铁律：v-model 仅用于 input；模板内无裸 && || < >；禁止 SVG（用 emoji）；根节点 .page
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
    pwdInputType: function () {
      return this.showPwd ? 'text' : 'password';
    },
    eyeIcon: function () {
      return this.showPwd ? '🙈' : '👁️';
    },
    btnDisabled: function () {
      return this.loading || !this.account || !this.password;
    }
  },

  methods: {
    go: function (p) { utils.go(p); },

    load: function () {
      if (Store.getToken()) { location.hash = '#/'; }
    },

    togglePwd: function () {
      this.showPwd = !this.showPwd;
    },

    onWechatLogin: function () {
      utils.toast('微信登录暂未配置');
    },

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
          try { location.hash = ''; } catch (e) {}
          location.hash = '#/';
          setTimeout(function () { utils.toast('登录成功'); }, 50);
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

  mounted: function () {
    // 进登录页时清掉旧 token，避免旧 token 触发 401 → toast → 退回登录页的循环
    Store.logout();
    this.load();
  },

  template: '\
<div class="page login-page">\
  <div class="login-box">\
    <div class="login-logo">\
      <div class="ic">🛡️</div>\
    </div>\
    <h1>特安助</h1>\
    <p class="sub">电梯安全管理平台</p>\
    <div>\
      <input type="text" class="fi-input" v-model="account" placeholder="请输入账号 / 邮箱"\
             autocomplete="username" @keyup.enter="onLogin" style="margin-bottom:12px;" />\
      <div style="position:relative;margin-bottom:14px;">\
        <input :type="pwdInputType" class="fi-input" v-model="password" placeholder="请输入密码"\
               autocomplete="current-password" @keyup.enter="onLogin" style="margin-bottom:0;padding-right:40px;" />\
        <span @click="togglePwd" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:16px;cursor:pointer;">\
          {{ eyeIcon }}\
        </span>\
      </div>\
      <button class="btn-primary" :disabled="btnDisabled" @click="onLogin">\
        <span v-if="loading">登录中...</span>\
        <span v-else>登 录</span>\
      </button>\
      <div class="login-3p">\
        <button class="btn-ghost" style="flex:1;padding:9px 12px;font-size:13px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text-2);cursor:pointer;" @click="onWechatLogin">💬 微信登录</button>\
      </div>\
      <p class="tip">特安助 · 特种设备安全管理平台</p>\
    </div>\
  </div>\
</div>'
};
