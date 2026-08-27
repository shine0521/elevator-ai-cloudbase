// M-12 设备详情
window.Pages = window.Pages || {};
window.Pages.device_detail = {
  template: `
<div class="page">
  <!-- 加载态 -->
  <div v-if="loading" class="empty-state"><text class="muted">加载中...</text></div>
  
  <!-- 设备基本信息卡 -->
  <div v-else-if="device" class="device-card card">
    <div class="device-header">
      <div class="device-name">{{device.device_name || device.name || '未知设备'}}</div>
      <div class="risk-badge" :style="{background:riskColor(device.risk_level),color:'#fff'}">
        {{device.risk_level || device.risk || '未知'}}
      </div>
    </div>
    
    <div class="info-grid">
      <div class="info-row"><text class="info-label">设备编号</text><text class="info-val">{{device.device_no || device.code || '-'}}</text></div>
      <div class="info-row"><text class="info-label">设备型号</text><text class="info-val">{{device.model || device.device_model || '-'}}</text></div>
      <div class="info-row"><text class="info-label">安装位置</text><text class="info-val">{{device.location || device.address || '-'}}</text></div>
      <div class="info-row"><text class="info-label">运行状态</text>
        <text class="info-val" :style="{color:statusColor(device.status)}">{{device.status || '-'}}</text>
      </div>
      <div class="info-row"><text class="info-label">所属单位</text><text class="info-val">{{device.unit_name || device.building || '-'}}</text></div>
      <div class="info-row"><text class="info-label">注册代码</text><text class="info-val">{{device.register_code || device.registration_code || '-'}}</text></div>
    </div>
  </div>
  
  <!-- Tab 切换 -->
  <div v-if="device" class="tab-bar card">
    <div :class="['tab', tab==='inspection'?'active':'']" @click="tab='inspection'">检查记录</div>
    <div :class="['tab', tab==='warning'?'active':'']" @click="tab='warning'">预警记录</div>
    <div :class="['tab', tab==='doc'?'active':'']" @click="tab='doc'">文档列表</div>
  </div>
  
  <!-- 检查记录列表 -->
  <div v-if="tab==='inspection'" class="tab-content">
    <div v-if="inspections.length===0" class="empty-state"><text class="muted">暂无检查记录</text></div>
    <div v-for="item in inspections" :key="item.id"
      class="list-item card"
      @click="goInspection(item)">
      <div class="item-title">{{item.inspection_no || item.inspection_date || '记录' + (item.id||'')}} {{item._source==='weekly'?'(周排查)':'(日管控)'}}</div>
      <div class="item-sub muted">
        {{item.inspection_date || item.create_time || ''}}
        <text v-if="item.inspector_name"> | {{item.inspector_name}}</text>
        <text v-if="item.result"> | {{item.result}}</text>
      </div>
    </div>
  </div>
  
  <!-- 预警记录列表 -->
  <div v-if="tab==='warning'" class="tab-content">
    <div v-if="warnings.length===0" class="empty-state"><text class="muted">暂无预警记录</text></div>
    <div v-for="item in warnings" :key="item.id"
      class="list-item card"
      @click="goWarning(item)">
      <div class="item-title">{{item.alarm_type || item.warning_type || '预警' + (item.id||'')}}</div>
      <div class="item-sub muted">
        {{item.create_time || item.alarm_time || ''}}
        <text v-if="item.level"> | {{item.level}}</text>
      </div>
    </div>
  </div>
  
  <!-- 文档列表 -->
  <div v-if="tab==='doc'" class="tab-content">
    <div v-if="docs.length===0" class="empty-state"><text class="muted">暂无文档</text></div>
    <div v-for="item in docs" :key="item.id" class="list-item card">
      <div class="item-title">{{item.doc_title || item.title || '文档' + (item.id||'')}}</div>
      <div class="item-sub muted">
        {{item.doc_type || item.type || '-'}}
        <text v-if="item.status"> | {{item.status}}</text>
      </div>
    </div>
  </div>
</div>
`,
  data() {
    return {
      query: {},
      id: null,
      device: null,
      tab: 'inspection',
      inspections: [],
      warnings: [],
      docs: [],
      loading: true
    };
  },
  mounted() {
    const parsed = Router.parse();
    this.query = parsed.query;
    const id = this.query.id || this.query.device_id;
    this.id = id;
    this.loadDevice(id);
  },
  methods: {
    async loadDevice(id) {
      this.loading = true;
      try {
        const d = await api.get(`/api/mobile/devices/${id}/detail`);
        const device = d.data || d;
        this.device = device;
        this.inspections = device.inspections || device.daily_records || [];
        this.warnings = device.warnings || device.alarms || [];
        this.docs = device.documents || device.docs || [];
        this.loading = false;
      } catch (e) {
        this.loading = false;
        utils.toast('网络错误');
      }
    },
    riskColor(level) {
      const RISK_COLORS = {
        HIGH: '#F5222D',
        MEDIUM: '#FAAD14',
        LOW: '#52C41A',
        高风险: '#F5222D',
        中风险: '#FAAD14',
        低风险: '#52C41A'
      };
      return RISK_COLORS[level] || '#999';
    },
    statusColor(status) {
      const STATUS_COLORS = {
        ONLINE: '#52C41A',
        OFFLINE: '#BFBFBF',
        FAULT: '#F5222D'
      };
      return STATUS_COLORS[status] || '#999';
    },
    goInspection(item) {
      const id = item.id || item.inspection_id;
      if (item._source === 'weekly') {
        utils.go('/weekly_form?id=' + id);
      } else {
        utils.go('/daily_form?id=' + id);
      }
    },
    goWarning(item) {
      utils.toast('预警详情开发中');
    }
  }
};
