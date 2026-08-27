// pages/daily_detail.js — 日管控检查详情
// GET /api/mobile/inspections/:id
// 设备信息卡 + 检查概览（进度/失败项）+ 检查项列表 + 底部状态按钮
// 所有逻辑收敛到 computed / methods，模板中不含 && || > < 等运算符
(function () {
  window.Pages = window.Pages || {};
  window.Pages.daily_detail = {
    template: [
      '<div class="page daily-detail">',

        // 加载态
        '<div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>',

        // 空状态
        '<div v-else-if="isEmpty" class="empty-state"><span class="muted">未找到检查记录</span></div>',

        // 内容
        '<div v-else class="page-pad">',

          // 设备信息卡
          '<div class="device-card">',
            '<div class="dc-name">{{data.device_name}}</div>',
            '<div class="dc-code">注册代码：{{data.device_code}}</div>',
            '<div class="dc-info"><span>📍 {{data.location}}</span></div>',
          '</div>',

          // 检查概览
          '<div class="card">',
            '<div class="flex flex-between" style="align-items:center;">',
              '<div>',
                '<div class="text-sm muted">检查编号</div>',
                '<div class="text-lg fw600">{{data.inspection_no}}</div>',
              '</div>',
              '<span class="badge" v-bind:class="statusClass(data.status)">{{statusLabel(data.status)}}</span>',
            '</div>',

            '<div class="divider"></div>',

            '<div class="info-row"><span class="info-label">检查日期</span><span class="info-val">{{data.check_date}}</span></div>',
            '<div class="info-row"><span class="info-label">检查人</span><span class="info-val">{{data.inspector_name}}</span></div>',

            // 通过进度
            '<div class="mt10">',
              '<div class="flex flex-between text-sm">',
                '<span class="muted">通过进度</span>',
                '<span class="fw600 text-primary">{{passCount}} / {{totalCount}}（{{passRate}}）</span>',
              '</div>',
              '<div class="progress"><div class="progress-bar" v-bind:style="progressStyle"></div></div>',
            '</div>',

            // 失败项数（红色高亮）
            '<div class="flex flex-between mt10">',
              '<span class="text-sm muted">失败项数</span>',
              '<span class="fw700" v-bind:style="failedCountStyle">{{failedCount}} 项</span>',
            '</div>',
          '</div>',

          // 检查项列表
          '<div class="card">',
            '<div class="card-title">检查项（{{totalCount}}）</div>',
            '<div v-for="(item, idx) in items" v-bind:key="idx" class="check-item-block">',
              '<div class="flex flex-between">',
                '<div class="fw600">{{item.item_name}}</div>',
                '<span class="badge" v-bind:class="typeClass(item.item_type)">{{typeLabel(item.item_type)}}</span>',
              '</div>',

              '<div class="mt6 flex flex-between" style="align-items:flex-start;">',
                '<div v-if="isPhoto(item)" class="photo-row">',
                  '<img v-for="(p, pi) in item.photos" v-bind:key="pi" v-bind:src="p" class="photo-thumb" />',
                  '<span v-if="noPhotos(item)" class="muted text-sm">无照片</span>',
                '</div>',
                '<div v-else class="text-sm">{{valueText(item)}}</div>',
                '<span class="badge" v-bind:class="resultClass(item.compare_result)">{{resultText(item.compare_result)}}</span>',
              '</div>',

              '<div v-if="hasFailReason(item)" class="text-red text-sm mt6">失败原因：{{item.fail_reason}}</div>',
            '</div>',
          '</div>',

          // 底部状态按钮
          '<div class="act-bar" v-if="showActions">',
            '<button v-if="isEditable" class="ab-btn ab-primary" v-on:click="goEdit">编辑</button>',
            '<button v-if="isSubmittable" class="ab-btn ab-green" v-on:click="goSubmit">提交</button>',
            '<button v-if="showApproveFlow" class="ab-btn ab-blue" v-on:click="goApprove">审批流</button>',
          '</div>',

        '</div>',
      '</div>'
    ].join(''),

    data: function () {
      return {
        id: null,
        data: null,
        items: [],
        loading: true
      };
    },

    computed: {
      isEmpty: function () {
        return !this.loading && !this.data;
      },

      isEditable: function () {
        return this.data && (this.data.status === 'pending' || this.data.status === 'ongoing');
      },
      isSubmittable: function () {
        return this.data && this.data.status === 'ongoing';
      },
      showApproveFlow: function () {
        return this.data && (this.data.status === 'submitted' || this.data.status === 'reviewed');
      },
      showActions: function () {
        return this.isEditable || this.isSubmittable || this.showApproveFlow;
      },

      failedCount: function () {
        return this.items ? this.items.filter(function (i) { return i.compare_result === 'fail'; }).length : 0;
      },
      passCount: function () {
        return this.items ? this.items.filter(function (i) { return i.compare_result === 'pass'; }).length : 0;
      },
      totalCount: function () {
        return this.items ? this.items.length : 0;
      },
      passRate: function () {
        var t = this.totalCount;
        if (!t) return '0%';
        return Math.round(this.passCount / t * 100) + '%';
      },
      progressStyle: function () {
        return 'width:' + this.passRate + ';background-color:var(--green);';
      },
      failedCountStyle: function () {
        return this.failedCount > 0 ? 'color:var(--red);' : 'color:var(--muted);';
      }
    },

    mounted: function () {
      this.id = this.query ? this.query.id : null;
      if (this.id) this.load();
      else { this.loading = false; }
      window.__ptrFn = this.load.bind(this);
    },

    beforeUnmount: function () {
      window.__ptrFn = null;
    },

    methods: {
      load: function () {
        var self = this;
        if (!self.id) { self.loading = false; return Promise.resolve(); }
        self.loading = true;
        return api.get('/api/mobile/inspections/' + self.id)
          .then(function (d) {
            self.data = d.data || d;
            self.items = (self.data && self.data.items) || [];
          })
          .catch(function () { utils.toast('加载失败'); })
          .finally(function () { self.loading = false; });
      },

      goEdit: function () {
        utils.go('/daily_form?id=' + this.id);
      },
      goSubmit: function () {
        var self = this;
        if (!this.id) return;
        api.post('/api/mobile/inspections/' + this.id + '/submit', {})
          .then(function () { utils.toast('已提交'); self.load(); })
          .catch(function (e) { utils.toast((e && e.message) || '提交失败'); });
      },
      goApprove: function () {
        utils.go('/approval');
      },

      // === 渲染辅助 ===
      isPhoto: function (item) {
        return item && item.item_type === 'photo';
      },
      noPhotos: function (item) {
        return !(item && item.photos && item.photos.length);
      },
      hasFailReason: function (item) {
        return item && item.compare_result === 'fail' && !!item.fail_reason;
      },
      valueText: function (item) {
        if (item && item.input_value !== undefined && item.input_value !== null && item.input_value !== '') {
          return String(item.input_value);
        }
        return '未填写';
      },

      typeLabel: function (t) {
        var m = { input: '文本', select: '选择', photo: '拍照', number: '数值', sign: '签名', checkbox: '勾选' };
        return m[t] || t || '其他';
      },
      typeClass: function (t) {
        var m = {
          input: 'badge-blue', select: 'badge-green', photo: 'badge-orange',
          number: 'badge-blue', sign: 'badge-orange', checkbox: 'badge-gray'
        };
        return m[t] || 'badge-gray';
      },

      resultText: function (r) {
        var m = { pass: '✓ 通过', fail: '✗ 不通过', pending: '待检' };
        return m[r] || r || '-';
      },
      resultClass: function (r) {
        var m = { pass: 'badge-green', fail: 'badge-red', pending: 'badge-gray' };
        return m[r] || 'badge-gray';
      },

      statusLabel: function (s) {
        var key = String(s || '').toLowerCase();
        var m = {
          pending: '待检', ongoing: '进行中', submitted: '已提交', reviewed: '已审核',
          rectifying: '整改中', verifying: '待验收', closed: '已关闭'
        };
        return m[key] || s || '';
      },
      statusClass: function (s) {
        var key = String(s || '').toLowerCase();
        var m = {
          pending: 'badge-orange', ongoing: 'badge-blue', submitted: 'badge-blue',
          reviewed: 'badge-green', rectifying: 'badge-blue', verifying: 'badge-orange',
          closed: 'badge-gray'
        };
        return m[key] || 'badge-gray';
      }
    }
  };
})();
