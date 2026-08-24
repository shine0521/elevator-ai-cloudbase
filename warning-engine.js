// warning-engine.js — M3 设备预警引擎（2.0 新增）
// 4 类评估器（threshold / deadline / status / trend）实时触发 warning_event。
// 由 server.js 启动时初始化（setInterval 调度），支持 SSE 实时推送。
const db = require('./db');

const URGENCY_ORDER = { low: 0, medium: 1, high: 2, urgent: 3, critical: 4 };
const CRITICAL_LEVELS = new Set(['urgent', 'critical']);

// 核心：评估设备，触发预警，返回新 event 数组
function evaluateDevice(deviceId, triggerSource, sourceId) {
  const db2 = db.getDb();
  const device = db2.prepare('SELECT * FROM elevator_device WHERE id = ?').get(deviceId);
  if (!device) return [];

  const events = [];
  const params = db2.prepare('SELECT * FROM template_warning_params WHERE enabled = 1').all();

  for (const p of params) {
    let triggered = false;
    let actualValue = null;

    switch (p.param_type) {
      case 'status': {
        if (p.param_key && device.status === p.param_key) { triggered = true; actualValue = device.status; }
        break;
      }
      case 'threshold': {
        if (!p.param_key || !p.threshold_value || !p.operator) break;
        const dv = device[p.param_key];
        if (dv == null) break;
        const num = parseFloat(dv);
        if (isNaN(num)) break;
        const thresh = parseFloat(p.threshold_value);
        switch (p.operator) {
          case '>': triggered = num > thresh; break;
          case '>=': triggered = num >= thresh; break;
          case '<': triggered = num < thresh; break;
          case '<=': triggered = num <= thresh; break;
          case '==': triggered = num === thresh; break;
          case '!=': triggered = num !== thresh; break;
        }
        if (triggered) actualValue = String(dv);
        break;
      }
      case 'deadline': {
        if (!p.param_key || !device[p.param_key]) break;
        const d = new Date(device[p.param_key]);
        const now = new Date();
        if (p.operator === 'expired') { triggered = d < now; actualValue = device[p.param_key]; }
        else if (p.operator === 'within') {
          const thresh = parseInt(p.threshold_value, 10) || 30;
          const future = new Date(now.getTime() + thresh * 86400000);
          triggered = d >= now && d <= future; actualValue = device[p.param_key];
        }
        break;
      }
      case 'trend': {
        // trend: 比较最近 N 条动态记录的字段趋势（略过，仅记录占位）
        actualValue = null;
        break;
      }
    }

    if (triggered) {
      const result = db2.transaction(() => {
        const info = db2.prepare(
          'SELECT event_id FROM warning_event WHERE device_id = ? AND warning_config_id = ? AND status = ? AND created_at > datetime("now","-1 hour")'
        ).get(deviceId, p.id, 'OPEN');
        if (info) return null; // 同设备同配置 1 小时内不重复触发
        const insert = db2.prepare(`
          INSERT INTO warning_event (device_id, warning_type, warning_level, warning_item, trigger_source, source_id, warning_config_id, threshold_value, actual_value, action_required, notified_users, notification_time, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'OPEN')
        `).run(deviceId, p.param_type.toUpperCase(), p.urgency_level, p.label || p.param_key,
          triggerSource, sourceId || null, p.id, p.threshold_value || null, actualValue,
          p.action || '需人工确认', p.label || '系统');
        return insert.lastInsertRowid;
      })();
      if (result) {
        const ev = db2.prepare('SELECT * FROM warning_event WHERE event_id = ?').get(result);
        events.push(ev);
      }
    }
  }

  return events;
}

// 创建预警事件（直接调用，不走评估器）
function createEvent({ deviceId, warningType, warningLevel, warningItem, triggerSource, sourceId, thresholdValue, actualValue, actionRequired }) {
  const db2 = db.getDb();
  const id = db2.prepare(`
    INSERT INTO warning_event (device_id, warning_type, warning_level, warning_item, trigger_source, source_id, threshold_value, actual_value, action_required, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')
  `).run(deviceId, warningType, warningLevel, warningItem, triggerSource, sourceId || null,
    thresholdValue || null, actualValue || null, actionRequired || '需人工确认');
  return db2.prepare('SELECT * FROM warning_event WHERE event_id = ?').get(id.lastInsertRowid);
}

// 确认预警（人工确认：OPEN → ACKNOWLEDGED；urgent/critical 强制确认）
function acknowledgeEvent(eventId, userEmail, note) {
  const db2 = db.getDb();
  db2.prepare('UPDATE warning_event SET status = ?, acknowledged_by = ?, acknowledged_at = datetime("now"), resolve_note = COALESCE(resolve_note || ?, ?) WHERE event_id = ?')
    .run('ACKNOWLEDGED', userEmail, note ? '\n' + note : '', note || null, eventId);
}

// 解决预警
function resolveEvent(eventId, userEmail, note) {
  const db2 = db.getDb();
  db2.prepare('UPDATE warning_event SET status = ?, resolved_by = ?, resolved_at = datetime("now"), resolve_note = ? WHERE event_id = ?')
    .run('RESOLVED', userEmail, note || null, eventId);
}

// 忽略预警
function dismissEvent(eventId, userEmail, note) {
  const db2 = db.getDb();
  db2.prepare('UPDATE warning_event SET status = ?, acknowledged_by = COALESCE(acknowledged_by, ?), acknowledged_at = COALESCE(acknowledged_at, datetime("now")), resolve_note = ? WHERE event_id = ?')
    .run('DISMISSED', userEmail, note || null, eventId);
}

// 判断是否为 critical/urgent（需强制人工确认）
function isCritical(level) { return CRITICAL_LEVELS.has(level); }

// 最高级别（用于列表排序）
function maxUrgency(a, b) { return (URGENCY_ORDER[a] || 0) >= (URGENCY_ORDER[b] || 0) ? a : b; }

module.exports = { evaluateDevice, createEvent, acknowledgeEvent, resolveEvent, dismissEvent, isCritical, maxUrgency, URGENCY_ORDER, CRITICAL_LEVELS };
