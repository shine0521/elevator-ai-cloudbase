// 应急事件上报 / 处置 → H5（Vue3 全局构建，按契约重写）
// 契约 #16：
//   无 id（上报模式）：设备选择 / 报警类型 alarmType 下拉 / 被困人数 / 位置 / 描述
//                     → api.post('/api/mobile/emergencies',{...}) → 拿 id 进入处置
//   有 id（处置模式）：4 阶段推进 responding→processing→recovering→completed
//                     api.put('/api/mobile/emergencies/'+id,{status}) + 每阶段加日志
//                     api.post('/api/mobile/emergencies/'+id+'/logs',{stepSeq,stepName,action,photos})
// 铁律：v-model 仅限 input/select/textarea；模板无裸 && || < >；禁止 SVG；根 <div class="page ef">
window.Pages = window.Pages || {};
window.Pages.emergency_form = {
  name: 'emergency_form',
  props: ['query'],
  data: function () {
    return {
      loading: true,
      id: '',
      mode: 'report',
      // 上报模式
      deviceId: '',
      deviceName: '',
      deviceSearch: '',
      deviceOptions: [],
      alarmType: '',
      trappedCount: 0,
      location: '',
      description: '',
      // 处置模式
      event: null,
      logs: [],
      stepAction: '',
      stepPhotos: [],
      actioning: false,
      alarmTypes: ['困人', '坠落', '剪切', '火灾', '扶梯伤人', '停电', '自然灾害', '其他'],
      stages: [
        { key: 'responding', label: '响应', name: '响应处置' },
        { key: 'processing', label: '处置', name: '现场处置' },
        { key: 'recovering', label: '恢复', name: '恢复运行' },
        { key: 'completed', label: '完成', name: '完成闭环' }
      ]
    };
  },
  computed: {
    isReport: function () { return this.mode === 'report'; },
    isHandle: function () { return this.mode === 'handle'; },
    showHandle: function () { return this.isHandle && !!this.event; },
    showAdvance: function () {
      if (!this.event) return false;
      var s = this.event.status;
      return s !== 'completed' && s !== 'cancelled';
    },
    isCompleted: function () { return !!(this.event && this.event.status === 'completed'); },
    isCancelled: function () { return !!(this.event && this.event.status === 'cancelled'); },
    canAddStepPhoto: function () { return this.stepPhotos.length < 6; },
    nextStageLabel: function () {
      if (!this.event) return '';
      var idx = this.stageIndex(this.event.status);
      if (idx < 0 || idx >= this.stages.length - 1) return '';
      return this.stages[idx + 1].label;
    },
    advanceLabel: function () {
      if (this.actioning) return '提交中...';
      if (!this.nextStageLabel) return '提交';
      return '推进至' + this.nextStageLabel;
    },
    currentStageName: function () {
      if (!this.event) return '';
      var idx = this.stageIndex(this.event.status);
      if (idx < 0 || idx >= this.stages.length) return '';
      return this.stages[idx].name;
    },
    stepPlaceholder: function () {
      return '请填写' + this.currentStageName + '情况';
    },
    eventNo: function () {
      if (!this.event) return '';
      return this.event.event_no || ('事件 #' + this.event.id);
    },
    deviceText: function () {
      if (!this.event) return '';
      return this.event.device_name || this.event.device_code || '设备未知';
    },
    trappedText: function () {
      if (!this.event || !this.event.trapped_count) return '无';
      return this.event.trapped_count + ' 人被困';
    },
    startTime: function () {
      return this.event ? utils.formatDateTime(this.event.start_time) : '';
    },
    statusLabel: function () {
      var m = { responding: '响应中', processing: '处置中', recovering: '恢复中', completed: '已完成', cancelled: '已取消' };
      return function (s) { return m[s] || s || ''; };
    },
    statusClass: function () {
      var m = { responding: 'badge-blue', processing: 'badge-orange', recovering: 'badge-green', completed: 'badge-gray', cancelled: 'badge-gray' };
      return function (s) { return m[s] || 'badge-gray'; };
    }
  },
  methods: {
    parsePhotos: function (p) {
      if (!p) return [];
      if (Array.isArray(p)) return p;
      try { return JSON.parse(p); } catch (e) { return []; }
    },
    stageIndex: function (status) {
      var m = { responding: 0, processing: 1, recovering: 2, completed: 3 };
      return m[status] != null ? m[status] : -1;
    },
    load: function () {
      var self = this;
      self.id = (self.query && self.query.id) || '';
      if (self.id) {
        self.mode = 'handle';
        return self.fetchEvent();
      }
      self.mode = 'report';
      self.loading = false;
      return self.fetchDevices();
    },
    fetchDevices: function () {
      var self = this;
      return api.get('/api/devices', { search: self.deviceSearch }).then(function (d) {
        self.deviceOptions = (d && d.data) ? d.data : (Array.isArray(d) ? d : []);
      }).catch(function () { self.deviceOptions = []; });
    },
    onDeviceSearch: function () {
      this.fetchDevices();
    },
    selectDevice: function (id, name) {
      this.deviceId = id;
      this.deviceName = name;
      this.deviceOptions = [];
      this.deviceSearch = '';
    },
    report: function () {
      var self = this;
      if (self.actioning) return;
      if (!self.deviceId) { utils.toast('请选择设备'); return; }
      if (!self.alarmType) { utils.toast('请选择报警类型'); return; }
      self.actioning = true;
      api.post('/api/mobile/emergencies', {
        deviceId: self.deviceId,
        alarmType: self.alarmType,
        alarmSource: '现场上报',
        trappedCount: Number(self.trappedCount) || 0,
        location: self.location,
        description: self.description
      }).then(function (d) {
        var id = (d && d.id) || (d && d.data && d.data.id) || '';
        if (!id) throw new Error('未返回事件ID');
        utils.toast('上报成功');
        self.id = String(id);
        self.mode = 'handle';
        return self.fetchEvent();
      }).catch(function (e) {
        utils.toast((e && e.message) || '上报失败');
      }).then(function () {
        self.actioning = false;
      });
    },
    fetchEvent: function () {
      var self = this;
      self.loading = true;
      return api.get('/api/mobile/emergencies/' + self.id).then(function (d) {
        self.event = (d && d.data) ? d.data : d;
        self.logs = (self.event && self.event.logs) ? self.event.logs : [];
        self.stepAction = '';
        self.stepPhotos = [];
      }).catch(function (e) {
        utils.toast((e && e.message) || '加载失败');
      }).then(function () { self.loading = false; });
    },
    stageClass: function (i) {
      var idx = this.event ? this.stageIndex(this.event.status) : -1;
      if (idx < 0) return 'cancel';
      if (i < idx) return 'done';
      if (i === idx) return 'on';
      return '';
    },
    showConn: function (i) { return i > 0; },
    connClass: function (i) {
      var idx = this.event ? this.stageIndex(this.event.status) : -1;
      return (idx >= 0 && i <= idx) ? 'done' : '';
    },
    advance: function () {
      var self = this;
      if (self.actioning || !self.event) return;
      var idx = self.stageIndex(self.event.status);
      if (idx < 0 || idx >= self.stages.length - 1) return;
      var next = self.stages[idx + 1];
      var cur = self.stages[idx];
      self.actioning = true;
      api.post('/api/mobile/emergencies/' + self.id + '/logs', {
        stepSeq: idx + 1,
        stepName: cur.name,
        action: self.stepAction,
        photos: self.stepPhotos
      }).then(function () {
        return api.put('/api/mobile/emergencies/' + self.id, { status: next.key });
      }).then(function () {
        utils.toast('已推进至' + next.label);
        self.stepAction = '';
        self.stepPhotos = [];
        return self.fetchEvent();
      }).catch(function (e) {
        utils.toast((e && e.message) || '操作失败');
      }).then(function () {
        self.actioning = false;
      });
    },
    addStepPhoto: function () {
      var self = this;
      utils.chooseImage(6 - self.stepPhotos.length).then(function (urls) {
        self.stepPhotos = self.stepPhotos.concat(urls);
      }).catch(function () {});
    },
    removeStepPhoto: function (idx) {
      this.stepPhotos.splice(idx, 1);
    },
    logPhotoList: function (lg) {
      return this.parsePhotos(lg && lg.photos);
    },
    logTime: function (lg) {
      return utils.formatDateTime(lg && lg.created_at);
    }
  },
  mounted: function () {
    this.load();
  },
  template: `
  <div class="page ef">
    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>

    <!-- 上报模式 -->
    <template v-if="isReport">
      <div class="block-title">上报应急事件</div>
      <div class="card">
        <div class="field">
          <div class="fi-label">设备 <span class="req">*</span></div>
          <input class="fi-input" v-model="deviceSearch" @input="onDeviceSearch" placeholder="搜索设备名称/编号" />
          <div v-if="deviceOptions.length" class="dev-list">
            <div v-for="opt in deviceOptions" :key="opt.id" class="device-item" @click="selectDevice(opt.id, opt.device_name)">
              <span class="dev-name">{{ opt.device_name }}</span>
              <span class="dev-sub muted">{{ opt.device_code }}</span>
            </div>
          </div>
          <div v-if="deviceName" class="fi-readonly">已选：{{ deviceName }}</div>
        </div>
        <div class="field">
          <div class="fi-label">报警类型 <span class="req">*</span></div>
          <select class="fi-input" v-model="alarmType">
            <option value="" disabled>请选择</option>
            <option v-for="a in alarmTypes" :key="a" :value="a">{{ a }}</option>
          </select>
        </div>
        <div class="field">
          <div class="fi-label">被困人数</div>
          <input class="fi-input" type="number" v-model.number="trappedCount" placeholder="0" />
        </div>
        <div class="field">
          <div class="fi-label">位置</div>
          <input class="fi-input" v-model="location" placeholder="如：1号楼3号电梯" />
        </div>
        <div class="field">
          <div class="fi-label">情况描述</div>
          <textarea class="fi-input" v-model="description" placeholder="请描述现场情况"></textarea>
        </div>
        <button class="btn-primary" :disabled="actioning" @click="report">{{ actioning ? '上报中...' : '提交上报' }}</button>
      </div>
    </template>

    <!-- 处置模式 -->
    <template v-else-if="showHandle">
      <div class="block-title">事件概览</div>
      <div class="card">
        <div class="info-top">
          <span class="info-no">{{ eventNo }}</span>
          <span class="badge" :class="statusClass(event.status)">{{ statusLabel(event.status) }}</span>
        </div>
        <div class="info-row"><span class="label">设备</span><span class="value">{{ deviceText }}</span></div>
        <div class="info-row"><span class="label">报警类型</span><span class="value">{{ event.alarm_type }}</span></div>
        <div class="info-row"><span class="label">被困人数</span><span class="value">{{ trappedText }}</span></div>
        <div class="info-row"><span class="label">开始时间</span><span class="value">{{ startTime }}</span></div>
      </div>

      <div class="prog">
        <template v-for="(s,i) in stages" :key="s.key">
          <div v-if="showConn(i)" class="prog-connector" :class="connClass(i)"></div>
          <div class="prog-step" :class="stageClass(i)">
            <div class="prog-dot"></div>
            <div class="prog-label">{{ s.label }}</div>
          </div>
        </template>
      </div>

      <div v-if="showAdvance" class="card">
        <div class="block-title">本阶段处置（{{ currentStageName }}）</div>
        <div class="form-label">处置说明</div>
        <textarea class="fi-input" v-model="stepAction" :placeholder="stepPlaceholder"></textarea>
        <div class="form-label" style="margin-top:10px">现场照片</div>
        <div class="photo-row">
          <div v-for="(p,idx) in stepPhotos" :key="idx" class="photo-wrap">
            <img class="photo-thumb" :src="p" />
            <div class="photo-del" @click="removeStepPhoto(idx)">×</div>
          </div>
          <div v-if="canAddStepPhoto" class="photo-add" @click="addStepPhoto">＋</div>
        </div>
        <button class="btn-primary" :disabled="actioning" @click="advance">{{ advanceLabel }}</button>
      </div>

      <div v-if="logs.length" class="card">
        <div class="block-title">处置日志</div>
        <div v-for="(lg,idx) in logs" :key="idx" class="log-item">
          <div class="log-head">
            <span class="log-step">第{{ lg.step_seq }}步 · {{ lg.step_name }}</span>
            <span class="muted">{{ logTime(lg) }}</span>
          </div>
          <div class="log-action">{{ lg.action }}</div>
          <div class="photo-row" v-if="logPhotoList(lg).length">
            <img v-for="(p,i) in logPhotoList(lg)" :key="i" class="photo-thumb" :src="p" />
          </div>
        </div>
      </div>

      <div v-if="isCompleted" class="card" style="text-align:center;color:var(--success);font-weight:600;padding:14px;">✅ 处置完成（闭环）</div>
      <div v-if="isCancelled" class="card" style="text-align:center;color:var(--muted);font-weight:600;padding:14px;">该事件已取消</div>
    </template>
  </div>
  `
};
