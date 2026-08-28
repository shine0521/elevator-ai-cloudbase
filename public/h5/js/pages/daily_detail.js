// pages/daily_detail.js — 日管控详情 M-08
// GET /api/mobile/inspections/:id → {device_*, status, signature, items:[...]}
// items 每项：item_name, item_category, input_value, standard_value, compare_result, ai_confidence, review_required, fail_reason, photos
// 结果用 .rr.ok / .rr.ng / .rr.mb 展示
(function () {
  window.Pages = window.Pages || {};

  window.Pages.daily_detail = {
    name: 'daily_detail',
    props: ['query'],

    data: function () {
      return {
        loading: true,
        error: false,
        insp: null,
        items: []
      };
    },

    computed: {
      hasId: function () { return !!(this.query && this.query.id); },

      deviceName: function () {
        var i = this.insp;
        if (!i) return '';
        return i.device_name || i.device_code || ('设备 #' + i.device_id);
      },

      deviceCode: function () {
        return this.insp ? (this.insp.device_code || '') : '';
      },

      location: function () {
        return this.insp ? (this.insp.location || '') : '';
      },

      deviceType: function () {
        return this.insp ? (this.insp.device_type || '') : '';
      },

      showLoading: function () { return this.loading; },
      showError:   function () { return this.error && !this.insp; },
      showEmpty:   function () { return !this.loading && !this.insp && !this.error; },
      showDetail:  function () { return !this.loading && this.insp; }
    },

    mounted: function () {
      var id = this.query && this.query.id;
      if (!id) {
        this.loading = false;
        return;
      }
      this.load();
    },

    methods: {
      load: function () {
        var self = this;
        self.loading = true;
        self.error = false;
        api.getInspection(self.query.id).then(function (d) {
          var data = d.data || d;
          self.insp = data;
          self.items = data.items || [];
          self.loading = false;
        }).catch(function () {
          self.error = true;
          self.loading = false;
        });
      },

      fmt: function (iso) { return utils.formatDate(iso); },
      fmtTime: function (iso) { return utils.formatDateTime(iso); },

      statusText: function (s) { return utils.statusLabel(s || ''); },
      statusColor: function (s) { return utils.statusColor(s || ''); },
      statusStyle: function (s) {
        return { background: s ? utils.statusColor(s) : 'var(--text-3)', color: '#fff' };
      },

      // 每项比对结果 class
      resultClass: function (r) {
        if (r === 'pass')   return 'ok';
        if (r === 'fail')   return 'ng';
        return 'mb';
      },

      resultLabel: function (r) {
        if (r === 'pass') return '通过';
        if (r === 'fail') return '异常';
        return '待判';
      },

      resultIcon: function (r) {
        if (r === 'pass') return '✅';
        if (r === 'fail') return '❌';
        return '❓';
      },

      inputVal: function (it) {
        return it.input_value || it.inputValue ? String(it.input_value || it.inputValue) : '—';
      },

      stdVal: function (it) {
        return it.standard_value || it.standardValue ? String(it.standard_value || it.standardValue) : '—';
      },

      hasPhotos: function (it) {
        var p = it.photos;
        if (!p) return false;
        if (typeof p === 'string') {
          try { p = JSON.parse(p); } catch (e) { return false; }
        }
        return Array.isArray(p) && p.length > 0;
      },

      photoCount: function (it) {
        var p = it.photos;
        if (!p) return 0;
        if (typeof p === 'string') {
          try { p = JSON.parse(p); } catch (e) { return 0; }
        }
        return Array.isArray(p) ? p.length : 0;
      },

      hasFailReason: function (it) {
        return !!(it.fail_reason || it.failReason);
      },

      failReason: function (it) {
        return it.fail_reason || it.failReason || '';
      },

      aiConf: function (it) {
        var c = it.ai_confidence != null ? it.ai_confidence : it.aiConfidence;
        if (c == null) return null;
        return Math.round(Number(c) * 100);
      },

      reviewReq: function (it) {
        return !!(it.review_required || it.reviewRequired);
      },

      itemKey: function (it, i) {
        return it && it.id != null ? String(it.id) : ('item_' + i);
      },

      // 统计
      passCount: function () {
        var n = 0;
        this.items.forEach(function (it) {
          if ((it.compare_result || '').toLowerCase() === 'pass') n++;
        });
        return n;
      },

      failCount: function () {
        var n = 0;
        this.items.forEach(function (it) {
          if ((it.compare_result || '').toLowerCase() === 'fail') n++;
        });
        return n;
      },

      pendingCount: function () {
        var n = 0;
        this.items.forEach(function (it) {
          var r = it.compare_result || '';
          if (r !== 'pass' && r !== 'fail') n++;
        });
        return n;
      },

      goList: function () { utils.go('/daily'); },
      goForm: function () {
        if (this.insp) utils.go('/daily_form?id=' + this.insp.id);
      }
    },

    template: [
      '<div class="page">',

        // ===== 加载态 =====
        '<div v-if="showLoading" style="text-align:center;padding:60px 0">',
          '<div style="font-size:36px">⏳</div>',
          '<div style="color:var(--text-3);margin-top:10px">加载中...</div>',
        '</div>',

        // ===== 无 ID =====
        '<div v-else-if="!hasId" style="text-align:center;padding:60px 0">',
          '<div style="font-size:48px">🔍</div>',
          '<div style="margin-top:10px">缺少记录 ID</div>',
          '<button class="btn-ghost btn-sm" style="margin-top:14px;width:auto;display:inline-block;padding:8px 20px" @click="goList">返回列表</button>',
        '</div>',

        // ===== 错误态 =====
        '<div v-else-if="showError" style="text-align:center;padding:60px 0">',
          '<div style="font-size:36px">⚠️</div>',
          '<div style="margin-top:10px">加载失败</div>',
          '<button class="btn-ghost btn-sm" style="margin-top:14px;width:auto;display:inline-block;padding:8px 20px" @click="load">重试</button>',
        '</div>',

        // ===== 详情 =====
        '<template v-else-if="showDetail">',

          // === 设备信息卡 ===
          '<div class="card" style="margin-bottom:12px">',
            '<div class="card-h">',
              '<div class="card-t">🏠 {{deviceName}}</div>',
              '<span class="tag" :style="statusStyle(insp.status)">{{statusText(insp.status)}}</span>',
            '</div>',
            '<div class="detail-row" v-if="deviceCode">',
              '<div class="dk">设备编号</div><div class="dv">{{deviceCode}}</div>',
            '</div>',
            '<div class="detail-row" v-if="deviceType">',
              '<div class="dk">设备类型</div><div class="dv">{{deviceType}}</div>',
            '</div>',
            '<div class="detail-row" v-if="location">',
              '<div class="dk">安装位置</div><div class="dv">{{location}}</div>',
            '</div>',
            '<div class="detail-row" v-if="insp.check_date">',
              '<div class="dk">检查日期</div><div class="dv">{{fmt(insp.check_date)}}</div>',
            '</div>',
            '<div class="detail-row" v-if="insp.inspector_name">',
              '<div class="dk">检查人</div><div class="dv">{{insp.inspector_name}}</div>',
            '</div>',
            '<div class="detail-row" v-if="insp.signature">',
              '<div class="dk">签名</div><div class="dv">{{insp.signature}}</div>',
            '</div>',
            '<div class="detail-row" v-if="insp.submitted_at">',
              '<div class="dk">提交时间</div><div class="dv">{{fmtTime(insp.submitted_at)}}</div>',
            '</div>',
            '<div class="detail-row" v-if="insp.reviewed_at">',
              '<div class="dk">复核时间</div><div class="dv">{{fmtTime(insp.reviewed_at)}}</div>',
            '</div>',
          '</div>',

          // === 统计概览 ===
          '<div class="stats" style="margin-bottom:12px">',
            '<div class="stat" style="cursor:default">',
              '<div class="si b-i">📋</div>',
              '<div><div class="sv">{{items.length}}</div><div class="sl">总项数</div></div>',
            '</div>',
            '<div class="stat" style="cursor:default">',
              '<div class="si b-s">✅</div>',
              '<div><div class="sv" style="color:var(--success)">{{passCount}}</div><div class="sl">通过</div></div>',
            '</div>',
            '<div class="stat" style="cursor:default">',
              '<div class="si b-d">❌</div>',
              '<div><div class="sv" style="color:var(--danger)">{{failCount}}</div><div class="sl">异常</div></div>',
            '</div>',
            '<div class="stat" style="cursor:default">',
              '<div class="si b-i">❓</div>',
              '<div><div class="sv">{{pendingCount}}</div><div class="sl">待判</div></div>',
            '</div>',
          '</div>',

          // === 检查项列表 ===
          '<div style="font-size:14px;font-weight:600;margin:0 0 10px;padding:0 2px">📌 检查项 ({{items.length}})</div>',

          '<div v-for="(it,i) in items" :key="itemKey(it,i)" :class="\'rr \' + resultClass(it.compare_result)">',
            '<div class="ri" v-html="resultIcon(it.compare_result)"></div>',
            '<div class="rc">',
              '<div class="rn">{{it.item_name || (\'检查项 \' + (i+1))}}</div>',
              '<div class="rd" v-if="it.item_category">{{it.item_category}}</div>',
              '<div class="rd">实测值：{{inputVal(it)}}</div>',
              '<div class="rd" v-if="stdVal(it) !== \'—\'">标准值：{{stdVal(it)}}</div>',
              '<div v-if="hasFailReason(it)" class="rd" style="color:var(--danger);margin-top:4px">⚠ {{failReason(it)}}</div>',
              '<div v-if="hasPhotos(it)" class="rd" style="margin-top:4px">📷 照片 {{photoCount(it)}} 张</div>',
              '<div v-if="aiConf(it) !== null" class="rd" style="margin-top:4px">AI 置信度：{{aiConf(it)}}%</div>',
              '<div v-if="reviewReq(it)" style="margin-top:4px">',
                '<span class="tag tag-pending" style="font-size:11px">需人工复核</span>',
              '</div>',
            '</div>',
          '</div>',

          // 无检查项时
          '<div v-if="items.length === 0" style="text-align:center;padding:30px 0;color:var(--text-3)">暂无检查项数据</div>',

          // === 操作按钮 ===
          '<div style="padding:16px 0 24px">',
            '<button class="btn-ghost" @click="goList">返回列表</button>',
          '</div>',

        '</template>',

      '</div>'
    ].join('')
  };
})();
