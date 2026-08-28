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
      utils.toast('微信授权登录功能即将上线');
    },

    onForgotPwd: function () {
      var email = this.account && this.account.trim();
      if (email) {
        var hint = '\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u91cd\u7f6e\u5bc6\u7801\uff0c\u6216\u8005\u5c31\u8fbe ' + email;
        utils.toast(hint);
      } else {
        utils.toast('请先在账号栏输入您的邮箱，再点击"忘记密码"');
      }
    },

    onLogin: async function () {
      var self = this;
      if (!self.account) { utils.toast('请输入账号'); this._shake(); return; }
      if (!self.password) { utils.toast('请输入密码'); this._shake(); return; }

      self.loading = true;
      try {
        var res = await api.post('/api/login', {
          email: self.account,
          password: self.password
        });
        if (res && res.token && res.user) {
          Store.setAuth(res.token, res.user);
          // 跳转前先清空 hash，等待 DOM 更新后再设目标路由
          location.hash = '';
          requestAnimationFrame(function () {
            location.hash = '#/';
            setTimeout(function () { utils.toast('登录成功'); }, 80);
          });
        } else {
          utils.toast((res && res.error) || '登录失败，请检查账号密码');
          self._shake();
        }
      } catch (e) {
        // api.js 在 throw 前已 toast 业务错误信息；
        // 额外补一个容错，以防某些边界情况 api.js 未 toast
        if (e && e.message && e.message !== 'NETWORK_ERROR' && e.message !== 'SERVER_ERROR') {
          // 已由 api 层 toast，这里不再重复弹
        }
        self._shake();
      } finally {
        self.loading = false;
      }
    },

    _shake: function () {
      var box = this.$el && this.$el.querySelector && this.$el.querySelector('.login-box');
      if (!box) return;
      box.classList.remove('shake');
      void box.offsetWidth; // force reflow to restart animation
      box.classList.add('shake');
      setTimeout(function () { box.classList.remove('shake'); }, 500);
    },
  },

  mounted: function () {
    // 进登录页时只清本地状态，不调用 Store.logout()（会触发 hash 跳转导致路由重入）
    Store.state.token = '';
    Store.state.user = null;
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch (e) {}
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
      <a href="#" class="forgot-link" @click.prevent="onForgotPwd">忘记密码？</a>\
    </div>\
  </div>\
</div>'
};
