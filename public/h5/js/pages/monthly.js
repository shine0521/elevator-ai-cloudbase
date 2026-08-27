// pages/monthly.js — 月调度列表 M-07
// GET /api/mobile/monthly → {data:[{id, dispatch_no, dispatch_month, host_name, status, overview}]}
// POST /api/mobile/monthly → {dispatchMonth, hostId, topics, attendees, summary}
// overview JSON: {checkCount, hazardCount, rectifyRate, accidentCount}
window.Pages = window.Pages || {};
window.Pages.monthly = {
  template: `

  <div class="page">
    <!-- 顶部统计概览 -->
    <div class="mk-overview">
      <div class="mk-cell"><div class="mk-num">{{summary.checkCount}}</div><div class="mk-label">本月检查次数</div></div>
      <div class="mk-cell"><div class="mk-num">{{summary.hazardCount}}</div><div class="mk-label">隐患数</div></div>
      <div class="mk-cell"><div class="mk-num green">{{summary.rectifyRate}}%</div><div class="mk-label">整改率</div></div>
      <div class="mk-cell"><div class="mk-num">{{summary.accidentCount}}</div><div class="mk-label">事故数</div></div>
    </div>

    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>
    <div v-else-if="list.length === 0" class="empty-state">
      <div class="empty-title">暂无月调度</div>
      <div class="empty-sub">点击右下角按钮新建月调度</div>
    </div>

    <div v-else style="padding:0 12px 80px">
      <div v-for="item in list" :key="item.id" class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:600;margin-bottom:4px">{{monthText(item)}}</div>
            <div class="mk-host">主持人：{{hostText(item)}}</div>
            <div class="mk-time" v-if="hasMeeting(item)">{{meetingText(item)}}</div>
          </div>
          <span class="status-badge" :style="statusStyle(item)">{{statusText(item.status)}}</span>
        </div>
        <div class="mk-topics" v-if="topicsText(item)">{{topicsText(item)}}</div>
      </div>
    </div>

    <!-- 新建 FAB -->
    <button class="fab-pill" @click="openForm"><span style="font-size:18px">＋</span> 新建月调度</button>

    <!-- 创建表单弹层 -->
    <div class="mk-mask" v-if="showForm" @click.self="closeForm">
      <div class="mk-sheet">
        <div class="mk-sheet-head">
          <div class="mk-sheet-title">新建月调度</div>
          <button class="mk-close" @click="closeForm">✕</button>
        </div>

        <div class="form-item" style="margin-bottom:14px">
          <div class="form-label">调度月份</div>
          <input type="month" v-model="form.dispatchMonth" class="fi-input">
        </div>
        <div class="form-item" style="margin-bottom:14px">
          <div class="form-label">主持人</div>
          <input class="fi-input" :value="form.hostName" disabled>
        </div>
        <div class="form-item" style="margin-bottom:14px">
          <div class="form-label">主要议题</div>
          <textarea v-model="form.topics" class="mk-textarea" placeholder="请输入本次会议主要议题"></textarea>
        </div>
        <div class="form-item" style="margin-bottom:14px">
          <div class="form-label">会议纪要</div>
          <textarea v-model="form.summary" class="mk-textarea" placeholder="请输入会议纪要"></textarea>
        </div>
        <div class="form-item" style="margin-bottom:14px">
          <div class="form-label">出席人员</div>
          <textarea v-model="form.attendees" class="mk-textarea" placeholder="每行一个姓名"></textarea>
        </div>

        <div class="btn-row">
          <button class="btn-ghost" @click="closeForm">取消</button>
          <button class="btn-primary" @click="submit" :disabled="submitting">
            {{submitting ? '提交中...' : '提交'}}
          </button>
        </div>
      </div>
    </div>
  </div>
  `,
  data() {
    const now = new Date();
    const defMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const user = (Store.state && Store.state.user) || {};
    return {
      list: [],
      loading: true,
      showForm: false,
      submitting: false,
      form: {
        dispatchMonth: defMonth,
        hostId: user.id || '',
        hostName: user.name || user.username || '',
        topics: '',
        summary: '',
        attendees: ''
      }
    };
  },
  computed: {
    summary() {
      const sum = { checkCount: 0, hazardCount: 0, accidentCount: 0, rectifyRate: 0, _n: 0 };
      const self = this;
      this.list.forEach(function (it) {
        const o = self.overviewObj(it);
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
    attendeeList() {
      return this.form.attendees
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
    }
  },
  mounted() {
    this.load();
  },
  methods: {
    // overview 可能为 JSON 字符串或对象，统一解析
    overviewObj(item) {
      let o = item.overview;
      if (typeof o === 'string') {
        try { o = JSON.parse(o); } catch (e) { o = {}; }
      }
      return o || {};
    },
    async load() {
      this.loading = true;
      try {
        const d = await api.get('/api/mobile/monthly', { page: 1, size: 50 });
        this.list = d.data || d || [];
      } catch (e) {
        if (!this._gone) utils.toast((e && e.message) || '网络错误');
      } finally {
        if (!this._gone) this.loading = false;
      }
    },
    monthText(item) {
      return item.dispatch_month || item.dispatchMonth || (item.dispatch_no || ('月调度 #' + item.id));
    },
    hostText(item) {
      return item.host_name || item.hostName || '—';
    },
    meetingText(item) {
      return item.meeting_time || item.dispatch_date || item.meetingTime || '';
    },
    hasMeeting(item) {
      return !!this.meetingText(item);
    },
    topicsText(item) {
      const t = item.topics;
      if (Array.isArray(t) && t.length) return t.join('、');
      if (typeof t === 'string' && t.trim()) return t.trim();
      const s = item.summary;
      if (typeof s === 'string' && s.trim()) return s.trim();
      return '';
    },
    statusText(s) {
      const m = { draft: '草稿', completed: '已完成', submitted: '已提交' };
      return m[String(s || '').toLowerCase()] || (s || '草稿');
    },
    statusColor(s) {
      const m = { draft: '#999', completed: '#52c41a', submitted: '#1677ff' };
      return m[String(s || '').toLowerCase()] || '#999';
    },
    statusStyle(item) {
      return { background: this.statusColor(item.status) };
    },
    openForm() {
      this.showForm = true;
    },
    closeForm() {
      this.showForm = false;
    },
    async submit() {
      if (!this.form.dispatchMonth) { utils.toast('请选择调度月份'); return; }
      if (!this.form.topics.trim()) { utils.toast('请填写主要议题'); return; }
      this.submitting = true;
      try {
        await api.post('/api/mobile/monthly', {
          dispatchMonth: this.form.dispatchMonth,
          hostId: this.form.hostId,
          hostName: this.form.hostName,
          topics: this.form.topics,
          attendees: this.attendeeList,
          summary: this.form.summary
        });
        utils.toast('创建成功');
        this.closeForm();
        this.load();
      } catch (e) {
        if (!this._gone) utils.toast((e && e.message) || '创建失败');
      } finally {
        if (!this._gone) this.submitting = false;
      }
    }
  },
  unmounted() { this._gone = true; }
};
