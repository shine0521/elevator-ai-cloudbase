// pages/monthly_form.js — 月调度纪要 M-19
// 创建：POST /api/mobile/monthly {dispatchMonth,hostId,hostName,overview,topics,summary}
// 更新：PUT /api/mobile/monthly/:id {attendees,meetingPhotos,summary,status}
// 选设备/月份 → 议题（topics JSON 数组，可增删）、参会人（attendees JSON）、纪要 summary
// query.id 存在则编辑模式
(function () {
  window.Pages = window.Pages || {};

  window.Pages.monthly_form = {
    name: 'monthly_form',
    props: ['query'],

    data: function () {
      var now = new Date();
      var pad = function (n) { return String(n).padStart(2, '0'); };
      var defMonth = now.getFullYear() + '-' + pad(now.getMonth() + 1);
      var user = (Store && Store.getUser) ? (Store.getUser() || {}) : {};
      return {
        loading: true,
        submitting: false,
        editId: null,
        viewMode: false,

        // 设备搜索
        deviceKeyword: '',
        deviceList: [],
        deviceLoading: false,

        // 表单
        dispatchMonth: defMonth,
        hostId: user.id || '',
        hostName: user.name || user.username || '',
        selectedDevice: null,

        // 议题数组（每项 {text}）
        topics: [],

        // 参会人数组（每项 {name}）
        attendees: [],

        // 议题/参会人输入
        topicInput: '',
        attendeeInput: '',

        // 概述/纪要
        overview: '',
        summary: ''
      };
    },

    computed: {
      isEdit: function () { return !!this.editId; },
      isCreate: function () { return !this.editId; },

      canSubmit: function () {
        return this.dispatchMonth.trim().length > 0 &&
               this.hostName.trim().length > 0 &&
               !this.submitting;
      },

      topicsCount: function () { return this.topics.length; },
      attendeesCount: function () { return this.attendees.length; },
      topicsEmpty: function () { return this.topics.length === 0 && !this.viewMode; },
      attendeesEmpty: function () { return this.attendees.length === 0 && !this.viewMode; }
    },

    mounted: function () {
      var self = this;
      var id = this.query && this.query.id;
      if (id) {
        self.editId = id;
        self.loadDetail();
      } else {
        self.loading = false;
      }
    },

    watch: {
      'query.id': function (nv) {
        var id = nv || null;
        if (String(id || '') !== String(this.editId || '')) {
          this.editId = id;
          this.reset();
          if (id) this.loadDetail();
          else this.loading = false;
        }
      }
    },

    methods: {
      reset: function () {
        var now = new Date();
        var pad = function (n) { return String(n).padStart(2, '0'); };
        var user = (Store && Store.getUser) ? (Store.getUser() || {}) : {};
        this.dispatchMonth = now.getFullYear() + '-' + pad(now.getMonth() + 1);
        this.hostId = user.id || '';
        this.hostName = user.name || user.username || '';
        this.selectedDevice = null;
        this.topics = [];
        this.attendees = [];
        this.overview = '';
        this.summary = '';
        this.deviceList = [];
        this.viewMode = false;
      },

      // === 设备搜索 ===
      searchDevice: function () {
        var self = this;
        self.deviceLoading = true;
        api.get('/api/devices', { search: self.deviceKeyword, page: 1, size: 50 })
          .then(function (d) { self.deviceList = (d && d.data) || d || []; })
          .catch(function () { self.deviceList = []; })
          .finally(function () { self.deviceLoading = false; });
      },

      selectDevice: function (dev) {
        this.selectedDevice = dev;
        this.deviceList = [];
      },

      clearDevice: function () {
        this.selectedDevice = null;
      },

      // === 议题增删 ===
      addTopic: function () {
        var t = this.topicInput.trim();
        if (!t) { utils.toast('请输入议题内容'); return; }
        this.topics.push({ text: t });
        this.topicInput = '';
      },

      removeTopic: function (idx) {
        this.topics.splice(idx, 1);
      },

      // === 参会人增删 ===
      addAttendee: function () {
        var t = this.attendeeInput.trim();
        if (!t) { utils.toast('请输入参会人姓名'); return; }
        this.attendees.push({ name: t });
        this.attendeeInput = '';
      },

      removeAttendee: function (idx) {
        this.attendees.splice(idx, 1);
      },

      // === 加载详情 ===
      loadDetail: function () {
        var self = this;
        self.loading = true;
        api.getMonthlyDetail(self.editId).then(function (d) {
          var data = d.data || d;
          self.dispatchMonth = data.dispatch_month || data.dispatchMonth || self.dispatchMonth;
          self.hostId = data.host_id || data.hostId || '';
          self.hostName = data.host_name || data.hostName || '';
          if (data.device_id) {
            self.selectedDevice = {
              id: data.device_id,
              device_name: data.device_name,
              device_code: data.device_code
            };
          }

          // topics 解析
          var t = data.topics;
          if (typeof t === 'string' && t.trim()) {
            try { t = JSON.parse(t); } catch (e) {}
          }
          self.topics = Array.isArray(t) ? t.map(function (s) { return { text: String(s) }; }) : [];

          // attendees 解析
          var a = data.attendees;
          if (typeof a === 'string' && a.trim()) {
            try { a = JSON.parse(a); } catch (e) {}
          }
          self.attendees = Array.isArray(a) ? a.map(function (s) { return { name: String(s) }; }) : [];

          // overview 解析
          var o = data.overview;
          if (typeof o === 'string' && o.trim()) {
            try { o = JSON.parse(o); } catch (e) {}
          }
          if (typeof o === 'object' && o !== null) {
            self.overview = [
              o.checkCount != null ? '本月检查 ' + o.checkCount + ' 次' : '',
              o.hazardCount != null ? '隐患 ' + o.hazardCount + ' 项' : '',
              o.rectifyRate != null ? '整改率 ' + o.rectifyRate + '%' : '',
              o.accidentCount != null ? '事故 ' + o.accidentCount + ' 次' : ''
            ].filter(Boolean).join('；');
          } else {
            self.overview = typeof o === 'string' ? o : '';
          }

          self.summary = data.summary || '';

          // 只读：completed 已完成状态
          self.viewMode = String(data.status || '').toLowerCase() === 'completed';
          self.loading = false;
        }).catch(function () {
          self.loading = false;
          utils.toast('加载失败');
        });
      },

      // === 提交 ===
      doSubmit: function () {
        var self = this;
        if (self.submitting) return;
        if (!self.canSubmit) return;

        self.submitting = true;

        var topicsArr = self.topics.map(function (t) { return t.text; });
        var attendeesArr = self.attendees.map(function (a) { return a.name; });

        if (self.isCreate) {
          // 概述 JSON（前端生成摘要）
          var overviewObj = null;
          if (self.overview.trim()) {
            overviewObj = { summary: self.overview };
          }

          api.createMonthly({
            dispatchMonth: self.dispatchMonth,
            hostId: self.hostId || null,
            hostName: self.hostName,
            overview: overviewObj,
            topics: topicsArr,
            summary: self.summary
          }).then(function (res) {
            var id = res.id || (res.data && res.data.id);
            if (!id) throw new Error('创建失败');
            utils.toast('创建成功');
            setTimeout(function () { utils.go('/monthly_form?id=' + id); }, 900);
          }).catch(function (e) {
            self.submitting = false;
            utils.toast((e && e.message) || '创建失败');
          });
        } else {
          // 更新
          api.submitMonthly(self.editId, {
            attendees: attendeesArr,
            summary: self.summary,
            status: 'completed'
          }).then(function () {
            utils.toast('提交成功');
            setTimeout(function () { utils.go('/monthly'); }, 900);
          }).catch(function (e) {
            self.submitting = false;
            utils.toast((e && e.message) || '提交失败');
          });
        }
      },

      goBack: function () { utils.go('/monthly'); }
    },

    unmounted: function () { this._gone = true; },

    template: [
      '<div class="page">',

        // ===== 加载态 =====
        '<div v-if="loading" style="text-align:center;padding:40px 0">',
          '<div style="font-size:36px">⏳</div>',
          '<div style="color:var(--text-3);margin-top:8px">加载中...</div>',
        '</div>',

        '<template v-else>',

          // ===== 只读提示 =====
          '<div v-if="viewMode" class="card" style="margin-bottom:12px">',
            '<span class="tag tag-info">该月调度已提交完成，当前为只读查看</span>',
          '</div>',

          // ===== 基本信息 =====
          '<div class="card" style="margin-bottom:12px">',
            '<div class="card-h"><div class="card-t">📆 调度信息</div></div>',

            '<div class="form-item">',
              '<div class="form-label">调度月份 <span class="req">*</span></div>',
              '<input type="month" :value="dispatchMonth" @input="e=>dispatchMonth = e.target.value" class="fi-input" :disabled="viewMode || isEdit">',
            '</div>',

            '<div class="form-item">',
              '<div class="form-label">主持人 <span class="req">*</span></div>',
              '<input v-model="hostName" class="fi-input" placeholder="请输入主持人姓名" :disabled="viewMode">',
            '</div>',

            // 设备搜索
            '<div class="form-item">',
              '<div class="form-label">关联设备（可选）</div>',
              '<div style="display:flex;gap:8px;margin-bottom:8px" v-if="!viewMode">',
                '<input v-model="deviceKeyword" class="fi-input" style="flex:1" placeholder="搜索设备名称/编号" @keyup.enter="searchDevice">',
                '<button class="btn-ghost" style="width:auto;padding:0 12px;flex:none" @click="searchDevice">搜索</button>',
              '</div>',
              '<div v-if="selectedDevice" style="background:#f0f9eb;border:1px solid #c2e7b0;border-radius:8px;padding:10px 12px;margin-bottom:6px">',
                '<div style="font-size:13px;font-weight:600">✅ {{selectedDevice.device_name}}</div>',
                '<div style="font-size:12px;color:var(--text-3)">{{selectedDevice.device_code}}</div>',
                '<button v-if="!viewMode" class="btn-ghost btn-sm" style="margin-top:6px;width:auto;display:inline-block;padding:4px 12px" @click="clearDevice">清除</button>',
              '</div>',
              '<div v-if="deviceLoading" style="text-align:center;padding:8px;color:var(--text-3)">搜索中...</div>',
              '<div v-for="dev in deviceList" :key="dev.id" class="list-item" style="padding:8px 12px;border:1px solid var(--border-light);border-radius:6px;margin-bottom:4px;cursor:pointer" @click="selectDevice(dev)">',
                '<div style="font-size:12px;font-weight:500">{{dev.device_name}}</div>',
                '<div style="font-size:11px;color:var(--text-3)">{{dev.device_code}} · {{dev.location}}</div>',
              '</div>',
            '</div>',
          '</div>',

          // ===== 议题 =====
          '<div class="card" style="margin-bottom:12px">',
            '<div class="card-h">',
              '<div class="card-t">📝 会议议题 <span style="color:var(--text-3);font-weight:400">({{topicsCount}})</span></div>',
            '</div>',

            // 已有议题
            '<div v-for="(t,i) in topics" :key="i" style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-light)">',
              '<div style="flex:1;font-size:13px;line-height:1.5">{{i+1}}. {{t.text}}</div>',
              '<button v-if="!viewMode" class="btn-ghost btn-sm" style="width:auto;padding:2px 10px;flex:none;font-size:12px" @click="removeTopic(i)">✖</button>',
            '</div>',

            // 添加议题
            '<div v-if="!viewMode" style="display:flex;gap:8px;margin-top:10px">',
              '<input v-model="topicInput" class="fi-input" style="flex:1" placeholder="输入议题，按回车添加" @keyup.enter="addTopic">',
              '<button class="btn-primary" style="width:auto;padding:0 14px;flex:none" @click="addTopic">+</button>',
            '</div>',

            '<div v-if="topicsEmpty" style="color:var(--text-3);font-size:12px;padding:6px 0">暂无议题，请添加</div>',
          '</div>',

          // ===== 参会人 =====
          '<div class="card" style="margin-bottom:12px">',
            '<div class="card-h">',
              '<div class="card-t">👥 参会人员 <span style="color:var(--text-3);font-weight:400">({{attendeesCount}})</span></div>',
            '</div>',

            // 已有参会人
            '<div v-for="(a,i) in attendees" :key="i" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-light)">',
              '<span style="font-size:20px">👤</span>',
              '<div style="flex:1;font-size:13px">{{a.name}}</div>',
              '<button v-if="!viewMode" class="btn-ghost btn-sm" style="width:auto;padding:2px 10px;flex:none;font-size:12px" @click="removeAttendee(i)">✖</button>',
            '</div>',

            // 添加参会人
            '<div v-if="!viewMode" style="display:flex;gap:8px;margin-top:10px">',
              '<input v-model="attendeeInput" class="fi-input" style="flex:1" placeholder="输入姓名，按回车添加" @keyup.enter="addAttendee">',
              '<button class="btn-primary" style="width:auto;padding:0 14px;flex:none" @click="addAttendee">+</button>',
            '</div>',

            '<div v-if="attendeesEmpty" style="color:var(--text-3);font-size:12px;padding:6px 0">暂无参会人，请添加</div>',
          '</div>',

          // ===== 概述 =====
          '<div class="card" style="margin-bottom:12px">',
            '<div class="card-h"><div class="card-t">📊 月度概述</div></div>',
            '<div class="form-item">',
              '<div class="form-label">概述（本月检查/隐患/整改情况摘要）</div>',
              '<textarea v-model="overview" class="fi-input" style="min-height:70px;resize:vertical" :disabled="viewMode" placeholder="例如：本月共完成日管控检查 12 次，发现隐患 3 项，整改率 100%，无安全事故。"></textarea>',
            '</div>',
          '</div>',

          // ===== 会议纪要 =====
          '<div class="card" style="margin-bottom:12px">',
            '<div class="card-h"><div class="card-t">📜 会议纪要</div></div>',
            '<div class="form-item">',
              '<div class="form-label">详细记录</div>',
              '<textarea v-model="summary" class="fi-input" style="min-height:120px;resize:vertical" :disabled="viewMode" placeholder="请输入本次月调度会议详细纪要内容..."></textarea>',
            '</div>',
          '</div>',

          // ===== 操作按钮 =====
          '<div style="padding:0 0 24px">',
            '<div class="btn-row">',
              '<button class="btn-ghost" @click="goBack">返回</button>',
              '<button v-if="!viewMode" class="btn-primary" @click="doSubmit" :disabled="!canSubmit || submitting">',
                '{{submitting ? (isCreate ? "创建中..." : "提交中...") : (isCreate ? "创建月调度" : "提交完成")}}',
              '</button>',
            '</div>',
          '</div>',

        '</template>',

      '</div>'
    ].join('')
  };
})();
