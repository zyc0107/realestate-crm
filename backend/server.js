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

function getDataFilter(user, options = {}) {
  const { tableAlias = '', includeCreatedBy = true } = options;
  const prefix = tableAlias ? `${tableAlias}.` : '';

  // 管理员: 无限制
  if (user.role === 'admin') {
    return { sql: '', params: [] };
  }

  // 普通中介: 只能看自己创建的数据
  if (includeCreatedBy) {
    return {
      sql: ` AND ${prefix}store_id=? AND (${prefix}created_by=? OR ${prefix}created_by IS NULL)`,
      params: [user.store_id, user.id]
    };
  }

  // 仅门店过滤(特殊场景)
  return {
    sql: ` AND ${prefix}store_id=?`,
    params: [user.store_id]
  };
}

// 专门用于 transactions 表的过滤器（用于统计和导出）
function getTransactionFilter(user) {
  const f = getDataFilter(user, { tableAlias: 't', includeCreatedBy: true });
  return f;
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
  const { username, password, name, store_name, agent_id } = req.body;
  if (!username || !password || !name || !store_name) return res.status(400).json({ error: '请填写所有必填项' });
  if (get('SELECT id FROM users WHERE username=?', [username])) return res.status(400).json({ error: '用户名已存在' });
  let store = get('SELECT * FROM stores WHERE name=?', [store_name]);
  if (!store) {
    const storeId = uuidv4();
    run('INSERT INTO stores (id, name) VALUES (?, ?)', [storeId, store_name]);
    store = get('SELECT * FROM stores WHERE id=?', [storeId]);
  }
  const userId = uuidv4();
  run('INSERT INTO users (id, username, password, name, store_id, role, agent_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, username, hashPassword(password), name, store.id, 'agent', agent_id || '']);
  const token = generateToken();
  run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
    [token, userId, new Date(Date.now() + 7*24*3600*1000).toISOString()]);
  const user = get('SELECT id,username,name,role,store_id,agent_id FROM users WHERE id=?', [userId]);
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

app.post('/api/user/update-nickname', authMiddleware, (req, res) => {
  const { nickname } = req.body;
  const trimmedNickname = nickname ? nickname.trim() : '';

  // Check if nickname is already taken by another user (only if not empty)
  if (trimmedNickname) {
    const existing = get('SELECT id FROM users WHERE nickname=? AND id!=?', [trimmedNickname, req.user.id]);
    if (existing) {
      return res.status(400).json({ error: '昵称已被使用，请换一个' });
    }
  }

  // Update nickname (can be empty)
  run('UPDATE users SET nickname=? WHERE id=?', [trimmedNickname, req.user.id]);
  res.json({ success: true, message: '昵称更新成功' });
});

// ==================== PROPERTIES ====================
app.get('/api/properties', authMiddleware, (req, res) => {
  const { status, search } = req.query;
  const f = getDataFilter(req.user, { includeCreatedBy: true });
  let sql = `SELECT p.*,
    s.name as store_name,
    u.name as agent_name,
    u.agent_id as agent_id
    FROM properties p
    LEFT JOIN stores s ON p.store_id = s.id
    LEFT JOIN users u ON p.created_by = u.id
    WHERE 1=1` + f.sql;
  const params = [...f.params];
  if (status) { sql += ' AND p.status=?'; params.push(status); }
  if (search) { sql += ' AND (p.community_name LIKE ? OR p.address LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY p.created_at DESC';
  res.json(all(sql, params));
});

app.post('/api/properties', authMiddleware, (req, res) => {
  const id = uuidv4();
  const { community_name, address, area, price, min_price, rooms, halls, baths, unit_room,
    property_type, decoration, build_year, urgent, floor, total_floors, orientation,
    amenities, photo_url, description, status = 'available',
    owner_name, owner_phone, owner_wechat, notes } = req.body;

  run(`INSERT INTO properties (id,community_name,address,area,price,min_price,rooms,halls,baths,unit_room,
    property_type,decoration,build_year,urgent,floor,total_floors,orientation,amenities,photo_url,description,status,
    owner_name,owner_phone,owner_wechat,notes,store_id,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, community_name||'', address||'', area||null, price||null, min_price||null,
     rooms||null, halls||null, baths||null, unit_room||'',
     property_type||'住宅', decoration||'', build_year||null, urgent||0,
     floor||'', total_floors||'', orientation||'', amenities||'', photo_url||'', description||'', status,
     owner_name||'', owner_phone||'', owner_wechat||'', notes||'', req.user.store_id||null, req.user.id]);

  // Auto-create seller customer if owner info provided
  if (owner_name || owner_phone) {
    const existing = owner_phone ? get('SELECT id FROM customers WHERE phone=? AND store_id=?', [owner_phone, req.user.store_id]) : null;
    if (!existing) {
      const customerId = uuidv4();
      run(`INSERT INTO customers (id,name,phone,wechat,customer_type,source,grade,notes,linked_property_id,store_id,created_by)
        VALUES (?,?,?,?,'seller','房源录入','B',?,?,?,?)`,
        [customerId, owner_name||'业主', owner_phone||'', owner_wechat||'',
         `关联房源：${community_name}`, id, req.user.store_id, req.user.id]);
    } else {
      // Link existing customer to property
      run('UPDATE customers SET linked_property_id=?, customer_type="seller" WHERE id=?', [id, existing.id]);
    }
  }

  res.json(get('SELECT * FROM properties WHERE id=?', [id]));
});

app.put('/api/properties/:id', authMiddleware, (req, res) => {
  const existing = get('SELECT * FROM properties WHERE id=?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '房源不存在' });
  if (req.user.role !== 'admin' && existing.created_by !== req.user.id && existing.created_by !== null) {
    return res.status(403).json({ error: '无权修改该房源' });
  }

  const { community_name, address, area, price, min_price, rooms, halls, baths, unit_room,
    property_type, decoration, build_year, urgent, floor, total_floors, orientation,
    amenities, photo_url, description, status, owner_name, owner_phone, owner_wechat, notes } = req.body;

  run(`UPDATE properties SET community_name=?,address=?,area=?,price=?,min_price=?,rooms=?,halls=?,baths=?,unit_room=?,
    property_type=?,decoration=?,build_year=?,urgent=?,floor=?,total_floors=?,orientation=?,amenities=?,photo_url=?,
    description=?,status=?,owner_name=?,owner_phone=?,owner_wechat=?,notes=?,updated_at=datetime('now') WHERE id=?`,
    [community_name||'', address||'', area||null, price||null, min_price||null,
     rooms||null, halls||null, baths||null, unit_room||'',
     property_type||'住宅', decoration||'', build_year||null, urgent||0,
     floor||'', total_floors||'', orientation||'', amenities||'', photo_url||'', description||'', status,
     owner_name||'', owner_phone||'', owner_wechat||'', notes||'', req.params.id]);

  res.json(get('SELECT * FROM properties WHERE id=?', [req.params.id]));
});
     orientation||'', amenities||'', photo_url||'', description||'', status,
     owner_name||'', owner_phone||'', owner_wechat||'', notes||'', req.params.id]);
  res.json(get('SELECT * FROM properties WHERE id=?', [req.params.id]));
});

app.delete('/api/properties/:id', authMiddleware, (req, res) => {
  const existing = get('SELECT * FROM properties WHERE id=?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '房源不存在' });
  if (req.user.role !== 'admin' && existing.created_by !== req.user.id && existing.created_by !== null) {
    return res.status(403).json({ error: '无权删除该房源' });
  }

  run('DELETE FROM properties WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// 批量删除房源
app.post('/api/properties/batch-delete', authMiddleware, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请提供要删除的房源ID列表' });
  }

  let successCount = 0;
  let errorCount = 0;

  ids.forEach(id => {
    try {
      const existing = get('SELECT * FROM properties WHERE id=?', [id]);
      if (!existing) {
        errorCount++;
        return;
      }
      if (req.user.role !== 'admin' && existing.created_by !== req.user.id && existing.created_by !== null) {
        errorCount++;
        return;
      }
      run('DELETE FROM properties WHERE id=?', [id]);
      successCount++;
    } catch (e) {
      errorCount++;
    }
  });

  res.json({
    success: true,
    successCount,
    errorCount,
    message: `成功删除 ${successCount} 条，失败 ${errorCount} 条`
  });
});

// ==================== CUSTOMERS ====================
app.get('/api/customers', authMiddleware, (req, res) => {
  const { grade, search, customer_type } = req.query;
  const f = getDataFilter(req.user, { tableAlias: 'c', includeCreatedBy: true });
  let sql = `SELECT c.*,
    (SELECT MAX(created_at) FROM follow_ups WHERE customer_id = c.id) as last_follow_up_at,
    p.min_price as property_min_price,
    p.price as property_price,
    p.community_name as property_community,
    p.unit_room as property_unit_room,
    s.name as store_name,
    u.name as agent_name,
    u.agent_id as agent_id
    FROM customers c
    LEFT JOIN properties p ON c.linked_property_id = p.id
    LEFT JOIN stores s ON c.store_id = s.id
    LEFT JOIN users u ON c.created_by = u.id
    WHERE 1=1` + f.sql;
  const params = [...f.params];
  if (grade) { sql += ' AND c.grade=?'; params.push(grade); }
  if (customer_type) { sql += ' AND c.customer_type=?'; params.push(customer_type); }
  if (search) { sql += ' AND (c.name LIKE ? OR c.phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY c.created_at DESC';
  res.json(all(sql, params));
});

app.get('/api/customers/:id', authMiddleware, (req, res) => {
  const customer = get('SELECT * FROM customers WHERE id=?', [req.params.id]);
  if (!customer) return res.status(404).json({ error: '客户不存在' });

  // 权限检查
  if (req.user.role !== 'admin' && customer.created_by !== req.user.id && customer.created_by !== null) {
    return res.status(403).json({ error: '无权访问该客户' });
  }

  // 跟进记录过滤
  const followUpFilter = req.user.role === 'admin'
    ? ''
    : ' AND (created_by=? OR created_by IS NULL)';
  const followUpParams = req.user.role === 'admin'
    ? [req.params.id]
    : [req.params.id, req.user.id];
  const followUps = all(
    `SELECT * FROM follow_ups WHERE customer_id=?${followUpFilter} ORDER BY created_at DESC`,
    followUpParams
  );

  // 提醒过滤
  const reminderFilter = req.user.role === 'admin'
    ? ''
    : ' AND (created_by=? OR created_by IS NULL)';
  const reminderParams = req.user.role === 'admin'
    ? [req.params.id]
    : [req.params.id, req.user.id];
  const reminders = all(
    `SELECT * FROM reminders WHERE customer_id=? AND is_done=0${reminderFilter} ORDER BY remind_at`,
    reminderParams
  );

  const linkedProperty = customer.linked_property_id ? get('SELECT * FROM properties WHERE id=?', [customer.linked_property_id]) : null;
  res.json({ ...customer, followUps, reminders, linkedProperty });
});

app.post('/api/customers', authMiddleware, (req, res) => {
  const { name, phone, wechat, customer_type = 'buyer', budget_min, budget_max,
    preferred_areas, requirements, source, grade = 'C', notes, linked_property_id } = req.body;

  // 验证必填字段
  if (!name) {
    return res.status(400).json({ error: '请填写客户姓名' });
  }

  // 检查手机号是否重复
  if (phone) {
    const existing = get('SELECT id, name FROM customers WHERE phone=? AND store_id=?', [phone, req.user.store_id]);
    if (existing) {
      return res.status(400).json({
        error: '手机号已存在',
        duplicate: true,
        existingCustomer: existing
      });
    }
  }

  const id = uuidv4();
  run(`INSERT INTO customers (id,name,phone,wechat,customer_type,budget_min,budget_max,
    preferred_areas,requirements,source,grade,notes,linked_property_id,store_id,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, name||'', phone||'', wechat||'', customer_type, budget_min||null, budget_max||null,
     preferred_areas||'', requirements||'', source||'', grade, notes||'', linked_property_id||null, req.user.store_id||null, req.user.id]);
  res.json(get('SELECT * FROM customers WHERE id=?', [id]));
});

app.put('/api/customers/:id', authMiddleware, (req, res) => {
  const existing = get('SELECT * FROM customers WHERE id=?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '客户不存在' });
  if (req.user.role !== 'admin' && existing.created_by !== req.user.id && existing.created_by !== null) {
    return res.status(403).json({ error: '无权修改该客户' });
  }

  const { name, phone, wechat, customer_type, budget_min, budget_max,
    preferred_areas, requirements, source, grade, notes } = req.body;
  run(`UPDATE customers SET name=?,phone=?,wechat=?,customer_type=?,budget_min=?,budget_max=?,
    preferred_areas=?,requirements=?,source=?,grade=?,notes=?,updated_at=datetime('now') WHERE id=?`,
    [name||'', phone||'', wechat||'', customer_type, budget_min||null, budget_max||null,
     preferred_areas||'', requirements||'', source||'', grade, notes||'', req.params.id]);
  res.json(get('SELECT * FROM customers WHERE id=?', [req.params.id]));
});

app.delete('/api/customers/:id', authMiddleware, (req, res) => {
  const existing = get('SELECT * FROM customers WHERE id=?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '客户不存在' });
  if (req.user.role !== 'admin' && existing.created_by !== req.user.id && existing.created_by !== null) {
    return res.status(403).json({ error: '无权删除该客户' });
  }

  run('DELETE FROM customers WHERE id=?', [req.params.id]);
  run('DELETE FROM follow_ups WHERE customer_id=?', [req.params.id]);
  run('DELETE FROM reminders WHERE customer_id=?', [req.params.id]);
  res.json({ success: true });
});

// 批量删除客户
app.post('/api/customers/batch-delete', authMiddleware, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请提供要删除的客户ID列表' });
  }

  let successCount = 0;
  let errorCount = 0;

  ids.forEach(id => {
    try {
      const existing = get('SELECT * FROM customers WHERE id=?', [id]);
      if (!existing) {
        errorCount++;
        return;
      }
      if (req.user.role !== 'admin' && existing.created_by !== req.user.id && existing.created_by !== null) {
        errorCount++;
        return;
      }
      run('DELETE FROM customers WHERE id=?', [id]);
      run('DELETE FROM follow_ups WHERE customer_id=?', [id]);
      run('DELETE FROM reminders WHERE customer_id=?', [id]);
      successCount++;
    } catch (e) {
      errorCount++;
    }
  });

  res.json({
    success: true,
    successCount,
    errorCount,
    message: `成功删除 ${successCount} 条，失败 ${errorCount} 条`
  });
});

// ==================== FOLLOW-UPS ====================
app.post('/api/followups', authMiddleware, (req, res) => {
  const id = uuidv4();
  const { customer_id, content, method, result, next_follow_up_at } = req.body;
  run(`INSERT INTO follow_ups (id,customer_id,content,method,result,next_follow_up_at,store_id,created_by) VALUES (?,?,?,?,?,?,?,?)`,
    [id, customer_id, content, method, result, next_follow_up_at, req.user.store_id, req.user.id]);
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
    run(`INSERT INTO follow_ups (id,customer_id,content,method,ai_analysis,store_id,created_by) VALUES (?,?,?,?,?,?,?)`,
      [followUpId, customer_id||null, chat_content, 'AI分析', JSON.stringify(analysis), req.user.store_id, req.user.id]);

    res.json({ analysis, follow_up_id: followUpId });
  } catch (error) {
    res.status(500).json({ error: error.message || 'AI分析失败' });
  }
});

// ==================== AI增强功能 ====================

// 1. 智能客户画像分析
app.post('/api/ai/customer-profile', authMiddleware, async (req, res) => {
  const { customer_id } = req.body;
  if (!customer_id) return res.status(400).json({ error: '请提供客户ID' });

  try {
    const key = getApiKey(req.user.store_id);

    // 获取客户完整信息
    const customer = get('SELECT * FROM customers WHERE id=?', [customer_id]);
    if (!customer) return res.status(404).json({ error: '客户不存在' });

    // 获取回访记录
    const followUps = all('SELECT * FROM follow_ups WHERE customer_id=? ORDER BY created_at DESC LIMIT 10', [customer_id]);

    // 获取浏览过的房源（通过交易记录）
    const viewedProperties = all(`
      SELECT p.* FROM properties p
      JOIN transactions t ON p.id = t.property_id
      WHERE t.customer_id=?
      ORDER BY t.created_at DESC LIMIT 5
    `, [customer_id]);

    const prompt = `你是专业的房产中介AI助手。请分析以下客户信息，生成详细的客户画像。

客户基本信息：
- 姓名：${customer.name}
- 类型：${customer.customer_type === 'buyer' ? '买家' : '卖家'}
- 预算：${customer.budget_min || '?'}-${customer.budget_max || '?'}万
- 意向区域：${customer.preferred_areas || '未填写'}
- 需求描述：${customer.requirements || '未填写'}
- 来源：${customer.source || '未知'}
- 等级：${customer.grade}类

回访记录（最近10条）：
${followUps.map((f, i) => `${i+1}. [${f.created_at}] ${f.content}`).join('\n') || '暂无回访记录'}

浏览过的房源：
${viewedProperties.map((p, i) => `${i+1}. ${p.community_name} ${p.area}㎡ ${p.rooms}室${p.halls}厅 ${p.price}万`).join('\n') || '暂无浏览记录'}

请以JSON格式输出（只输出JSON，不要其他内容）：
{
  "purchase_motivation": "购房动机分析（如：刚需自住/改善换房/投资等）",
  "urgency_level": "紧迫性（高/中/低）",
  "urgency_reason": "紧迫性原因",
  "real_budget": {
    "min": 实际预算下限（数字）,
    "max": 实际预算上限（数字）,
    "analysis": "预算分析说明"
  },
  "preferences": {
    "location": ["偏好区域1", "偏好区域2"],
    "property_type": "偏好房型（如：3室2厅）",
    "floor": "偏好楼层",
    "orientation": "偏好朝向",
    "decoration": "偏好装修",
    "other": ["其他偏好1", "其他偏好2"]
  },
  "concerns": ["主要顾虑1", "主要顾虑2", "主要顾虑3"],
  "deal_probability": 成交概率评分（0-100的数字）,
  "deal_probability_analysis": "成交概率分析说明",
  "follow_up_strategy": {
    "frequency": "建议回访频率（如：每3天）",
    "focus_points": ["重点关注1", "重点关注2"],
    "suggested_actions": ["建议行动1", "建议行动2"],
    "话术建议": "具体的沟通话术"
  },
  "risk_factors": ["风险因素1", "风险因素2"],
  "summary": "客户画像总结（100字以内）"
}`;

    const analysisText = await callDeepSeek(key, prompt);
    let profile;
    try {
      profile = JSON.parse(analysisText.replace(/```json|```/g, '').trim());
    } catch {
      profile = { summary: analysisText, deal_probability: 50 };
    }

    // 保存画像到数据库（可以添加一个customer_profiles表）
    res.json({ profile, customer });
  } catch (error) {
    res.status(500).json({ error: error.message || '客户画像分析失败' });
  }
});

// 2. 智能房源推荐
app.post('/api/ai/recommend-properties', authMiddleware, async (req, res) => {
  const { customer_id } = req.body;
  if (!customer_id) return res.status(400).json({ error: '请提供客户ID' });

  try {
    const key = getApiKey(req.user.store_id);

    // 获取客户信息
    const customer = get('SELECT * FROM customers WHERE id=?', [customer_id]);
    if (!customer) return res.status(404).json({ error: '客户不存在' });

    // 获取所有在售房源
    const f = getDataFilter(req.user, { includeCreatedBy: false });
    const properties = all(`SELECT * FROM properties WHERE status='available'${f.sql} ORDER BY created_at DESC LIMIT 50`, f.params);

    if (properties.length === 0) {
      return res.json({ recommendations: [], explanation: '暂无可推荐的房源' });
    }

    const prompt = `你是专业的房产中介AI助手。请根据客户需求，从以下房源中推荐最合适的5套。

客户需求：
- 预算：${customer.budget_min || '?'}-${customer.budget_max || '?'}万
- 意向区域：${customer.preferred_areas || '不限'}
- 需求描述：${customer.requirements || '未填写'}
- 等级：${customer.grade}类

可选房源列表：
${properties.map((p, i) => `${i+1}. ID:${p.id} | ${p.community_name} | ${p.area}㎡ | ${p.rooms}室${p.halls}厅${p.baths}卫 | ${p.price}万 | ${p.orientation || '未知朝向'} | ${p.decoration || '未知装修'}`).join('\n')}

请以JSON格式输出（只输出JSON，不要其他内容）：
{
  "recommendations": [
    {
      "property_id": "房源ID",
      "match_score": 匹配度评分（0-100）,
      "match_reasons": ["匹配理由1", "匹配理由2", "匹配理由3"],
      "selling_points": ["卖点1", "卖点2"],
      "potential_concerns": ["可能的顾虑1", "可能的顾虑2"],
      "suggested_pitch": "推荐话术"
    }
  ],
  "overall_analysis": "整体推荐分析"
}

请推荐5套最合适的房源，按匹配度从高到低排序。`;

    const analysisText = await callDeepSeek(key, prompt);
    let result;
    try {
      result = JSON.parse(analysisText.replace(/```json|```/g, '').trim());
    } catch {
      result = { recommendations: [], overall_analysis: analysisText };
    }

    // 补充完整的房源信息
    if (result.recommendations && result.recommendations.length > 0) {
      result.recommendations = result.recommendations.map(rec => {
        const property = properties.find(p => p.id === rec.property_id);
        return { ...rec, property };
      }).filter(rec => rec.property); // 过滤掉找不到的房源
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || '房源推荐失败' });
  }
});

// 3. 智能回访策略建议
app.post('/api/ai/follow-up-strategy', authMiddleware, async (req, res) => {
  const { customer_id } = req.body;
  if (!customer_id) return res.status(400).json({ error: '请提供客户ID' });

  try {
    const key = getApiKey(req.user.store_id);

    // 获取客户信息
    const customer = get('SELECT * FROM customers WHERE id=?', [customer_id]);
    if (!customer) return res.status(404).json({ error: '客户不存在' });

    // 获取最近的回访记录
    const lastFollowUp = get('SELECT * FROM follow_ups WHERE customer_id=? ORDER BY created_at DESC LIMIT 1', [customer_id]);

    // 获取所有回访记录
    const allFollowUps = all('SELECT * FROM follow_ups WHERE customer_id=? ORDER BY created_at DESC', [customer_id]);

    const daysSinceLastContact = lastFollowUp
      ? Math.floor((Date.now() - new Date(lastFollowUp.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    const prompt = `你是专业的房产中介AI助手。请根据客户情况，制定详细的回访策略。

客户信息：
- 姓名：${customer.name}
- 等级：${customer.grade}类
- 预算：${customer.budget_min || '?'}-${customer.budget_max || '?'}万
- 需求：${customer.requirements || '未填写'}

上次回访：
${lastFollowUp ? `- 时间：${lastFollowUp.created_at}\n- 内容：${lastFollowUp.content}\n- 距今：${daysSinceLastContact}天` : '暂无回访记录'}

历史回访记录（共${allFollowUps.length}条）：
${allFollowUps.slice(0, 5).map((f, i) => `${i+1}. [${f.created_at}] ${f.content.substring(0, 100)}`).join('\n') || '暂无'}

请以JSON格式输出（只输出JSON，不要其他内容）：
{
  "should_follow_up_now": true或false,
  "urgency": "紧急程度（高/中/低）",
  "best_time": {
    "date": "建议回访日期（YYYY-MM-DD）",
    "time_slot": "建议时间段（如：上午10-11点）",
    "reason": "选择这个时间的原因"
  },
  "communication_method": "建议沟通方式（电话/微信/上门）",
  "conversation_topics": [
    {
      "topic": "话题1",
      "purpose": "目的",
      "key_points": ["要点1", "要点2"]
    }
  ],
  "opening_script": "开场白话术",
  "main_script": "主要沟通话术",
  "closing_script": "结束语话术",
  "expected_outcomes": ["预期结果1", "预期结果2"],
  "backup_plan": "如果客户不接电话/不回复的备选方案",
  "notes": "其他注意事项"
}`;

    const analysisText = await callDeepSeek(key, prompt);
    let strategy;
    try {
      strategy = JSON.parse(analysisText.replace(/```json|```/g, '').trim());
    } catch {
      strategy = { notes: analysisText, should_follow_up_now: true };
    }

    res.json({ strategy, customer, last_follow_up: lastFollowUp, days_since_last_contact: daysSinceLastContact });
  } catch (error) {
    res.status(500).json({ error: error.message || '回访策略生成失败' });
  }
});

// 4. 成交概率预测
app.post('/api/ai/deal-probability', authMiddleware, async (req, res) => {
  const { customer_id, property_id } = req.body;
  if (!customer_id) return res.status(400).json({ error: '请提供客户ID' });

  try {
    const key = getApiKey(req.user.store_id);

    // 获取客户信息
    const customer = get('SELECT * FROM customers WHERE id=?', [customer_id]);
    if (!customer) return res.status(404).json({ error: '客户不存在' });

    // 获取房源信息（如果提供）
    let property = null;
    if (property_id) {
      property = get('SELECT * FROM properties WHERE id=?', [property_id]);
    }

    // 获取回访记录
    const followUps = all('SELECT * FROM follow_ups WHERE customer_id=? ORDER BY created_at DESC LIMIT 10', [customer_id]);

    // 获取交易记录
    const transactions = all('SELECT * FROM transactions WHERE customer_id=?', [customer_id]);

    const prompt = `你是专业的房产中介AI助手。请预测客户的成交概率。

客户信息：
- 姓名：${customer.name}
- 类型：${customer.customer_type === 'buyer' ? '买家' : '卖家'}
- 等级：${customer.grade}类
- 预算：${customer.budget_min || '?'}-${customer.budget_max || '?'}万
- 来源：${customer.source || '未知'}
- 需求：${customer.requirements || '未填写'}

${property ? `目标房源：
- 小区：${property.community_name}
- 面积：${property.area}㎡
- 户型：${property.rooms}室${property.halls}厅${property.baths}卫
- 价格：${property.price}万（底价${property.min_price || '?'}万）
- 朝向：${property.orientation || '未知'}
- 装修：${property.decoration || '未知'}` : '暂无特定目标房源'}

回访记录（${followUps.length}条）：
${followUps.map((f, i) => `${i+1}. [${f.created_at}] ${f.content.substring(0, 100)}`).join('\n') || '暂无'}

交易进度：
${transactions.length > 0 ? transactions.map(t => `- 阶段：${t.stage}`).join('\n') : '暂无交易记录'}

请以JSON格式输出（只输出JSON，不要其他内容）：
{
  "overall_probability": 总体成交概率（0-100的数字）,
  "probability_level": "概率等级（极高/高/中/低/极低）",
  "confidence": "预测置信度（0-100）",
  "key_factors": {
    "positive": [
      {"factor": "正面因素1", "impact": "影响程度（高/中/低）", "score": 加分（数字）}
    ],
    "negative": [
      {"factor": "负面因素1", "impact": "影响程度（高/中/低）", "score": 减分（数字）}
    ]
  },
  "timeline_prediction": {
    "estimated_days": 预计成交天数（数字）,
    "confidence": "时间预测置信度",
    "explanation": "时间预测说明"
  },
  "recommended_actions": [
    {
      "action": "建议行动1",
      "priority": "优先级（高/中/低）",
      "expected_impact": "预期影响",
      "implementation": "具体实施方法"
    }
  ],
  "risk_assessment": {
    "deal_falling_through_risk": "流单风险（高/中/低）",
    "risk_factors": ["风险因素1", "风险因素2"],
    "mitigation_strategies": ["应对策略1", "应对策略2"]
  },
  "price_negotiation_advice": {
    "客户心理价位": "预估的心理价位",
    "negotiation_space": "议价空间分析",
    "strategy": "议价策略建议"
  },
  "summary": "成交概率分析总结"
}`;

    const analysisText = await callDeepSeek(key, prompt);
    let prediction;
    try {
      prediction = JSON.parse(analysisText.replace(/```json|```/g, '').trim());
    } catch {
      prediction = { summary: analysisText, overall_probability: 50 };
    }

    res.json({ prediction, customer, property });
  } catch (error) {
    res.status(500).json({ error: error.message || '成交概率预测失败' });
  }
});

// ==================== REMINDERS ====================
app.get('/api/reminders', authMiddleware, (req, res) => {
  const f = getDataFilter(req.user, { tableAlias: 'r', includeCreatedBy: true });
  const sql = `SELECT r.*,c.name as customer_name FROM reminders r
    LEFT JOIN customers c ON r.customer_id=c.id
    WHERE r.is_done=0${f.sql} ORDER BY r.remind_at`;
  res.json(all(sql, f.params));
});

app.post('/api/reminders', authMiddleware, (req, res) => {
  const id = uuidv4();
  const { customer_id, title, content, remind_at } = req.body;
  if (!title || !remind_at) return res.status(400).json({ error: '标题和提醒时间必填' });
  run(`INSERT INTO reminders (id,customer_id,title,content,remind_at,store_id,created_by) VALUES (?,?,?,?,?,?,?)`,
    [id, customer_id||null, title, content||'', remind_at, req.user.store_id, req.user.id]);
  res.json(get('SELECT * FROM reminders WHERE id=?', [id]));
});

app.put('/api/reminders/:id/done', authMiddleware, (req, res) => {
  const existing = get('SELECT * FROM reminders WHERE id=?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '提醒不存在' });
  if (req.user.role !== 'admin' && existing.created_by !== req.user.id && existing.created_by !== null) {
    return res.status(403).json({ error: '无权操作该提醒' });
  }

  run('UPDATE reminders SET is_done=1 WHERE id=?', [req.params.id]);
  res.json(get('SELECT * FROM reminders WHERE id=?', [req.params.id]));
});

// ==================== TRANSACTIONS ====================
app.get('/api/transactions', authMiddleware, (req, res) => {
  const f = getDataFilter(req.user, { tableAlias: 't', includeCreatedBy: true });
  const sql = `SELECT t.*,c.name as customer_name,p.title as property_title,p.address as property_address
    FROM transactions t LEFT JOIN customers c ON t.customer_id=c.id LEFT JOIN properties p ON t.property_id=p.id
    WHERE 1=1${f.sql} ORDER BY t.created_at DESC`;
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
  const existing = get('SELECT * FROM transactions WHERE id=?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '交易不存在' });
  if (req.user.role !== 'admin' && existing.created_by !== req.user.id && existing.created_by !== null) {
    return res.status(403).json({ error: '无权修改该交易' });
  }

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
    const f = getDataFilter(req.user, { includeCreatedBy: true });
    const w = f.sql ? f.sql.replace(' AND ', ' WHERE ') : '';
    const and = f.sql;
    const p = f.params;

    // 专门用于 transactions 表的过滤
    const tf = getTransactionFilter(req.user);
    const tAnd = tf.sql;
    const tParams = tf.params;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1).toISOString();
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const start = d.toISOString();
      const end = new Date(d.getFullYear(), d.getMonth()+1, 1).toISOString();
      const r = get(`SELECT COUNT(*) as deals, COALESCE(SUM(commission_amount),0) as commission
        FROM transactions t WHERE stage='completed'${tAnd} AND t.created_at>=? AND t.created_at<?`, [...tParams, start, end]);
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
        FROM transactions t WHERE stage='completed'${tAnd} AND t.created_at>=?`, [...tParams, monthStart]),
      quarterDeals: get(`SELECT COUNT(*) as count, COALESCE(SUM(deal_price),0) as total, COALESCE(SUM(commission_amount),0) as commission
        FROM transactions t WHERE stage='completed'${tAnd} AND t.created_at>=?`, [...tParams, quarterStart]),
      transactionByStage: all(`SELECT stage, COUNT(*) as count FROM transactions t${tAnd ? ' WHERE 1=1' + tAnd : ''} GROUP BY stage`, tParams),
      pendingReminders: get(`SELECT COUNT(*) as count FROM reminders WHERE is_done=0${and} AND remind_at<=datetime('now','+3 days')`, p)?.count||0,
      monthlyTrend
    });
  } catch(e) {
    console.error('Stats error:', e);
    res.json({ totalProperties:0, propertyByStatus:[], totalCustomers:0, totalBuyers:0, totalSellers:0,
      customerByGrade:[], customerBySource:[], monthDeals:{count:0,total:0,commission:0},
      quarterDeals:{count:0,total:0,commission:0}, transactionByStage:[], pendingReminders:0, monthlyTrend:[] });
  }
});

// ==================== EXPORT ====================
app.get('/api/export', authMiddleware, (req, res) => {
  const format = req.query.format || (req.user.role === 'admin' ? 'csv' : 'excel');
  const f = getDataFilter(req.user, { includeCreatedBy: true });
  const and = f.sql; const w = f.sql ? f.sql.replace(' AND ', ' WHERE ') : ''; const p = f.params;

  // 专门用于 transactions 表的过滤
  const tf = getTransactionFilter(req.user);
  const tAnd = tf.sql;
  const tParams = tf.params;

  const properties = all(`SELECT p.*, s.name as store_name FROM properties p LEFT JOIN stores s ON p.store_id=s.id${w} ORDER BY p.created_at DESC`, p);
  const customers = all(`SELECT c.*, s.name as store_name FROM customers c LEFT JOIN stores s ON c.store_id=s.id${w} ORDER BY c.created_at DESC`, p);
  const transactions = all(`SELECT t.*, c.name as customer_name, p.title as property_title, s.name as store_name
    FROM transactions t LEFT JOIN customers c ON t.customer_id=c.id LEFT JOIN properties p ON t.property_id=p.id
    LEFT JOIN stores s ON t.store_id=s.id WHERE 1=1${tAnd} ORDER BY t.created_at DESC`, tParams);

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

// ==================== IMPORT ====================
// 下载导入模板
app.get('/api/import/template/:type', authMiddleware, (req, res) => {
  const { type } = req.params;
  const wb = XLSX.utils.book_new();

  if (type === 'properties') {
    const template = [
      {
        '小区名称': '示例小区',
        '详细地址': '示例路123号',
        '面积(㎡)': '100',
        '挂牌价(万)': '500',
        '最低价(万)': '480',
        '户型': '3室2厅',
        '室': '3',
        '厅': '2',
        '卫': '2',
        '楼层': '10',
        '总楼层': '30',
        '朝向': '南',
        '配套设施': '地铁,学校',
        '状态': 'available',
        '业主姓名': '张三',
        '业主电话': '13800138000',
        '业主微信': 'zhangsan',
        '备注': '急售'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    XLSX.utils.book_append_sheet(wb, ws, '房源导入模板');
  } else if (type === 'customers') {
    const template = [
      {
        '客户姓名': '李四',
        '手机号': '13900139000',
        '微信': 'lisi',
        '客户类型': 'buyer',
        '预算最低(万)': '300',
        '预算最高(万)': '500',
        '意向区域': '浦东新区',
        '需求描述': '3室2厅,靠近地铁',
        '来源': '朋友介绍',
        '等级': 'A',
        '备注': '意向强烈'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    XLSX.utils.book_append_sheet(wb, ws, '客户导入模板');
  } else {
    return res.status(400).json({ error: '无效的模板类型' });
  }

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(type === 'properties' ? '房源导入模板.xlsx' : '客户导入模板.xlsx')}`);
  res.send(buffer);
});

app.post('/api/import/properties', authMiddleware, (req, res) => {
  try {
    const { data } = req.body;
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: '请提供有效的数据' });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    data.forEach((row, index) => {
      try {
        // 验证必填字段
        if (!row.address) {
          errors.push(`第${index + 1}行：缺少地址`);
          errorCount++;
          return;
        }

        const id = uuidv4();
        run(`INSERT INTO properties (id,title,community_name,address,area,price,min_price,unit_type,rooms,halls,baths,
          floor,total_floors,orientation,amenities,description,status,owner_name,owner_phone,owner_wechat,notes,store_id,created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, row.title||'', row.community_name||'', row.address, row.area||null, row.price||null, row.min_price||null,
           row.unit_type||'', row.rooms||'', row.halls||'', row.baths||'',
           row.floor||'', row.total_floors||'', row.orientation||'', row.amenities||'', row.description||'',
           row.status||'available', row.owner_name||'', row.owner_phone||'', row.owner_wechat||'', row.notes||'',
           req.user.store_id, req.user.id]);
        successCount++;
      } catch (e) {
        errors.push(`第${index + 1}行：${e.message}`);
        errorCount++;
      }
    });

    res.json({
      success: true,
      successCount,
      errorCount,
      errors: errors.slice(0, 10), // 只返回前10个错误
      message: `成功导入 ${successCount} 条，失败 ${errorCount} 条`
    });
  } catch (e) {
    res.status(500).json({ error: '导入失败：' + e.message });
  }
});

app.post('/api/import/customers', authMiddleware, (req, res) => {
  try {
    const { data } = req.body;
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: '请提供有效的数据' });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const duplicates = [];

    data.forEach((row, index) => {
      try {
        // 验证必填字段
        if (!row.name) {
          errors.push(`第${index + 1}行：缺少客户姓名`);
          errorCount++;
          return;
        }

        // 检查手机号是否重复
        if (row.phone) {
          const existing = get('SELECT id, name FROM customers WHERE phone=? AND store_id=?', [row.phone, req.user.store_id]);
          if (existing) {
            duplicates.push(`第${index + 1}行：手机号 ${row.phone} 已存在（客户：${existing.name}）`);
            errorCount++;
            return;
          }
        }

        const id = uuidv4();
        run(`INSERT INTO customers (id,name,phone,wechat,customer_type,budget_min,budget_max,
          preferred_areas,requirements,source,grade,notes,store_id,created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, row.name, row.phone||'', row.wechat||'', row.customer_type||'buyer',
           row.budget_min||null, row.budget_max||null, row.preferred_areas||'', row.requirements||'',
           row.source||'', row.grade||'C', row.notes||'', req.user.store_id, req.user.id]);
        successCount++;
      } catch (e) {
        errors.push(`第${index + 1}行：${e.message}`);
        errorCount++;
      }
    });

    res.json({
      success: true,
      successCount,
      errorCount,
      errors: [...duplicates, ...errors].slice(0, 10),
      message: `成功导入 ${successCount} 条，失败 ${errorCount} 条${duplicates.length > 0 ? `（其中 ${duplicates.length} 条重复）` : ''}`
    });
  } catch (e) {
    res.status(500).json({ error: '导入失败：' + e.message });
  }
});

// ==================== ADMIN ====================
app.get('/api/admin/stores', authMiddleware, adminMiddleware, (req, res) => {
  res.json(all('SELECT s.*, COUNT(u.id) as user_count FROM stores s LEFT JOIN users u ON s.id=u.store_id GROUP BY s.id'));
});

const PORT = process.env.PORT || 3001;
initDB().then(() => app.listen(PORT, () => console.log(`🏠 房产CRM运行在端口 ${PORT}`)));
