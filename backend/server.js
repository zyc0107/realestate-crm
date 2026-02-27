require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const XLSX = require('xlsx');
const { initDB, run, get, all } = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

function hashPassword(p) { return crypto.createHash('sha256').update(p + 'crm_salt_2026').digest('hex'); }
function generateToken() { return crypto.randomBytes(32).toString('hex'); }

function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '请先登录' });
  const session = get('SELECT * FROM sessions WHERE token=? AND expires_at > datetime("now")', [token]);
  if (!session) return res.status(401).json({ error: '登录已过期' });
  const user = get('SELECT * FROM users WHERE id=?', [session.user_id]);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  req.user = user;
  next();
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}

function getStoreFilter(user) {
  if (user.role === 'admin') return { sql: '', params: [] };
  return { sql: ' AND store_id=?', params: [user.store_id] };
}

async function callDeepSeek(apiKey, prompt, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30秒超时

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `DeepSeek API错误: ${response.status}`);
      }

      const data = await response.json();
      if (!data.choices || !data.choices[0]) {
        throw new Error('DeepSeek API返回数据格式错误');
      }

      return data.choices[0].message.content;
    } catch (error) {
      console.error(`DeepSeek API调用失败 (尝试 ${attempt}/${retries}):`, error.message);

      if (error.name === 'AbortError') {
        if (attempt === retries) throw new Error('DeepSeek API请求超时，请稍后重试');
      } else if (attempt === retries) {
        throw new Error(`DeepSeek API连接失败: ${error.message}`);
      }

      // 等待后重试（指数退避）
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }
}

function getApiKey(storeId) {
  const saved = storeId ? get("SELECT value FROM settings WHERE key='deepseek_api_key' AND store_id=?", [storeId]) : null;
  const key = saved?.value || process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('未配置 DeepSeek API Key，请在系统设置中填入');
  return key;
}

// ==================== AUTH ====================
app.post('/api/auth/register', (req, res) => {
  const { username, password, name, store_name } = req.body;
  if (!username || !password || !name || !store_name) return res.status(400).json({ error: '请填写所有必填项' });
  if (get('SELECT id FROM users WHERE username=?', [username])) return res.status(400).json({ error: '用户名已存在' });
  let store = get('SELECT * FROM stores WHERE name=?', [store_name]);
  if (!store) {
    const storeId = uuidv4();
    run('INSERT INTO stores (id, name) VALUES (?, ?)', [storeId, store_name]);
    store = get('SELECT * FROM stores WHERE id=?', [storeId]);
  }
  const userId = uuidv4();
  run('INSERT INTO users (id, username, password, name, store_id, role) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, username, hashPassword(password), name, store.id, 'agent']);
  const token = generateToken();
  run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
    [token, userId, new Date(Date.now() + 7*24*3600*1000).toISOString()]);
  const user = get('SELECT id,username,name,role,store_id FROM users WHERE id=?', [userId]);
  res.json({ token, user, store });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = get('SELECT * FROM users WHERE username=?', [username]);
  if (!user || user.password !== hashPassword(password)) return res.status(400).json({ error: '用户名或密码错误' });
  const token = generateToken();
  run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
    [token, user.id, new Date(Date.now() + 7*24*3600*1000).toISOString()]);
  const store = user.store_id ? get('SELECT * FROM stores WHERE id=?', [user.store_id]) : null;
  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser, store });
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  run('DELETE FROM sessions WHERE token=?', [req.headers['authorization']?.replace('Bearer ', '')]);
  res.json({ success: true });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const store = req.user.store_id ? get('SELECT * FROM stores WHERE id=?', [req.user.store_id]) : null;
  const { password: _, ...safeUser } = req.user;
  res.json({ user: safeUser, store });
});

// ==================== SETTINGS ====================
app.get('/api/settings', authMiddleware, (req, res) => {
  const rows = all('SELECT key, value FROM settings WHERE store_id=?', [req.user.store_id]);
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  if (settings.deepseek_api_key) {
    settings.deepseek_api_key_preview = settings.deepseek_api_key.substring(0, 8) + '...(已保存)';
    delete settings.deepseek_api_key;
  }
  res.json(settings);
});

app.post('/api/settings', authMiddleware, (req, res) => {
  const { deepseek_api_key, company_name, agent_name } = req.body;
  const sid = req.user.store_id;
  const upsert = (k, v) => run(
    `INSERT INTO settings (key, value, store_id) VALUES (?, ?, ?) ON CONFLICT(key, store_id) DO UPDATE SET value=excluded.value`,
    [k, v, sid]
  );
  if (deepseek_api_key) upsert('deepseek_api_key', deepseek_api_key);
  if (company_name !== undefined) upsert('company_name', company_name);
  if (agent_name !== undefined) upsert('agent_name', agent_name);
  res.json({ success: true });
});

app.post('/api/settings/test-key', authMiddleware, async (req, res) => {
  try {
    const key = req.body.api_key || getApiKey(req.user.store_id);
    await callDeepSeek(key, '回复"OK"两个字');
    res.json({ success: true, message: 'API Key 验证成功！' });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// ==================== PROPERTIES ====================
app.get('/api/properties', authMiddleware, (req, res) => {
  const { status, search } = req.query;
  const f = getStoreFilter(req.user);
  let sql = 'SELECT * FROM properties WHERE 1=1' + f.sql;
  const params = [...f.params];
  if (status) { sql += ' AND status=?'; params.push(status); }
  if (search) { sql += ' AND (title LIKE ? OR address LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY created_at DESC';
  res.json(all(sql, params));
});

app.post('/api/properties', authMiddleware, (req, res) => {
  const id = uuidv4();
  const { title, address, area, price, min_price, unit_type, floor, total_floors, orientation,
    amenities, photo_url, description, status = 'available',
    owner_name, owner_phone, owner_wechat, notes } = req.body;
  run(`INSERT INTO properties (id,title,address,area,price,min_price,unit_type,floor,total_floors,
    orientation,amenities,photo_url,description,status,owner_name,owner_phone,owner_wechat,notes,store_id,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, title, address, area, price, min_price, unit_type, floor, total_floors,
     orientation, amenities, photo_url, description, status,
     owner_name, owner_phone, owner_wechat, notes, req.user.store_id, req.user.id]);

  // Auto-create seller customer if owner info provided
  if (owner_name || owner_phone) {
    const existing = owner_phone ? get('SELECT id FROM customers WHERE phone=? AND store_id=?', [owner_phone, req.user.store_id]) : null;
    if (!existing) {
      const customerId = uuidv4();
      run(`INSERT INTO customers (id,name,phone,wechat,customer_type,source,grade,notes,linked_property_id,store_id,created_by)
        VALUES (?,?,?,?,'seller','房源录入','B',?,?,?,?)`,
        [customerId, owner_name||'业主', owner_phone||'', owner_wechat||'',
         `关联房源：${title}`, id, req.user.store_id, req.user.id]);
    } else {
      // Link existing customer to property
      run('UPDATE customers SET linked_property_id=?, customer_type="seller" WHERE id=?', [id, existing.id]);
    }
  }

  res.json(get('SELECT * FROM properties WHERE id=?', [id]));
});

app.put('/api/properties/:id', authMiddleware, (req, res) => {
  const { title, address, area, price, min_price, unit_type, floor, total_floors, orientation,
    amenities, photo_url, description, status, owner_name, owner_phone, owner_wechat, notes } = req.body;
  run(`UPDATE properties SET title=?,address=?,area=?,price=?,min_price=?,unit_type=?,floor=?,total_floors=?,
    orientation=?,amenities=?,photo_url=?,description=?,status=?,
    owner_name=?,owner_phone=?,owner_wechat=?,notes=?,updated_at=datetime('now') WHERE id=?`,
    [title, address, area, price, min_price, unit_type, floor, total_floors,
     orientation, amenities, photo_url, description, status,
     owner_name, owner_phone, owner_wechat, notes, req.params.id]);
  res.json(get('SELECT * FROM properties WHERE id=?', [req.params.id]));
});

app.delete('/api/properties/:id', authMiddleware, (req, res) => {
  run('DELETE FROM properties WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ==================== CUSTOMERS ====================
app.get('/api/customers', authMiddleware, (req, res) => {
  const { grade, search, customer_type } = req.query;
  const f = getStoreFilter(req.user);
  let sql = 'SELECT * FROM customers WHERE 1=1' + f.sql;
  const params = [...f.params];
  if (grade) { sql += ' AND grade=?'; params.push(grade); }
  if (customer_type) { sql += ' AND customer_type=?'; params.push(customer_type); }
  if (search) { sql += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY created_at DESC';
  res.json(all(sql, params));
});

app.get('/api/customers/:id', authMiddleware, (req, res) => {
  const customer = get('SELECT * FROM customers WHERE id=?', [req.params.id]);
  if (!customer) return res.status(404).json({ error: '客户不存在' });
  const followUps = all('SELECT * FROM follow_ups WHERE customer_id=? ORDER BY created_at DESC', [req.params.id]);
  const reminders = all('SELECT * FROM reminders WHERE customer_id=? AND is_done=0 ORDER BY remind_at', [req.params.id]);
  const linkedProperty = customer.linked_property_id ? get('SELECT * FROM properties WHERE id=?', [customer.linked_property_id]) : null;
  res.json({ ...customer, followUps, reminders, linkedProperty });
});

app.post('/api/customers', authMiddleware, (req, res) => {
  const id = uuidv4();
  const { name, phone, wechat, customer_type = 'buyer', budget_min, budget_max,
    preferred_areas, requirements, source, grade = 'C', notes, linked_property_id } = req.body;
  run(`INSERT INTO customers (id,name,phone,wechat,customer_type,budget_min,budget_max,
    preferred_areas,requirements,source,grade,notes,linked_property_id,store_id,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, name, phone, wechat, customer_type, budget_min, budget_max,
     preferred_areas, requirements, source, grade, notes, linked_property_id, req.user.store_id, req.user.id]);
  res.json(get('SELECT * FROM customers WHERE id=?', [id]));
});

app.put('/api/customers/:id', authMiddleware, (req, res) => {
  const { name, phone, wechat, customer_type, budget_min, budget_max,
    preferred_areas, requirements, source, grade, notes } = req.body;
  run(`UPDATE customers SET name=?,phone=?,wechat=?,customer_type=?,budget_min=?,budget_max=?,
    preferred_areas=?,requirements=?,source=?,grade=?,notes=?,updated_at=datetime('now') WHERE id=?`,
    [name, phone, wechat, customer_type, budget_min, budget_max,
     preferred_areas, requirements, source, grade, notes, req.params.id]);
  res.json(get('SELECT * FROM customers WHERE id=?', [req.params.id]));
});

// ==================== FOLLOW-UPS ====================
app.post('/api/followups', authMiddleware, (req, res) => {
  const id = uuidv4();
  const { customer_id, content, method, result, next_follow_up_at } = req.body;
  run(`INSERT INTO follow_ups (id,customer_id,content,method,result,next_follow_up_at,created_by) VALUES (?,?,?,?,?,?,?)`,
    [id, customer_id, content, method, result, next_follow_up_at, req.user.id]);
  res.json(get('SELECT * FROM follow_ups WHERE id=?', [id]));
});

// ==================== AI ANALYSIS ====================
app.post('/api/ai/analyze-chat', authMiddleware, async (req, res) => {
  const { customer_id, chat_content } = req.body;
  if (!chat_content) return res.status(400).json({ error: '请提供聊天内容' });
  try {
    const key = getApiKey(req.user.store_id);
    const prompt = `你是专业的房产中介顾问助手。分析以下与客户的聊天记录，给出回访建议。
聊天记录：${chat_content}

请以JSON格式输出（只输出JSON，不要其他内容）：
{
  "key_concerns": ["关注点1","关注点2"],
  "intention_level": "高/中/低",
  "intention_analysis": "意向分析",
  "suggested_follow_up_days": 3,
  "detected_appointment": {
    "found": true或false,
    "date_description": "检测到的时间描述，如'下周三下午'",
    "suggested_datetime": "建议的具体时间ISO格式，如2026-03-05T14:00:00"
  },
  "follow_up_script": "建议的跟进话术",
  "focus_points": ["重点1","重点2"],
  "summary": "总结"
}`;
    const analysisText = await callDeepSeek(key, prompt);
    let analysis;
    try { analysis = JSON.parse(analysisText.replace(/```json|```/g, '').trim()); }
    catch { analysis = { summary: analysisText, detected_appointment: { found: false } }; }

    const followUpId = uuidv4();
    run(`INSERT INTO follow_ups (id,customer_id,content,method,ai_analysis,created_by) VALUES (?,?,?,?,?,?)`,
      [followUpId, customer_id||null, chat_content, 'AI分析', JSON.stringify(analysis), req.user.id]);

    res.json({ analysis, follow_up_id: followUpId });
  } catch (error) {
    res.status(500).json({ error: error.message || 'AI分析失败' });
  }
});

// ==================== REMINDERS ====================
app.get('/api/reminders', authMiddleware, (req, res) => {
  const f = getStoreFilter(req.user);
  const sql = `SELECT r.*,c.name as customer_name FROM reminders r
    LEFT JOIN customers c ON r.customer_id=c.id
    WHERE r.is_done=0${f.sql.replace('store_id', 'r.store_id')} ORDER BY r.remind_at`;
  res.json(all(sql, f.params));
});

app.post('/api/reminders', authMiddleware, (req, res) => {
  const id = uuidv4();
  const { customer_id, title, content, remind_at } = req.body;
  if (!title || !remind_at) return res.status(400).json({ error: '标题和提醒时间必填' });
  run(`INSERT INTO reminders (id,customer_id,title,content,remind_at,store_id) VALUES (?,?,?,?,?,?)`,
    [id, customer_id||null, title, content||'', remind_at, req.user.store_id]);
  res.json(get('SELECT * FROM reminders WHERE id=?', [id]));
});

app.put('/api/reminders/:id/done', authMiddleware, (req, res) => {
  run('UPDATE reminders SET is_done=1 WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ==================== TRANSACTIONS ====================
app.get('/api/transactions', authMiddleware, (req, res) => {
  const f = getStoreFilter(req.user);
  const sql = `SELECT t.*,c.name as customer_name,p.title as property_title,p.address as property_address
    FROM transactions t LEFT JOIN customers c ON t.customer_id=c.id LEFT JOIN properties p ON t.property_id=p.id
    WHERE 1=1${f.sql.replace('store_id', 't.store_id')} ORDER BY t.created_at DESC`;
  res.json(all(sql, f.params));
});

app.post('/api/transactions', authMiddleware, (req, res) => {
  const id = uuidv4();
  const { customer_id, property_id, stage, deal_price, commission_rate = 2.0, notes } = req.body;
  const commission_amount = deal_price ? (deal_price * commission_rate / 100) : null;
  run(`INSERT INTO transactions (id,customer_id,property_id,stage,deal_price,commission_rate,commission_amount,notes,store_id,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, customer_id, property_id, stage, deal_price, commission_rate, commission_amount, notes, req.user.store_id, req.user.id]);
  if (stage === 'completed') run("UPDATE properties SET status='sold' WHERE id=?", [property_id]);
  res.json(get('SELECT * FROM transactions WHERE id=?', [id]));
});

app.put('/api/transactions/:id', authMiddleware, (req, res) => {
  const { stage, deal_price, commission_rate, notes } = req.body;
  const commission_amount = deal_price ? (deal_price * commission_rate / 100) : null;
  run(`UPDATE transactions SET stage=?,deal_price=?,commission_rate=?,commission_amount=?,notes=?,updated_at=datetime('now') WHERE id=?`,
    [stage, deal_price, commission_rate, commission_amount, notes, req.params.id]);
  const tx = get('SELECT * FROM transactions WHERE id=?', [req.params.id]);
  if (stage === 'completed') run("UPDATE properties SET status='sold' WHERE id=?", [tx.property_id]);
  res.json(tx);
});

// ==================== STATS ====================
app.get('/api/stats', authMiddleware, (req, res) => {
  try {
    const f = getStoreFilter(req.user);
    const w = f.sql ? f.sql.replace(' AND ', ' WHERE ') : '';
    const and = f.sql;
    const p = f.params;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1).toISOString();
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const start = d.toISOString();
      const end = new Date(d.getFullYear(), d.getMonth()+1, 1).toISOString();
      const r = get(`SELECT COUNT(*) as deals, COALESCE(SUM(commission_amount),0) as commission
        FROM transactions WHERE stage='completed'${and} AND created_at>=? AND created_at<?`, [...p, start, end]);
      monthlyTrend.push({ month: `${d.getMonth()+1}月`, deals: r?.deals||0, commission: r?.commission||0 });
    }
    res.json({
      totalProperties: get(`SELECT COUNT(*) as count FROM properties${w}`, p)?.count||0,
      propertyByStatus: all(`SELECT status, COUNT(*) as count FROM properties${w} GROUP BY status`, p),
      totalCustomers: get(`SELECT COUNT(*) as count FROM customers${w}`, p)?.count||0,
      totalBuyers: get(`SELECT COUNT(*) as count FROM customers WHERE customer_type='buyer'${and}`, p)?.count||0,
      totalSellers: get(`SELECT COUNT(*) as count FROM customers WHERE customer_type='seller'${and}`, p)?.count||0,
      customerByGrade: all(`SELECT grade, COUNT(*) as count FROM customers${w} GROUP BY grade`, p),
      customerBySource: all(`SELECT source, COUNT(*) as count FROM customers WHERE source IS NOT NULL${and} GROUP BY source`, p),
      monthDeals: get(`SELECT COUNT(*) as count, COALESCE(SUM(deal_price),0) as total, COALESCE(SUM(commission_amount),0) as commission
        FROM transactions WHERE stage='completed'${and} AND created_at>=?`, [...p, monthStart]),
      quarterDeals: get(`SELECT COUNT(*) as count, COALESCE(SUM(deal_price),0) as total, COALESCE(SUM(commission_amount),0) as commission
        FROM transactions WHERE stage='completed'${and} AND created_at>=?`, [...p, quarterStart]),
      transactionByStage: all(`SELECT stage, COUNT(*) as count FROM transactions${w} GROUP BY stage`, p),
      pendingReminders: get(`SELECT COUNT(*) as count FROM reminders WHERE is_done=0${and} AND remind_at<=datetime('now','+3 days')`, p)?.count||0,
      monthlyTrend
    });
  } catch(e) {
    res.json({ totalProperties:0, propertyByStatus:[], totalCustomers:0, totalBuyers:0, totalSellers:0,
      customerByGrade:[], customerBySource:[], monthDeals:{count:0,total:0,commission:0},
      quarterDeals:{count:0,total:0,commission:0}, transactionByStage:[], pendingReminders:0, monthlyTrend:[] });
  }
});

// ==================== EXPORT ====================
app.get('/api/export', authMiddleware, (req, res) => {
  const format = req.query.format || (req.user.role === 'admin' ? 'csv' : 'excel'); // 中介默认Excel，管理员默认CSV
  const f = getStoreFilter(req.user);
  const and = f.sql; const w = f.sql ? f.sql.replace(' AND ', ' WHERE ') : ''; const p = f.params;

  const properties = all(`SELECT p.*, s.name as store_name FROM properties p LEFT JOIN stores s ON p.store_id=s.id${w} ORDER BY p.created_at DESC`, p);
  const customers = all(`SELECT c.*, s.name as store_name FROM customers c LEFT JOIN stores s ON c.store_id=s.id${w} ORDER BY c.created_at DESC`, p);
  const transactions = all(`SELECT t.*, c.name as customer_name, p.title as property_title, s.name as store_name
    FROM transactions t LEFT JOIN customers c ON t.customer_id=c.id LEFT JOIN properties p ON t.property_id=p.id
    LEFT JOIN stores s ON t.store_id=s.id WHERE 1=1${and.replace('store_id','t.store_id')} ORDER BY t.created_at DESC`, p);

  const date = new Date().toISOString().split('T')[0];

  if (format === 'excel') {
    // Excel导出
    const wb = XLSX.utils.book_new();

    // 房源数据
    const propertiesData = properties.map(p => ({
      '门店': p.store_name || '',
      '标题': p.title || '',
      '地址': p.address || '',
      '面积': p.area || '',
      '挂牌价(万)': p.price || '',
      '最低价(万)': p.min_price || '',
      '户型': p.unit_type || '',
      '状态': p.status || '',
      '业主': p.owner_name || '',
      '业主电话': p.owner_phone || '',
      '录入时间': p.created_at || ''
    }));
    const ws1 = XLSX.utils.json_to_sheet(propertiesData);
    XLSX.utils.book_append_sheet(wb, ws1, '房源数据');

    // 客户数据
    const customersData = customers.map(c => ({
      '门店': c.store_name || '',
      '类型': c.customer_type === 'buyer' ? '买家' : '卖家',
      '姓名': c.name || '',
      '电话': c.phone || '',
      '微信': c.wechat || '',
      '等级': c.grade || '',
      '来源': c.source || '',
      '录入时间': c.created_at || ''
    }));
    const ws2 = XLSX.utils.json_to_sheet(customersData);
    XLSX.utils.book_append_sheet(wb, ws2, '客户数据');

    // 交易数据
    const transactionsData = transactions.map(t => ({
      '门店': t.store_name || '',
      '客户': t.customer_name || '',
      '房源': t.property_title || '',
      '阶段': t.stage || '',
      '成交价(万)': t.deal_price || '',
      '佣金(万)': t.commission_amount || '',
      '创建时间': t.created_at || ''
    }));
    const ws3 = XLSX.utils.json_to_sheet(transactionsData);
    XLSX.utils.book_append_sheet(wb, ws3, '交易数据');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('房产CRM数据_' + date + '.xlsx')}`);
    res.send(buffer);
  } else {
    // CSV导出（原有逻辑）
    const toCsv = (headers, rows, keys) =>
      headers.join(',') + '\n' + rows.map(r => keys.map(k => `"${(r[k]||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
    const content = [
      req.user.role==='admin' ? '=== 管理员视图：全部门店数据 ===' : `=== ${req.user.name} 的数据 ===`,
      '', '=== 房源数据 ===',
      toCsv(['门店','标题','地址','面积','挂牌价(万)','最低价(万)','户型','状态','业主','业主电话','录入时间'],
        properties, ['store_name','title','address','area','price','min_price','unit_type','status','owner_name','owner_phone','created_at']),
      '', '=== 客户数据 ===',
      toCsv(['门店','类型','姓名','电话','微信','等级','来源','录入时间'],
        customers, ['store_name','customer_type','name','phone','wechat','grade','source','created_at']),
      '', '=== 交易数据 ===',
      toCsv(['门店','客户','房源','阶段','成交价(万)','佣金(万)','创建时间'],
        transactions, ['store_name','customer_name','property_title','stage','deal_price','commission_amount','created_at']),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('房产CRM数据_' + date + '.csv')}`);
    res.send('\uFEFF' + content);
  }
});

// ==================== ADMIN ====================
app.get('/api/admin/stores', authMiddleware, adminMiddleware, (req, res) => {
  res.json(all('SELECT s.*, COUNT(u.id) as user_count FROM stores s LEFT JOIN users u ON s.id=u.store_id GROUP BY s.id'));
});

const PORT = process.env.PORT || 3001;
initDB().then(() => app.listen(PORT, () => console.log(`🏠 房产CRM运行在端口 ${PORT}`)));
