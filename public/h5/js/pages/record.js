// pages/record.js — 检查记录查询（综合：日管控 / 周排查 / 隐患 组合）
// 顶部筛选（类型 + 时间范围 + 状态）→ 组合查询三端 API → 按类型分组展示
// 所有逻辑收敛到 computed / methods，模板中不含 && || > < 等运算符
(function () {
  window.Pages = window.Pages || {};
  window.Pages.record = {
    template: [
      '<div class="record-page">',

        // === 筛选卡片 ===
        '<div class="card">',
          '<div class="form-item">',
            '<div class="form-label">检查类型</div>',
            '<select class="fi-input" v-model="type">',
              '<option v-for="o in typeOptions" v-bind:key="o.value" v-bind:value="o.value">{{o.label}}</option>',
            '</select>',
          '</div>',

          '<div class="form-item">',
            '<div class="form-label">时间范围</div>',
            '<div class="flex gap8">',
              '<input class="fi-input" type="date" v-model="startDate" />',
              '<span class="muted" style="align-self:center;">至</span>',
              '<input class="fi-input" type="date" v-model="endDate" />',
            '</div>',
          '</div>',

          '<div class="form-item">',
            '<div class="form-label">状态</div>',
            '<select class="fi-input" v-model="status">',
              '<option v-for="o in statusOptions" v-bind:key="o.value" v-bind:value="o.value">{{o.label}}</option>',
            '</select>',
          '</div>',

          '<button class="btn-primary" v-on:click="doQuery">查询</button>',
        '</div>',

        // === 加载态 ===
        '<div v-if="loading" class="loading-row"><div class="spinner"></div>查询中...</div>',

        // === 空状态 ===
        '<div v-if="showEmpty" class="empty-state">',
          '<div class="empty-icon">🔍</div>',
          '<div class="empty-title">未找到记录</div>',
          '<div class="empty-sub">调整筛选条件后重试</div>',
        '</div>',

        // === 按类型分组结果 ===
        '<div v-if="showGroups">',
          '<div v-for="g in groups" v-bind:key="g.type" class="record-group">',
            '<div class="record-group-title" v-bind:style="groupTitleStyle(g)">{{g.label}}（{{g.items.length}}）</div>',
            '<div class="list">',
              '<div v-for="item in g.items" v-bind:key="itemKey(item)" class="list-item" v-on:click="goDetail(item)">',
                '<div class="li-body">',
                  '<div class="li-title">{{rowTitle(item)}}</div>',
                  '<div class="li-sub">{{rowSub(item)}}</div>',
                '</div>',
                '<div class="li-extra">',
                  '<span v-if="isHazardItem(item)" class="badge" v-bind:style="riskBadgeStyle(item)">{{riskLabel(item)}}</span>',
                  '<span class="badge" v-bind:class="statusClass(item.status)">{{statusLabel(item.status)}}</span>',
                '</div>',
                '<div class="li-arrow">›</div>',
              '</div>',
            '</div>',
          '</div>',
        '</div>',

      '</div>'
    ].join(''),

    data: function () {
      return {
        type: 'all',       // all | daily | weekly | hazard
        startDate: '',
        endDate: '',
        status: 'all',
        loading: true,
        list: [],
        typeOptions: [
          { value: 'all', label: '全部' },
          { value: 'daily', label: '日管控' },
          { value: 'weekly', label: '周排查' },
          { value: 'hazard', label: '隐患' }
        ],
        statusOptions: [
          { value: 'all', label: '全部' },
          { value: 'pending', label: '待检' },
          { value: 'ongoing', label: '进行中' },
          { value: 'submitted', label: '已提交' },
          { value: 'reviewed', label: '已审核' },
          { value: 'rectifying', label: '整改中' },
          { value: 'verifying', label: '待验收' },
          { value: 'closed', label: '已关闭' }
        ]
      };
    },

    computed: {
      // 按类型分组成可渲染结构
      groups: function () {
        var self = this;
        var order = ['daily', 'weekly', 'hazard'];
        return order.map(function (t) {
          return {
            type: t,
            label: self.typeLabel(t),
            color: self.typeColor(t),
            items: self.list.filter(function (i) { return i._type === t; })
          };
        }).filter(function (g) { return g.items.length > 0; });
      },
      showGroups: function () {
        return this.groups.length > 0;
      },
      showEmpty: function () {
        return !this.loading && this.groups.length === 0;
      }
    },

    mounted: function () {
      this.load();
      window.__ptrFn = this.load.bind(this);
    },

    beforeUnmount: function () {
      window.__ptrFn = null;
    },

    methods: {
      // 查询按钮
      doQuery: function () {
        this.load();
      },

      // 组合查询：按所选类型调用对应 API，合并后做日期/状态筛选并排序
      load: function () {
        var self = this;
        self.loading = true;

        var calls = [];
        if (self.type === 'all' || self.type === 'daily') calls.push(self.fetchType('daily'));
        if (self.type === 'all' || self.type === 'weekly') calls.push(self.fetchType('weekly'));
        if (self.type === 'all' || self.type === 'hazard') calls.push(self.fetchType('hazard'));

        return Promise.all(calls)
          .then(function (results) {
            var merged = [];
            results.forEach(function (arr) { merged = merged.concat(arr); });

            merged = merged.filter(function (item) {
              if (self.status !== 'all' && item.status !== self.status) return false;
              var d = self.itemDate(item);
              if (self.startDate && d && d < self.startDate) return false;
              if (self.endDate && d && d > self.endDate) return false;
              return true;
            });

            merged.sort(function (a, b) {
              return self.itemDate(b).localeCompare(self.itemDate(a));
            });

            self.list = merged;
          })
          .catch(function () { utils.toast('查询失败'); })
          .finally(function () { self.loading = false; });
      },

      fetchType: function (type) {
        var path = type === 'daily' ? '/api/mobile/inspections'
          : type === 'weekly' ? '/api/mobile/weekly'
          : '/api/mobile/hazards';
        return api.get(path, { page: 1, size: 200 })
          .then(function (d) {
            var arr = (d && d.data) || [];
            return arr.map(function (it) {
              var o = {};
              for (var k in it) { if (Object.prototype.hasOwnProperty.call(it, k)) o[k] = it[k]; }
              o._type = type;
              return o;
            });
          });
      },

      // 归一化日期（yyyy-mm-dd），用于时间范围筛选与排序
      itemDate: function (item) {
        var raw = item.check_date || item.find_time || item.created_at || item.inspection_date || item.create_time || '';
        return String(raw).substring(0, 10);
      },

      goDetail: function (item) {
        var id = item.id;
        if (item._type === 'daily') utils.go('/daily_detail?id=' + id);
        else if (item._type === 'weekly') utils.go('/weekly_form?id=' + id);
        else utils.go('/hazard_form?id=' + id + '&mode=view');
      },

      itemKey: function (item) {
        return (item._type || 'x') + '_' + item.id;
      },

      isHazardItem: function (item) {
        return item && item._type === 'hazard';
      },

      typeLabel: function (t) {
        var m = { all: '全部', daily: '日管控', weekly: '周排查', hazard: '隐患排查' };
        return m[t] || t;
      },
      typeColor: function (t) {
        var m = { daily: '#1677ff', weekly: '#52c41a', hazard: '#fa8c16' };
        return m[t] || '#999';
      },
      groupTitleStyle: function (g) {
        return {
          color: g.color,
          borderLeft: '3px solid ' + g.color,
          paddingLeft: '8px',
          fontWeight: '600',
          fontSize: '15px',
          margin: '12px 0 6px'
        };
      },

      rowTitle: function (item) {
        if (item._type === 'hazard') return this.hazardTitle(item);
        return item.device_name || item.inspection_no || ('记录 #' + item.id);
      },
      rowSub: function (item) {
        var parts = [];
        if (item._type === 'weekly') {
          if (item.week_no) parts.push('第' + item.week_no + '周');
          if (item.location) parts.push(item.location);
          if (item.inspector_name) parts.push(item.inspector_name);
        } else if (item._type === 'hazard') {
          if (item.find_time) parts.push(utils.formatTime(item.find_time));
          else if (item.created_at) parts.push(utils.formatTime(item.created_at));
          if (item.location) parts.push(item.location);
        } else {
          if (item.check_date) parts.push(item.check_date);
          if (item.location) parts.push(item.location);
          if (item.inspector_name) parts.push(item.inspector_name);
        }
        return parts.join(' | ');
      },
      hazardTitle: function (item) {
        var s = item.hazard_desc || item.hazard_type || item.device_name || ('隐患 #' + item.id);
        if (s.length > 24) s = s.substring(0, 24) + '…';
        return s;
      },

      riskLabel: function (item) {
        return utils.levelLabel(item.risk_level);
      },
      riskBadgeStyle: function (item) {
        return { background: utils.levelColor(item.risk_level), color: '#fff' };
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
