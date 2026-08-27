// M-13/M-14 应急救援
window.Pages = window.Pages || {};
window.Pages.emergency = {
  template: `
<div class="page">
  <!-- 顶部按钮 -->
  <div class="action-bar">
    <button class="btn-primary" @click="showNewForm">新建应急事件</button>
  </div>
  
  <!-- 加载态 -->
  <div v-if="loading" class="empty-state"><text class="muted">加载中...</text></div>
  <div v-else-if="list.length===0" class="empty-state"><text class="muted">暂无应急事件</text></div>
  
  <!-- 事件列表 -->
  <div v-else class="list-wrap">
    <div v-for="item in list" :key="item.id"
      class="list-item card"
      @click="goDetail(item.id)">
      <div class="item-main">
        <div class="item-title">{{titleOf(item)}}{{item.id ? ' #' + item.id : ''}}</div>
        <div class="status-badge" :style="{background:statusCfg(item.status).color,color:'#fff'}">{{statusCfg(item.status).label}}</div>
      </div>
      <div class="item-sub muted">
        <text v-if="item.device_name">设备：{{item.device_name}}</text>
        <text v-if="trappedHint(item)"> | 被困人数：{{item.trapped_count}}</text>
        <text v-if="item.create_time"> | {{item.create_time}}</text>
      </div>
      <div v-if="item.status!=='completed'" class="action-row">
        <button class="btn-sm" size="mini" :data-id="item.id" :data-status="item.status" @click="updateStatus(item.id, item.status)">推进状态 ›</button>
      </div>
    </div>
  </div>
  
  <!-- 新建表单弹层 -->
  <div v-if="showFormFlag" class="mask" @click="hideForm">
    <div class="form-panel" @click.stop>
      <div class="form-title">新建应急事件</div>
      
      <!-- 报警类型 -->
      <div class="form-item">
        <text class="form-label">报警类型 *</text>
        <select class="form-input" v-model="form.alarm_type">
          <option value="">请选择</option>
          <option v-for="t in alarmTypes" :key="t" :value="t">{{t}}</option>
        </select>
      </div>
      
      <!-- 设备 -->
      <div class="form-item">
        <text class="form-label">关联设备</text>
        <div class="flex-row">
          <input class="form-input" placeholder="设备名称/编号" v-model="form.device_name" style="flex:1" />
          <button class="btn-sm" @click="scanDevice" style="margin-left:8rpx">扫码</button>
        </div>
      </div>
      
      <!-- 被困人数 -->
      <div class="form-item">
        <text class="form-label">被困人数</text>
        <input class="form-input" type="number" placeholder="请输入" v-model="form.trapped_count" />
      </div>
      
      <!-- 描述 -->
      <div class="form-item">
        <text class="form-label">情况描述 *</text>
        <textarea class="form-textarea" placeholder="请详细描述情况（至少5字）" v-model="form.description" />
      </div>
      
      <!-- 联系人 -->
      <div class="form-item">
        <text class="form-label">紧急联系人</text>
        <input class="form-input" placeholder="姓名" v-model="form.contact_name" />
      </div>
      <div class="form-item">
        <text class="form-label">联系电话</text>
        <input class="form-input" type="number" placeholder="手机号" v-model="form.contact_phone" />
      </div>
      
      <!-- 操作 -->
      <div class="form-actions">
        <button class="btn-default" @click="hideForm">取消</button>
        <button class="btn-primary" @click="submitForm" :disabled="submitting">提交</button>
      </div>
    </div>
  </div>
</div>
`,
  data() {
    return {
      list: [],
      loading: true,
      showFormFlag: false,
      form: {
        alarm_type: '',
        device_id: '',
        device_name: '',
        trapped_count: '',
        description: '',
        contact_name: '',
        contact_phone: ''
      },
      submitting: false,
      alarmTypes: ['困人报警', '故障报警', '物联网报警', '人工报警']
    };
  },
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const d = await api.get('/api/mobile/emergencies');
        this.list = d.data || d || [];
        this.loading = false;
      } catch (e) {
        this.loading = false;
        utils.toast('网络错误');
      }
    },
    titleOf(item) {
      return item.event_title || item.alarm_type || '应急事件';
    },
    trappedHint(item) {
      return item.trapped_count && item.trapped_count > 0;
    },
    statusCfg(status) {
      const STATUS_MAP = {
        responding: { label: '响应中', color: '#FF8C00' },
        processing: { label: '处置中', color: '#1082FF' },
        recovering: { label: '恢复中', color: '#FAAD14' },
        completed: { label: '已完成', color: '#52C41A' }
      };
      return STATUS_MAP[status] || { label: status, color: '#999' };
    },
    showNewForm() {
      this.showFormFlag = true;
      this.form = {
        alarm_type: '', device_id: '', device_name: '',
        trapped_count: '', description: '', contact_name: '', contact_phone: ''
      };
    },
    hideForm() {
      this.showFormFlag = false;
    },
    async scanDevice() {
      try {
        const result = await utils.scanCode();
        const code = result.trim();
        const d = await api.get('/api/mobile/devices/scan', { code: code });
        const dev = d.data || d;
        if (dev && dev.id) {
          this.form.device_id = dev.id;
          this.form.device_name = dev.device_name || dev.name;
          utils.toast('设备已关联');
        } else {
          utils.toast('设备不存在');
        }
      } catch (e) {
        utils.toast('设备查询失败');
      }
    },
    async submitForm() {
      const { alarm_type, description } = this.form;
      if (!alarm_type) {
        utils.toast('请选择报警类型');
        return;
      }
      if (!description || description.trim().length < 5) {
        utils.toast('请填写描述（至少5字）');
        return;
      }
      this.submitting = true;
      try {
        await api.post('/api/mobile/emergencies', this.form);
        this.submitting = false;
        this.showFormFlag = false;
        utils.toast('应急事件已创建');
        this.load();
      } catch (e) {
        this.submitting = false;
        utils.toast('网络错误');
      }
    },
    async updateStatus(id, status) {
      const statusOrder = ['responding', 'processing', 'recovering', 'completed'];
      const idx = statusOrder.indexOf(status);
      const nextStatus = idx >= 0 && idx < statusOrder.length - 1 ? statusOrder[idx + 1] : null;
      
      if (!nextStatus) {
        utils.toast('已是最终状态');
        return;
      }
      
      const ok = await utils.confirm(`确定将状态更新为"${this.statusCfg(nextStatus).label}"？`);
      if (!ok) return;
      
      try {
        await api.put(`/api/mobile/emergencies/${id}`, { status: nextStatus });
        utils.toast('状态已更新');
        this.load();
      } catch (e) {
        utils.toast('网络错误');
      }
    },
    goDetail(id) {
      utils.toast('事件进行中，请稍候');
    }
  }
};
