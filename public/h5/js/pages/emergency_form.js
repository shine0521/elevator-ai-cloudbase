// 应急事件上报/处置 - H5 (Vue3 全局构建, 按契约重写)
// 契约 #19: 新建 POST /api/mobile/emergencies {alarmType,deviceId,location,trappedCount,description}
// 契约 #19: 推进 PUT /api/mobile/emergencies/:id {status}; 日志 POST /api/mobile/emergencies/:id/logs {stage,action,photo}
// 铁律: v-model 仅限 input/select/textarea; 模板禁裸 && || < >; 根 <div class="page">; 三态齐全; 禁 SVG
window.Pages = window.Pages || {};
window.Pages.emergency_form = {
  name: 'emergency_form',
  props: ['query'],
  data: function () {
    return {
      loading: true,
      error: false,
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
    isReport: function () {
      return this.mode === 'report';
    },
    isHandle: function () {
      return this.mode === 'handle';
    },
    showHandle: function () {
      return this.isHandle && !!this.event;
    },
    showAdvance: function () {
      if (!this.event) return false;
      var s = this.event.status;
      return s !== 'completed' && s !== 'cancelled';
    },
    isCompleted: function () {
      return !!(this.event && this.event.status === 'completed');
    },
    isCancelled: function () {
      return !!(this.event && this.event.status === 'cancelled');
    },
    canAddStepPhoto: function () {
      return this.stepPhotos.length < 6;
    },
    currentStageIndex: function () {
      if (!this.event) return -1;
      var status = this.event.status;
      var idx = -1;
      for (var i = 0; i < this.stages.length; i++) {
        if (this.stages[i].key === status) {
          idx = i;
          break;
        }
      }
      return idx;
    },
    nextStageLabel: function () {
      var idx = this.currentStageIndex;
      if (idx < 0 || idx >= this.stages.length - 1) return '';
      return this.stages[idx + 1].label;
    },
    advanceLabel: function () {
      if (this.actioning) return '提交中...';
      if (!this.nextStageLabel) return '提交';
      return '推进至「' + this.nextStageLabel + '」';
    },
    currentStageName: function () {
      var idx = this.currentStageIndex;
      if (idx < 0 || idx >= this.stages.length) return '';
      return this.stages[idx].name;
    },
    stepPlaceholder: function () {
      var name = this.currentStageName;
      return name ? '请填写' + name + '情况' : '请填写处置情况';
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
    statusLabelMap: function () {
      return {
        responding: '响应中',
        processing: '处置中',
        recovering: '恢复中',
        completed: '已完成',
        cancelled: '已取消'
      };
    },
    statusClassMap: function () {
      return {
        responding: 'tag-info',
        processing: 'tag-pending',
        recovering: 'tag-completed',
        completed: 'tag-ok',
        cancelled: 'tag-low'
      };
    }
  },
  methods: {
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
      }).catch(function () {
        self.deviceOptions = [];
      });
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
      if (!self.deviceId) {
        utils.toast('请选择设备');
        return;
      }
      if (!self.alarmType) {
        utils.toast('请选择报警类型');
        return;
      }
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
      self.error = false;
      return api.get('/api/mobile/emergencies/' + self.id).then(function (d) {
        self.event = (d && d.data) ? d.data : d;
        self.logs = (self.event && self.event.logs) ? self.event.logs : [];
        self.stepAction = '';
        self.stepPhotos = [];
      }).catch(function (e) {
        self.error = true;
        utils.toast((e && e.message) || '加载失败');
      }).then(function () {
        self.loading = false;
      });
    },
    stageClass: function (i) {
      var idx = this.currentStageIndex;
      if (idx < 0) return 'cancel';
      if (i < idx) return 'done';
      if (i === idx) return 'on';
      return '';
    },
    showConn: function (i) {
      return i > 0;
    },
    connClass: function (i) {
      var idx = this.currentStageIndex;
      return (idx >= 0 && i <= idx) ? 'done' : '';
    },
    advance: function () {
      var self = this;
      if (self.actioning || !self.event) return;
      var idx = self.currentStageIndex;
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
        utils.toast('已推进至「' + next.label + '」');
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
      var remain = 6 - self.stepPhotos.length;
      utils.chooseImage(remain).then(function (urls) {
        self.stepPhotos = self.stepPhotos.concat(urls);
      }).catch(function () {});
    },
    removeStepPhoto: function (idx) {
      this.stepPhotos.splice(idx, 1);
    },
    parsePhotos: function (p) {
      if (!p) return [];
      if (Array.isArray(p)) return p;
      try {
        return JSON.parse(p);
      } catch (e) {
        return [];
      }
    },
    logPhotoList: function (lg) {
      return this.parsePhotos(lg && lg.photos);
    },
    logTime: function (lg) {
      return utils.formatDateTime(lg && lg.created_at);
    },
    statusLabel: function (s) {
      return this.statusLabelMap[s] || s || '';
    },
    statusClass: function (s) {
      return this.statusClassMap[s] || 'tag-low';
    }
  },
  mounted: function () {
    this.load();
  },
  template: `
<div class="page">
  <div v-if="loading" class="empty-state">
    <div class="loading-spinner"></div>
    <div class="muted" style="margin-top:12px;">加载中...</div>
  </div>

  <div v-else-if="error" class="empty-state">
    <div class="text-danger">❌ 加载失败</div>
    <button class="btn btn-primary" style="margin-top:16px;" @click="load">重试</button>
  </div>

  <!-- 上报模式 -->
  <template v-else-if="isReport">
    <div class="card">
      <div class="card-t">上报应急事件</div>

      <div class="field">
        <div class="fi-label">设备 <span class="text-danger">*</span></div>
        <input class="fi-input" :value="deviceSearch" @input="e => deviceSearch = e.target.value" @input="onDeviceSearch" placeholder="搜索设备名称/编号" />
        <div v-if="deviceOptions.length" class="card" style="margin-top:8px;max-height:200px;overflow-y:auto;">
          <div v-for="opt in deviceOptions" :key="opt.id" class="list-item" @click="selectDevice(opt.id, opt.device_name)">
            <div class="li-title">{{ opt.device_name }}</div>
            <div class="li-sub muted">{{ opt.device_code }}</div>
          </div>
        </div>
        <div v-if="deviceName" class="muted" style="margin-top:8px;">✅ 已选：{{ deviceName }}</div>
      </div>

      <div class="field">
        <div class="fi-label">报警类型 <span class="text-danger">*</span></div>
        <select class="fi-input" :value="alarmType" @change="e => alarmType = e.target.value">
          <option value="" disabled>请选择</option>
          <option v-for="a in alarmTypes" :key="a" :value="a">{{ a }}</option>
        </select>
      </div>

      <div class="field">
        <div class="fi-label">被困人数</div>
        <input class="fi-input" type="number" :value="trappedCount" @input="e => trappedCount = Number(e.target.value) || 0" placeholder="0" />
      </div>

      <div class="field">
        <div class="fi-label">位置</div>
        <input class="fi-input" :value="location" @input="e => location = e.target.value" placeholder="如：1号楼3号电梯" />
      </div>

      <div class="field">
        <div class="fi-label">情况描述</div>
        <textarea class="fi-input txta" :value="description" @input="e => description = e.target.value" placeholder="请描述现场情况"></textarea>
      </div>

      <button class="btn btn-primary btn-row" :disabled="actioning" @click="report">
        {{ actioning ? '上报中...' : '提交上报' }}
      </button>
    </div>
  </template>

  <!-- 处置模式 -->
  <template v-else-if="showHandle">
    <div class="card">
      <div class="card-h">
        <span class="card-t">{{ eventNo }}</span>
        <span class="tag" :class="statusClass(event.status)">{{ statusLabel(event.status) }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">设备</span>
        <span class="detail-value">{{ deviceText }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">报警类型</span>
        <span class="detail-value">{{ event.alarm_type }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">被困人数</span>
        <span class="detail-value">{{ trappedText }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">开始时间</span>
        <span class="detail-value">{{ startTime }}</span>
      </div>
      <div v-if="event.location" class="detail-row">
        <span class="detail-label">位置</span>
        <span class="detail-value">{{ event.location }}</span>
      </div>
      <div v-if="event.description" class="detail-row">
        <span class="detail-label">描述</span>
        <span class="detail-value">{{ event.description }}</span>
      </div>
    </div>

    <!-- 步骤条 -->
    <div class="steps">
      <template v-for="(s, i) in stages">
        <div v-if="showConn(i)" class="steps-connector" :class="connClass(i)"></div>
        <div class="steps-item" :class="stageClass(i)">
          <div class="steps-dot"></div>
          <div class="steps-label">{{ s.label }}</div>
        </div>
      </template>
    </div>

    <!-- 处置操作 -->
    <div v-if="showAdvance" class="card">
      <div class="card-t">本阶段处置（{{ currentStageName }}）</div>

      <div class="field">
        <div class="fi-label">处置说明</div>
        <textarea class="fi-input txta" :value="stepAction" @input="e => stepAction = e.target.value" :placeholder="stepPlaceholder"></textarea>
      </div>

      <div class="field">
        <div class="fi-label">现场照片</div>
        <div class="photo-wall">
          <div v-for="(p, idx) in stepPhotos" :key="idx" class="photo-item">
            <img class="photo-thumb" :src="p" />
            <div class="photo-del" @click="removeStepPhoto(idx)">×</div>
          </div>
          <div v-if="canAddStepPhoto" class="photo-add" @click="addStepPhoto">📷</div>
        </div>
      </div>

      <button class="btn btn-primary btn-row" :disabled="actioning" @click="advance">{{ advanceLabel }}</button>
    </div>

    <!-- 处置日志 -->
    <div v-if="logs.length" class="card">
      <div class="card-t">处置日志</div>
      <div v-for="(lg, idx) in logs" :key="idx" class="log-item">
        <div class="li-row">
          <span class="li-title">第{{ lg.step_seq }}步 · {{ lg.step_name }}</span>
          <span class="li-sub muted">{{ logTime(lg) }}</span>
        </div>
        <div v-if="lg.action" class="li-sub text-2">{{ lg.action }}</div>
        <div v-if="logPhotoList(lg).length" class="photo-wall" style="margin-top:8px;">
          <img v-for="(p, i) in logPhotoList(lg)" :key="i" class="photo-thumb" :src="p" />
        </div>
      </div>
    </div>

    <div v-if="isCompleted" class="card" style="text-align:center;">
      <div class="text-success" style="font-weight:600;padding:16px;">✅ 处置完成（闭环）</div>
    </div>
    <div v-if="isCancelled" class="card" style="text-align:center;">
      <div class="muted" style="font-weight:600;padding:16px;">该事件已取消</div>
    </div>
  </template>

  <div v-else class="empty-state">
    <div class="muted">未找到事件</div>
  </div>
</div>
`
};
