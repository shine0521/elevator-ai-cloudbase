// 日管控填报
window.Pages.daily_form = {
  name: 'daily_form',
  props: ['query'],
  data: function () {
    return {
      deviceKeyword: '',
      deviceList: [],
      selectedDevice: null,
      loadingDevice: false,
      loading: false,
      submitting: false,
      signature: '',
      editId: null,
      // 内置标准日管控检查项（后端无模板字段 API，前端内置）
      checklist: [
        { seq: 1, name: '轿厢照明/风扇/按钮', category: '轿厢', type: 'radio', options: ['正常', '异常'] },
        { seq: 2, name: '层门与轿门开关', category: '层门', type: 'radio', options: ['正常', '异常'] },
        { seq: 3, name: '平层准确度', category: '运行', type: 'select', options: ['±5mm内', '±10mm内', '超差'] },
        { seq: 4, name: '运行异响/振动', category: '运行', type: 'radio', options: ['正常', '异常'] },
        { seq: 5, name: '楼层显示与报站', category: '轿厢', type: 'radio', options: ['正常', '异常'] },
        { seq: 6, name: '制动器状态', category: '机房', type: 'radio', options: ['正常', '异常'] },
        { seq: 7, name: '钢丝绳/曳引绳', category: '机房', type: 'radio', options: ['正常', '异常'] },
        { seq: 8, name: '安全钳/限速器', category: '机房', type: 'radio', options: ['正常', '异常'] },
        { seq: 9, name: '底坑积水/杂物', category: '底坑', type: 'radio', options: ['正常', '异常'] },
        { seq: 10, name: '备注说明', category: '其他', type: 'textarea' }
      ],
      formData: {}
    };
  },
  computed: {
    canSubmit: function () {
      return !!this.selectedDevice && !!this.signature && !this.submitting;
    }
  },
  methods: {
    searchDevice: function () {
      var self = this;
      self.loadingDevice = true;
      api.get('/api/devices', { search: self.deviceKeyword }).then(function (d) {
        self.deviceList = d.data || d || [];
        self.loadingDevice = false;
      }).catch(function () {
        self.deviceList = [];
        self.loadingDevice = false;
      });
    },
    selectDevice: function (dev) { this.selectedDevice = dev; },
    scan: function () {
      var self = this;
      utils.scanCode().then(function (code) {
        return api.scanDevice(code);
      }).then(function (dev) {
        self.selectedDevice = dev;
      }).catch(function (e) {
        utils.toast((e && e.message) || '扫码失败');
      });
    },
    isChecked: function (seq, val) {
      var arr = this.formData[seq];
      return Array.isArray(arr) && arr.indexOf(val) >= 0;
    },
    toggleCheck: function (seq, val) {
      var arr = this.formData[seq];
      if (!Array.isArray(arr)) arr = [];
      var idx = arr.indexOf(val);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(val);
      this.formData[seq] = arr;
    },
    itemResult: function (f) {
      var v = this.formData[f.seq];
      if (f.type === 'radio' || f.type === 'select') {
        if (v === '异常' || v === '超差') return 'fail';
      }
      return 'pass';
    },
    resultColor: function (f) {
      return this.itemResult(f) === 'fail' ? 'var(--danger)' : 'var(--success)';
    },
    resultLabel: function (f) {
      return this.itemResult(f) === 'fail' ? '异常' : '通过';
    },
    todayStr: function () {
      var d = new Date();
      var m = ('0' + (d.getMonth() + 1)).slice(-2);
      var day = ('0' + d.getDate()).slice(-2);
      return d.getFullYear() + '-' + m + '-' + day;
    },
    submit: function () {
      var self = this;
      if (!self.selectedDevice) { utils.toast('请先选择设备'); return; }
      if (!self.signature) { utils.toast('请填写检查人签名'); return; }
      if (self.submitting) return;
      self.submitting = true;
      var items = self.checklist.map(function (f) {
        var v = self.formData[f.seq];
        return {
          itemSeq: f.seq,
          itemName: f.name,
          itemCategory: f.category,
          itemType: f.type,
          inputValue: (v == null ? '' : (Array.isArray(v) ? v.join(',') : String(v))),
          standardValue: '',
          compareResult: self.itemResult(f)
        };
      });
      api.createInspection({ deviceId: self.selectedDevice.id, checkDate: self.todayStr(), templateId: null })
        .then(function (res) {
          var id = res.id || (res.data && res.data.id);
          return api.post('/api/mobile/inspections/' + id + '/items', { items: items })
            .then(function () { return id; });
        })
        .then(function (id) {
          return api.submitInspection(id, { signature: self.signature });
        })
        .then(function () {
          self.submitting = false;
          utils.toast('提交成功');
          utils.go('/daily_detail?id=' + (self.editId || ''));
        })
        .catch(function (e) {
          self.submitting = false;
          utils.toast((e && e.message) || '提交失败');
        });
    },
    loadEdit: function () {
      var self = this;
      var id = this.query && this.query.id;
      if (!id) return;
      self.editId = id;
      self.loading = true;
      api.getInspection(id).then(function (d) {
        var data = d.data || d;
        self.selectedDevice = { id: data.device_id, device_name: data.device_name, device_code: data.device_code };
        (data.items || []).forEach(function (it) {
          self.formData[it.item_seq] = it.input_value;
        });
        self.signature = data.signature || '';
        self.loading = false;
      }).catch(function () {
        self.loading = false;
      });
    }
  },
  mounted: function () { this.loadEdit(); },
  template: `
  <div class="page">
    <div class="block-title">设备选择</div>
    <div class="card">
      <div class="btn-row">
        <input class="fi-input" v-model="deviceKeyword" placeholder="输入设备名称/编号搜索" style="flex:1;">
        <button class="btn-query" @click="searchDevice">搜索</button>
        <button class="btn-scan" @click="scan">扫码</button>
      </div>
      <div v-if="selectedDevice" class="dev-pick">
        <span class="dev-pick-item">✓ {{selectedDevice.device_name}}（{{selectedDevice.device_code}}）</span>
      </div>
      <div v-for="dev in deviceList" :key="dev.id" class="dev-item" @click="selectDevice(dev)">
        <div class="dev-name">{{dev.device_name}}</div>
        <div class="dev-sub">{{dev.device_code}} · {{dev.location}}</div>
      </div>
    </div>

    <div class="block-title">检查项</div>
    <div class="card" v-for="f in checklist" :key="f.seq">
      <div class="fi-label">{{f.name}} <span class="muted">· {{f.category}}</span></div>
      <input v-if="f.type==='text' || f.type==='number' || f.type==='date'" class="fi-input"
             :type="f.type" :value="formData[f.seq]" @input="e => formData[f.seq] = e.target.value">
      <textarea v-else-if="f.type==='textarea'" class="fi-input"
             :value="formData[f.seq]" @input="e => formData[f.seq] = e.target.value"></textarea>
      <select v-else-if="f.type==='select'" class="fi-input"
             :value="formData[f.seq]" @change="formData[f.seq] = $event.target.value">
        <option v-for="o in f.options" :key="o" :value="o">{{o}}</option>
      </select>
      <div v-else-if="f.type==='radio'">
        <label class="choice-row" v-for="o in f.options" :key="o">
          <input type="radio" :name="'f'+f.seq" :value="o" :checked="formData[f.seq]===o" @change="formData[f.seq]=o">
          <span>{{o}}</span>
        </label>
      </div>
      <div v-else-if="f.type==='checkbox'">
        <label class="choice-row" v-for="o in f.options" :key="o">
          <input type="checkbox" :value="o" :checked="isChecked(f.seq,o)" @change="toggleCheck(f.seq,o)">
          <span>{{o}}</span>
        </label>
      </div>
      <div class="btn-row" style="margin-top:8px;">
        <span class="badge" :style="{color:resultColor(f),borderColor:resultColor(f)}">{{resultLabel(f)}}</span>
      </div>
    </div>

    <div class="block-title">检查人签名</div>
    <div class="card">
      <input class="fi-input" v-model="signature" placeholder="输入检查人姓名/工号">
    </div>

    <div class="bottom-bar">
      <button class="btn-primary" :disabled="!canSubmit" @click="submit">提交日管控</button>
    </div>
  </div>`
};
