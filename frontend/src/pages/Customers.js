import { apiFetch } from '../api';
import React, { useState, useEffect } from 'react';

const GRADE_COLORS = { A:'#ef4444', B:'#f59e0b', C:'#3b82f6', D:'#6b7280' };
const TYPE_LABELS = { buyer:'买家', seller:'卖家' };
const TYPE_COLORS = { buyer:'#3b82f6', seller:'#10b981' };

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [tab, setTab] = useState('all'); // all | buyer | seller
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const empty = { name:'',phone:'',wechat:'',customer_type:'buyer',budget_min:'',budget_max:'',
    preferred_areas:'',requirements:'',source:'',grade:'C',notes:'' };
  const [form, setForm] = useState(empty);

  useEffect(() => { load(); }, [tab, search]);

  const load = async () => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (tab !== 'all') params.append('customer_type', tab);
    const r = await apiFetch('/api/customers?' + params);
    setCustomers(await r.json());
  };

  const save = async () => {
    if (!form.name) {
      alert('请填写客户姓名');
      return;
    }
    try {
      const method = editItem ? 'PUT' : 'POST';
      const url = editItem ? `/api/customers/${editItem.id}` : '/api/customers';
      const res = await apiFetch(url, { method, body: JSON.stringify(form) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '保存失败');
      }
      alert('✅ 保存成功！');
      setShowForm(false); setEditItem(null); setForm(empty); load();
    } catch (e) {
      alert('❌ ' + e.message);
    }
  };

  const openEdit = (c) => { setEditItem(c); setForm(c); setShowForm(true); };
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {[['all','全部客户'],['buyer','买家'],['seller','卖家']].map(([key,label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding:'6px 18px', borderRadius:20, border:'none', cursor:'pointer', fontWeight:600, fontSize:13,
              background: tab===key ? 'var(--accent)' : 'var(--bg-card)',
              color: tab===key ? 'white' : 'var(--text-muted)' }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ display:'flex', gap:12, marginBottom:20 }}>
        <input className="search-input" placeholder="🔍 搜索姓名、电话..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex:1 }} />
        <button className="btn btn-primary" onClick={() => { setEditItem(null); setForm(empty); setShowForm(true); }}>+ 添加客户</button>
      </div>

      <div className="table-container">
        <table className="table">
          <thead><tr>
            <th>客户信息</th><th>类型</th><th>预算/价格</th><th>等级</th><th>意向区域</th><th>来源</th><th>操作</th>
          </tr></thead>
          <tbody>
            {customers.length === 0 && <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>暂无客户</td></tr>}
            {customers.map(c => (
              <tr key={c.id}>
                <td>
                  <div style={{ fontWeight:600 }}>{c.name}</div>
                  {c.phone && <div style={{ fontSize:12, color:'var(--text-muted)' }}>📞 {c.phone}</div>}
                  {c.wechat && <div style={{ fontSize:12, color:'var(--text-muted)' }}>💬 {c.wechat}</div>}
                </td>
                <td>
                  <span style={{ padding:'2px 10px', borderRadius:20, fontSize:12, fontWeight:600,
                    background: TYPE_COLORS[c.customer_type]+'22', color: TYPE_COLORS[c.customer_type] }}>
                    {TYPE_LABELS[c.customer_type] || c.customer_type}
                  </span>
                </td>
                <td>
                  {c.customer_type === 'buyer'
                    ? (c.budget_min||c.budget_max) ? `${c.budget_min||'?'}~${c.budget_max||'?'}万` : '-'
                    : c.notes ? <span style={{ fontSize:12, color:'var(--text-muted)' }}>{c.notes.substring(0,20)}</span> : '-'
                  }
                </td>
                <td><span style={{ fontWeight:700, color: GRADE_COLORS[c.grade] }}>{c.grade}类</span></td>
                <td style={{ fontSize:13 }}>{c.preferred_areas || '-'}</td>
                <td style={{ fontSize:13 }}>{c.source || '-'}</td>
                <td>
                  <button className="btn btn-sm" onClick={() => openEdit(c)}>编辑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowForm(false)}>
          <div className="modal" style={{ maxWidth:560, maxHeight:'90vh', overflowY:'auto' }}>
            <div className="modal-header">
              <h2>{editItem ? '✏️ 编辑客户' : '👤 添加客户'}</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div className="form-group">
                <label>姓名 *</label>
                <input value={form.name} onChange={e=>update('name',e.target.value)} placeholder="客户姓名" />
              </div>
              <div className="form-group">
                <label>客户类型</label>
                <select value={form.customer_type} onChange={e=>update('customer_type',e.target.value)}>
                  <option value="buyer">买家</option>
                  <option value="seller">卖家</option>
                </select>
              </div>
              <div className="form-group">
                <label>电话</label>
                <input value={form.phone} onChange={e=>update('phone',e.target.value)} placeholder="手机号" />
              </div>
              <div className="form-group">
                <label>微信</label>
                <input value={form.wechat} onChange={e=>update('wechat',e.target.value)} placeholder="微信号" />
              </div>
              {form.customer_type === 'buyer' && <>
                <div className="form-group">
                  <label>预算下限（万）</label>
                  <input type="number" value={form.budget_min} onChange={e=>update('budget_min',e.target.value)} />
                </div>
                <div className="form-group">
                  <label>预算上限（万）</label>
                  <input type="number" value={form.budget_max} onChange={e=>update('budget_max',e.target.value)} />
                </div>
                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label>意向区域</label>
                  <input value={form.preferred_areas} onChange={e=>update('preferred_areas',e.target.value)} placeholder="天河、越秀..." />
                </div>
                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label>需求描述</label>
                  <textarea value={form.requirements} onChange={e=>update('requirements',e.target.value)} rows={2} placeholder="3房2厅，南北通透..." />
                </div>
              </>}
              <div className="form-group">
                <label>来源</label>
                <select value={form.source} onChange={e=>update('source',e.target.value)}>
                  <option value="">请选择</option>
                  {['老客户介绍','安居客','链家','自主开发','门店来访','微信朋友圈','房源录入'].map(v=><option key={v}>{v}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>等级</label>
                <select value={form.grade} onChange={e=>update('grade',e.target.value)}>
                  <option value="A">A类（高意向）</option>
                  <option value="B">B类（中意向）</option>
                  <option value="C">C类（低意向）</option>
                  <option value="D">D类（暂无意向）</option>
                </select>
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label>备注</label>
                <textarea value={form.notes} onChange={e=>update('notes',e.target.value)} rows={2} placeholder="其他备注..." />
              </div>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
              <button className="btn" onClick={() => setShowForm(false)}>取消</button>
              <button className="btn btn-primary" onClick={save}>💾 保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
