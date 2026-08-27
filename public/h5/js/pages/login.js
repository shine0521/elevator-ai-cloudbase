// login.js - 特安助 H5 登录页
// 技术栈：Vue 3 global build（CDN），无构建工具

(function () {
  'use strict';

  var LoginPage = {
    template: '<div class="login-page">'
      + '<div class="login-bg"></div>'
      + '<div class="login-content">'
        // Logo 区
        + '<div class="login-logo-wrap">'
          + '<div class="login-logo-icon">'
            + '<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">'
              + '<rect width="48" height="48" rx="12" fill="white" fill-opacity="0.2"/>'
              + '<path d="M24 8L10 16V34L24 42L38 34V16L24 8Z" stroke="white" stroke-width="2" stroke-linejoin="round"/>'
              + '<path d="M24 20L18 23.5V30.5L24 34L30 30.5V23.5L24 20Z" fill="white" fill-opacity="0.6"/>'
              + '<line x1="24" y1="8" x2="24" y2="20" stroke="white" stroke-width="2"/>'
              + '<line x1="38" y1="16" x2="24" y2="20" stroke="white" stroke-width="2"/>'
              + '<line x1="10" y1="16" x2="24" y2="20" stroke="white" stroke-width="2"/>'
            + '</svg>'
          + '</div>'
          + '<h1 class="login-title">特安助</h1>'
          + '<p class="login-sub">电梯安全管理平台</p>'
        + '</div>'
        // 表单
        + '<div class="login-form">'
          // 账号输入
          + '<div class="login-input-wrap">'
            + '<span class="login-ico login-ico-user"></span>'
            + '<input'
              + ' class="login-input"'
              + ' type="text"'
              + ' v-model="account"'
              + ' placeholder="请输入账号"'
              + ' autocomplete="username"'
              + ' @keyup.enter="onLogin"'
            + '/>'
          + '</div>'
          // 密码输入
          + '<div class="login-input-wrap">'
            + '<span class="login-ico login-ico-lock"></span>'
            + '<input'
              + ' class="login-input"'
              + ' :type="pwdInputType"'
              + ' v-model="password"'
              + ' placeholder="请输入密码"'
              + ' autocomplete="current-password"'
              + ' @keyup.enter="onLogin"'
            + '/>'
            + '<span'
              + ' class="login-eye"'
              + ' @click="togglePwd"'
              + ' :class="{ active: showPwd }"'
            + '></span>'
          + '</div>'
          // 错误提示
          + '<p class="login-error" v-if="errorMsg">{{ errorMsg }}</p>'
          // 登录按钮
          + '<button'
            + ' class="btn-primary"'
            + ' @click="onLogin"'
            + ' :disabled="loading || isBtnDisabled"'
          + '>'
            + '<span v-if="loading" class="btn-loading"></span>'
            + '<span v-else>登录</span>'
          + '</button>'
          // 微信登录（降级提示）
          + '<button class="login-wechat" @click="onWechatLogin">'
            + '<span class="login-wechat-icon"></span>'
            + '微信登录'
          + '</button>'
        + '</div>'
        // 底部版本
        + '<div class="login-foot">特安助 v4.0</div>'
      + '</div>'
    + '</div>',

    data: function () {
      return {
        account: '',
        password: '',
        showPwd: false,
        loading: false,
        errorMsg: ''
      };
    },

    computed: {
      pwdInputType: function () {
        return this.showPwd ? 'text' : 'password';
      },
      isBtnDisabled: function () {
        return !this.account || !this.password;
      }
    },

    methods: {
      togglePwd: function () {
        this.showPwd = !this.showPwd;
      },

      onWechatLogin: function () {
        window.utils.toast('微信授权需配置正式域名');
      },

      onLogin: async function () {
        var self = this;

        // 验证非空
        if (!self.account) {
          self.errorMsg = '请输入账号';
          return;
        }
        if (!self.password) {
          self.errorMsg = '请输入密码';
          return;
        }

        self.errorMsg = '';
        self.loading = true;

        try {
          var res = await window.api.post('/api/login', {
            email: self.account,
            password: self.password
          });

          if (res.success && res.token && res.user) {
            window.Store.setAuth(res.token, res.user);
            window.utils.go('/');
          } else {
            self.errorMsg = res.message || '登录失败，请检查账号密码';
          }
        } catch (err) {
          self.errorMsg = err.message || '网络异常，请稍后重试';
        } finally {
          self.loading = false;
        }
      }
    },

    mounted: function () {
      // 如果已登录则直接跳转
      if (window.Store.getToken()) {
        window.utils.go('/');
      }
    }
  };

  // 注册到全局 Vue 路由
  if (window.VueRouter) {
    window.VueRouter.definePage('login', LoginPage);
  }

  // 兼容直接 mount 场景（若 index.html 用 v-if 控制组件）
  window.LoginPage = LoginPage;

})();
