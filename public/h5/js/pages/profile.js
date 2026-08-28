// profile.js — 电梯安全管理 AI 系统 H5 个人中心
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md 重写
// 铁律：v-model 仅用于 input；模板内无裸 && || < >；禁止 SVG（用 emoji）；根节点 .page
window.Pages = window.Pages || {};

window.Pages.profile = {
  name: 'profile',
  props: ['query'],

  data: function () {
    return {
      showPwd: false,
      pwdSaving: false,
      refreshLoading: false,
      form: { oldPassword: '', newPassword: '', confirm: '' }
    };
  },

  computed: {
    user: function () { return Store.getUser() || {}; },

    userName: function () {
      var u = this.user;
      return (u && (u.name || u.email || '')) || '未登录';
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
    },

    isAdmin: function () { return Store.isRole('admin'); },
    isAuditor: function () { return Store.isRole('auditor'); },
    showCompliance: function () { return this.isAdmin || this.isAuditor; }
  },

  methods: {
    go: function (p) { utils.go(p); },

    load: function () {
      var self = this;
      self.refreshLoading = true;
      api.getMe().then(function (res) {
        if (res && typeof res === 'object') {
          var u = res.id ? res : (res.data || res);
          if (u.id) Store.setAuth(Store.getToken(), u);
        }
      }).catch(function () {
        // api 层已统一 toast，静默失败
      }).finally(function () {
        self.refreshLoading = false;
      });
    },

    openPwd: function () {
      this.form = { oldPassword: '', newPassword: '', confirm: '' };
      this.showPwd = true;
    },

    closePwd: function () {
      this.showPwd = false;
    },

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

    logout: async function () {
      var ok = await utils.confirm('确定要退出登录吗？');
      if (!ok) return;
      Store.logout();
    }
  },

  mounted: function () { this.load(); },

  template: '\
<div class="page">\
  <!-- 用户信息卡 -->\
  <div class="card" style="display:flex;flex-direction:column;align-items:center;padding:24px 14px;margin-bottom:12px;">\
    <div class="avatar" style="width:64px;height:64px;font-size:26px;margin-bottom:10px;">{{ avatarText }}</div>\
    <div style="font-size:17px;font-weight:600;margin-bottom:6px;">{{ userName }}</div>\
    <div style="font-size:12px;color:var(--text-3);margin-bottom:8px;">{{ userEmail }}</div>\
    <span v-if="roleLabel" class="tag tag-info">{{ roleLabel }}</span>\
  </div>\
  <!-- 菜单 -->\
  <div class="list" style="margin-bottom:12px;">\
    <div class="list-item" @click="openPwd">\
      <div class="li-icon" style="background:#fdf6ec;color:var(--warning);">🔒</div>\
      <div class="li-body">\
        <div class="li-title">修改密码</div>\
        <div class="li-sub">定期更换密码，保障账号安全</div>\
      </div>\
      <div class="li-arrow">›</div>\
    </div>\
    <div class="list-item" @click="go(\'/record\')">\
      <div class="li-icon" style="background:var(--primary-light);color:var(--primary);">📊</div>\
      <div class="li-body">\
        <div class="li-title">检查记录</div>\
        <div class="li-sub">查看历史检查数据</div>\
      </div>\
      <div class="li-arrow">›</div>\
    </div>\
    <!-- 合规中心入口（仅 admin / auditor 显示）-->\
    <template v-if="showCompliance">\
      <div class="list-item" @click="go(\'/discriminate\')">\
        <div class="li-icon" style="background:#f0f9eb;color:var(--success);">⚖️</div>\
        <div class="li-body">\
          <div class="li-title">合规判别</div>\
          <div class="li-sub">AI 合规风险分析</div>\
        </div>\
        <div class="li-arrow">›</div>\
      </div>\
      <div class="list-item" @click="go(\'/audit_list\')">\
        <div class="li-icon" style="background:#f4f4f5;color:var(--text-3);">🔍</div>\
        <div class="li-body">\
          <div class="li-title">合规审核</div>\
          <div class="li-sub">审核合规判别结果</div>\
        </div>\
        <div class="li-arrow">›</div>\
      </div>\
      <div class="list-item" @click="go(\'/logs_list\')">\
        <div class="li-icon" style="background:#f4f4f5;color:var(--text-3);">🧾</div>\
        <div class="li-body">\
          <div class="li-title">操作日志</div>\
          <div class="li-sub">司法留痕记录</div>\
        </div>\
        <div class="li-arrow">›</div>\
      </div>\
    </template>\
  </div>\
  <!-- 版本信息 -->\
  <div style="text-align:center;color:var(--text-3);font-size:12px;padding:8px 0 16px;">特安助 v1.0.0</div>\
  <!-- 退出登录按钮 -->\
  <button class="btn-danger" style="max-width:320px;margin:0 auto;display:block;" @click="logout">退出登录</button>\
  <!-- 修改密码弹层 -->\
  <div class="modal-mask" v-if="showPwd" @click.self="closePwd">\
    <div class="modal">\
      <div class="modal-h">\
        <span>修改密码</span>\
        <button class="modal-close" @click="closePwd">×</button>\
      </div>\
      <div class="form-item">\
        <div class="form-label">旧密码</div>\
        <input type="password" class="fi-input" v-model="form.oldPassword" placeholder="请输入旧密码" />\
      </div>\
      <div class="form-item">\
        <div class="form-label">新密码</div>\
        <input type="password" class="fi-input" v-model="form.newPassword" placeholder="至少 6 位" />\
      </div>\
      <div class="form-item" style="margin-bottom:16px;">\
        <div class="form-label">确认新密码</div>\
        <input type="password" class="fi-input" v-model="form.confirm" placeholder="再次输入新密码" />\
      </div>\
      <div class="btn-row">\
        <button class="btn-ghost" style="flex:1;padding:10px;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;" @click="closePwd">取消</button>\
        <button class="btn-primary" style="flex:1;padding:10px;" :disabled="pwdSaving" @click="submitPwd">\
          <span v-if="pwdSaving">保存中...</span>\
          <span v-else>确认修改</span>\
        </button>\
      </div>\
    </div>\
  </div>\
</div>'
};
