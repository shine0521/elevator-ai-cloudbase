// 个人中心
window.Pages = window.Pages || {};
window.Pages.profile = {
  template: `
<div class="page">
  <div class="user-card" v-if="user">
    <div class="uc-avatar" :style="avatarStyle">{{avatarText}}</div>
    <div class="uc-name">{{userName}}</div>
    <div class="uc-role" v-if="roleLabel">{{roleLabel}}</div>
    <div class="uc-org">{{userEmail}}</div>
    <div class="uc-org" v-if="orgName">{{orgName}}</div>
  </div>

  <div class="card menu-card">
    <div class="menu-row" @click="openPwd">
      <span class="menu-ico">🔒</span>
      <span class="menu-txt">账号安全</span>
      <span class="menu-arrow">›</span>
    </div>
    <div class="menu-row" @click="goRecord">
      <span class="menu-ico">📊</span>
      <span class="menu-txt">检查记录</span>
      <span class="menu-arrow">›</span>
    </div>
    <div class="menu-row" @click="openAbout">
      <span class="menu-ico">ℹ️</span>
      <span class="menu-txt">关于我们</span>
      <span class="menu-arrow">›</span>
    </div>
    <div class="menu-row" @click="confirmLogout">
      <span class="menu-ico">🚪</span>
      <span class="menu-txt text-red">退出登录</span>
      <span class="menu-arrow">›</span>
    </div>
  </div>

  <div class="ver muted">特安助 v1.0.0</div>

  <div class="modal-overlay" v-show="showPwd" @click="closePwd">
    <div class="modal-box" @click.stop>
      <div class="modal-title">修改密码</div>
      <div class="form-item">
        <div class="form-label">当前密码</div>
        <input class="fi-input" type="password" v-model="pwd.current" placeholder="请输入当前密码" />
      </div>
      <div class="form-item">
        <div class="form-label">新密码</div>
        <input class="fi-input" type="password" v-model="pwd.next" placeholder="至少 6 位" />
      </div>
      <div class="form-item">
        <div class="form-label">确认新密码</div>
        <input class="fi-input" type="password" v-model="pwd.confirm" placeholder="再次输入新密码" />
      </div>
      <div class="flex gap8 mt8">
        <button class="ab-btn ab-gray" @click="closePwd">取消</button>
        <button class="ab-btn ab-primary" :disabled="pwdSaving" @click="submitPwd">确认修改</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" v-show="showAbout" @click="showAbout=false">
    <div class="modal-box" @click.stop>
      <div class="modal-title">关于我们</div>
      <div class="modal-body">
        特安助 · 特种设备安全管理平台<br/>
        提供日管控、周排查、月调度、隐患排查、应急管理等一站式安全合规服务。<br/><br/>
        客服热线：400-000-0000<br/>
        版本：v1.0.0
      </div>
      <button class="ab-btn ab-primary" @click="showAbout=false">知道了</button>
    </div>
  </div>
</div>
`,
  data() {
    return {
      user: null,
      showPwd: false,
      showAbout: false,
      pwdSaving: false,
      pwd: { current: '', next: '', confirm: '' }
    };
  },
  mounted() {
    this.user = Store.getUser() || Store.state.user;
  },
  computed: {
    avatarText: function () {
      if (!this.user || !this.user.name) return '?';
      return String(this.user.name).charAt(0);
    },
    userName: function () {
      return (this.user && (this.user.name || this.user.username)) || '未登录';
    },
    userEmail: function () {
      return (this.user && this.user.email) || '';
    },
    roleLabel: function () {
      if (!this.user) return '';
      var roles = [];
      if (Array.isArray(this.user.roles)) roles = this.user.roles;
      else if (typeof this.user.role === 'string' && this.user.role) roles = [this.user.role];
      if (!roles.length) return '';
      return roles.join(' / ');
    },
    orgName: function () {
      if (!this.user) return '';
      if (this.user.org_name) return this.user.org_name;
      if (this.user.organization && this.user.organization.name) return this.user.organization.name;
      return this.user.orgId || '';
    },
    avatarStyle: function () {
      return { background: 'linear-gradient(135deg,#1677FF,#4a9eff)' };
    }
  },
  methods: {
    openPwd: function () {
      this.pwd = { current: '', next: '', confirm: '' };
      this.showPwd = true;
    },
    closePwd: function () {
      this.showPwd = false;
    },
    openAbout: function () {
      this.showAbout = true;
    },
    goRecord: function () {
      utils.go('/record');
    },
    submitPwd: async function () {
      if (!this.pwd.current) { utils.toast('请输入当前密码'); return; }
      if (this.pwd.next.length < 6) { utils.toast('新密码至少 6 位'); return; }
      if (this.pwd.next !== this.pwd.confirm) { utils.toast('两次输入不一致'); return; }
      this.pwdSaving = true;
      try {
        await api.changePassword({
          currentPassword: this.pwd.current,
          newPassword: this.pwd.next,
          confirmPassword: this.pwd.confirm
        });
        utils.toast('密码修改成功');
        this.showPwd = false;
      } catch (e) {
        utils.toast('修改失败');
      } finally {
        this.pwdSaving = false;
      }
    },
    confirmLogout: async function () {
      var ok = await utils.confirm('确定要退出登录吗？');
      if (!ok) return;
      Store.logout();
      utils.go('/login');
    }
  }
};
