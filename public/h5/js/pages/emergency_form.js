// 应急事件上报 / 处置 → H5 (Vue3 global build)
// 新建: POST /api/mobile/emergencies                       { deviceId, alarmType, alarmSource, trappedCount, location, description, emergencyContact }
// 更新: PUT  /api/mobile/emergencies/:id { status }
// 日志: POST /api/mobile/emergencies/:id/logs              { stepSeq, stepName, action, photos }
// 模式A 新建（无 id）；模式B 处置（带 id）
// Vue 模板安全：逻辑全部在 computed / methods，模板内无 && || 裸& > <
window.Pages = window.Pages || {};
window.Pages.emergency_form = {
  template: `
  <div class="page ef">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>

    <template v-else>
      <!-- ========== 模式A：新建 ========== -->
      <template v-if="isNew">
        <div class="card">
          <div class="card-title">选择设备</div>
          <div class="flex gap8">
            <input class="fi-input" style="flex:1" v-model="searchKw" placeholder="设备名称 / 编号 / 注册代码" @keyup.enter="searchDevice" />
            <button class="btn-query" @click="searchDevice" :disabled="searching">搜索</button>
          </div>
          <button class="btn-scan" @click="scanDevice">📷 扫码选择设备</button>
          <div class="dev-pick" v-if="devList.length">
            <div v-for="d in devList" :key="d.id" class="dev-pick-item" :class="pickClass(d)" @click="pickDevice(d)">
              <div class="dp-name">{{ d.device_name }} <span class="muted" style="font-weight:400">{{ d.device_code }}</span></div>
              <div class="dp-sub muted">{{ d.location }}</div>
            </div>
          </div>
          <div class="pick-done" v-if="form.deviceId">已选设备：{{ selectedDevLabel }}</div>
        </div>

        <div class="card">
          <div class="card-title">报警信息</div>
          <div class="form-item">
            <label class="form-label">报警类型 <span class="req">*</span></label>
            <select class="fi-input" v-model="form.alarmType">
              <option value="">请选择报警类型</option>
              <option v-for="t in alarmTypes" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div class="form-item">
            <label class="form-label">报警来源</label>
            <select class="fi-input" v-model="form.alarmSource">
              <option v-for="s in alarmSources" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="form-item">
            <label class="form-label">被困人数</label>
            <input class="fi-input" type="number" min="0" max="99" v-model="form.trappedCount" placeholder="0" />
          </div>
          <div class="form-item">
            <label class="form-label">现场位置</label>
            <div class="flex gap8">
              <input class="fi-input" style="flex:1" v-model="form.location" placeholder="点击定位或手动输入位置" />
              <button class="btn-query" @click="locate" :disabled="locating">定位</button>
            </div>
            <div class="f-readonly">{{ gpsText }}</div>
          </div>
          <div class="form-item">
            <label class="form-label">现场描述 <span class="req">*</span></label>
            <textarea class="fi-input" v-model="form.description" placeholder="请描述事件情况（至少 5 字）"></textarea>
          </div>
          <div class="form-item">
            <label class="form-label">紧急联系人</label>
            <input class="fi-input" v-model="form.emergencyContact" placeholder="姓名 / 电话" />
          </div>
        </div>

        <button class="btn-primary" @click="doSubmit" :disabled="submitting">{{ submitText }}</button>
      </template>

      <!-- ========== 模式B：查看 / 处置 ========== -->
      <template v-else>
        <div class="device-card">
          <div class="dc-code">{{ eventNo }}</div>
          <div class="dc-info">
            <span class="status-badge" :class="badgeClass(data.status)">{{ statusLabel(data.status) }}</span>
            <span>{{ orDash(data.alarm_type) }}</span>
            <span v-if="data.alarm_source">{{ data.alarm_source }}</span>
          </div>
          <div class="dc-info">{{ orDash(data.location) }}</div>
        </div>

        <div class="card">
          <div class="card-title">事件信息</div>
          <div class="info-row"><span class="info-label">关联设备</span><span class="info-val">{{ devText }}</span></div>
          <div class="info-row"><span class="info-label">报警时间</span><span class="info-val">{{ alarmTime }}</span></div>
          <div class="info-row"><span class="info-label">被困人数</span><span class="info-val">{{ trappedText }}</span></div>
          <div class="info-row"><span class="info-label">结束时间</span><span class="info-val">{{ endTimeText }}</span></div>
          <div class="info-row"><span class="info-label">事件描述</span><span class="info-val">{{ orDash(data.description) }}</span></div>
        </div>

        <!-- 处置阶段进度条 -->
        <div class="card">
          <div class="card-title">处置阶段</div>
          <div class="prog">
            <template v-for="(s,i) in stageList" :key="s.key">
              <div v-if="showConnector(i)" class="prog-connector" :class="connectorClass(i)"></div>
              <div class="prog-step" :class="stageCls(i)" @click="setActiveStage(i)">
                <div class="prog-dot"></div>
                <div class="prog-label">{{ s.label }}</div>
              </div>
            </template>
          </div>

          <!-- 当前阶段操作面板 -->
          <div v-if="canOperate" class="stage-panel">
            <div class="stage-title">{{ currentStageLabel }}</div>
            <div class="form-item">
              <label class="form-label">处置动作</label>
              <textarea class="fi-input" v-model="actionText" placeholder="记录本阶段处置动作"></textarea>
            </div>
            <div class="form-item">
              <label class="form-label">处置照片</label>
              <div class="photo-row">
                <div v-for="(p,idx) in stepPhotos" :key="idx" class="photo-wrap">
                  <img class="photo-thumb" :src="p" />
                  <div class="photo-del" @click="removeStepPhoto(idx)">×</div>
                </div>
                <label v-if="canAddStepPhoto" class="photo-add">＋
                  <input type="file" accept="image/*" multiple class="photo-input" @change="onPhotoChange($event,'stepPhotos')" />
                </label>
              </div>
            </div>
            <button class="btn-primary" @click="advanceStep" :disabled="submitting">{{ advanceBtnText }}</button>
          </div>
          <div v-else class="done-tip">✅ {{ doneTip }}</div>
        </div>

        <!-- 处置日志 -->
        <div class="card">
          <div class="card-title">处置日志</div>
          <div v-if="logsEmpty" class="empty-sub">暂无处置记录</div>
          <div v-else class="timeline">
            <div v-for="lg in logs" :key="lg.id" class="tl-item">
              <div class="tl-dot"></div>
              <div class="tl-body">
                <div class="tl-title">{{ lg.step_name }}</div>
                <div class="tl-meta">{{ logTime(lg) }}</div>
                <div v-if="lg.action" class="tl-comment">{{ lg.action }}</div>
                <div class="photo-row" v-if="logHasPhotos(lg)">
                  <img v-for="(p,i) in logPhotos(lg)" :key="i" class="photo-thumb" :src="p" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

  </div>
  `,
  data: function () {
    return {
      loading: true,
      submitting: false,
      searching: false,
      locating: false,
      // 新建表单
      searchKw: '',
      devList: [],
      form: {
        id: '',
        deviceId: '',
        deviceName: '',
        deviceCode: '',
        alarmType: '',
        alarmSource: '人工',
        trappedCount: 0,
        location: '',
        description: '',
        emergencyContact: ''
      },
      gpsText: '',
      // 处置（查看模式）
      data: null,
      logs: [],
      activeStage: 0,
      actionText: '',
      stepPhotos: [],
      stageList: [
        { key: 'responding', label: '响应' },
        { key: 'processing', label: '处置' },
        { key: 'recovering', label: '恢复' },
        { key: 'completed', label: '完成' }
      ],
      alarmTypes: ['困人', '坠落', '剪切', '火灾', '扶梯伤人', '停电', '自然灾害', '其他'],
      alarmSources: ['人工', '自动']
    };
  },
  computed: {
    isNew: function () {
      return !this.query || !this.query.id;
    },
    currentStepIndex: function () {
      var m = { responding: 0, processing: 1, recovering: 2, completed: 3 };
      var s = this.data ? this.data.status : '';
      return m[s] != null ? m[s] : 0;
    },
    nextStatus: function () {
      var m = { responding: 'processing', processing: 'recovering', recovering: 'completed' };
      var s = this.data ? this.data.status : '';
      return m[s] || s;
    },
    stepLabel: function () {
      var m = { responding: '响应', processing: '处置', recovering: '恢复', completed: '完成' };
      return function (s) { return m[s] || ''; };
    },
    // ===== 派生展示 =====
    submitText: function () {
      return this.submitting ? '提交中...' : '提交应急事件';
    },
    selectedDevLabel: function () {
      if (!this.form.deviceId) return '';
      return this.form.deviceName + (this.form.deviceCode ? (' ' + this.form.deviceCode) : '');
    },
    currentStageLabel: function () {
      var s = this.stageList[this.currentStepIndex];
      return s ? this.stepLabel(s.key) : '';
    },
    canOperate: function () {
      var s = this.data ? this.data.status : '';
      return s === 'responding' || s === 'processing' || s === 'recovering';
    },
    advanceBtnText: function () {
      return this.nextStatus === 'completed' ? '完成救援' : '确认进入下一阶段';
    },
    canAddStepPhoto: function () {
      return this.stepPhotos.length < 6;
    },
    logsEmpty: function () {
      return this.logs.length === 0;
    },
    eventNo: function () {
      if (!this.data) return '';
      return this.data.event_no || ('事件 #' + this.data.id);
    },
    devText: function () {
      if (!this.data) return '';
      var parts = [];
      if (this.data.device_code) parts.push(this.data.device_code);
      if (this.data.device_name) parts.push(this.data.device_name);
      return parts.length ? parts.join(' ') : '未关联设备';
    },
    alarmTime: function () {
      if (!this.data) return '';
      return utils.formatDateTime(this.data.start_time || this.data.created_at);
    },
    endTimeText: function () {
      if (!this.data || !this.data.end_time) return '—';
      return utils.formatDateTime(this.data.end_time);
    },
    trappedText: function () {
      if (!this.data) return '';
      var n = parseInt(this.data.trapped_count, 10) || 0;
      return n > 0 ? (n + ' 人被困') : '无被困';
    },
    doneTip: function () {
      if (!this.data) return '';
      var s = this.data.status;
      if (s === 'completed') return '救援已完成';
      if (s === 'cancelled') return '事件已取消';
      return '处置结束';
    }
  },
  mounted: function () {
    var id = (this.query && this.query.id) || '';
    if (!id) {
      this.loading = false;
      return;
    }
    this.form.id = id;
    this.load(id);
  },
  methods: {
    // ===== 模式A：设备选择 =====
    searchDevice: async function () {
      var kw = String(this.searchKw || '').trim();
      if (!kw) { utils.toast('请输入搜索关键字'); return; }
      this.searching = true;
      try {
        var d = await api.get('/api/devices', { search: kw, page: 1, size: 20 });
        this.devList = (d && d.data) ? d.data : [];
        if (!this.devList.length) utils.toast('未找到匹配设备');
      } catch (e) {
        utils.toast((e && e.message) || '搜索失败');
      } finally {
        this.searching = false;
      }
    },
    scanDevice: async function () {
      try {
        var code = await utils.scanCode();
        var d = await api.scanDevice(code);
        var dev = (d && d.device_code) ? d : (d.data || d);
        if (dev && dev.id) {
          this.pickDevice(dev);
        } else {
          utils.toast('未找到该设备');
        }
      } catch (e) {
        if (e && e.message === 'cancelled') return;
        utils.toast((e && e.message) || '扫码失败');
      }
    },
    pickDevice: function (d) {
      this.form.deviceId = d.id;
      this.form.deviceName = d.device_name || d.name || '';
      this.form.deviceCode = d.device_code || d.code || '';
      if (!this.form.location && d.location) this.form.location = d.location;
    },
    pickClass: function (d) {
      return String(d.id) === String(this.form.deviceId) ? 'on' : '';
    },
    locate: async function () {
      this.locating = true;
      this.gpsText = '定位中...';
      try {
        var loc = await utils.getLocation();
        var txt = loc.lat.toFixed(6) + ',' + loc.lng.toFixed(6);
        this.form.location = 'GPS:' + txt;
        this.gpsText = '定位成功：' + txt;
      } catch (e) {
        this.gpsText = '定位失败，请手动输入位置';
      } finally {
        this.locating = false;
      }
    },

    // ===== 模式A：提交 =====
    doSubmit: async function () {
      if (this.submitting) return;
      if (!this.form.deviceId) { utils.toast('请先选择设备'); return; }
      if (!this.form.alarmType) { utils.toast('请选择报警类型'); return; }
      if (String(this.form.description || '').trim().length < 5) { utils.toast('请填写事件描述（至少5字）'); return; }
      this.submitting = true;
      try {
        var payload = {
          deviceId: this.form.deviceId,
          alarmType: this.form.alarmType,
          alarmSource: this.form.alarmSource,
          trappedCount: parseInt(this.form.trappedCount, 10) || 0,
          location: this.form.location,
          description: this.form.description,
          emergencyContact: this.form.emergencyContact
        };
        await api.post('/api/mobile/emergencies', payload);
        utils.toast('事件上报成功');
        utils.go('/emergency');
      } catch (e) {
        utils.toast((e && e.message) || '上报失败');
      } finally {
        this.submitting = false;
      }
    },

    // ===== 模式B：加载 / 处置 =====
    load: async function (id) {
      this.loading = true;
      try {
        var d = await api.get('/api/mobile/emergencies/' + id);
        var ev = (d && d.data) ? d.data : d;
        this.data = ev || null;
        this.logs = (ev && ev.logs) ? ev.logs : [];
        this.form.id = id;
        this.activeStage = this.currentStepIndex;
      } catch (e) {
        utils.toast((e && e.message) || '加载失败');
      } finally {
        this.loading = false;
      }
    },
    orDash: function (v) { return v || '-'; },
    statusLabel: function (s) {
      var m = { responding: '响应中', processing: '处理中', recovering: '恢复中', completed: '已完成', cancelled: '已取消' };
      return m[s] || s || '-';
    },
    badgeClass: function (s) {
      var m = { responding: 'badge-blue', processing: 'badge-orange', recovering: 'badge-green', completed: 'badge-gray', cancelled: 'badge-gray' };
      return m[s] || 'badge-gray';
    },
    currentStepSeq: function () {
      return this.currentStepIndex + 1;
    },
    currentStepName: function () {
      var s = this.stageList[this.currentStepIndex];
      return s ? s.label : '';
    },
    setActiveStage: function (i) { this.activeStage = i; },
    showConnector: function (i) { return i > 0; },
    stageCls: function (i) {
      var idx = this.currentStepIndex;
      if (idx < 0) return 'cancel';
      if (i < idx) return 'done';
      if (i === idx) return 'on';
      return '';
    },
    connectorClass: function (i) {
      var idx = this.currentStepIndex;
      return (idx >= 0 && i <= idx) ? 'done' : '';
    },
    onPhotoChange: function (e, key) {
      var files = Array.prototype.slice.call(e.target.files || []);
      var self = this;
      files.forEach(function (f) { self[key].push(URL.createObjectURL(f)); });
      this[key] = this[key].slice(0, 6);
      if (e.target) e.target.value = '';
    },
    removeStepPhoto: function (idx) { this.stepPhotos.splice(idx, 1); },

    advanceStep: async function () {
      if (this.submitting) return;
      if (!this.data) return;
      if (this.data.status === 'completed' || this.data.status === 'cancelled') {
        utils.toast('事件已结束');
        return;
      }
      var next = this.nextStatus();
      this.submitting = true;
      try {
        await api.put('/api/mobile/emergencies/' + this.form.id, { status: next });
        await api.post('/api/mobile/emergencies/' + this.form.id + '/logs', {
          stepSeq: this.currentStepSeq(),
          stepName: this.currentStepName(),
          action: this.actionText,
          photos: JSON.stringify(this.stepPhotos || [])
        });
        utils.toast('阶段已推进');
        this.actionText = '';
        this.stepPhotos = [];
        this.load(this.form.id);
      } catch (e) {
        utils.toast((e && e.message) || '推进失败');
      } finally {
        this.submitting = false;
      }
    },

    // ===== 日志时间线 =====
    logTime: function (lg) { return utils.formatDateTime(lg.created_at); },
    logHasPhotos: function (lg) { return this.logPhotos(lg).length > 0; },
    logPhotos: function (lg) {
      if (!lg || !lg.photos) return [];
      try {
        var arr = JSON.parse(lg.photos);
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    }
  }
};
