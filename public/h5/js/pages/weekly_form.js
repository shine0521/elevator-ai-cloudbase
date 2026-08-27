// pages/weekly_form.js — 周排查执行 M-06（与 daily_form 高度相似，5 步：选设备→选模板→逐项检查→签名→提交）
//  - 设备：GET /api/devices?page=&size=（web 通用列表接口）
//  - 模板：GET /api/templates?status=published → 选中后 GET /api/templates/:id 取字段
//  - 创建：POST /api/mobile/weekly {deviceId, weekNo, templateId, templateVersion}
//  - 检查项：POST /api/mobile/weekly/:id/items {items:[...]}
//  - 提交：POST /api/mobile/weekly/:id/submit {signature}（H5 用姓名输入替代手写签名）
// 差异点：用 weekNo（当前第几周）替代 checkDate；itemCategory 用 weekly；标签显示"周排查"
window.Pages = window.Pages || {};
window.Pages.weekly_form = {
  template: `
  <div class="page">
    <!-- 步骤条 -->
    <div class="steps">
      <div class="step" v-for="(s, i) in steps" :key="s" :class="{on: stepOn(i)}">
        <div class="dot">{{i + 1}}</div>{{s}}
      </div>
    </div>

    <div v-if="loading" class="empty-state"><span class="muted">加载中...</span></div>

    <template v-else>
      <!-- ============ STEP 0 选设备 + 周号 ============ -->
      <div v-if="step === 0" class="card">
        <div class="card-title">周排查信息 <span class="type-tag">周排查</span></div>
        <div class="form-item">
          <div class="form-label">排查周期（第几周）</div>
          <select v-model="form.weekNo" class="fi-input">
            <option v-for="o in weekOptions" :key="o.value" :value="o.value">{{o.label}}</option>
          </select>
          <div class="fi-help">当前周号：{{weekLabel}}</div>
        </div>
        <div class="form-item">
          <div class="form-label">选择设备</div>
          <input v-model="deviceSearch" class="fi-input" placeholder="搜索设备名称 / 编号">
        </div>
        <div class="dev-list">
          <div v-for="d in filteredDevices" :key="d.id" class="dev-item" :class="{on: form.deviceId == d.id}" @click="form.deviceId = d.id">
            <div class="dev-name">{{d.device_name}} <span class="muted">{{d.device_code}}</span></div>
            <div class="muted" style="font-size:12px">{{locText(d)}} {{typeText(d)}}</div>
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
            <div class="muted" style="font-size:12px">{{catText(t)}} {{descText(t)}}</div>
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
            <span class="fi-label">{{idx + 1}}. {{fieldName(f)}}</span>
            <span class="req" v-if="f.required">*</span>
          </div>

          <!-- text / number -->
          <input v-if="isTextType(f)"
            :value="formData[f.id]" @input="v => formData[f.id] = v.target.value" class="fi-input"
            :type="f.field_type === 'number' ? 'number' : 'text'"
            :disabled="viewMode" :placeholder="placeholderOf(f)">
          <!-- textarea -->
          <textarea v-else-if="f.field_type === 'textarea'"
            :value="formData[f.id]" @input="v => formData[f.id] = v.target.value" class="fi-input"
            :disabled="viewMode" :placeholder="placeholderOf(f)"></textarea>
          <!-- date -->
          <input v-else-if="f.field_type === 'date'"
            :value="formData[f.id]" @input="v => formData[f.id] = v.target.value" class="fi-input" type="date" :disabled="viewMode">
          <!-- select -->
          <select v-else-if="f.field_type === 'select'"
            :value="formData[f.id]" @input="v => formData[f.id] = v.target.value" class="fi-input" :disabled="viewMode">
            <option value="">请选择</option>
            <option v-for="o in opts(f)" :key="o" :value="o">{{o}}</option>
          </select>
          <!-- radio -->
          <label v-else-if="f.field_type === 'radio'" v-for="o in opts(f)" :key="o" class="opt">
            <input type="radio" :name="'f' + f.id" :value="o" :value="formData[f.id]" @input="v => formData[f.id] = v.target.value" :disabled="viewMode"> {{o}}
          </label>
          <!-- checkbox -->
          <span v-else-if="f.field_type === 'checkbox'">
            <label v-for="o in opts(f)" :key="o" class="opt">
              <input type="checkbox" :value="o" :value="formData[f.id]" @input="v => formData[f.id] = v.target.value" :disabled="viewMode"> {{o}}
            </label>
          </span>
          <!-- photo / ai_recognition / file -->
          <div v-else-if="isMediaType(f)">
            <div v-if="formData[f.id]" class="fi-file">📎 {{formData[f.id]}}</div>
            <button v-if="!viewMode" class="btn-ghost" @click="pickFile(f)">
              {{formData[f.id] ? '重新选择' : (f.field_type === 'file' ? '选择文件' : '📷 拍照上传')}}
            </button>
            <div v-if="f.field_type === 'ai_recognition'" class="fi-help">拍照后系统将自动识别数据并填入</div>
          </div>
          <!-- signature -->
          <input v-else-if="f.field_type === 'signature'"
            :value="formData[f.id]" @input="v => formData[f.id] = v.target.value" class="fi-input"
            :disabled="viewMode" placeholder="签名人姓名">
          <!-- sensor_data / computed（只读） -->
          <div v-else class="fi-readonly">{{readonlyVal(f)}}</div>

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
          <div class="sum-line">类型：<span class="type-tag">周排查</span></div>
          <div class="sum-line">设备：{{selectedDevice ? selectedDevice.device_name : form.deviceId}}</div>
          <div class="sum-line">周号：{{weekLabel}}</div>
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
            <div class="sum-line">类型：<span class="type-tag">周排查</span></div>
            <div class="sum-line">设备：{{selectedDevice ? selectedDevice.device_name : form.deviceId}}</div>
            <div class="sum-line">周号：{{weekLabel}}</div>
            <div class="sum-line">模板：{{selectedTemplate ? selectedTemplate.name : form.templateId}}</div>
            <div class="sum-line">检查项：{{stats.total}} 项（通过 {{stats.pass}} / 未通过 {{stats.fail}}）</div>
            <div class="sum-line">签名：{{signName}}</div>
          </div>
          <button class="btn-primary" @click="submit" :disabled="submitting">
            {{submitting ? '提交中...' : '确认提交'}}
          </button>
          <div v-if="hasFail" class="fi-help" style="margin-top:8px">⚠ 有 {{stats.fail}} 项未通过，提交后将进入复核流程</div>
        </template>
        <button class="btn-ghost" style="margin-top:8px" @click="goList">返回列表</button>
      </div>
    </template>
  </div>
  `,
  props: ['query'],
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
      form: {
        deviceId: '',
        weekNo: Math.ceil(new Date().getDate() / 7),
        templateId: '',
        templateVersion: 1
      },
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
    weekOptions() {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const days = new Date(y, m + 1, 0).getDate();
      const mm = String(m + 1).padStart(2, '0');
      const opts = [];
      let wk = 1;
      for (let start = 1; start <= days; start += 7) {
        const end = Math.min(start + 6, days);
        const s = String(start).padStart(2, '0');
        const e = String(end).padStart(2, '0');
        opts.push({ value: wk, label: '第' + wk + '周 (' + mm + '/' + s + ' - ' + mm + '/' + e + ')' });
        wk++;
      }
      return opts;
    },
    weekLabel() {
      const opt = this.weekOptions.find(o => o.value === this.form.weekNo);
      if (opt) return opt.label;
      return this.isoWeek(new Date());
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
    this.editId = (this.query && this.query.id) || null;
    this.loadDevices();
    this.loadTemplates();
    if (this.editId) this.loadDetail();
    else this.loading = false;
  },
  watch: {
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
    stepOn(i) {
      return i <= this.step;
    },
    locText(d) {
      return d.location || '';
    },
    typeText(d) {
      return d.device_type || '';
    },
    catText(t) {
      return t.category || '通用';
    },
    descText(t) {
      return t.description || '';
    },
    fieldName(f) {
      return f.field_label || f.field_name;
    },
    readonlyVal(f) {
      return this.formData[f.id] || f.default_value || '—';
    },
    placeholderOf(f) {
      return f.placeholder || '请输入';
    },
    isTextType(f) {
      return f.field_type === 'text' || f.field_type === 'number';
    },
    isMediaType(f) {
      return f.field_type === 'photo' || f.field_type === 'ai_recognition' || f.field_type === 'file';
    },
    isoWeek(date) {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - dayNum + 3);
      const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
      const diff = (d - firstThursday) / 86400000;
      const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
      return date.getFullYear() + '-W' + String(week).padStart(2, '0');
    },
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
        const d = await api.get('/api/mobile/weekly/' + this.editId);
        const meta = d.data || d || {};
        this.form.deviceId = meta.device_id != null ? meta.device_id : (meta.deviceId != null ? meta.deviceId : '');
        if (meta.week_no != null) this.form.weekNo = meta.week_no;
        else if (meta.weekNo != null) this.form.weekNo = meta.weekNo;
        this.form.templateId = meta.template_id || (meta.templateId || '');
        this.form.templateVersion = meta.template_version || (meta.templateVersion || 1);
        this.viewMode = ['submitted', 'reviewed', 'completed'].indexOf(meta.status) >= 0;
        if (this.form.templateId) {
          try {
            const t = await api.get('/api/templates/' + this.form.templateId);
            this.fields = t.fields || [];
            this.initFormData();
            (meta.items || []).forEach(it => {
              if (it.field_id == null) return;
              const f = this.fields.find(x => String(x.id) === String(it.field_id));
              if (!f) return;
              const v = it.input_value;
              if (f.field_type === 'checkbox') this.formData[f.id] = v ? String(v).split(',') : [];
              else this.formData[f.id] = v == null ? '' : String(v);
            });
          } catch (e) { /* 模板缺失时保留空字段 */ }
        }
        this.signName = meta.inspector_name || (meta.inspectorName || (Store.state.user && Store.state.user.name) || '');
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
      this.form = {
        deviceId: '',
        weekNo: Math.ceil(new Date().getDate() / 7),
        templateId: '',
        templateVersion: 1
      };
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
        if (!this.form.weekNo) { utils.toast('请选择排查周期'); return; }
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
          itemCategory: 'weekly',
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
          const created = await api.post('/api/mobile/weekly', {
            deviceId: this.form.deviceId,
            weekNo: this.form.weekNo,
            templateId: this.form.templateId,
            templateVersion: this.form.templateVersion
          });
          id = created.id || (created.data && created.data.id);
        }
        const items = this.buildItems();
        if (items.length) await api.post('/api/mobile/weekly/' + id + '/items', { items: items });
        await api.post('/api/mobile/weekly/' + id + '/submit', { signature: this.signName.trim() });
        utils.toast('提交成功');
        setTimeout(() => utils.go('/weekly'), 900);
      } catch (e) {
        if (!this._gone) utils.toast((e && e.message) || '提交失败');
        this.submitting = false;
      }
    },
    goList() {
      utils.go('/weekly');
    },
    hasFail() {
      return this.stats.fail > 0;
    }
  },
  unmounted() { this._gone = true; }
};
