// pages/weekly_form.js — 周排查执行 M-10（4 步向导：选设备/周号 → 选模板 → 逐项检查 → 提交签名）
// 创建：POST /api/mobile/weekly {deviceId, weekNo, templateId}
// 提交项（与 daily 不同，逐条）：POST /api/mobile/weekly/:id/items {itemName,itemCategory,itemType,inputValue,standardValue,compareResult}
// 提交：POST /api/mobile/weekly/:id/submit {signature}
// query.id 存在则编辑模式（加载已有检查项）
(function () {
  window.Pages = window.Pages || {};

  window.Pages.weekly_form = {
    name: 'weekly_form',
    props: ['query'],

    data: function () {
      return {
        step: 0,
        steps: ['选设备', '选模板', '逐项检查', '提交签名'],
        loading: true,
        submitting: false,
        editId: null,
        viewMode: false,

        // 设备搜索
        deviceKeyword: '',
        deviceList: [],
        deviceLoading: false,

        // 模板搜索
        templateKeyword: '',
        templateList: [],
        templateLoading: false,

        // 选中
        selectedDevice: null,
        selectedTemplate: null,
        fields: [],

        // 周号（默认当前周）
        weekNo: (function () {
          var d = new Date();
          var start = new Date(d.getFullYear(), 0, 1);
          var days = Math.floor((d - start) / 86400000);
          return Math.ceil((days + start.getDay() + 1) / 7);
        })(),

        // 内置周排查检查项
        builtInFields: [
          { id: 'wb_1',  field_name: '曳引机运行状态',       field_type: 'radio',   options: ['正常', '异常'], required: true,  sort_order: 1  },
          { id: 'wb_2',  field_name: '制动器效能测试',       field_type: 'radio',   options: ['正常', '异常'], required: true,  sort_order: 2  },
          { id: 'wb_3',  field_name: '限速器动作测试',       field_type: 'radio',   options: ['正常', '异常'], required: true,  sort_order: 3  },
          { id: 'wb_4',  field_name: '安全钳联动测试',       field_type: 'radio',   options: ['正常', '异常'], required: true,  sort_order: 4  },
          { id: 'wb_5',  field_name: '层门门锁电气联锁',     field_type: 'radio',   options: ['正常', '异常'], required: true,  sort_order: 5  },
          { id: 'wb_6',  field_name: '轿门门锁电气联锁',     field_type: 'radio',   options: ['正常', '异常'], required: true,  sort_order: 6  },
          { id: 'wb_7',  field_name: '紧急照明与报警装置',   field_type: 'radio',   options: ['正常', '异常'], required: true,  sort_order: 7  },
          { id: 'wb_8',  field_name: '机房环境与通风',       field_type: 'radio',   options: ['正常', '异常'], required: false, sort_order: 8  },
          { id: 'wb_9',  field_name: '底坑环境（无积水/杂物）', field_type: 'radio', options: ['正常', '异常'], required: true,  sort_order: 9  },
          { id: 'wb_10', field_name: '井道照明',             field_type: 'radio',   options: ['正常', '异常'], required: false, sort_order: 10 },
          { id: 'wb_11', field_name: '钢丝绳磨损/断丝检查',  field_type: 'radio',   options: ['正常', '异常'], required: true,  sort_order: 11 },
          { id: 'wb_12', field_name: '备注说明',             field_type: 'textarea', options: [],            required: false, sort_order: 12 }
        ],

        // 动态表单数据
        formData: {},

        // 签名
        signature: ''
      };
    },

    computed: {
      activeFields: function () {
        if (this.fields && this.fields.length > 0) return this.fields;
        return this.builtInFields;
      },

      canNext: function () {
        if (this.step === 0) return !!this.selectedDevice;
        if (this.step === 1) return true; // 模板可跳过
        if (this.step === 2) return this.validateStep2();
        if (this.step === 3) return this.signature.trim().length > 0;
        return true;
      },

      passCount: function () {
        var n = 0;
        var self = this;
        this.activeFields.forEach(function (f) {
          if (self.fieldResult(f) === 'pass') n++;
        });
        return n;
      },

      failCount: function () {
        var n = 0;
        var self = this;
        this.activeFields.forEach(function (f) {
          if (self.fieldResult(f) === 'fail') n++;
        });
        return n;
      },

      hasFails: function () { return this.failCount > 0; },

      weekLabel: function () {
        var now = new Date();
        var y = now.getFullYear();
        var d = Math.ceil((new Date(y, 0, 1).getDay() + 1 + Math.floor((new Date(y, now.getMonth(), now.getDate()) - new Date(y, 0, 1)) / 86400000)) / 7);
        return y + '年第' + (this.weekNo || d) + '周';
      }
    },

    mounted: function () {
      var self = this;
      var id = this.query && this.query.id;
      if (id) {
        self.editId = id;
        self.loadEdit();
      } else {
        self.loading = false;
      }
    },

    watch: {
      'query.id': function (nv) {
        var id = nv || null;
        if (String(id || '') !== String(this.editId || '')) {
          this.editId = id;
          this.resetForm();
          if (id) this.loadEdit();
          else this.loading = false;
        }
      }
    },

    methods: {
      resetForm: function () {
        this.step = 0;
        this.viewMode = false;
        this.fields = [];
        this.formData = {};
        this.selectedDevice = null;
        this.selectedTemplate = null;
        this.signature = '';
        this.deviceList = [];
        this.templateList = [];
      },

      stepClass: function (i) {
        return { on: this.step === i, done: this.step > i };
      },

      // === 设备 ===
      searchDevice: function () {
        var self = this;
        self.deviceLoading = true;
        api.get('/api/devices', { search: self.deviceKeyword, page: 1, size: 50 })
          .then(function (d) { self.deviceList = (d && d.data) || d || []; })
          .catch(function () { self.deviceList = []; })
          .finally(function () { self.deviceLoading = false; });
      },

      doScan: function () {
        var self = this;
        utils.scanCode().then(function (code) {
          return api.scanDevice(code);
        }).then(function (dev) {
          self.selectedDevice = dev;
          self.deviceList = [];
        }).catch(function (e) {
          utils.toast((e && e.message) || '扫码失败');
        });
      },

      selectDevice: function (dev) {
        this.selectedDevice = dev;
        this.deviceList = [];
      },

      clearDevice: function () {
        this.selectedDevice = null;
      },

      // === 模板 ===
      loadTemplates: function () {
        var self = this;
        self.templateLoading = true;
        api.getTemplates({ status: 'published', page: 1, size: 100 })
          .then(function (d) {
            var all = (d && d.data) || d || [];
            var weekly = all.filter(function (t) {
              var cat = (t.category || '').toLowerCase();
              return cat.indexOf('周') >= 0 || cat.indexOf('weekly') >= 0;
            });
            self.templateList = weekly.length > 0 ? weekly : all;
          })
          .catch(function () { self.templateList = []; })
          .finally(function () { self.templateLoading = false; });
      },

      selectTemplate: function (t) {
        var self = this;
        this.selectedTemplate = t;
        this.fields = [];
        this.formData = {};
        api.getTemplateFields(t.id).then(function (d) {
          var fd = (d && d.data && d.data.fields) || d.fields || d || [];
          self.fields = fd;
          fd.forEach(function (f) {
            self.formData[f.id] = f.field_type === 'checkbox' ? [] : (f.default_value || '');
          });
        }).catch(function () { self.fields = []; });
      },

      // === 字段渲染 ===
      fieldLabel: function (f) {
        return f.field_label || f.field_name || f.item_name || '';
      },

      fieldCategory: function (f) {
        return f.item_category || f.category || '';
      },
      catText: function (t) { return t.category || '\u901a\u7528'; },
      tplClass: function (t) { return { on: !!(this.selectedTemplate && this.selectedTemplate.id === t.id) }; },

      isTextType: function (f) {
        return f.field_type === 'text' || f.field_type === 'number';
      },

      isMediaType: function (f) {
        return f.field_type === 'photo' || f.field_type === 'file' || f.field_type === 'ai_recognition';
      },

      parseOpts: function (f) {
        var o = f.options;
        if (Array.isArray(o)) return o;
        if (!o) return [];
        return String(o).split(/[,|，;；、]/).map(function (s) { return s.trim(); }).filter(Boolean);
      },

      isChecked: function (fid, val) {
        var arr = this.formData[fid];
        return Array.isArray(arr) && arr.indexOf(val) >= 0;
      },

      toggleCheck: function (fid, val) {
        var arr = this.formData[fid];
        if (!Array.isArray(arr)) arr = [];
        var idx = arr.indexOf(val);
        if (idx >= 0) arr.splice(idx, 1); else arr.push(val);
        this.formData[fid] = arr;
      },

      isEmpty: function (v) {
        if (Array.isArray(v)) return !v.length;
        return v == null || String(v).trim() === '';
      },

      fieldResult: function (f) {
        var v = this.formData[f.id];
        var type = f.field_type;
        if (type === 'radio' || type === 'select') {
          var ngVals = ['异常', '超差', 'fail', 'ng', '不合格'];
          if (ngVals.indexOf(String(v || '').trim()) >= 0) return 'fail';
        }
        if (!this.isEmpty(v)) return 'pass';
        if (f.required) return 'fail';
        return 'pass';
      },

      resultClass: function (f) {
        return this.fieldResult(f) === 'pass' ? 'tag-ok' : 'tag-ng';
      },

      resultLabel: function (f) {
        return this.fieldResult(f) === 'pass' ? '通过' : '异常';
      },

      validateStep2: function () {
        var skip = { sensor_data: 1, computed: 1, photo: 1, file: 1, ai_recognition: 1 };
        for (var i = 0; i < this.activeFields.length; i++) {
          var f = this.activeFields[i];
          if (skip[f.field_type]) continue;
          if (!f.required) continue;
          if (this.isEmpty(this.formData[f.id])) return false;
        }
        return true;
      },

      pickFile: function (f) {
        var self = this;
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = f.field_type === 'file' ? '*/*' : 'image/*';
        input.onchange = function () {
          var file = input.files && input.files[0];
          if (file) self.formData[f.id] = file.name;
        };
        input.click();
      },

      next: function () {
        var self = this;
        if (self.step === 0) {
          if (!self.selectedDevice) { utils.toast('请选择设备'); return; }
        }
        if (self.step === 3) {
          if (!self.signature.trim()) { utils.toast('请填写检查人签名'); return; }
        }
        if (self.step < 3) self.step++;
      },

      prev: function () {
        if (this.step > 0) this.step--;
      },

      // === 加载编辑数据 ===
      loadEdit: function () {
        var self = this;
        self.loading = true;
        api.getWeeklyDetail(self.editId).then(function (d) {
          var data = d.data || d;
          self.selectedDevice = {
            id: data.device_id,
            device_name: data.device_name,
            device_code: data.device_code,
            location: data.location
          };
          self.weekNo = data.week_no || data.weekNo || self.weekNo;
          self.signature = data.signature || '';

          var ro = ['submitted', 'reviewed', 'completed'];
          self.viewMode = ro.indexOf(data.status) >= 0;

          var items = data.items || [];
          if (items.length > 0) {
            self.fields = items.map(function (it, idx) {
              return {
                id: 'edit_w_' + (it.field_id || it.id || idx),
                field_name: it.item_name,
                field_type: it.item_type || 'text',
                options: it.item_type === 'select' ? ['正常', '异常', '超差'] : [],
                required: true,
                sort_order: it.item_seq || idx + 1
              };
            });
            items.forEach(function (it) {
              var fid = 'edit_w_' + (it.field_id || it.id);
              self.formData[fid] = it.input_value || '';
            });
          }
          self.step = 2;
          self.loading = false;
        }).catch(function () {
          self.loading = false;
          utils.toast('加载失败');
        });
      },

      // === 构建提交数据（逐条，与 daily 不同） ===
      buildItemPayload: function (f, idx) {
        var self = this;
        var val = self.formData[f.id];
        var inputValue = Array.isArray(val) ? val.join(',') : (val == null ? '' : String(val));
        var compareResult = self.fieldResult(f);
        return {
          itemName: self.fieldLabel(f),
          itemCategory: self.fieldCategory(f) || '周排查',
          itemType: f.field_type || 'text',
          inputValue: inputValue,
          standardValue: f.default_value || '',
          compareResult: compareResult,
          failReason: compareResult === 'fail' ? '检测值异常' : null
        };
      },

      // === 提交 ===
      doSubmit: function () {
        var self = this;
        if (self.submitting) return;
        self.submitting = true;

        var step1 = function () {
          if (self.editId) return Promise.resolve(self.editId);
          return api.createWeekly({
            deviceId: self.selectedDevice.id,
            weekNo: self.weekNo,
            templateId: self.selectedTemplate ? self.selectedTemplate.id : null
          }).then(function (res) {
            return res.id || (res.data && res.data.id) || null;
          });
        };

        var step2 = function (id) {
          if (!id) throw new Error('创建周排查失败');
          var items = self.activeFields.map(function (f, idx) {
            return self.buildItemPayload(f, idx);
          });
          // 周排查逐条提交（server.js POST /weekly/:id/items 接受单条）
          var promises = items.map(function (item) {
            return api.post('/api/mobile/weekly/' + id + '/items', item);
          });
          return Promise.all(promises).then(function () { return id; });
        };

        var step3 = function (id) {
          return api.submitWeekly(id, { signature: self.signature.trim() });
        };

        step1().then(step2).then(step3).then(function () {
          utils.toast('提交成功');
          setTimeout(function () { utils.go('/weekly'); }, 900);
        }).catch(function (e) {
          self.submitting = false;
          utils.toast((e && e.message) || '提交失败');
        });
      },

      goBack: function () { utils.go('/weekly'); }
    },

    unmounted: function () { this._gone = true; },

    template: [
      '<div class="page">',

        // ===== 步骤条 =====
        '<div class="steps">',
          '<div v-for="(s,i) in steps" :key="s" class="step" :class="stepClass(i)">',
            '<div class="dot">{{i+1}}</div>',
            '<div class="lab">{{s}}</div>',
          '</div>',
        '</div>',

        // ===== 加载态 =====
        '<div v-if="loading" style="text-align:center;padding:40px 0">',
          '<div style="font-size:36px">⏳</div>',
          '<div style="color:var(--text-3);margin-top:8px">加载中...</div>',
        '</div>',

        '<template v-else>',

          // ===== STEP 0：选设备 + 周号 =====
          '<div v-if="step === 0">',
            '<div class="card">',
              '<div class="card-h"><div class="card-t">📅 周排查信息</div></div>',

              '<div class="form-item">',
                '<div class="form-label">排查周期（第几周）</div>',
                '<div style="display:flex;gap:8px">',
                  '<select :value="weekNo" @change="e=>weekNo = e.target.value" class="fi-input" style="flex:1">',
                    '<option v-for="w in [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53]" :key="w" :value="w">第 {{w}} 周</option>',
                  '</select>',
                  '<div style="padding:10px 0;color:var(--text-3);font-size:13px;white-space:nowrap">{{weekLabel}}</div>',
                '</div>',
              '</div>',

              '<div class="form-item">',
                '<div class="form-label">选择设备 <span class="req">*</span></div>',
                '<div style="display:flex;gap:8px;margin-bottom:8px">',
                  '<input v-model="deviceKeyword" class="fi-input" style="flex:1" placeholder="搜索设备名称 / 编号" @keyup.enter="searchDevice">',
                  '<button class="btn-ghost" style="width:auto;padding:0 12px;flex:none" @click="searchDevice">搜索</button>',
                  '<button class="btn-primary" style="width:auto;padding:0 12px;flex:none" @click="doScan">📷</button>',
                '</div>',

                '<div v-if="selectedDevice" style="background:#f0f9eb;border:1px solid #c2e7b0;border-radius:8px;padding:10px 12px;margin-bottom:8px">',
                  '<div style="font-size:14px;font-weight:600">✅ {{selectedDevice.device_name}}</div>',
                  '<div style="font-size:12px;color:var(--text-3)">{{selectedDevice.device_code}} · {{selectedDevice.location}}</div>',
                  '<button v-if="!viewMode" class="btn-ghost btn-sm" style="margin-top:6px;width:auto;display:inline-block;padding:4px 12px" @click="clearDevice">清除选择</button>',
                '</div>',

                '<div v-if="deviceLoading" style="text-align:center;padding:10px;color:var(--text-3)">搜索中...</div>',
                '<div v-for="dev in deviceList" :key="dev.id" class="list-item" style="padding:10px 12px;border:1px solid var(--border-light);border-radius:6px;margin-bottom:6px;cursor:pointer" @click="selectDevice(dev)">',
                  '<div style="font-size:13px;font-weight:500">{{dev.device_name}}</div>',
                  '<div style="font-size:12px;color:var(--text-3)">{{dev.device_code}} · {{dev.location}}</div>',
                '</div>',
              '</div>',
            '</div>',

            '<div class="btn-row">',
              '<button class="btn-ghost" @click="goBack">返回</button>',
              '<button class="btn-primary" @click="next" :disabled="!canNext">下一步</button>',
            '</div>',
          '</div>',

          // ===== STEP 1：选模板 =====
          '<div v-if="step === 1">',
            '<div class="card">',
              '<div class="card-h"><div class="card-t">📋 选择模板</div></div>',
              '<div style="color:var(--text-3);font-size:12px;margin-bottom:12px">若跳过模板，将使用标准周排查检查项</div>',
              '<div style="margin-bottom:12px">',
                '<input v-model="templateKeyword" class="fi-input" placeholder="搜索模板名称" @focus="loadTemplates">',
              '</div>',
              '<div v-if="templateLoading" style="text-align:center;padding:10px;color:var(--text-3)">加载中...</div>',
              '<div v-for="t in templateList" :key="t.id" class="list-item" style="padding:10px 12px;border:1px solid var(--border-light);border-radius:6px;margin-bottom:6px;cursor:pointer" :class="tplClass(t)" @click="selectTemplate(t)">',
                '<div style="font-size:13px;font-weight:500">{{t.name}} <span style="color:var(--text-3)">v{{t.version||1}}</span></div>',
                '<div style="font-size:12px;color:var(--text-3)">{{t.category||\'通用\'}} · {{t.code||\'\'}}</div>',
              '</div>',
              '<div style="text-align:center;padding:12px 0">',
                '<button class="btn-ghost btn-sm" style="width:auto;display:inline-block;padding:6px 16px" @click="next">跳过，使用标准检查项</button>',
              '</div>',
            '</div>',
            '<div class="btn-row">',
              '<button class="btn-ghost" @click="prev">返回</button>',
              '<button class="btn-primary" @click="next">下一步</button>',
            '</div>',
          '</div>',

          // ===== STEP 2：逐项检查 =====
          '<div v-if="step === 2">',
            '<div v-if="viewMode" class="card" style="margin-bottom:10px">',
              '<span class="tag tag-info">该周排查已提交，当前为只读查看</span>',
            '</div>',

            '<div class="card" v-for="(f,i) in activeFields" :key="f.id" style="margin-bottom:10px">',
              '<div style="font-size:13px;font-weight:600;margin-bottom:8px">',
                '{{i+1}}. {{fieldLabel(f)}}',
                '<span v-if="f.required" style="color:var(--danger)"> *</span>',
                '<span v-if="fieldCategory(f)" style="color:var(--text-3);font-weight:400"> · {{fieldCategory(f)}}</span>',
              '</div>',

              '<input v-if="isTextType(f)"',
                ' class="fi-input"',
                ' :type="f.field_type===\'number\'?\'number\':\'text\'"',
                ' :value="formData[f.id]"',
                ' @input="e=>formData[f.id] = e.target.value"',
                ' :disabled="viewMode"',
                ' :placeholder="f.placeholder||\'请输入\'">',

              '<textarea v-else-if="f.field_type===\'textarea\'"',
                ' class="fi-input"',
                ' :value="formData[f.id]"',
                ' @input="e=>formData[f.id] = e.target.value"',
                ' :disabled="viewMode"',
                ' :placeholder="f.placeholder||\'请输入\'"',
                ' style="min-height:70px;resize:vertical"></textarea>',

              '<input v-else-if="f.field_type===\'date\'"',
                ' type="date" class="fi-input"',
                ' :value="formData[f.id]"',
                ' @input="e=>formData[f.id] = e.target.value"',
                ' :disabled="viewMode">',

              '<select v-else-if="f.field_type===\'select\'"',
                ' class="fi-input"',
                ' :value="formData[f.id]"',
                ' @change="e=>formData[f.id] = e.target.value"',
                ' :disabled="viewMode">',
                '<option value="">请选择</option>',
                '<option v-for="o in parseOpts(f)" :key="o" :value="o">{{o}}</option>',
              '</select>',

              '<div v-else-if="f.field_type===\'radio\'">',
                '<label v-for="o in parseOpts(f)" :key="o" style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--border-light);cursor:pointer">',
                  '<input type="radio" :name="\'f\'+f.id" :value="o" :checked="formData[f.id]===o" @change="formData[f.id]=o" :disabled="viewMode">',
                  '<span style="font-size:13px">{{o}}</span>',
                '</label>',
              '</div>',

              '<div v-else-if="f.field_type===\'checkbox\'">',
                '<label v-for="o in parseOpts(f)" :key="o" style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--border-light);cursor:pointer">',
                  '<input type="checkbox" :value="o" :checked="isChecked(f.id,o)" @change="toggleCheck(f.id,o)" :disabled="viewMode">',
                  '<span style="font-size:13px">{{o}}</span>',
                '</label>',
              '</div>',

              '<div v-else-if="isMediaType(f)">',
                '<div v-if="formData[f.id]" style="font-size:12px;color:var(--text-3);margin-bottom:6px">📎 {{formData[f.id]}}</div>',
                '<button v-if="!viewMode" class="btn-ghost btn-sm" style="width:auto;display:inline-block;padding:6px 14px" @click="pickFile(f)">',
                  '{{formData[f.id] ? \'重新选择\' : (f.field_type===\'file\'?\'选择文件\':\'📷 拍照\')}}',
                '</button>',
              '</div>',

              '<div v-else style="color:var(--text-3);font-size:13px">{{formData[f.id]||\'—\'}}</div>',

              '<div style="margin-top:8px">',
                '<span class="tag" :class="resultClass(f)">{{resultLabel(f)}}</span>',
              '</div>',
            '</div>',

            '<div class="card" style="margin-bottom:10px">',
              '<div style="font-size:13px">检查项 {{activeFields.length}} 项 · <span style="color:var(--success)">通过 {{passCount}}</span> · <span style="color:var(--danger)">异常 {{failCount}}</span></div>',
            '</div>',

            '<div class="btn-row">',
              '<button class="btn-ghost" @click="prev">返回</button>',
              '<button v-if="!viewMode" class="btn-primary" @click="next">下一步：签名</button>',
              '<button v-else class="btn-primary" @click="goBack">返回列表</button>',
            '</div>',
          '</div>',

          // ===== STEP 3：签名提交 =====
          '<div v-if="step === 3">',
            '<div class="card">',
              '<div class="card-h"><div class="card-t">🖊 提交签名</div></div>',
              '<div style="font-size:13px;color:var(--text-2);margin-bottom:14px">',
                '设备：{{selectedDevice ? selectedDevice.device_name : \'—\'}} ({{selectedDevice ? selectedDevice.device_code : \'—\'}})<br>',
                '排查周期：{{weekLabel}}<br>',
                '检查项：{{activeFields.length}} 项（通过 {{passCount}} / 异常 {{failCount}}）',
              '</div>',
              '<div v-if="hasFails" style="background:#fef0f0;border:1px solid #fbc4c4;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:13px;color:var(--danger)">',
                '⚠️ 有 {{failCount}} 项检测异常，提交后将进入复核流程',
              '</div>',
              '<div class="form-item">',
                '<div class="form-label">检查人签名（姓名）<span class="req">*</span></div>',
                '<input v-model="signature" class="fi-input" placeholder="请输入检查人姓名" :disabled="viewMode">',
              '</div>',
            '</div>',

            '<div v-if="!viewMode" class="btn-row">',
              '<button class="btn-ghost" @click="prev">返回</button>',
              '<button class="btn-primary" @click="doSubmit" :disabled="!canNext || submitting">',
                '{{submitting ? \'提交中...\' : \'确认提交\'}}',
              '</button>',
            '</div>',
            '<div v-else class="btn-row">',
              '<button class="btn-ghost" @click="goBack">返回列表</button>',
            '</div>',
          '</div>',

        '</template>',

        '<div style="height:20px"></div>',

      '</div>'
    ].join('')
  };
})();
