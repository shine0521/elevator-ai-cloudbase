// record.js — 电梯安全管理 AI 系统 H5 检查记录综合查询
// 依据 H5_FULL_REWRITE_CONTRACT_v2.md 重写
// segment 切换：日管控 / 周排查 / 月调度；.list 列表；点进 detail 路由
// 铁律：v-model 仅用于 input/select；模板内无裸 && || < >；禁止 SVG（用 emoji）；根节点 .page
window.Pages = window.Pages || {};

window.Pages.record = {
  name: 'record',
  props: ['query'],

  data: function () {
    return {
      tab: 'daily',     // daily | weekly | monthly
      loading: true,
      error: null,
      list: []
    };
  },

  computed: {
    showEmpty: function () {
      return !this.loading && !this.error && this.list.length === 0;
    },
    showError: function () {
      return !this.loading && !!this.error;
    }
  },

  methods: {
    go: function (p) { utils.go(p); },

    switchTab: function (t) {
      this.tab = t;
      this.load();
    },

    load: function () {
      var self = this;
      self.loading = true;
      self.error = null;
      self.list = [];

      if (self.tab === 'daily') self.fetchInspections();
      else if (self.tab === 'weekly') self.fetchWeekly();
      else self.fetchMonthly();
    },

    fetchInspections: function () {
      var self = this;
      api.getInspections({ page: 1, pageSize: 200 }).then(function (d) {
        var arr = (d && (d.data || d)) || [];
        self.list = arr.map(function (it) {
          return {
            _type: 'daily',
            id: it.id,
            no: it.inspection_no || '',
            device: it.device_name || '',
            code: it.device_code || '',
            location: it.location || '',
            inspector: it.inspector_name || '',
            status: it.status || '',
            date: it.check_date || it.created_at || ''
          };
        });
      }).catch(function () {
        self.error = '加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    fetchWeekly: function () {
      var self = this;
      api.getWeekly({ page: 1, pageSize: 200 }).then(function (d) {
        var arr = (d && (d.data || d)) || [];
        self.list = arr.map(function (it) {
          return {
            _type: 'weekly',
            id: it.id,
            no: it.inspection_no || '',
            device: it.device_name || '',
            code: it.device_code || '',
            week: it.week_no || '',
            location: it.location || '',
            inspector: it.inspector_name || '',
            status: it.status || '',
            date: it.created_at || ''
          };
        });
      }).catch(function () {
        self.error = '加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    fetchMonthly: function () {
      var self = this;
      api.getMonthly({ page: 1, pageSize: 200 }).then(function (d) {
        var arr = (d && (d.data || d)) || [];
        self.list = arr.map(function (it) {
          return {
            _type: 'monthly',
            id: it.id,
            no: it.dispatch_no || '',
            device: it.host_name || '',
            month: it.dispatch_month || '',
            overview: it.overview || '',
            status: it.status || '',
            date: it.created_at || ''
          };
        });
      }).catch(function () {
        self.error = '加载失败，请重试';
      }).finally(function () {
        self.loading = false;
      });
    },

    itemKey: function (it) {
      return (it._type || 'x') + '_' + (it.id || 0);
    },

    itemSub: function (it) {
      var parts = [];
      if (it.no) parts.push(it.no);
      if (it._type === 'weekly' && it.week) parts.push('第' + it.week + '周');
      if (it._type === 'monthly' && it.month) parts.push(it.month);
      if (it.location) parts.push(it.location);
      if (it.inspector) parts.push(it.inspector);
      if (it.date) parts.push(it.date.substring(0, 10));
      return parts.join(' · ') || '无详情';
    },

    statusLabel: function (s) {
      var m = {
        pending: '待检',
        ongoing: '进行中',
        submitted: '已提交',
        reviewed: '已审核',
        draft: '草稿',
        completed: '已完成',
        rectifying: '整改中',
        verifying: '待验收',
        closed: '已关闭',
        open: '未整改'
      };
      return m[String(s || '').toLowerCase()] || s || '待检';
    },

    statusClass: function (s) {
      var m = {
        pending: 'tag-pending',
        ongoing: 'tag-info',
        submitted: 'tag-info',
        reviewed: 'tag-ok',
        draft: 'tag-draft',
        completed: 'tag-completed',
        rectifying: 'tag-mb',
        verifying: 'tag-mb',
        closed: 'tag-draft',
        open: 'tag-pending'
      };
      return m[String(s || '').toLowerCase()] || 'tag-draft';
    },

    goDetail: function (it) {
      if (it._type === 'daily') {
        utils.go('/daily_detail?id=' + it.id);
      } else if (it._type === 'weekly') {
        utils.toast('可在周排查列表查看详情');
        utils.go('/weekly');
      } else if (it._type === 'monthly') {
        utils.go('/monthly?id=' + it.id);
      }
    }
  },

  mounted: function () { this.load(); },

  template: '\
<div class="page">\
  <div style="font-size:16px;font-weight:600;margin-bottom:12px;">检查记录</div>\
  <!-- 分段切换 -->\
  <div class="seg">\
    <button :class="{ on: tab === \'daily\' }" @click="switchTab(\'daily\')">日管控</button>\
    <button :class="{ on: tab === \'weekly\' }" @click="switchTab(\'weekly\')">周排查</button>\
    <button :class="{ on: tab === \'monthly\' }" @click="switchTab(\'monthly\')">月调度</button>\
  </div>\
  <!-- 加载态 -->\
  <div v-if="loading" class="loading-wrap">\
    <div class="spinner"></div>\
    <div>加载中...</div>\
  </div>\
  <!-- 错误态 -->\
  <div v-else-if="showError" class="error-wrap">\
    <div>⚠️</div>\
    <div>{{ error }}</div>\
    <button class="btn-primary" style="margin-top:14px;width:auto;padding:9px 20px;" @click="load">重 试</button>\
  </div>\
  <!-- 空态 -->\
  <div v-else-if="showEmpty" class="empty-wrap">\
    <div class="em-ic">📭</div>\
    <div class="em-tip">暂无记录</div>\
  </div>\
  <!-- 列表 -->\
  <div v-else class="list">\
    <div v-for="item in list" :key="itemKey(item)" class="list-item" @click="goDetail(item)">\
      <div class="li-icon" style="font-size:20px;">\
        <template v-if="item._type === \'daily\'">📋</template>\
        <template v-else-if="item._type === \'weekly\'">📆</template>\
        <template v-else>📝</template>\
      </div>\
      <div class="li-body">\
        <div class="li-title">{{ item.device || \'未命名\' }}</div>\
        <div class="li-sub">{{ itemSub(item) }}</div>\
      </div>\
      <div style="flex-shrink:0;margin-left:8px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;">\
        <span class="tag" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>\
      </div>\
      <div class="li-arrow" style="margin-left:6px;">›</div>\
    </div>\
  </div>\
</div>'
};
