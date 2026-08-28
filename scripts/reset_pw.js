#!/usr/bin/env node
/**
 * 阶段4 — 数据治理：12 账号弱密码(123456)改为强密码
 * 强密码规则(确定性, 便于演示记录): Taz#<email首段前6>2026*
 *   admin@demo.com   -> Taz#admin2026*
 *   op_wangjf@...    -> Taz#op_wan2026*
 * 仅当 password_hash 命中弱密码哈希时才重置(幂等, 不破坏已改密码)
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { hashPassword } = require('../auth');

const DATA_DIR = process.env.DATA_DIR || __dirname.replace(/\/scripts$/, '');
const DB_PATH = path.join(DATA_DIR, 'data.db');

function genStrong(email) {
  const head = String(email.split('@')[0]).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
  return `Taz#${head}2026*`;
}

function resetWeakPasswords(database) {
  const db = database || new Database(DB_PATH);
  const weakHash = hashPassword('123456');
  const users = db.prepare('SELECT id, email, password_hash FROM users').all();
  let changed = 0;
  const map = [];
  const upd = db.prepare('UPDATE users SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
  for (const u of users) {
    if (u.password_hash === weakHash) {
      const pw = genStrong(u.email);
      upd.run(hashPassword(pw), u.id);
      map.push({ email: u.email, password: pw });
      changed++;
    }
  }
  return { changed, map };
}

module.exports = resetWeakPasswords;

if (require.main === module) {
  if (!fs.existsSync(DB_PATH)) { console.error('data.db not found'); process.exit(1); }
  const db = new Database(DB_PATH);
  const r = resetWeakPasswords(db);
  console.log('✅ 重置弱密码账号数:', r.changed);
  console.log('--- 强密码映射(请妥善保存) ---');
  for (const m of r.map) console.log(`   ${m.email}  =>  ${m.password}`);
  if (r.map.length) {
    fs.writeFileSync('/tmp/strong_passwords.txt', r.map.map(m => `${m.email}  ${m.password}`).join('\n'));
    console.log('已写入 /tmp/strong_passwords.txt');
  }
}
