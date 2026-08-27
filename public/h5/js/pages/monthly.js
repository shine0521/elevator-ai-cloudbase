// pages/monthly.js — 月调度列表 + 新建 + 继续填写
// GET  /api/mobile/monthly        → {data:[{id, dispatch_no, dispatch_month, host_name, overview(JSON), topics(JSON), attendees(JSON), summary, status}]}
// POST /api/mobile/monthly        → api.createMonthly（新建）
// PUT  /api/mobile/monthly/:id    → api.submitMonthly（继续填写并推进 completed）
(function () {
  window.Pages = window.Pages || {};

  window.Pages.monthly = {
    name: 'monthly',
    props: ['query'],

    data: function () {
      var now = new Date();
      var defMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      var user = (typeof Store !== 'undefined' && Store.getUser) ? (Store.getUser() || {}) : {};
      return {
        loading: true,
        list: [],
        showForm: false,
        formMode: 'create', // 'create' | 'continue'
        submitting: false,
        editItem: null,
        form: {
          dispatchMonth: defMonth,
          hostId: user.id || '',
          hostName: user.name || user.username || '',
          topics: '',
          attendees: '',
          summary: ''
        }
      };
    },

    computed: {
      showLoading: function () { return this.loading && this.list.length === 0; },
      showEmpty: function () { return !this.loading && this.list.length === 0; },
      showCreate: function () { return this.formMode === 'create'; },
      showContinue: function () { return this.formMode === 'continue'; },

      // 顶部统计概览（overview 可能为 JSON 字符串）
      summary: function () {
        var sum = { checkCount: 0, hazardCount: 0, accidentCount: 0, rectifyRate: 0, _n: 0 };
        var self = this;
        this.list.forEach(function (it) {
          var o = self.overviewObj(it);
          sum.checkCount += Number(o.checkCount || 0);
          sum.hazardCount += Number(o.hazardCount || 0);
          sum.accidentCount += Number(o.accidentCount || 0);
          if (o.rectifyRate != null && o.rectifyRate !== '') {
            sum.rectifyRate += Number(o.rectifyRate || 0);
            sum._n++;
          }
        });
        if (sum._n > 0) sum.rectifyRate = Math.round(sum.rectifyRate / sum._n);
        return sum;
      },

      // 出席人员：输入框按行解析
      attendeeList: function () {
        return this.form.attendees.split('\n')
          .map(function (s) { return s.trim(); })
          .filter(function (s) { return !!s; });
      }
    },

    mounted: function () { this.load(); },

    methods: {
      load: function () {
        var self = this;
        self.loading = true;
        api.getMonthly({ page: 1, pageSize: 50 })
          .then(function (d) { self.list = (d && d.data) || []; })
          .catch(function () { if (!self._gone) utils.toast('加载失败'); })
          .finally(function () { if (!self._gone) self.loading = false; });
      },

      // overview 统一解析
      overviewObj: function (item) {
        var o = item.overview;
        if (typeof o === 'string') {
          try { o = JSON.parse(o); } catch (e) { o = {}; }
        }
        return o || {};
      },

      itemKey: function (item, i) {
        return (item && item.id != null) ? String(item.id) : ('row_' + i);
      },

      monthText: function (item) {
        return item.dispatch_month || item.dispatchMonth || (item.dispatch_no || ('月调度 #' + item.id));
      },
      hostText: function (item) { return item.host_name || item.hostName || '—'; },
      topicsText: function (item) {
        var t = item.topics;
        if (Array.isArray(t) && t.length) return t.join('、');
        if (typeof t === 'string' && t.trim()) return t.trim();
        var s = item.summary;
        if (typeof s === 'string' && s.trim()) return s.trim();
        return '';
      },
      isCompleted: function (item) {
        return String(item.status || '').toLowerCase() === 'completed';
      },

      statusText: function (s) {
        var m = { draft: '草稿', completed: '已完成', submitted: '已提交' };
        return m[String(s || '').toLowerCase()] || (s || '草稿');
      },
      statusStyle: function (s) {
        return { background: utils.statusColor(s), color: '#fff' };
      },

      // === 新建 ===
      openForm: function () {
        this.formMode = 'create';
        this.editItem = null;
        this.form.dispatchMonth = this.form.dispatchMonth || '';
        this.form.topics = '';
        this.form.attendees = '';
        this.form.summary = '';
        this.showForm = true;
      },

      // === 继续填写（非 completed 项） ===
      openContinue: function (item) {
        this.formMode = 'continue';
        this.editItem = item;
        var attendees = item.attendees;
        if (Array.isArray(attendees)) attendees = attendees.join('\n');
        else if (typeof attendees !== 'string') attendees = '';
        this.form.dispatchMonth = this.monthText(item);
        this.form.topics = this.topicsText(item);
        this.form.attendees = attendees || '';
        this.form.summary = item.summary || '';
        this.showForm = true;
      },

      closeForm: function () { this.showForm = false; },

      submit: function () {
        var self = this;
        if (this.formMode === 'create') {
          if (!this.form.dispatchMonth) { utils.toast('请选择调度月份'); return; }
          if (!this.form.topics.trim()) { utils.toast('请填写主要议题'); return; }
          this.submitting = true;
          api.createMonthly({
            dispatchMonth: this.form.dispatchMonth,
            hostId: this.form.hostId,
            hostName: this.form.hostName,
            topics: this.form.topics,
            attendees: this.attendeeList,
            summary: this.form.summary
          }).then(function () {
            utils.toast('创建成功');
            self.closeForm();
            self.load();
          }).catch(function (e) {
            if (!self._gone) utils.toast((e && e.message) || '创建失败');
          }).finally(function () { if (!self._gone) self.submitting = false; });
        } else {
          if (!this.editItem) { this.closeForm(); return; }
          this.submitting = true;
          api.submitMonthly(this.editItem.id, {
            attendees: this.attendeeList,
            summary: this.form.summary,
            status: 'completed'
          }).then(function () {
            utils.toast('已提交完成');
            self.closeForm();
            self.load();
          }).catch(function (e) {
            if (!self._gone) utils.toast((e && e.message) || '提交失败');
          }).finally(function () { if (!self._gone) self.submitting = false; });
        }
      },

      goDetail: function (item) {
        // 月调度详情复用 weekly_form 查看模式（无独立路由）
        if (item && item.id) utils.go('/weekly_form?id=' + item.id);
      }
    },

    unmounted: function () { this._gone = true; },

    template: [
      '<div class="page">',

        // === 顶部统计概览 ===
        '<div style="display:flex;gap:8px;padding:12px">',
          '<div style="flex:1;background:#fff;border-radius:8px;padding:10px;text-align:center">',
            '<div style="font-size:18px;font-weight:700">{{summary.checkCount}}</div>',
            '<div class="muted" style="font-size:12px">本月检查</div>',
          '</div>',
          '<div style="flex:1;background:#fff;border-radius:8px;padding:10px;text-align:center">',
            '<div style="font-size:18px;font-weight:700">{{summary.hazardCount}}</div>',
            '<div class="muted" style="font-size:12px">隐患数</div>',
          '</div>',
          '<div style="flex:1;background:#fff;border-radius:8px;padding:10px;text-align:center">',
            '<div style="font-size:18px;font-weight:700;color:var(--success)">{{summary.rectifyRate}}%</div>',
            '<div class="muted" style="font-size:12px">整改率</div>',
          '</div>',
          '<div style="flex:1;background:#fff;border-radius:8px;padding:10px;text-align:center">',
            '<div style="font-size:18px;font-weight:700">{{summary.accidentCount}}</div>',
            '<div class="muted" style="font-size:12px">事故数</div>',
          '</div>',
        '</div>',

        // === 加载态 ===
        '<div v-if="showLoading" class="empty-state"><div class="empty-title">加载中...</div></div>',

        // === 空状态 ===
        '<div v-else-if="showEmpty" class="empty-state">',
          '<div class="empty-icon">📅</div>',
          '<div class="empty-title">暂无月调度</div>',
          '<div class="empty-sub">点击右下角按钮新建月调度</div>',
        '</div>',

        // === 列表 ===
        '<div v-else style="padding:0 12px 80px">',
          '<div v-for="(item, i) in list" v-bind:key="itemKey(item, i)" class="card" style="margin-bottom:10px">',
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">',
              '<div style="flex:1;min-width:0">',
                '<div style="font-size:14px;font-weight:600;margin-bottom:4px">{{monthText(item)}}</div>',
                '<div class="muted" style="font-size:12px">主持人：{{hostText(item)}}</div>',
              '</div>',
              '<span class="badge" v-bind:style="statusStyle(item.status)">{{statusText(item.status)}}</span>',
            '</div>',
            '<div v-if="topicsText(item)" class="muted" style="font-size:12px;margin-top:6px">{{topicsText(item)}}</div>',
            '<div style="margin-top:10px">',
              '<button class="btn-ghost btn-sm" v-on:click="goDetail(item)">查看</button>',
              '<button v-if="!isCompleted(item)" class="btn-primary btn-sm" style="margin-left:8px" v-on:click="openContinue(item)">继续填写</button>',
            '</div>',
          '</div>',
        '</div>',

        // === 新建 FAB ===
        '<button class="fab-pill" v-on:click="openForm"><span style="font-size:18px">＋</span> 新建月调度</button>',

        // === 创建 / 继续填写弹层 ===
        '<div class="mask" v-if="showForm" v-on:click.self="closeForm">',
          '<div style="position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:14px 14px 0 0;padding:16px;max-height:80vh;overflow:auto">',
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
              '<div style="font-size:16px;font-weight:600">{{ showCreate ? "新建月调度" : "继续填写月调度" }}</div>',
              '<button class="btn-ghost btn-sm" v-on:click="closeForm">✕</button>',
            '</div>',

            '<div class="form-item" style="margin-bottom:12px">',
              '<div class="form-label">调度月份</div>',
              '<input type="month" v-model="form.dispatchMonth" class="fi-input" v-bind:disabled="showContinue">',
            '</div>',
            '<div class="form-item" style="margin-bottom:12px">',
              '<div class="form-label">主持人</div>',
              '<input class="fi-input" v-model="form.hostName" v-bind:disabled="showContinue">',
            '</div>',
            '<div class="form-item" style="margin-bottom:12px">',
              '<div class="form-label">主要议题</div>',
              '<textarea v-model="form.topics" class="fi-input" style="min-height:64px" v-bind:disabled="showContinue" placeholder="请输入本次会议主要议题"></textarea>',
            '</div>',
            '<div class="form-item" style="margin-bottom:12px">',
              '<div class="form-label">出席人员（每行一个）</div>',
              '<textarea v-model="form.attendees" class="fi-input" style="min-height:64px" placeholder="每行一个姓名"></textarea>',
            '</div>',
            '<div class="form-item" style="margin-bottom:14px">',
              '<div class="form-label">会议纪要</div>',
              '<textarea v-model="form.summary" class="fi-input" style="min-height:64px" placeholder="请输入会议纪要"></textarea>',
            '</div>',

            '<div class="btn-row">',
              '<button class="btn-ghost" v-on:click="closeForm">取消</button>',
              '<button class="btn-primary" v-on:click="submit" v-bind:disabled="submitting">',
                '{{ submitting ? "提交中..." : (showCreate ? "创建" : "提交完成") }}',
              '</button>',
            '</div>',
          '</div>',
        '</div>',

      '</div>'
    ].join('')
  };
})();
