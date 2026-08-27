// pages/monthly_form.js — 月调度 M-19（新增）
// 4步向导：选设备 → 选模板 → 逐项填写 → 提交
// GET/POST/PUT /api/mobile/monthly | /api/mobile/monthly/:id/submit
// 与 daily_form 相同架构，模板字段略有不同
window.Pages = window.Pages || {};
window.Pages.monthly_form = {
  name: 'monthly_form',
  props: ['query'],
  template: `
  <div class="page mf">

    <!-- 步骤条 -->
    <div class="step-bar">
      <div v-for="(s, i) in steps" :key="s" class="step-chip"
        :class="{on: i === step, done: i < step}">
        <div class="snum">{{i + 1}}</div>
        {{s}}
      </div>
    </div>

    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>

    <template v-else>
      <!-- STEP 0: 选设备 + 月份 -->
      <div v-if="step === 0" class="card">
        <div class="month-note">月调度月份：{{form.monthLabel}}</div>
        <div class="fi-label">选择设备 <span class="req">*</span></div>
        <input v-model="deviceSearch" class="fi-input" placeholder="搜索设备名称 / 编号" style="margin-bottom:10px">
        <div style="max-height:44vh;overflow-y:auto">
          <div v-for="d in filteredDevices" :key="d.id"
            class="dev-item" :class="{on: form.deviceId === d.id}"
            @click="form.deviceId = d.id">
            <div class="dev-name">{{d.device_name || d.deviceName || ''}} <span class="muted">{{d.device_code || d.deviceCode || ''}}</span></div>
            <div class="muted" style="font-size:12px">{{d.location || ''}} {{d.device_type || d.deviceType || ''}}</div>
          </div>
          <div v-if="!filteredDevices.length" class="empty-state"><span class="muted">暂无设备</span></div>
        </div>
        <button class="btn-primary" @click="next" style="margin-top:12px">下一步：选择模板</button>
      </div>

      <!-- STEP 1: 选模板 -->
      <div v-if="step === 1" class="card">
        <div class="fi-label">月调度模板（已发布）<span class="req">*</span></div>
        <input v-model="templateSearch" class="fi-input" placeholder="搜索模板名称" style="margin-bottom:10px">
        <div style="max-height:40vh;overflow-y:auto">
          <div v-for="t in filteredTemplates" :key="t.id"
            class="dev-item" :class="{on: form.templateId === t.id}"
            @click="selectTemplate(t)">
            <div class="dev-name">{{t.name || ''}} <span class="muted">v{{t.version || 1}}</span></div>
            <div class="muted" style="font-size:12px">{{t.category || '通用'}} {{t.description || ''}}</div>
          </div>
          <div v-if="!filteredTemplates.length" class="empty-state"><span class="muted">暂无月调度模板</span></div>
        </div>
        <div class="btn-row">
          <button class="btn-ghost" @click="prev">上一步</button>
          <button class="btn-primary" @click="next">下一步：逐项填写</button>
        </div>
      </div>

      <!-- STEP 2: 逐项填写 -->
      <div v-if="step === 2">
        <div v-if="isReadonly" class="card" style="margin-bottom:10px"><span class="view-badge">该月调度已提交，当前为只读查看</span></div>
        <div v-for="(f, idx) in fields" :key="f.id" class="card">
          <div class="fi-label">{{idx + 1}}. {{f.field_label || f.field_name || '检查项'}}<span class="req" v-if="f.required">*</span></div>

          <input v-if="isTextOrNumber(f)" :value="formData[f.id]" @input="v => formData[f.id] = v.target.value"
            class="fi-input"
            :type="f.field_type === 'number' ? 'number' : 'text'"
            :disabled="isReadonly" :placeholder="f.placeholder || '请输入'">

          <textarea v-else-if="f.field_type === 'textarea'" :value="formData[f.id]" @input="v => formData[f.id] = v.target.value"
            class="fi-input" :disabled="isReadonly" :placeholder="f.placeholder || '请输入'"
            style="min-height:70px"></textarea>

          <input v-else-if="f.field_type === 'date'" :value="formData[f.id]" @input="v => formData[f.id] = v.target.value"
            class="fi-input" type="date" :disabled="isReadonly">

          <select v-else-if="f.field_type === 'select'" :value="formData[f.id]" @input="v => formData[f.id] = v.target.value"
            class="fi-input" :disabled="isReadonly">
            <option value="">请选择</option>
            <option v-for="o in parseOpts(f)" :key="o" :value="o">{{o}}</option>
          </select>

          <div v-else-if="f.field_type === 'radio'" class="opt-row">
            <label v-for="o in parseOpts(f)" :key="o" class="opt-chip"
              :class="{on: formData[f.id] === o}">
              <input type="radio" :name="'f' + f.id" :value="o" :value="formData[f.id]" @input="v => formData[f.id] = v.target.value" :disabled="isReadonly">
              {{o}}
            </label>
          </div>

          <div v-else-if="f.field_type === 'checkbox'" class="opt-row">
            <label v-for="o in parseOpts(f)" :key="o" class="opt-chip"
              :class="{on: isChecked(f.id, o)}">
              <input type="checkbox" :value="o" :disabled="isReadonly" @change="toggleCheck(f.id, o)">
              {{o}}
            </label>
          </div>

          <div v-else-if="isPhotoType(f)">
            <div v-if="formData[f.id]" class="muted" style="font-size:13px;margin-bottom:6px">📎 {{formData[f.id]}}</div>
            <button v-if="notReadonly" class="btn-ghost" @click="pickFile(f)">
              {{formData[f.id] ? '重新选择' : (f.field_type === 'file' ? '选择文件' : '📷 上传')}}
            </button>
          </div>

          <div v-else-if="f.field_type === 'signature'" :value="formData[f.id]" @input="v => formData[f.id] = v.target.value"
            class="fi-input" :disabled="isReadonly" placeholder="请输入签名人姓名">签名人姓名</div>

          <div v-else class="fi-readonly">{{formData[f.id] || f.default_value || '—'}}</div>

          <div v-if="f.help_text" class="fi-help">{{f.help_text}}</div>
        </div>
        <div v-if="notFields" class="card muted" style="text-align:center">该模板暂无填写项</div>

        <div class="btn-row" v-if="notReadonly">
          <button class="btn-ghost" @click="prev">上一步</button>
          <button class="btn-primary" @click="next">下一步：提交</button>
        </div>
        <div class="btn-row" v-else>
          <button class="btn-ghost" @click="goList">返回列表</button>
        </div>
      </div>

      <!-- STEP 3: 提交确认 -->
      <div v-if="step === 3" class="card">
        <div v-if="isReadonly" class="center muted" style="padding:20px">该月调度已提交，无需重复操作</div>
        <template v-else>
          <div class="fi-label" style="margin-bottom:10px">确认提交</div>
          <div class="sum-line">设备：{{devDisplay}}</div>
          <div class="sum-line">月份：{{form.monthLabel}}</div>
          <div class="sum-line">模板：{{tplDisplay}}</div>
          <div class="sum-line">填写项：{{statsTotal}} 项（已填 {{statsPass}} / 未填 {{statsFail}}）</div>
          <div v-if="statsFail > 0" class="warn-tip">⚠ 有 {{statsFail}} 项未填写</div>
          <button class="btn-primary" style="margin-top:16px" @click="submit" :disabled="submitting">
            {{submitting ? '提交中...' : '确认提交'}}
          </button>
        </template>
        <button class="btn-ghost" style="margin-top:8px" @click="goList">返回列表</button>
      </div>
    </template>
  </div>
  `,
  data() {
    return {
      step: 0,
      steps: ['选设备', '选模板', '逐项填写', '提交'],
      loading: true,
      submitting: false,
      editId: null,
      viewMode: false,
      devices: [],
      templates: [],
      fields: [],
      deviceSearch: '',
      templateSearch: '',
      form: { deviceId: '', templateId: '', templateVersion: 1, monthLabel: '' },
      formData: {}
    };
  },
  computed: {
    filteredDevices() {
      var q = (this.deviceSearch || '').trim().toLowerCase();
      if (!q) return this.devices;
      var self = this;
      return this.devices.filter(function(d) {
        return contains(d.device_name, q) || contains(d.deviceName, q) ||
               contains(d.device_code, q) || contains(d.deviceCode, q) ||
               contains(d.location, q);
      });
    },
    filteredTemplates() {
      var q = (this.templateSearch || '').trim().toLowerCase();
      if (!q) return this.templates;
      var self = this;
      return this.templates.filter(function(t) {
        return contains(t.name, q) || contains(t.code, q);
      });
    },
    selectedDevice() {
      var id = this.form.deviceId;
      var self = this;
      return this.devices.find(function(d) { return String(d.id) === String(id); }) || null;
    },
    selectedTemplate() {
      var id = this.form.templateId;
      var self = this;
      return this.templates.find(function(t) { return String(t.id) === String(id); }) || null;
    },
    devDisplay() {
      var d = this.selectedDevice;
      return d ? ((d.device_name || d.deviceName || '') + ' ' + (d.device_code || d.deviceCode || '')).trim() : String(this.form.deviceId || '');
    },
    tplDisplay() {
      var t = this.selectedTemplate;
      return t ? (t.name || '') : String(this.form.templateId || '');
    },
    isReadonly() { return this.viewMode; },
    notReadonly() { return !this.viewMode; },
    notFields() { return !this.fields.length; },
    statsTotal() { return this.fields.length; },
    statsPass() {
      var self = this;
      var pass = 0;
      this.fields.forEach(function(f) {
        if (self.isRoField(f)) return;
        if (!f.required || !self.isEmpty(self.formData[f.id])) pass++;
      });
      return pass;
    },
    statsFail() { return this.statsTotal - this.statsPass; }
  },
  mounted: function() {
    this.initMonthLabel();
    this.editId = this.query.id || null;
    this.loadDevices();
    this.loadTemplates();
    if (this.editId) {
      this.loadDetail(this.editId);
    } else {
      this.loading = false;
    }
  },
  watch: {
    'query.id': {
      handler: function(nv) {
        var id = nv || null;
        if (String(id || '') !== String(this.editId || '')) {
          this.editId = id;
          this.reset();
          if (id) this.loadDetail(id);
        }
      }
    }
  },
  methods: {
    initMonthLabel: function() {
      var d = new Date();
      var p = function(n) { return String(n).padStart(2, '0'); };
      this.form.monthLabel = d.getFullYear() + '年' + p(d.getMonth() + 1) + '月';
    },
    async loadDevices() {
      try {
        var d = await api.get('/api/devices', { page: 1, size: 200 });
        this.devices = d.data || [];
      } catch (e) {
        if (!this._gone) utils.toast((e && e.message) || '设备列表加载失败');
      }
    },
    async loadTemplates() {
      try {
        var d = await api.get('/api/templates', { status: 'published', category: 'monthly', page: 1, size: 200 });
        this.templates = d.data || [];
      } catch (e) {
        try {
          var d2 = await api.get('/api/templates', { status: 'published', page: 1, size: 200 });
          this.templates = (d2.data || []).filter(function(t) {
            return t.category === 'monthly';
          });
        } catch(e2) {
          if (!this._gone) utils.toast((e && e.message) || '模板列表加载失败');
        }
      }
    },
    async selectTemplate(t) {
      this.form.templateId = t.id;
      this.form.templateVersion = t.version || 1;
      try {
        var d = await api.get('/api/templates/' + t.id);
        this.fields = d.fields || [];
        this.initFormData();
      } catch (e) {
        if (!this._gone) utils.toast((e && e.message) || '模板字段加载失败');
      }
    },
    initFormData: function() {
      var fd = {};
      var self = this;
      this.fields.forEach(function(f) {
        fd[f.id] = f.field_type === 'checkbox' ? [] : (f.default_value || f.defaultValue || '');
      });
      this.formData = fd;
    },
    async loadDetail(id) {
      var self = this;
      this.loading = true;
      try {
        var d = await api.get('/api/mobile/monthly/' + id);
        this.form.deviceId = d.device_id != null ? String(d.device_id) : '';
        this.form.monthLabel = d.month_label || d.monthLabel || this.form.monthLabel;
        this.form.templateId = d.template_id || '';
        this.form.templateVersion = d.template_version || d.templateVersion || 1;
        var ro = ['submitted', 'reviewed', 'closed', 'completed'];
        this.viewMode = ro.indexOf(d.status) >= 0;
        if (d.template_id) {
          try {
            var t = await api.get('/api/templates/' + d.template_id);
            this.fields = t.fields || [];
            this.initFormData();
          } catch(e) {}
        }
        if (d.items && d.items.length) {
          var self2 = this;
          d.items.forEach(function(it) {
            if (!it.field_id) return;
            var f = self2.fields.find(function(x) { return String(x.id) === String(it.field_id); });
            if (!f) return;
            var v = it.input_value;
            if (f.field_type === 'checkbox') self2.formData[f.id] = v ? String(v).split(',') : [];
            else self2.formData[f.id] = v == null ? '' : String(v);
          });
        }
        this.step = 2;
      } catch (e) {
        if (!this._gone) utils.toast((e && e.message) || '加载失败');
      } finally {
        if (!this._gone) this.loading = false;
      }
    },
    reset: function() {
      this.step = 0;
      this.viewMode = false;
      this.fields = [];
      this.formData = {};
      this.form = { deviceId: '', templateId: '', templateVersion: 1, monthLabel: this.form.monthLabel };
      this.loading = false;
    },
    parseOpts: function(f) {
      var o = f.options;
      if (Array.isArray(o)) return o;
      if (o == null || o === '') return [];
      return String(o).split(/[|,，;；、]/).map(function(s) { return s.trim(); }).filter(Boolean);
    },
    isTextOrNumber: function(f) { return f.field_type === 'text' || f.field_type === 'number'; },
    isPhotoType: function(f) { return f.field_type === 'photo' || f.field_type === 'ai_recognition' || f.field_type === 'file'; },
    isRoField: function(f) { return f.field_type === 'sensor_data' || f.field_type === 'computed'; },
    isEmpty: function(v) {
      if (Array.isArray(v)) return !v.length;
      return v == null || String(v).trim() === '';
    },
    isChecked: function(fieldId, val) {
      var arr = this.formData[fieldId];
      return Array.isArray(arr) && arr.indexOf(val) >= 0;
    },
    toggleCheck: function(fieldId, val) {
      var arr = this.formData[fieldId];
      if (!Array.isArray(arr)) arr = [];
      var idx = arr.indexOf(val);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(val);
      this.formData[fieldId] = arr;
    },
    pickFile: function(f) {
      var self = this;
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = f.field_type === 'file' ? '*/*' : 'image/*';
      input.onchange = function() {
        var file = input.files && input.files[0];
        if (file) self.formData[f.id] = file.name;
      };
      input.click();
    },
    next: function() {
      if (this.step === 0) {
        if (!this.form.deviceId) { utils.toast('请选择设备'); return; }
      }
      if (this.step === 1) {
        if (!this.form.templateId) { utils.toast('请选择月调度模板'); return; }
        if (!this.fields.length) { utils.toast('该模板暂无填写项'); return; }
      }
      if (this.step === 2 && !this.validateFields()) return;
      if (this.step < 3) this.step++;
    },
    prev: function() {
      if (this.step > 0) this.step--;
    },
    validateFields: function() {
      var skip = { sensor_data: 1, computed: 1 };
      var self = this;
      for (var i = 0; i < this.fields.length; i++) {
        var f = this.fields[i];
        if (skip[f.field_type] || !f.required) continue;
        if (this.isEmpty(this.formData[f.id])) {
          utils.toast('请填写：' + (f.field_label || f.field_name));
          return false;
        }
      }
      return true;
    },
    buildItems: function() {
      var self = this;
      return this.fields.map(function(f, idx) {
        var val = self.formData[f.id];
        var type = f.field_type;
        var inputValue = Array.isArray(val) ? val.join(',') : (val == null ? '' : String(val));
        var compareResult = 'pass';
        if (!self.isRoField(f) && f.required && self.isEmpty(val)) compareResult = 'fail';
        return {
          fieldId: f.id,
          itemSeq: f.sort_order != null ? f.sort_order : (idx + 1),
          itemName: f.field_label || f.field_name,
          itemType: type,
          inputValue: inputValue,
          compareResult: compareResult
        };
      });
    },
    async submit() {
      this.submitting = true;
      var self = this;
      try {
        var id = this.editId;
        if (!id) {
          var created = await api.post('/api/mobile/monthly', {
            deviceId: parseInt(this.form.deviceId) || 0,
            monthLabel: this.form.monthLabel,
            templateId: parseInt(this.form.templateId) || 0,
            templateVersion: parseInt(this.form.templateVersion) || 1
          });
          id = created.id;
          if (!id) throw new Error('创建失败，未获取到 ID');
        } else {
          await api.put('/api/mobile/monthly/' + id, {
            deviceId: parseInt(this.form.deviceId) || 0,
            templateId: parseInt(this.form.templateId) || 0
          });
        }
        var items = this.buildItems();
        if (items.length) {
          await api.post('/api/mobile/monthly/' + id + '/items', { items: items });
        }
        await api.post('/api/mobile/monthly/' + id + '/submit', {});
        utils.toast('提交成功');
        setTimeout(function() { utils.go('/monthly'); }, 900);
      } catch (e) {
        if (!this._gone) utils.toast((e && e.message) || '提交失败');
        this.submitting = false;
      }
    },
    goList: function() { utils.go('/monthly'); }
  },
  unmounted: function() { this._gone = true; }
};

function contains(str, sub) {
  str = str || '';
  return str.toLowerCase().indexOf(sub) >= 0;
}
