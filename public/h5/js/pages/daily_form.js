// pages/daily_form.js — 日管控执行 M-04
// 5步：选设备 → 选模板 → 逐项检查 → 签名 → 完成
// API:
//   GET  /api/mobile/devices                    设备列表（支持keyword搜索）
//   GET  /api/mobile/devices/scan?code=xxx      扫码查设备
//   GET  /api/templates?status=published         已发布模板
//   GET  /api/mobile/inspections/:id             详情（含items）
//   POST /api/mobile/inspections                创建设备检查
//   POST /api/mobile/inspections/:id/items      提交检查项
//   POST /api/mobile/inspections/:id/submit     最终提交
//   PUT  /api/mobile/inspections/:id            暂存进度

window.Pages = window.Pages || {};
window.Pages.daily_form = {
  template: `

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
      <div v-if="step === 0">
        <div class="card">
          <!-- 日期选择 -->
          <div class="form-item">
            <div class="form-label">检查日期</div>
            <input type="date" v-model="form.checkDate" class="fi-input">
          </div>

          <!-- 查看已有检查时的设备信息 -->
          <div v-if="hasInspection">
            <div class="pick-done">
              <div class="pick-done-txt">已选设备</div>
              <div class="dev-name">{{device ? device.device_name : ''}}</div>
              <div class="muted" style="font-size:12px">{{device ? device.device_code : ''}} · {{device ? device.location : ''}}</div>
            </div>
          </div>

          <!-- 新建时的设备选择 -->
          <template v-if="hasInspection === false">
            <!-- 搜索 + 扫码 -->
            <div class="scan-row">
              <input v-model="deviceSearch" class="fi-input" placeholder="搜索设备名称 / 编号">
              <button class="btn-ghost" @click="doDeviceSearch">搜索</button>
              <button class="btn-primary" @click="scanDevice" style="flex:0 0 auto;padding:0 12px;">扫码</button>
            </div>

            <!-- 搜索结果列表 -->
            <div class="dev-list">
              <div v-for="d in filteredDevices" :key="d.id" class="dev-item" :class="{on: form.deviceId === d.id}" @click="pickDevice(d)">
                <div class="dev-name">{{d.device_name}} <span class="muted">{{d.device_code}}</span></div>
                <div class="muted" style="font-size:12px">{{d.location ? d.location : ''}}</div>
              </div>
              <div v-if="filteredDevices.length === 0" class="empty-state"><span class="muted">暂无设备</span></div>
            </div>
          </template>

          <button class="btn-primary" @click="next">下一步：选择模板</button>
        </div>
      </div>

      <!-- ============ STEP 1 选模板 ============ -->
      <div v-if="step === 1">
        <div class="card">
          <div class="form-item">
            <div class="form-label">检查模板（已发布）</div>
            <input v-model="templateSearch" class="fi-input" placeholder="搜索模板名称" @input="filterTemplates">
          </div>
          <div class="dev-list">
            <div v-for="t in filteredTemplates" :key="t.id" class="dev-item" :class="{on: form.templateId === t.id}" @click="pickTemplate(t)">
              <div class="dev-name">{{t.name}} <span class="muted">v{{t.version ? t.version : 1}}</span></div>
              <div class="muted" style="font-size:12px">{{t.category ? t.category : '通用'}}</div>
            </div>
            <div v-if="filteredTemplates.length === 0" class="empty-state"><span class="muted">暂无已发布模板</span></div>
          </div>
          <div class="btn-row">
            <button class="btn-ghost" @click="prev">上一步</button>
            <button class="btn-primary" @click="next">下一步：逐项检查</button>
          </div>
        </div>
      </div>

      <!-- ============ STEP 2 逐项检查 ============ -->
      <div v-if="step === 2">
        <!-- 只读提示 -->
        <div v-if="isViewMode" class="card" style="margin-bottom:10px;">
          <span class="tag tag-green">该检查已提交，当前为只读查看</span>
        </div>

        <!-- 进度条 -->
        <div class="card progress">
          <div class="progress-bar">
            <span>已检 {{checkStats.passed + checkStats.failed}} / {{checkStats.total}}</span>
            <div class="progress-track">
              <div class="progress-fill" :style="{width: progressPercent + '%'}"></div>
            </div>
            <span class="tag tag-green" v-if="checkStats.failed === 0">全部通过</span>
            <span class="tag tag-red" v-if="checkStats.failed > 0">未通过 {{checkStats.failed}}</span>
          </div>
        </div>

        <!-- 检查项 -->
        <div v-for="(item, idx) in items" :key="item.fieldId" class="item-card">
          <div class="item-label-row">
            <span class="item-seq">{{idx + 1}}</span>
            <span class="fi-label">{{item.item_name}}</span>
            <span class="type-tag">{{typeLabel(item.item_type)}}</span>
            <span class="result-badge" :class="resultClass(item.compare_result)">{{resultLabel(item.compare_result)}}</span>
          </div>

          <!-- check（合格/不合格） -->
          <div v-if="item.item_type === 'check'">
            <div class="fi-check-btns">
              <button class="btn-pass" :class="{on: item.compare_result === 'pass'}" @click="setResult(idx, 'pass')">✓ 合格</button>
              <button class="btn-fail" :class="{on: item.compare_result === 'fail'}" @click="setResult(idx, 'fail')">✗ 不合格</button>
            </div>
          </div>

          <!-- select（单选） -->
          <div v-else-if="item.item_type === 'select'">
            <select v-model="item.input_value" class="fi-input" :disabled="isViewMode" @change="autoResult(idx)">
              <option value="">请选择</option>
              <option v-for="o in itemOptions(item)" :key="o" :value="o">{{o}}</option>
            </select>
          </div>

          <!-- input（文本） -->
          <div v-else-if="item.item_type === 'input'">
            <input v-model="item.input_value" class="fi-input" type="text" :disabled="isViewMode" placeholder="请输入">
          </div>

          <!-- numeric（数字） -->
          <div v-else-if="item.item_type === 'numeric'">
            <div v-if="item.standard_value" class="fi-help" style="margin-bottom:4px;">标准值参考：{{item.standard_value}}</div>
            <input v-model="item.input_value" class="fi-input" type="number" :disabled="isViewMode" placeholder="请输入数值">
          </div>

          <!-- photo（拍照） -->
          <div v-else-if="item.item_type === 'photo'">
            <div class="photo-row">
              <div v-for="(p, pi) in item.photos" :key="pi" style="position:relative;">
                <img :src="p" class="photo-thumb">
                <span v-if="isViewMode === false" class="photo-x" @click="removePhoto(idx, pi)">✕</span>
              </div>
              <div v-if="isViewMode === false" class="photo-add" @click="triggerPhoto(idx)">+</div>
              <input type="file" accept="image/*" style="display:none" :ref="'photo_' + idx" @change="onPhotoChange(idx, $event)">
            </div>
          </div>

          <!-- 默认输入 -->
          <div v-else>
            <input v-model="item.input_value" class="fi-input" type="text" :disabled="isViewMode" placeholder="请输入">
          </div>
        </div>

        <div v-if="items.length === 0" class="card"><span class="muted">该模板暂无检查项</span></div>

        <div class="card btn-row">
          <button class="btn-ghost" @click="prev">上一步</button>
          <button class="btn-primary" @click="next">下一步：签名</button>
        </div>
      </div>

      <!-- ============ STEP 3 签名 ============ -->
      <div v-if="step === 3">
        <div class="card">
          <div class="form-item">
            <div class="form-label">检查摘要</div>
            <div class="sum-line">设备：{{device ? device.device_name : ''}}</div>
            <div class="sum-line">日期：{{form.checkDate}}</div>
            <div class="sum-line">模板：{{template ? template.name : ''}}</div>
            <div class="sum-line">检查项 {{checkStats.total}} 项 · 通过 {{checkStats.passed}} · 未通过 {{checkStats.failed}}</div>
          </div>
          <div class="form-item">
            <div class="form-label">签名（请输入检查人姓名，替代手写签名）</div>
            <input v-model="signatureName" class="fi-input" type="text" placeholder="请输入检查人姓名" :disabled="isViewMode">
          </div>
          <div class="btn-row">
            <button class="btn-ghost" @click="prev">上一步</button>
            <button class="btn-primary" @click="next">确认并提交</button>
          </div>
        </div>
      </div>

      <!-- ============ STEP 4 完成 ============ -->
      <div v-if="step === 4" class="card">
        <div class="success-wrap">
          <div class="success-icon">✅</div>
          <div class="success-title">提交成功</div>
          <div class="success-sub">日管控检查已完成提交</div>
          <div class="success-btns">
            <button class="btn-primary" @click="viewDetail">查看详情</button>
            <button class="btn-ghost" @click="goWorkbench">返回工作台</button>
          </div>
        </div>
      </div>
    </template>
  </div>
  `,

  data: function() {
    return {
      step: 0,
      steps: ['选设备', '选模板', '逐项检查', '签名', '完成'],
      loading: false,
      submitting: false,
      form: {
        checkDate: todayStr(),
        deviceId: null,
        templateId: null,
        inspectionId: null
      },
      device: null,
      template: null,
      templateFields: [],
      items: [],
      deviceSearch: '',
      templateSearch: '',
      deviceList: [],
      templateList: [],
      signatureName: '',
      stats: { total: 0, passed: 0, failed: 0 }
    };
  },

  computed: {
    filteredDevices: function() {
      var kw = this.deviceSearch.toLowerCase();
      var list = this.deviceList;
      if (!kw) return list;
      return list.filter(function(d) {
        return (d.device_name || '').toLowerCase().indexOf(kw) >= 0 ||
               (d.device_code || '').toLowerCase().indexOf(kw) >= 0;
      });
    },
    filteredTemplates: function() {
      var kw = this.templateSearch.toLowerCase();
      var list = this.templateList;
      if (!kw) return list;
      return list.filter(function(t) {
        return (t.name || '').toLowerCase().indexOf(kw) >= 0 ||
               (t.code || '').toLowerCase().indexOf(kw) >= 0;
      });
    },
    canNext: function() {
      if (this.step === 0) return !!(this.form.deviceId) && !!(this.form.checkDate);
      if (this.step === 1) return !!(this.form.templateId);
      if (this.step === 2) return this.items.length > 0;
      return true;
    },
    hasInspection: function() {
      return !!(this.form.inspectionId);
    },
    isViewMode: function() {
      if (!this.form.inspectionId) return false;
      var status = this._inspectionStatus;
      return status === 'submitted' || status === 'reviewed' || status === 'reviewed';
    },
    checkStats: function() {
      var total = this.items.length;
      var passed = 0;
      var failed = 0;
      var i, len;
      for (i = 0, len = total; i < len; i++) {
        if (this.items[i].compare_result === 'pass') passed++;
        else if (this.items[i].compare_result === 'fail') failed++;
      }
      return { total: total, passed: passed, failed: failed };
    },
    progressPercent: function() {
      var total = this.stats.total;
      if (!total) return 0;
      var done = this.stats.passed + this.stats.failed;
      return Math.round(done / total * 100);
    }
  },

  mounted: function() {
    var self = this;
    var id = this.query && this.query.id ? String(this.query.id) : null;
    if (id) {
      this.form.inspectionId = id;
      this.loadInspection(id);
    } else {
      this.loadDeviceList();
      this.loadTemplateList();
    }
  },

  methods: {
    // ---------- 设备 ----------
    loadDeviceList: function(kw) {
      var self = this;
      var params = { page: 1, size: 200 };
      if (kw) params.keyword = kw;
      api.get('/api/mobile/devices', params).then(function(d) {
        self.deviceList = d.data || [];
      }).catch(function(e) {
        utils.toast('设备列表加载失败');
      });
    },
    doDeviceSearch: function() {
      this.loadDeviceList(this.deviceSearch);
    },
    scanDevice: function() {
      var self = this;
      utils.scanCode(function(code) {
        api.get('/api/mobile/devices/scan', { code: code }).then(function(d) {
          if (d && d.id) {
            self.pickDevice(d);
            var exists = self.deviceList.some(function(x) { return x.id === d.id; });
            if (!exists) self.deviceList.unshift(d);
          } else {
            utils.toast('未找到该设备');
          }
        }).catch(function() {
          utils.toast('扫码查询失败');
        });
      });
    },
    pickDevice: function(d) {
      this.form.deviceId = d.id;
      this.device = d;
    },

    // ---------- 模板 ----------
    loadTemplateList: function() {
      var self = this;
      api.get('/api/templates', { status: 'published', page: 1, size: 200 }).then(function(d) {
        self.templateList = d.data || [];
      }).catch(function(e) {
        utils.toast('模板列表加载失败');
      });
    },
    filterTemplates: function() {
      // computed 过滤，无需额外处理
    },
    pickTemplate: function(t) {
      this.form.templateId = t.id;
      this.template = t;
    },

    // ---------- 已有检查加载 ----------
    loadInspection: function(id) {
      var self = this;
      this.loading = true;
      api.get('/api/mobile/inspections/' + id).then(function(d) {
        self.form.checkDate = d.check_date ? String(d.check_date).substring(0, 10) : todayStr();
        self.form.inspectionId = d.id;
        self.form.deviceId = d.device_id;
        self.form.templateId = d.template_id;
        self._inspectionStatus = d.status;

        // 加载设备信息
        if (d.device) {
          self.device = d.device;
        } else if (d.device_id) {
          self.device = { id: d.device_id, device_name: d.device_name || '', device_code: d.device_code || '', location: d.location || '' };
        }

        // 加载模板字段
        if (d.template_id) {
          api.get('/api/templates/' + d.template_id).then(function(tpl) {
            self.template = tpl;
            self.templateFields = tpl.fields || tpl.template_fields || [];
            self.buildItemsFromTemplate();
            self.loadDeviceList();
            self.loadTemplateList();
          }).catch(function() {
            self.loadDeviceList();
            self.loadTemplateList();
          });
        } else {
          self.loadDeviceList();
          self.loadTemplateList();
        }

        // 回填检查项
        if (d.items && d.items.length > 0) {
          self.items = d.items.map(function(it) {
            var photos = [];
            if (it.photos) {
              try { photos = JSON.parse(it.photos); } catch(e) { photos = []; }
            }
            return {
              fieldId: it.field_id,
              item_seq: it.item_seq || 1,
              item_name: it.item_name || '',
              item_type: it.item_type || 'input',
              input_value: it.input_value || '',
              compare_result: it.compare_result || 'pending',
              photos: photos,
              standard_value: it.standard_value || ''
            };
          });
          self.step = 2;
          self.loading = false;
        } else {
          self.step = 0;
          self.loading = false;
        }

        self.signatureName = d.inspector_name || '';

      }).catch(function(e) {
        utils.toast('加载失败');
        self.loading = false;
        self.loadDeviceList();
        self.loadTemplateList();
      });
    },

    buildItemsFromTemplate: function() {
      var self = this;
      if (this.items.length > 0) return;
      this.templateFields.forEach(function(f, i) {
        self.items.push({
          fieldId: f.id,
          item_seq: i + 1,
          item_name: f.field_name || f.name || '',
          item_type: f.field_type || 'input',
          input_value: '',
          compare_result: 'pending',
          photos: [],
          standard_value: f.standard_value || f.default_value || ''
        });
      });
    },

    // ---------- 检查项操作 ----------
    setResult: function(idx, result) {
      this.items[idx].compare_result = result;
    },
    autoResult: function(idx) {
      var item = this.items[idx];
      if (item.input_value) {
        item.compare_result = 'pass';
      } else {
        item.compare_result = 'pending';
      }
    },
    typeLabel: function(type) {
      var map = {
        'check': '合格/不合格',
        'select': '单选',
        'input': '文本',
        'numeric': '数值',
        'photo': '拍照'
      };
      return map[type] || '文本';
    },
    resultClass: function(r) {
      if (r === 'pass') return 'result-pass';
      if (r === 'fail') return 'result-fail';
      return 'result-pending';
    },
    resultLabel: function(r) {
      if (r === 'pass') return '✓ 通过';
      if (r === 'fail') return '✗ 未通过';
      return '— 待检';
    },
    itemOptions: function(item) {
      var opts = item.options || item.field_options || '';
      if (Array.isArray(opts)) return opts;
      if (!opts) return [];
      return String(opts).split(/[|,，;；、]/).map(function(s) { return s.trim(); }).filter(Boolean);
    },
    triggerPhoto: function(idx) {
      var el = this.$refs['photo_' + idx];
      if (el && el[0]) el[0].click();
    },
    onPhotoChange: function(idx, e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      var photos = this.items[idx].photos || [];
      var self = this;
      files.forEach(function(f) {
        if (photos.length >= 6) return;
        photos.push(URL.createObjectURL(f));
      });
      self.items[idx].photos = photos;
      e.target.value = '';
    },
    removePhoto: function(idx, pi) {
      var photos = this.items[idx].photos || [];
      photos.splice(pi, 1);
      this.items[idx].photos = photos;
    },

    // ---------- 步骤流转 ----------
    next: function() {
      if (!this.canNext) {
        if (this.step === 0 && !this.form.deviceId) { utils.toast('请选择设备'); return; }
        if (this.step === 0 && !this.form.checkDate) { utils.toast('请选择检查日期'); return; }
        if (this.step === 1 && !this.form.templateId) { utils.toast('请选择检查模板'); return; }
        return;
      }
      if (this.step === 0) {
        this.doStep0Next();
      } else if (this.step === 1) {
        this.doStep1Next();
      } else if (this.step === 2) {
        this.doStep2Next();
      } else if (this.step === 3) {
        this.doStep3Next();
      }
    },
    prev: function() {
      if (this.step > 0) this.step--;
    },

    doStep0Next: function() {
      var self = this;
      if (!this.form.inspectionId) {
        // 新建检查
        api.post('/api/mobile/inspections', {
          deviceId: this.form.deviceId,
          checkDate: this.form.checkDate,
          templateId: this.form.templateId
        }).then(function(d) {
          self.form.inspectionId = d.id;
          self.step = 1;
        }).catch(function(e) {
          utils.toast('创建设备检查失败');
        });
      } else {
        // 已有检查直接进入下一步
        this.step = 1;
      }
    },

    doStep1Next: function() {
      var self = this;
      // 已有 items（编辑/查看模式）直接进入
      if (this.items.length > 0) {
        this.step = 2;
        return;
      }
      // 新建时从模板加载字段
      api.get('/api/templates/' + this.form.templateId).then(function(tpl) {
        self.template = tpl;
        self.templateFields = tpl.fields || tpl.template_fields || [];
        self.buildItemsFromTemplate();
        self.step = 2;
      }).catch(function() {
        utils.toast('加载模板字段失败');
      });
    },

    doStep2Next: function() {
      var self = this;
      // 暂存进度
      api.put('/api/mobile/inspections/' + this.form.inspectionId, {
        status: 'ongoing',
        totalItems: this.checkStats.total,
        passedItems: this.checkStats.passed,
        failedItems: this.checkStats.failed
      }).then(function() {
        self.step = 3;
      }).catch(function() {
        // 暂存失败不影响继续
        self.step = 3;
      });
    },

    doStep3Next: function() {
      var name = this.signatureName ? this.signatureName.trim() : '';
      if (!name) {
        utils.toast('请输入检查人姓名');
        return;
      }
      this.doSubmit(name);
    },

    doSubmit: function(signName) {
      var self = this;
      this.submitting = true;
      var inspectionId = this.form.inspectionId;

      // 提交检查项
      var payload = this.items.map(function(item) {
        return {
          fieldId: item.fieldId,
          inputValue: item.input_value,
          compareResult: item.compare_result,
          photos: JSON.stringify(item.photos || [])
        };
      });

      Promise.resolve()
        .then(function() {
          return api.post('/api/mobile/inspections/' + inspectionId + '/items', { items: payload });
        })
        .then(function() {
          return api.post('/api/mobile/inspections/' + inspectionId + '/submit', { signature: signName });
        })
        .then(function() {
          self.step = 4;
          self.submitting = false;
        })
        ['catch'](function(e) {
          utils.toast('提交失败：' + (e.message || '网络错误'));
          self.submitting = false;
        });
    },

    viewDetail: function() {
      if (this.form.inspectionId) {
        utils.go('/daily_form?id=' + this.form.inspectionId);
      } else {
        this.goWorkbench();
      }
    },
    goWorkbench: function() {
      utils.go('/');
    }
  }
};

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
