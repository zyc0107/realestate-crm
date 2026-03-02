const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, 'crm.db');
let db = null;

async function initDB() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL, name TEXT NOT NULL,
      role TEXT DEFAULT 'agent', store_id TEXT, agent_id TEXT, nickname TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY, title TEXT, community_name TEXT, address TEXT NOT NULL,
      area REAL, price REAL, min_price REAL,
      unit_type TEXT, rooms TEXT, halls TEXT, baths TEXT, unit_room TEXT,
      property_type TEXT DEFAULT '住宅', decoration TEXT, build_year TEXT, urgent INTEGER DEFAULT 0,
      floor TEXT, total_floors TEXT,
      orientation TEXT, amenities TEXT, photo_url TEXT, description TEXT,
      owner_name TEXT, owner_phone TEXT, owner_wechat TEXT, notes TEXT,
      status TEXT DEFAULT 'available', store_id TEXT, created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, wechat TEXT,
      customer_type TEXT DEFAULT 'buyer',
      budget_min REAL, budget_max REAL, preferred_areas TEXT, requirements TEXT,
      source TEXT, grade TEXT DEFAULT 'C', notes TEXT,
      linked_property_id TEXT,
      store_id TEXT, created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS follow_ups (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, content TEXT,
      method TEXT, result TEXT, next_follow_up_at TEXT, ai_analysis TEXT,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, property_id TEXT NOT NULL,
      stage TEXT DEFAULT 'viewing', deal_price REAL,
      commission_rate REAL DEFAULT 2.0, commission_amount REAL,
      notes TEXT, store_id TEXT, created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY, customer_id TEXT, follow_up_id TEXT,
      title TEXT NOT NULL, content TEXT, remind_at TEXT NOT NULL,
      is_done INTEGER DEFAULT 0, store_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT NOT NULL, value TEXT NOT NULL, store_id TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (key, store_id)
    );
  `);

  // Add new columns if they don't exist (migration)
  const migrations = [
    "ALTER TABLE properties ADD COLUMN min_price REAL",
    "ALTER TABLE properties ADD COLUMN owner_name TEXT",
    "ALTER TABLE properties ADD COLUMN owner_phone TEXT",
    "ALTER TABLE properties ADD COLUMN owner_wechat TEXT",
    "ALTER TABLE properties ADD COLUMN notes TEXT",
    "ALTER TABLE customers ADD COLUMN customer_type TEXT DEFAULT 'buyer'",
    "ALTER TABLE customers ADD COLUMN linked_property_id TEXT",
    "ALTER TABLE users ADD COLUMN agent_id TEXT",
    "ALTER TABLE users ADD COLUMN nickname TEXT",
    "ALTER TABLE properties ADD COLUMN community_name TEXT",
    "ALTER TABLE properties ADD COLUMN rooms TEXT",
    "ALTER TABLE properties ADD COLUMN halls TEXT",
    "ALTER TABLE properties ADD COLUMN baths TEXT",
    "ALTER TABLE properties ADD COLUMN unit_room TEXT",
    "ALTER TABLE properties ADD COLUMN property_type TEXT DEFAULT '住宅'",
    "ALTER TABLE properties ADD COLUMN decoration TEXT",
    "ALTER TABLE properties ADD COLUMN build_year TEXT",
    "ALTER TABLE properties ADD COLUMN urgent INTEGER DEFAULT 0",
  ];
  for (const sql of migrations) {
    try { db.run(sql); } catch(e) { /* column already exists */ }
  }

  // Create default admin
  const adminExists = get('SELECT id FROM users WHERE role="admin"');
  if (!adminExists) {
    const crypto = require('crypto');
    const adminId = require('crypto').randomUUID ? require('crypto').randomUUID() : 'admin-' + Date.now();
    const hashed = crypto.createHash('sha256').update('admin123crm_salt_2026').digest('hex');
    db.run(`INSERT OR IGNORE INTO users (id, username, password, name, role) VALUES ('${adminId}', 'admin', '${hashed}', '管理员', 'admin')`);
    console.log('✅ 默认管理员账号已创建：用户名 admin，密码 admin123');
  }
  saveDB();
  return db;
}

function saveDB() {
  if (!db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function run(sql, params = []) { db.run(sql, params); saveDB(); }

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

module.exports = { initDB, run, get, all, saveDB };
