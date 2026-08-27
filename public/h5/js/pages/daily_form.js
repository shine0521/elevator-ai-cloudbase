// pages/daily_form.js — 日管控执行 M-04（转换自 elevator-mini/pages/daily_form + field_render.wxml）
// 5步：选设备 → 选模板 → 逐项检查 → 签名 → 提交
//  - 设备：GET /api/devices?page=&size=（web 通用列表接口）
//  - 模板：GET /api/templates?status=published → 选中后 GET /api/templates/:id 取字段
//  - 创建：POST /api/mobile/inspections {deviceId, checkDate, templateId, templateVersion}
//  - 检查项：POST /api/mobile/inspections/:id/items {items:[...]}
//  - 提交：POST /api/mobile/inspections/:id/submit {signature}（H5 用姓名输入替代手写签名）
window.Pages = window.Pages || {};
window.Pages.daily_form = {
  template: `
  <style>
  .fi-input { width: 100%; border: 1px solid var(--border); border-radius: 8px; padding: 11px; font-size: 15px; background: #fff; }
  .fi-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .fi-label { font-size: 14px; font-weight: 600; }
  .req { color: var(--red); font-weight: 700; }
  .fi-help { font-size: 12px; color: var(--muted); margin-top: 6px; }
  .fi-readonly { color: var(--muted); font-size: 14px; padding: 4px 0; }
  .fi-file { font-size: 13px; color: var(--primary); margin-bottom: 6px; }
  .opt { display: inline-flex; align-items: center; gap: 4px; margin: 4px 12px 4px 0; font-size: 14px; }
  .form-item { margin-bottom: 14px; }
  .form-label { font-size: 13px; color: var(--muted); margin-bottom: 6px; }
  .dev-list { max-height: 44vh; overflow-y: auto; }
  .dev-item { border: 1px solid var(--border); border-radius: 8px; padding: 10px; margin-bottom: 8px; cursor: pointer; }
  .dev-item.on { border-color: var(--primary); background: #f0f7ff; }
  .dev-name { font-size: 14px; font-weight: 500; }
  .btn-row { display: flex; gap: 10px; margin-top: 8px; }
  .btn-row button { flex: 1; margin-top: 0; }
  .btn-row .btn-ghost { width: auto; }
  .sum-line { font-size: 14px; padding: 2px 0; }
  .ok-icon { font-size: 56px; text-align: center; margin: 16px 0 8px; }
  </style>
  <div class="page">
    <!-- 步骤条 -->
    <div class="steps">
      <div class="step" v-for="(s, i) in steps" :key="s" :class="{on: i <= step}">
        <div class="dot">{{i + 1}}</div>{{s}}
      </div>
    </div>

    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>

    <template v-else>
      <!-- ============ STEP 0 选设备 ============ -->
      <div v-if="step === 0" class="card">
        <div class="form-item">
          <div class="form-label">检查日期</div>
          <input type="date" v-model="form.checkDate" class="fi-input">
        </div>
        <div class="form-item">
          <div class="form-label">选择设备</div>
          <input v-model="deviceSearch" class="fi-input" placeholder="搜索设备名称 / 编号">
        </div>
        <div class="dev-list">
          <div v-for="d in filteredDevices" :key="d.id" class="dev-item" :class="{on: form.deviceId == d.id}" @click="form.deviceId = d.id">
            <div class="dev-name">{{d.device_name}} <span class="muted">{{d.device_code}}</span></div>
            <div class="muted" style="font-size:12px">{{d.location || ''}} {{d.device_type || ''}}</div>
          </div>
          <div v-if="!filteredDevices.length" class="empty-state"><span class="muted">暂无设备</span></div>
        </div>
        <button class="btn-primary" @click="next">下一步：选择模板</button>
      </div>

      <!-- ============ STEP 1 选模板 ============ -->
      <div v-if="step === 1" class="card">
        <div class="form-item">
          <div class="form-label">检查模板（已发布）</div>
          <input v-model="templateSearch" class="fi-input" placeholder="搜索模板名称 / 编号">
        </div>
        <div class="dev-list">
          <div v-for="t in filteredTemplates" :key="t.id" class="dev-item" :class="{on: form.templateId == t.id}" @click="selectTemplate(t)">
            <div class="dev-name">{{t.name}} <span class="muted">v{{t.version}}</span></div>
            <div class="muted" style="font-size:12px">{{t.category || '通用'}} {{t.description || ''}}</div>
          </div>
          <div v-if="!filteredTemplates.length" class="empty-state"><span class="muted">暂无已发布模板</span></div>
        </div>
        <div class="btn-row">
          <button class="btn-ghost" @click="prev">上一步</button>
          <button class="btn-primary" @click="next">下一步：逐项检查</button>
        </div>
      </div>

      <!-- ============ STEP 2 逐项检查 ============ -->
      <div v-if="step === 2">
        <div class="card" v-if="viewMode"><span class="tag tag-green">该检查已提交，当前为只读查看</span></div>
        <div class="card" v-for="(f, idx) in fields" :key="f.id">
          <div class="fi-head">
            <span class="fi-label">{{idx + 1}}. {{f.field_label || f.field_name}}</span>
            <span class="req" v-if="f.required">*</span>
          </div>

          <!-- text / number -->
          <input v-if="f.field_type === 'text' || f.field_type === 'number'"
            v-model="formData[f.id]" class="fi-input"
            :type="f.field_type === 'number' ? 'number' : 'text'"
            :disabled="viewMode" :placeholder="f.placeholder || '请输入'">
          <!-- textarea -->
          <textarea v-else-if="f.field_type === 'textarea'"
            v-model="formData[f.id]" class="fi-input"
            :disabled="viewMode" :placeholder="f.placeholder || '请输入'"></textarea>
          <!-- date -->
          <input v-else-if="f.field_type === 'date'"
            v-model="formData[f.id]" class="fi-input" type="date" :disabled="viewMode">
          <!-- select -->
          <select v-else-if="f.field_type === 'select'"
            v-model="formData[f.id]" class="fi-input" :disabled="viewMode">
            <option value="">请选择</option>
            <option v-for="o in opts(f)" :key="o" :value="o">{{o}}</option>
          </select>
          <!-- radio -->
          <label v-else-if="f.field_type === 'radio'" v-for="o in opts(f)" :key="o" class="opt">
            <input type="radio" :name="'f' + f.id" :value="o" v-model="formData[f.id]" :disabled="viewMode"> {{o}}
          </label>
          <!-- checkbox -->
          <span v-else-if="f.field_type === 'checkbox'">
            <label v-for="o in opts(f)" :key="o" class="opt">
              <input type="checkbox" :value="o" v-model="formData[f.id]" :disabled="viewMode"> {{o}}
            </label>
          </span>
          <!-- photo / ai_recognition / file -->
          <div v-else-if="f.field_type === 'photo' || f.field_type === 'ai_recognition' || f.field_type === 'file'">
            <div v-if="formData[f.id]" class="fi-file">📎 {{formData[f.id]}}</div>
            <button v-if="!viewMode" class="btn-ghost" @click="pickFile(f)">
              {{formData[f.id] ? '重新选择' : (f.field_type === 'file' ? '选择文件' : '📷 拍照上传')}}
            </button>
            <div v-if="f.field_type === 'ai_recognition'" class="fi-help">拍照后系统将自动识别数据并填入</div>
          </div>
          <!-- signature -->
          <input v-else-if="f.field_type === 'signature'"
            v-model="formData[f.id]" class="fi-input"
            :disabled="viewMode" placeholder="签名人姓名">
          <!-- sensor_data / computed（只读） -->
          <div v-else class="fi-readonly">{{formData[f.id] || f.default_value || '—'}}</div>

          <div v-if="f.help_text" class="fi-help">{{f.help_text}}</div>
        </div>
        <div v-if="!fields.length" class="card muted">该模板暂无检查项</div>

        <div class="btn-row" v-if="!viewMode">
          <button class="btn-ghost" @click="prev">上一步</button>
          <button class="btn-primary" @click="next">下一步：签名</button>
        </div>
        <div class="btn-row" v-else>
          <button class="btn-ghost" @click="goList">返回列表</button>
        </div>
      </div>

      <!-- ============ STEP 3 签名 ============ -->
      <div v-if="step === 3" class="card">
        <div class="form-item">
          <div class="form-label">检查摘要</div>
          <div class="sum-line">设备：{{selectedDevice ? selectedDevice.device_name : form.deviceId}}</div>
          <div class="sum-line">日期：{{form.checkDate}}</div>
          <div class="sum-line">模板：{{selectedTemplate ? selectedTemplate.name : form.templateId}}</div>
          <div class="sum-line">检查项 {{stats.total}} 项 · 通过 {{stats.pass}} · 未通过 {{stats.fail}}</div>
        </div>
        <div class="form-item">
          <div class="form-label">签名（检查人姓名，替代手写签名）</div>
          <input v-model="signName" class="fi-input" placeholder="请输入检查人姓名" :disabled="viewMode">
        </div>
        <div class="btn-row">
          <button class="btn-ghost" @click="prev">上一步</button>
          <button class="btn-primary" @click="next">下一步：提交</button>
        </div>
      </div>

      <!-- ============ STEP 4 提交 ============ -->
      <div v-if="step === 4" class="card">
        <div v-if="viewMode" class="center muted">该检查已提交，无需重复操作</div>
        <template v-else>
          <div class="form-item">
            <div class="form-label">确认提交</div>
            <div class="sum-line">设备：{{selectedDevice ? selectedDevice.device_name : form.deviceId}}</div>
            <div class="sum-line">日期：{{form.checkDate}}</div>
            <div class="sum-line">模板：{{selectedTemplate ? selectedTemplate.name : form.templateId}}</div>
            <div class="sum-line">检查项：{{stats.total}} 项（通过 {{stats.pass}} / 未通过 {{stats.fail}}）</div>
            <div class="sum-line">签名：{{signName}}</div>
          </div>
          <button class="btn-primary" @click="submit" :disabled="submitting">
            {{submitting ? '提交中...' : '确认提交'}}
          </button>
          <div v-if="stats.fail > 0" class="fi-help" style="margin-top:8px">⚠ 有 {{stats.fail}} 项未通过，提交后将进入复核流程</div>
        </template>
        <button class="btn-ghost" style="margin-top:8px" @click="goList">返回列表</button>
      </div>
    </template>
  </div>
  `,
  data() {
    return {
      step: 0,
      steps: ['选设备', '选模板', '逐项检查', '签名', '提交'],
      loading: true,
      submitting: false,
      editId: null,
      viewMode: false,
      devices: [],
      templates: [],
      fields: [],
      deviceSearch: '',
      templateSearch: '',
      form: { deviceId: '', checkDate: todayStr(), templateId: '', templateVersion: 1 },
      formData: {},
      signName: ''
    };
  },
  computed: {
    filteredDevices() {
      const q = (this.deviceSearch || '').trim().toLowerCase();
      if (!q) return this.devices;
      return this.devices.filter(d =>
        String(d.device_name || '').toLowerCase().indexOf(q) >= 0 ||
        String(d.device_code || '').toLowerCase().indexOf(q) >= 0 ||
        String(d.location || '').toLowerCase().indexOf(q) >= 0
      );
    },
    filteredTemplates() {
      const q = (this.templateSearch || '').trim().toLowerCase();
      if (!q) return this.templates;
      return this.templates.filter(t =>
        String(t.name || '').toLowerCase().indexOf(q) >= 0 ||
        String(t.code || '').toLowerCase().indexOf(q) >= 0
      );
    },
    selectedDevice() {
      return this.devices.find(d => String(d.id) === String(this.form.deviceId)) || null;
    },
    selectedTemplate() {
      return this.templates.find(t => String(t.id) === String(this.form.templateId)) || null;
    },
    stats() {
      let pass = 0, fail = 0;
      this.fields.forEach(f => {
        const v = this.formData[f.id];
        const empty = Array.isArray(v) ? !v.length : (v == null || String(v).trim() === '');
        const ro = f.field_type === 'sensor_data' || f.field_type === 'computed';
        if (!ro && f.required && empty) fail++; else pass++;
      });
      return { total: this.fields.length, pass: pass, fail: fail };
    }
  },
  mounted() {
    this.editId = this.query.id || null;
    this.loadDevices();
    this.loadTemplates();
    if (this.editId) this.loadDetail();
    else this.loading = false;
  },
  watch: {
    // /daily_form → /daily_form?id=5 同组件不重建，监听 query.id
    'query.id'(nv) {
      const id = nv || null;
      if (String(id || '') !== String(this.editId || '')) {
        this.editId = id;
        this.reset();
        if (id) this.loadDetail();
      }
    }
  },
  methods: {
    async loadDevices() {
      try {
        const d = await api.get('/api/devices', { page: 1, size: 200 });
        this.devices = d.data || [];
      } catch (e) {
        if (!this._gone) utils.toast((e && e.message) || '设备列表加载失败');
      }
    },
    async loadTemplates() {
      try {
        const d = await api.get('/api/templates', { status: 'published', page: 1, size: 200 });
        this.templates = d.data || [];
      } catch (e) {
        if (!this._gone) utils.toast((e && e.message) || '模板列表加载失败');
      }
    },
    // 选中模板：立即拉取字段
    async selectTemplate(t) {
      this.form.templateId = t.id;
      this.form.templateVersion = t.version || 1;
      try {
        const d = await api.get('/api/templates/' + t.id);
        this.fields = d.fields || [];
        this.initFormData();
      } catch (e) {
        if (!this._gone) utils.toast((e && e.message) || '模板字段加载失败');
      }
    },
    initFormData() {
      const fd = {};
      this.fields.forEach(f => {
        fd[f.id] = f.field_type === 'checkbox' ? [] : (f.default_value || '');
      });
      this.formData = fd;
    },
    // 编辑模式：加载已有检查（含检查项回填）
    async loadDetail() {
      this.loading = true;
      try {
        const d = await api.get('/api/mobile/inspections/' + this.editId);
        this.form.deviceId = d.device_id != null ? d.device_id : '';
        this.form.checkDate = d.check_date ? String(d.check_date).substring(0, 10) : '';
        this.form.templateId = d.template_id || '';
        this.form.templateVersion = d.template_version || 1;
        this.viewMode = ['submitted', 'reviewed', 'completed'].indexOf(d.status) >= 0;
        if (d.template_id) {
          try {
            const t = await api.get('/api/templates/' + d.template_id);
            this.fields = t.fields || [];
            this.initFormData();
            (d.items || []).forEach(it => {
              if (it.field_id == null) return;
              const f = this.fields.find(x => String(x.id) === String(it.field_id));
              if (!f) return;
              const v = it.input_value;
              if (f.field_type === 'checkbox') this.formData[f.id] = v ? String(v).split(',') : [];
              else this.formData[f.id] = v == null ? '' : String(v);
            });
          } catch (e) { /* 模板缺失时保留空字段 */ }
        }
        this.signName = d.inspector_name || (Store.state.user && Store.state.user.name) || '';
        this.step = 2;
      } catch (e) {
        if (!this._gone) utils.toast((e && e.message) || '加载失败');
      } finally {
        if (!this._gone) this.loading = false;
      }
    },
    reset() {
      this.step = 0;
      this.viewMode = false;
      this.fields = [];
      this.formData = {};
      this.signName = '';
      this.form = { deviceId: '', checkDate: todayStr(), templateId: '', templateVersion: 1 };
      this.loading = false;
    },
    // 选项解析（服务端已解析为数组，兼容历史竖线/逗号格式）
    opts(f) {
      const o = f.options;
      if (Array.isArray(o)) return o;
      if (o == null || o === '') return [];
      return String(o).split(/[|,，;；、]/).map(s => s.trim()).filter(Boolean);
    },
    // 文件/拍照选择（H5 用文件选择替代，存文件名）
    pickFile(f) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = f.field_type === 'file' ? '*/*' : 'image/*';
      input.onchange = function () {
        const file = input.files && input.files[0];
        if (file) this.formData[f.id] = file.name;
      }.bind(this);
      input.click();
    },
    next() {
      if (this.step === 0) {
        if (!this.form.deviceId) { utils.toast('请选择设备'); return; }
        if (!this.form.checkDate) { utils.toast('请选择检查日期'); return; }
      }
      if (this.step === 1) {
        if (!this.form.templateId) { utils.toast('请选择检查模板'); return; }
      }
      if (this.step === 2 && !this.validateFields()) return;
      if (this.step === 3 && !this.signName.trim()) { utils.toast('请填写签名'); return; }
      if (this.step < 4) this.step++;
    },
    prev() {
      if (this.step > 0) this.step--;
    },
    validateFields() {
      const skip = { sensor_data: 1, computed: 1, photo: 1, file: 1, ai_recognition: 1 };
      for (const f of this.fields) {
        if (skip[f.field_type] || !f.required) continue;
        const v = this.formData[f.id];
        const empty = Array.isArray(v) ? !v.length : (v == null || String(v).trim() === '');
        if (empty) {
          utils.toast('请填写：' + (f.field_label || f.field_name));
          return false;
        }
      }
      return true;
    },
    buildItems() {
      const items = [];
      this.fields.forEach((f, idx) => {
        const val = this.formData[f.id];
        const required = !!f.required;
        const type = f.field_type;
        const ro = type === 'sensor_data' || type === 'computed';
        let inputValue = Array.isArray(val) ? val.join(',') : (val == null ? '' : String(val));
        let compareResult = 'pass';
        let failReason = '';
        if (!ro && required && !inputValue) {
          compareResult = 'fail';
          failReason = '未填写';
        }
        items.push({
          fieldId: f.id,
          itemSeq: f.sort_order != null ? f.sort_order : (idx + 1),
          itemName: f.field_label || f.field_name,
          itemCategory: 'daily',
          itemType: type,
          inputValue: inputValue,
          standardValue: f.default_value || '',
          compareRule: f.validation_rule || null,
          compareResult: compareResult,
          reviewRequired: compareResult === 'fail' ? 1 : 0,
          failReason: failReason || null
        });
      });
      return items;
    },
    async submit() {
      if (!this.signName.trim()) { utils.toast('请填写签名'); return; }
      this.submitting = true;
      try {
        let id = this.editId;
        if (!id) {
          const created = await api.post('/api/mobile/inspections', {
            deviceId: this.form.deviceId,
            checkDate: this.form.checkDate,
            templateId: this.form.templateId,
            templateVersion: this.form.templateVersion
          });
          id = created.id;
        }
        const items = this.buildItems();
        if (items.length) await api.post('/api/mobile/inspections/' + id + '/items', { items: items });
        await api.post('/api/mobile/inspections/' + id + '/submit', { signature: this.signName.trim() });
        utils.toast('提交成功');
        setTimeout(() => utils.go('/daily'), 900);
      } catch (e) {
        if (!this._gone) utils.toast((e && e.message) || '提交失败');
        this.submitting = false;
      }
    },
    goList() {
      utils.go('/daily');
    }
  },
  unmounted() { this._gone = true; }
};

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
