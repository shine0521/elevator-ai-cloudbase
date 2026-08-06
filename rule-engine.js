/**
 * 规则执行引擎 - 动态规则配置与执行
 * 
 * 特性：
 *   - 支持从数据库加载规则（动态配置）
 *   - 支持多种规则类型：COMPARE、RANGE、EXISTS、REGEX、COMBINE、CUSTOM
 *   - 支持规则优先级和启用/禁用
 *   - 支持规则测试和预览
 *   - 完整的执行日志和结果追踪
 *   - P0.3: 支持 AND/OR/in 条件语法
 *   - P0.4: 支持 Handlebars 风格输出生成器
 * 
 * 规则结果：合规 / 不合规 / 待人工
 */

const { getDb } = require('./db');
const { normalizeDateOnly, dateToEpochDay, diffDays, todayLocal } = require('./utils/datetime');

/* ------------------------------------------------------------------
 * BUG-04：日期字段比较的时区与语义修复
 *
 * 原实现对所有 <,<=,>,>= 统一走 parseFloat：
 *   parseFloat('2023-06-15') === 2023，parseFloat('2024-01-01') === 2024
 * → 同年份的两个日期永远“相等”，跨年时又只比年份，检验超期类规则全部误判。
 * 修复：识别日期型值后按「当日 UTC 零点」比较，不受服务器时区影响，也不会跨天。
 * 同时支持阈值写成 today / today+30 / today-15 的相对日期。
 * ------------------------------------------------------------------ */
const DATE_LIKE_RE = /^\s*\d{4}\s*[-/\u5e74.]\s*\d{1,2}\s*[-/\u6708.]\s*\d{1,2}\s*\u65e5?\s*$/;

function isDateLike(v) {
  if (v == null) return false;
  const s = String(v).trim();
  if (!s) return false;
  if (DATE_LIKE_RE.test(s)) return true;
  return /^today([+-]\d+)?$/i.test(s) || /^\u4eca\u5929([+-]\d+)?$/.test(s);
}

/** 把日期值（含 today±N 相对写法）转为可比较的 epoch 毫秒 */
function toComparableDate(v) {
  if (v == null) return null;
  const s = String(v).trim();
  const rel = s.match(/^(?:today|\u4eca\u5929)([+-]\d+)?$/i);
  if (rel) {
    const base = dateToEpochDay(todayLocal());
    const offset = rel[1] ? parseInt(rel[1], 10) : 0;
    return base == null ? null : base + offset * 86400000;
  }
  return dateToEpochDay(s);
}

/** 日期语义比较；任一侧无法解析时返回 null（由调用方回退到数值比较） */
function compareAsDate(a, b, op) {
  const ea = toComparableDate(a);
  const eb = toComparableDate(b);
  if (ea == null || eb == null) return null;
  switch (op) {
    case '<=': return ea <= eb;
    case '>=': return ea >= eb;
    case '<': return ea < eb;
    case '>': return ea > eb;
    case '==': return ea === eb;
    case '!=': return ea !== eb;
    default: return null;
  }
}

/**
 * 规则引擎类
 */
class RuleEngine {
  constructor() {
    this.rules = [];
    this.executionLog = [];
    this.cache = new Map(); // 规则缓存
    this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存
  }

  /**
   * 从数据库加载模板规则
   */
  loadRulesFromDb(templateId) {
    const cacheKey = `rules_${templateId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      this.rules = cached.rules;
      return this.rules;
    }

    const db = getDb();
    const rules = db.prepare(`
      SELECT * FROM template_rules 
      WHERE template_id = ? AND enabled = 1 
      ORDER BY priority DESC, id ASC
    `).all(templateId);

    // 解析规则配置
    this.rules = rules.map(rule => ({
      ...rule,
      config: JSON.parse(rule.rule_config)
    }));

    // 更新缓存
    this.cache.set(cacheKey, {
      rules: this.rules,
      timestamp: Date.now()
    });

    return this.rules;
  }

  /**
   * 加载硬编码规则（兜底）
   */
  loadHardcodedRules(templateId, templateName) {
    this.rules = [];
    
    // 根据模板名称匹配规则
    if ((templateName || '').includes('维保')) {
      this.rules = [
        {
          id: 0,
          rule_name: '钢丝绳磨损率检查',
          rule_type: 'COMPARE',
          config: {
            field: 'wire_rope_wear_rate',
            operator: '<=',
            threshold: 7,
            passResult: '合规',
            failResult: '不合规'
          },
          clause_ref: 'TSG T5001-2023 第15条',
          description: '钢丝绳磨损率应不超过7%',
          severity: 'mandatory'
        },
        {
          id: 0,
          rule_name: '维保间隔检查',
          rule_type: 'COMPARE',
          config: {
            field: 'maintenance_interval',
            operator: '<=',
            threshold: 15,
            passResult: '合规',
            failResult: '待人工'
          },
          clause_ref: 'TSG T5001-2023 第8条',
          description: '维保间隔应不超过15天',
          severity: 'mandatory'
        },
        {
          id: 0,
          rule_name: '制动器状态检查',
          rule_type: 'COMPARE',
          config: {
            field: 'brake_status',
            operator: '==',
            threshold: '正常',
            passResult: '合规',
            failResult: '不合规'
          },
          clause_ref: 'GB 7588-2020 第12.4.2条',
          description: '制动器必须处于正常工作状态',
          severity: 'mandatory'
        },
        {
          id: 0,
          rule_name: '门机系统检查',
          rule_type: 'COMPARE',
          config: {
            field: 'door_status',
            operator: '==',
            threshold: '正常',
            passResult: '合规',
            failResult: '待人工'
          },
          clause_ref: 'TSG T7001-2023 第6.3条',
          description: '门机系统应正常关闭并锁紧',
          severity: 'mandatory'
        },
        {
          id: 0,
          rule_name: '限速器校验检查',
          rule_type: 'COMPARE',
          config: {
            field: 'governor_calibrated',
            operator: '==',
            threshold: '是',
            passResult: '合规',
            failResult: '不合规'
          },
          clause_ref: 'TSG T7001-2023 第8.2条',
          description: '限速器应在有效校验期内',
          severity: 'mandatory'
        }
      ];
    } else if ((templateName || '').includes('检验')) {
      this.rules = [
        {
          id: 0,
          rule_name: '检验周期检查',
          rule_type: 'COMPARE',
          config: {
            field: 'inspection_interval',
            operator: '<=',
            threshold: 365,
            passResult: '合规',
            failResult: '不合规'
          },
          clause_ref: 'TSG T7001-2023 第1.2条',
          description: '定期检验周期应不超过1年',
          severity: 'mandatory'
        },
        {
          id: 0,
          rule_name: '检验机构资质检查',
          rule_type: 'COMPARE',
          config: {
            field: 'inspection_qualified',
            operator: '==',
            threshold: '是',
            passResult: '合规',
            failResult: '不合规'
          },
          clause_ref: 'TSG Z7001-2023 第3条',
          description: '检验机构应具备相应资质',
          severity: 'mandatory'
        }
      ];
    } else if ((templateName || '').includes('故障')) {
      this.rules = [
        {
          id: 0,
          rule_name: '故障等级判定',
          rule_type: 'COMPARE',
          config: {
            field: 'fault_level',
            operator: '==',
            threshold: '一般',
            passResult: '合规',
            failResult: '待人工'
          },
          clause_ref: 'TSG T5001-2023 第20条',
          description: '一般故障可在维保中处理',
          severity: 'mandatory'
        },
        {
          id: 0,
          rule_name: '应急响应检查',
          rule_type: 'COMPARE',
          config: {
            field: 'emergency_response',
            operator: '<=',
            threshold: 30,
            passResult: '合规',
            failResult: '待人工'
          },
          clause_ref: 'TSG T5001-2023 第25条',
          description: '应急救援响应时间应不超过30分钟',
          severity: 'mandatory'
        }
      ];
    }
    
    return this.rules;
  }

  /**
   * P0.3: 高级条件解析器
   * 支持语法:
   *   field <= 7
   *   field == '正常'
   *   field in ['一般','轻微']
   *   field <= 15 AND brake_status == '正常'
   *   wire_rope_wear_rate <= 7 OR fault_level in ['严重','危险']
   */
  parseAdvancedCondition(condition, formData) {
    // 解析 "field in ['a','b']" 语法
    const inMatch = condition.match(/^([^\s]+)\s+in\s+\[(.+)\]$/i);
    if (inMatch) {
      const field = inMatch[1].trim();
      const values = inMatch[2].split(',').map(v => {
        v = v.trim().replace(/^['"]|['"]$/g, '');
        return v;
      });
      const fieldValue = formData[field];
      const passed = fieldValue !== undefined && fieldValue !== null &&
        values.some(v => String(fieldValue).toLowerCase() === String(v).toLowerCase());
      return { passed, field, operator: 'in', values, actualValue: fieldValue };
    }

    // 解析 "field op threshold" 单条件
    const singleMatch = condition.match(/^([^\s]+)\s*(<=|>=|<|>|==|!=|CONTAINS|NOT_CONTAINS)\s*(.+)$/i);
    if (singleMatch) {
      const field = singleMatch[1].trim();
      const operator = singleMatch[2].toUpperCase();
      let threshold = singleMatch[3].trim();
      // 去掉字符串引号
      if ((threshold.startsWith("'") && threshold.endsWith("'")) ||
          (threshold.startsWith('"') && threshold.endsWith('"'))) {
        threshold = threshold.slice(1, -1);
      }
      const fieldValue = formData[field];
      const numValue = parseFloat(fieldValue);
      const numThreshold = parseFloat(threshold);

      let passed = false;
      if (['<=', '>=', '<', '>'].includes(operator)) {
        if (!isNaN(numValue) && !isNaN(numThreshold)) {
          switch (operator) {
            case '<=': passed = numValue <= numThreshold; break;
            case '>=': passed = numValue >= numThreshold; break;
            case '<': passed = numValue < numThreshold; break;
            case '>': passed = numValue > numThreshold; break;
          }
        }
      } else if (['==', '!='].includes(operator)) {
        passed = operator === '=='
          ? String(fieldValue || '').toLowerCase() === String(threshold).toLowerCase()
          : String(fieldValue || '').toLowerCase() !== String(threshold).toLowerCase();
      } else if (operator === 'CONTAINS') {
        passed = String(fieldValue || '').includes(threshold);
      } else if (operator === 'NOT_CONTAINS') {
        passed = !String(fieldValue || '').includes(threshold);
      }
      return { passed, field, operator, threshold, actualValue: fieldValue };
    }

    // 解析 AND/OR 组合条件
    // 先按 OR 分割（OR 优先级低于 AND）
    const orParts = condition.split(/\s+OR\s+/i);
    if (orParts.length > 1) {
      const orResults = orParts.map(part => this.parseAdvancedCondition(part.trim(), formData));
      const passed = orResults.some(r => r.passed);
      return { passed, logic: 'OR', parts: orResults, raw: condition };
    }

    // 按 AND 分割
    const andParts = condition.split(/\s+AND\s+/i);
    if (andParts.length > 1) {
      const andResults = andParts.map(part => this.parseAdvancedCondition(part.trim(), formData));
      const passed = andResults.every(r => r.passed);
      return { passed, logic: 'AND', parts: andResults, raw: condition };
    }

    return { passed: false, error: '无法解析条件: ' + condition };
  }

  /**
   * 执行COMPARE类型规则
   */
  executeCompareRule(rule, formData) {
    const config = rule.config;
    const fieldValue = formData[config.field];

    // P0.3: 支持字符串条件(condition字段)解析
    if (config.condition) {
      const parsed = this.parseAdvancedCondition(config.condition, formData);
      const passed = parsed.passed;
      const result = passed ? config.passResult : config.failResult;
      const status = result === '合规' ? 'success' : result === '不合规' ? 'error' : 'warning';

      // 收集子条件详情
      let detailParts = [];
      let rawCondition = config.condition;
      if (parsed.parts) {
        detailParts = parsed.parts.map(p => {
          if (p.parts) {
            return p.parts.map(s => `${s.field || ''} ${s.operator} ${s.actualValue || '未填写'}`).join(` ${p.logic} `);
          }
          if (p.values) return `${p.field} in [${p.values.join(', ')}] = ${p.actualValue !== undefined ? 'true' : 'false'}`;
          return `${p.field || ''} ${p.operator || ''} ${p.threshold || ''} → ${p.passed ? '通过' : '不通过'}`;
        });
      }

      return {
        ruleId: rule.id,
        ruleName: rule.rule_name,
        status,
        result,
        description: rule.description,
        detail: rawCondition + (detailParts.length ? ` → ${detailParts.join(' | ')}` : '') + ` → ${passed ? '通过' : '不通过'}`,
        formula: rawCondition,
        clause: rule.clause_ref,
        actualValue: formData,
        expectedValue: config.passResult + '/' + config.failResult,
        passed,
        parsedCondition: parsed
      };
    }

    // 原有字段比较逻辑
    const fieldValue2 = formData[config.field];

    // 字段缺失
    if (fieldValue2 === undefined || fieldValue2 === null || fieldValue2 === '') {
      return {
        ruleId: rule.id,
        ruleName: rule.rule_name,
        status: 'warning',
        result: '待人工',
        description: rule.description,
        detail: `字段"${config.field}"未填写，自动流转人工审核`,
        formula: `${config.field} ${config.operator} ${config.threshold}`,
        clause: rule.clause_ref,
        actualValue: null,
        expectedValue: config.threshold
      };
    }

    let passed = false;
    const actualValue = fieldValue2;
    // 规范化运算符别名：op→operator、value→threshold、eq/ne/gt/gte/lt/lte→标准符号
    const operator = config.operator || config.op;
    const threshold = (config.threshold !== undefined && config.threshold !== null && config.threshold !== '')
      ? config.threshold
      : config.value;
    const normOp = { eq: '==', ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' }[operator] || operator;

    // BUG-04：日期优先走日期语义比较（避免 parseFloat('2023-06-15')===2023 的误判）
    const dateComparable = isDateLike(fieldValue2) || isDateLike(threshold) || config.valueType === 'date';
    let dateResult = null;
    if (dateComparable && ['<=', '>=', '<', '>', '==', '!='].includes(normOp)) {
      dateResult = compareAsDate(fieldValue2, threshold, normOp);
    }

    if (dateResult !== null) {
      passed = dateResult;
    }
    // 数值比较
    else if (['<=', '>=', '<', '>'].includes(normOp)) {
      const numValue = parseFloat(fieldValue2);
      const numThreshold = parseFloat(threshold);

      if (!isNaN(numValue) && !isNaN(numThreshold)) {
        switch (normOp) {
          case '<=': passed = numValue <= numThreshold; break;
          case '>=': passed = numValue >= numThreshold; break;
          case '<': passed = numValue < numThreshold; break;
          case '>': passed = numValue > numThreshold; break;
        }
      }
    }
    // 字符串比较
    else if (['==', '!='].includes(normOp)) {
      passed = normOp === '=='
        ? String(fieldValue2).toLowerCase() === String(threshold).toLowerCase()
        : String(fieldValue2).toLowerCase() !== String(threshold).toLowerCase();
    }
    // 包含检查
    else if (normOp === 'CONTAINS') {
      passed = String(fieldValue2).includes(String(threshold));
    }
    else if (normOp === 'NOT_CONTAINS') {
      passed = !String(fieldValue2).includes(String(threshold));
    }
    // 兼容种子中以 operator:'REGEX' + threshold/pattern 表达的写法
    else if (normOp === 'REGEX') {
      const pat = config.pattern != null ? config.pattern : threshold;
      try {
        passed = new RegExp(pat, config.flags || 'i').test(String(fieldValue2));
      } catch (e) {
        passed = false;
      }
    }
    // 兼容种子中以 operator:'EXISTS' 表达的写法（仅判非空）
    else if (normOp === 'EXISTS') {
      passed = fieldValue2 !== undefined && fieldValue2 !== null && String(fieldValue2).trim() !== '';
    }

    const result = passed ? (config.passResult || '合规') : (config.failResult || '不合规');
    const status = result === '合规' ? 'success' : result === '不合规' ? 'error' : 'warning';

    return {
      ruleId: rule.id,
      ruleName: rule.rule_name,
      status,
      result,
      description: rule.description,
      detail: `字段"${config.field}"值="${fieldValue2}"，${operator} ${threshold} → ${passed ? '通过' : '不通过'}`,
      formula: `${config.field} ${operator} ${threshold}`,
      clause: rule.clause_ref,
      actualValue,
      expectedValue: threshold,
      passed
    };
  }

  /**
   * 执行RANGE类型规则
   */
  executeRangeRule(rule, formData) {
    const config = rule.config;
    const fieldValue = formData[config.field];
    
    if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
      return {
        ruleId: rule.id,
        ruleName: rule.rule_name,
        status: 'warning',
        result: '待人工',
        description: rule.description,
        detail: `字段"${config.field}"未填写`,
        formula: `${config.min} ≤ ${config.field} ≤ ${config.max}`,
        clause: rule.clause_ref
      };
    }

    const numValue = parseFloat(fieldValue);
    const min = parseFloat(config.min);
    const max = parseFloat(config.max);
    
    const passed = !isNaN(numValue) && !isNaN(min) && !isNaN(max) && numValue >= min && numValue <= max;
    const result = passed ? config.passResult : config.failResult;
    const status = result === '合规' ? 'success' : result === '不合规' ? 'error' : 'warning';

    return {
      ruleId: rule.id,
      ruleName: rule.rule_name,
      status,
      result,
      description: rule.description,
      detail: `字段"${config.field}"值="${fieldValue}"，范围[${min}, ${max}] → ${passed ? '通过' : '不通过'}`,
      formula: `${min} ≤ ${config.field} ≤ ${max}`,
      clause: rule.clause_ref,
      actualValue: numValue,
      expectedRange: [min, max],
      passed
    };
  }

  /**
   * 执行EXISTS类型规则
   */
  executeExistsRule(rule, formData) {
    const config = rule.config;
    const fieldValue = formData[config.field];
    const exists = fieldValue !== undefined && fieldValue !== null && fieldValue !== '';

    if (!exists) {
      const result = config.failResult || '待人工';
      const status = result === '合规' ? 'success' : result === '不合规' ? 'error' : 'warning';
      return {
        ruleId: rule.id,
        ruleName: rule.rule_name,
        status,
        result,
        description: rule.description,
        detail: `字段"${config.field}"未填写 → 不通过`,
        formula: `EXISTS(${config.field})`,
        clause: rule.clause_ref,
        actualValue: '不存在',
        passed: false
      };
    }

    // 字段已填写，进一步可选校验：pattern / values / minLength
    let passed = true;
    let extra = '已填写';
    if (config.pattern) {
      try {
        passed = new RegExp(config.pattern, config.flags || 'i').test(String(fieldValue));
        extra = passed ? '且匹配格式' : '但格式不符';
      } catch (e) { passed = false; extra = '格式校验异常'; }
    } else if (config.values) {
      const valList = (Array.isArray(config.values) ? config.values : [config.values]).map(v => String(v));
      passed = valList.includes(String(fieldValue));
      extra = passed ? '且取值合规' : '但取值不在允许范围';
    } else if (config.minLength) {
      passed = String(fieldValue).length >= Number(config.minLength);
      extra = passed ? `且长度≥${config.minLength}` : `但长度不足${config.minLength}`;
    }

    const result = passed ? (config.passResult || '合规') : (config.failResult || '不合规');
    const status = result === '合规' ? 'success' : result === '不合规' ? 'error' : 'warning';
    return {
      ruleId: rule.id,
      ruleName: rule.rule_name,
      status,
      result,
      description: rule.description,
      detail: `字段"${config.field}"已填写${extra} → ${passed ? '通过' : '不通过'}`,
      formula: `EXISTS(${config.field})${config.pattern ? ' MATCHES /' + config.pattern + '/' : config.values ? ' IN ' + JSON.stringify(config.values) : config.minLength ? ' LEN≥' + config.minLength : ''}`,
      clause: rule.clause_ref,
      actualValue: fieldValue,
      passed
    };
  }

  /**
   * 执行REGEX类型规则
   */
  executeRegexRule(rule, formData) {
    const config = rule.config;
    const fieldValue = formData[config.field];
    
    if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
      return {
        ruleId: rule.id,
        ruleName: rule.rule_name,
        status: 'warning',
        result: '待人工',
        description: rule.description,
        detail: `字段"${config.field}"未填写`,
        formula: `${config.field} MATCHES /${config.pattern}/`,
        clause: rule.clause_ref
      };
    }

    let passed = false;
    try {
      const regex = new RegExp(config.pattern, config.flags || 'i');
      passed = regex.test(String(fieldValue));
    } catch (e) {
      return {
        ruleId: rule.id,
        ruleName: rule.rule_name,
        status: 'error',
        result: '待人工',
        description: rule.description,
        detail: `正则表达式错误: ${e.message}`,
        formula: `/^${config.pattern}$/`,
        clause: rule.clause_ref,
        error: e.message
      };
    }

    const result = passed ? config.passResult : config.failResult;
    const status = result === '合规' ? 'success' : result === '不合规' ? 'error' : 'warning';

    return {
      ruleId: rule.id,
      ruleName: rule.rule_name,
      status,
      result,
      description: rule.description,
      detail: `字段"${config.field}"值="${fieldValue}"，匹配模式/${config.pattern}/ → ${passed ? '通过' : '不通过'}`,
      formula: `${config.field} MATCHES /${config.pattern}/`,
      clause: rule.clause_ref,
      actualValue: fieldValue,
      pattern: config.pattern,
      passed
    };
  }

  /**
   * 执行COMBINE类型规则（组合规则）
   */
  executeCombineRule(rule, formData) {
    const config = rule.config;
    // 兼容 rules / conditions 两种子规则写法；op / logic 两种连接词写法
    const subRules = config.rules || config.conditions || [];
    const logic = String(config.logic || config.op || 'AND').toUpperCase();
    const results = [];

    for (const subRule of subRules) {
      const subConfig = {
        field: subRule.field,
        operator: subRule.operator || subRule.op,
        threshold: (subRule.threshold !== undefined && subRule.threshold !== null && subRule.threshold !== '') ? subRule.threshold : subRule.value,
        passResult: '合规',
        failResult: '不合规'
      };
      const tempRule = {
        id: rule.id,
        rule_name: subRule.name || subRule.field || '子规则',
        rule_type: subRule.rule_type || 'COMPARE',
        config: subConfig,
        clause_ref: '',
        description: ''
      };
      results.push(this.executeCompareRule(tempRule, formData));
    }

    // 计算组合结果
    let passed;
    if (logic === 'AND') passed = results.length > 0 && results.every(r => r.passed);
    else if (logic === 'OR') passed = results.some(r => r.passed);
    else passed = false;

    const result = passed ? (config.passResult || '合规') : (config.failResult || '不合规');
    const status = result === '合规' ? 'success' : result === '不合规' ? 'error' : 'warning';

    return {
      ruleId: rule.id,
      ruleName: rule.rule_name,
      status,
      result,
      description: rule.description,
      detail: `组合规则(${logic})，${results.filter(r => r.passed).length}/${results.length}通过`,
      formula: `(${subRules.map(r => `${r.field} ${r.operator || r.op} ${r.threshold !== undefined ? r.threshold : r.value}`).join(` ${logic} `)})`,
      clause: rule.clause_ref,
      subResults: results,
      passed
    };
  }

  /**
   * 执行单条规则
   */
  executeRule(rule, formData) {
    switch (rule.rule_type) {
      case 'COMPARE':
        return this.executeCompareRule(rule, formData);
      case 'RANGE':
        return this.executeRangeRule(rule, formData);
      case 'EXISTS':
        return this.executeExistsRule(rule, formData);
      case 'REGEX':
        return this.executeRegexRule(rule, formData);
      case 'COMBINE':
        return this.executeCombineRule(rule, formData);
      default:
        return {
          ruleId: rule.id,
          ruleName: rule.rule_name,
          status: 'warning',
          result: '待人工',
          description: rule.description,
          detail: `未知规则类型: ${rule.rule_type}`,
          clause: rule.clause_ref
        };
    }
  }

  /**
   * 执行所有规则（主入口）
   */
  execute(formData, templateId, templateName) {
    this.executionLog = [];
    
    // 1. 尝试从数据库加载规则
    this.loadRulesFromDb(templateId);
    
    // 2. 如果数据库无规则，使用硬编码规则
    if (this.rules.length === 0) {
      this.loadHardcodedRules(templateId, templateName);
    }
    
    // 3. 执行所有规则
    let finalResult = '合规';
    
    for (const rule of this.rules) {
      const result = this.executeRule(rule, formData);
      this.executionLog.push(result);
      
      // 优先级：不合规 > 待人工 > 合规
      if (result.result === '不合规') {
        finalResult = '不合规';
      } else if (result.result === '待人工' && finalResult !== '不合规') {
        finalResult = '待人工';
      }
    }
    
    // 4. 生成结论
    const compliantCount = this.executionLog.filter(r => r.result === '合规').length;
    const nonCompliantCount = this.executionLog.filter(r => r.result === '不合规').length;
    const pendingCount = this.executionLog.filter(r => r.result === '待人工').length;
    
    let conclusion = '';
    if (finalResult === '合规') {
      conclusion = `经规则引擎执行 ${this.rules.length} 条规则，全部通过。该电梯${templateName || '合规性判定'}结果为：合规。`;
    } else if (finalResult === '不合规') {
      const failedRules = this.executionLog.filter(r => r.result === '不合规');
      const clauses = failedRules.map(r => r.clause).join('、');
      conclusion = `经规则引擎执行 ${this.rules.length} 条规则，其中 ${nonCompliantCount} 条不通过。依据 ${clauses}，该电梯${templateName || '合规性判定'}结果为：不合规。`;
    } else {
      const pendingRules = this.executionLog.filter(r => r.result === '待人工');
      const clauses = pendingRules.map(r => r.clause).join('、');
      conclusion = `经规则引擎执行 ${this.rules.length} 条规则，其中 ${pendingCount} 条待人工判定。依据 ${clauses}，该电梯${templateName || '合规性判定'}需转人工审核。`;
    }
    
    return {
      finalResult,
      conclusion,
      passCount: compliantCount,
      failCount: nonCompliantCount,
      pendingCount,
      totalRules: this.rules.length,
      executionLog: this.executionLog,
      needAudit: finalResult === '待人工'
    };
  }

  /**
   * 清除规则缓存
   */
  clearCache(templateId = null) {
    if (templateId) {
      this.cache.delete(`rules_${templateId}`);
    } else {
      this.cache.clear();
    }
  }

  /**
   * 添加规则到数据库
   */
  addRule(templateId, ruleData) {
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO template_rules 
        (template_id, rule_name, rule_type, rule_config, clause_ref, description, severity, priority, enabled, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      templateId,
      ruleData.ruleName,
      ruleData.ruleType,
      JSON.stringify(ruleData.config),
      ruleData.clauseRef || '',
      ruleData.description || '',
      ruleData.severity || 'mandatory',
      ruleData.priority || 0,
      ruleData.enabled !== false ? 1 : 0,
      ruleData.createdBy || 'system'
    );
    
    // 清除缓存
    this.clearCache(templateId);
    
    return result.lastInsertRowid;
  }

  /**
   * 更新规则
   */
  updateRule(ruleId, ruleData) {
    const db = getDb();
    const rule = db.prepare('SELECT template_id FROM template_rules WHERE id = ?').get(ruleId);
    if (!rule) return false;
    
    db.prepare(`
      UPDATE template_rules 
      SET rule_name = ?, rule_type = ?, rule_config = ?, clause_ref = ?, 
          description = ?, severity = ?, priority = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      ruleData.ruleName,
      ruleData.ruleType,
      JSON.stringify(ruleData.config),
      ruleData.clauseRef || '',
      ruleData.description || '',
      ruleData.severity || 'mandatory',
      ruleData.priority || 0,
      ruleData.enabled !== false ? 1 : 0,
      ruleId
    );
    
    // 清除缓存
    this.clearCache(rule.template_id);
    
    return true;
  }

  /**
   * 删除规则
   */
  deleteRule(ruleId) {
    const db = getDb();
    const rule = db.prepare('SELECT template_id FROM template_rules WHERE id = ?').get(ruleId);
    if (!rule) return false;
    
    db.prepare('DELETE FROM template_rules WHERE id = ?').run(ruleId);
    
    // 清除缓存
    this.clearCache(rule.template_id);
    
    return true;
  }

  /**
   * 测试规则（不保存）
   */
  testRule(ruleData, testData) {
    const tempRule = {
      id: 0,
      rule_name: ruleData.ruleName || '测试规则',
      rule_type: ruleData.ruleType,
      config: ruleData.config,
      clause_ref: ruleData.clauseRef || '',
      description: ruleData.description || ''
    };
    
    return this.executeRule(tempRule, testData);
  }
}

// 导出单例
const engine = new RuleEngine();
// 暴露日期比较工具（BUG-04 回归测试用）
engine.isDateLike = isDateLike;
engine.compareAsDate = compareAsDate;
engine.toComparableDate = toComparableDate;
module.exports = engine;

/**
 * P0.4: 输出生成器
 * 支持 Handlebars 风格模板语法（简化实现，非完整 Handlebars）：
 *   - {{field_name}}          字段值替换
 *   - {{#if (gt x 7)}}...{{else}}...{{/if}}
 *   - {{#each items}}{{/each}}
 *   - {{template_name}}, {{final_result}} 全局变量
 */
RuleEngine.prototype.generateOutput = function(template, result, fieldValues) {
  if (!template) return '';

  // 全局变量上下文
  const ctx = {
    ...fieldValues,
    template_name: result.templateName || '',
    template_code: result.templateCode || '',
    final_result: result.finalResult || '',
    pass_count: result.passCount || 0,
    fail_count: result.failCount || 0,
    pending_count: result.pendingCount || 0,
    total_rules: result.totalRules || 0,
    conclusion: result.conclusion || '',
    need_audit: result.needAudit || false,
    timestamp: new Date().toLocaleString('zh-CN')
  };

  let output = template;

  // 1. 简单字段替换 {{field_name}}
  output = output.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = ctx[key];
    if (val === undefined || val === null) return match;
    return String(val);
  });

  // 2. 条件块 {{#if (gt field threshold)}}...{{else}}...{{/if}}
  output = output.replace(
    /\{\{#if\s+\((gt|lt|gte|lte|eq|ne)\s+(\w+)\s+([\d.]+)\)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (match, op, field, threshold, ifTrue, ifFalse) => {
      ifFalse = ifFalse || '';
      const numField = parseFloat(ctx[field]);
      const numThreshold = parseFloat(threshold);
      let passed = false;
      if (!isNaN(numField) && !isNaN(numThreshold)) {
        switch (op) {
          case 'gt': passed = numField > numThreshold; break;
          case 'lt': passed = numField < numThreshold; break;
          case 'gte': passed = numField >= numThreshold; break;
          case 'lte': passed = numField <= numThreshold; break;
          case 'eq': passed = numField === numThreshold; break;
          case 'ne': passed = numField !== numThreshold; break;
        }
      }
      return passed ? ifTrue : ifFalse;
    }
  );

  // 3. 条件块 {{#if (eq_str field 'value')}}...{{else}}...{{/if}}
  output = output.replace(
    /\{\{#if\s+\((eq_str|ne_str)\s+(\w+)\s+['"]([^'"]+)['"]\)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (match, op, field, value, ifTrue, ifFalse) => {
      ifFalse = ifFalse || '';
      const fieldVal = String(ctx[field] || '').toLowerCase();
      const compareVal = value.toLowerCase();
      const passed = op === 'eq_str' ? fieldVal === compareVal : fieldVal !== compareVal;
      return passed ? ifTrue : ifFalse;
    }
  );

  // 4. 条件块 {{#if field}}...{{else}}...{{/if}}
  output = output.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (match, field, ifTrue, ifFalse) => {
      ifFalse = ifFalse || '';
      const val = ctx[field];
      const passed = val !== undefined && val !== null && val !== false && val !== '' && val !== 'false';
      return passed ? ifTrue : ifFalse;
    }
  );

  // 5. 循环块 {{#each items}}...{{/each}}
  output = output.replace(
    /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (match, arrayKey, itemTemplate) => {
      const arr = ctx[arrayKey];
      if (!Array.isArray(arr) || arr.length === 0) return '';
      return arr.map(item => {
        let itemText = itemTemplate;
        if (typeof item === 'object') {
          itemText = itemText.replace(/\{\{(\w+)\}\}/g, (m, k) => {
            const v = item[k];
            return v !== undefined ? String(v) : m;
          });
        } else {
          itemText = itemText.replace(/\{\{\.\}\}/g, String(item));
        }
        return itemText;
      }).join('\n');
    }
  );

  return output;
};

/**
 * P0.4: 根据规则结果生成完整输出报告
 */
RuleEngine.prototype.generateComplianceReport = function(result, fieldValues, options) {
  options = options || {};
  const template = options.template || '';
  const format = options.format || 'text';

  if (template) {
    const rendered = this.generateOutput(template, result, fieldValues);
    if (rendered) return rendered;
  }

  if (format === 'text' || !format) {
    const failed = (result.executionLog || []).filter(r => r.result === '不合规');
    const pending = (result.executionLog || []).filter(r => r.result === '待人工');

    let report = '【合规性判别报告】\n';
    report += '━━━━━━━━━━━━━━━━━━━━━\n';
    report += '判别时间：' + new Date().toLocaleString('zh-CN') + '\n';
    report += '模板名称：' + (result.templateName || '未知模板') + '\n';
    report += '判别结论：' + result.finalResult + '\n';
    report += '\n规则执行汇总：\n';
    report += '  ✅ 合规：' + (result.passCount || 0) + ' 项\n';
    report += '  ❌ 不合规：' + (result.failCount || 0) + ' 项\n';
    report += '  ⚠️ 待人工：' + (result.pendingCount || 0) + ' 项\n';

    if (failed.length > 0) {
      report += '\n不合规项目详情：\n';
      failed.forEach((r, i) => {
        report += '  ' + (i + 1) + '. ' + (r.ruleName || '规则') + '\n';
        report += '     依据：' + (r.clause || '无') + '\n';
        report += '     说明：' + (r.detail || r.description || '') + '\n';
      });
    }

    if (pending.length > 0) {
      report += '\n待人工审核项目：\n';
      pending.forEach((r, i) => {
        report += '  ' + (i + 1) + '. ' + (r.ruleName || '规则') + '\n';
      });
    }

    if (result.needAudit) {
      report += '\n⚠️ 系统建议：转人工审核确认\n';
    }

    return report;
  }

  return JSON.stringify({
    conclusion: result.finalResult,
    summary: {
      total: result.totalRules || 0,
      compliant: result.passCount || 0,
      nonCompliant: result.failCount || 0,
      pending: result.pendingCount || 0
    },
    needAudit: result.needAudit,
    executionLog: result.executionLog,
    generatedAt: new Date().toISOString()
  }, null, 2);
};
