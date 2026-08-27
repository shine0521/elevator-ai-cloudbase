// profile.js — 个人中心
// 依据 H5_REWRITE_CONTRACT.md 重写：显示 Store.getUser() 信息 + 退出登录 + 修改密码 inline 弹层
// 铁律：v-model 仅用于 input；模板内无裸 && || < >；禁止 SVG；根节点 .page
window.Pages = window.Pages || {};

window.Pages.profile = {
  name: 'profile',
  props: ['query'],

  data: function () {
    return {
      showPwd: false,
      pwdSaving: false,
      form: { oldPassword: '', newPassword: '', confirm: '' }
    };
  },

  computed: {
    user: function () { return Store.getUser() || {}; },

    userName: function () {
      var u = this.user;
      return (u && (u.name || u.username)) || '未登录';
    },

    userEmail: function () {
      var u = this.user;
      return (u && u.email) || '';
    },

    roleLabel: function () {
      var u = this.user;
      var roles = [];
      if (Array.isArray(u.roles)) roles = u.roles;
      else if (typeof u.role === 'string' && u.role) roles = [u.role];
      if (!roles.length) return '';
      var map = { admin: '管理员', auditor: '审核员', operator: '操作员', user: '普通用户' };
      return roles.map(function (r) { return map[String(r).toLowerCase()] || r; }).join(' / ');
    },

    avatarText: function () {
      var n = this.userName;
      return (n && n !== '未登录') ? String(n).charAt(0) : '?';
    }
  },

  methods: {
    go: function (p) { utils.go(p); },
    load: function () { /* 数据来自 Store，无需异步加载 */ },

    openPwd: function () {
      this.form = { oldPassword: '', newPassword: '', confirm: '' };
      this.showPwd = true;
    },
    closePwd: function () { this.showPwd = false; },

    // 修改密码：api.changePassword({ oldPassword, newPassword })
    submitPwd: async function () {
      var self = this;
      if (!self.form.oldPassword) { utils.toast('请输入旧密码'); return; }
      if (!self.form.newPassword) { utils.toast('请输入新密码'); return; }
      if (self.form.newPassword.length < 6) { utils.toast('新密码至少 6 位'); return; }
      if (self.form.newPassword !== self.form.confirm) { utils.toast('两次输入不一致'); return; }

      self.pwdSaving = true;
      try {
        await api.changePassword({
          oldPassword: self.form.oldPassword,
          newPassword: self.form.newPassword
        });
        utils.toast('密码修改成功');
        self.showPwd = false;
      } catch (e) {
        // api 层已统一 toast
      } finally {
        self.pwdSaving = false;
      }
    },

    // 退出登录
    logout: async function () {
      var ok = await utils.confirm('确定要退出登录吗？');
      if (!ok) return;
      Store.logout();
    }
  },

  mounted: function () { this.load(); },

  template: `
<div class="page">
  <!-- 用户信息卡 -->
  <div class="user-card">
    <div class="uc-avatar">{{ avatarText }}</div>
    <div class="uc-name">{{ userName }}</div>
    <div class="uc-role" v-if="roleLabel">{{ roleLabel }}</div>
    <div class="uc-org">{{ userEmail }}</div>
  </div>

  <!-- 菜单 -->
  <div class="card">
    <div class="menu-row" @click="openPwd">
      <span style="font-size:16px;">🔒</span>
      <span style="flex:1;">修改密码</span>
      <span style="color:var(--muted);">›</span>
    </div>
    <div class="menu-row" @click="go('/record')">
      <span style="font-size:16px;">📊</span>
      <span style="flex:1;">检查记录</span>
      <span style="color:var(--muted);">›</span>
    </div>
    <div class="menu-row" @click="logout">
      <span style="font-size:16px;">🚪</span>
      <span style="flex:1;" class="text-red">退出登录</span>
      <span style="color:var(--muted);">›</span>
    </div>
  </div>

  <div class="ver muted">特安助 v1.0.0</div>

  <!-- 修改密码弹层 -->
  <div class="modal-overlay" v-if="showPwd" @click="closePwd">
    <div class="modal-box" @click.stop>
      <div class="modal-title">修改密码</div>
      <div class="field">
        <div class="fi-label">旧密码</div>
        <input class="fi-input" type="password" v-model="form.oldPassword" placeholder="请输入旧密码" />
      </div>
      <div class="field">
        <div class="fi-label">新密码</div>
        <input class="fi-input" type="password" v-model="form.newPassword" placeholder="至少 6 位" />
      </div>
      <div class="field">
        <div class="fi-label">确认新密码</div>
        <input class="fi-input" type="password" v-model="form.confirm" placeholder="再次输入新密码" />
      </div>
      <div class="btn-row">
        <button class="btn-default" @click="closePwd">取消</button>
        <button class="btn-primary" :disabled="pwdSaving" @click="submitPwd">确认修改</button>
      </div>
    </div>
  </div>
</div>
`
};
