import { apiFetch } from '../api';
import React, { useState, useEffect } from 'react';

export default function Reminders() {
  const [reminders, setReminders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customer_id: '', title: '', content: '', remind_at: '' });
  const [customers, setCustomers] = useState([]);

  useEffect(() => { load(); loadCustomers(); }, []);

  const load = async () => {
    const r = await apiFetch('/api/reminders');
    setReminders(await r.json());
  };

  const loadCustomers = async () => {
    const r = await apiFetch('/api/customers');
    setCustomers(await r.json());
  };

  const save = async () => {
    if (!form.title || !form.remind_at) {
      alert('请填写标题和提醒时间');
      return;
    }
    await apiFetch('/api/reminders', { method:'POST', body: JSON.stringify(form) });
    alert('✅ 提醒已添加！');
    setShowForm(false);
    setForm({ customer_id: '', title: '', content: '', remind_at: '' });
    load();
  };

  const markDone = async (id) => {
    await apiFetch(`/api/reminders/${id}/done`, { method:'PUT' });
    load();
  };

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h2 style={{ fontSize:18, fontWeight:600 }}>🔔 回访提醒列表</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ 添加提醒</button>
      </div>

      {reminders.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, background:'var(--bg-card)', borderRadius:12, color:'var(--text-muted)' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
          <div>暂无待办提醒</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {reminders.map(r => (
            <div key={r.id} style={{ padding:16, background:'var(--bg-card)', borderRadius:12, border:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, marginBottom:4 }}>{r.title}</div>
                {r.customer_name && <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:4 }}>👤 {r.customer_name}</div>}
                {r.content && <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:4 }}>{r.content}</div>}
                <div style={{ fontSize:13, color:'var(--warning)', fontWeight:600 }}>
                  ⏰ {new Date(r.remind_at).toLocaleString('zh-CN')}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => markDone(r.id)}>✓ 完成</button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:500 }}>
            <div className="modal-header">
              <h2>➕ 添加回访提醒</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--text-muted)' }}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div className="form-group">
                  <label>关联客户（可选）</label>
                  <select value={form.customer_id} onChange={e=>update('customer_id',e.target.value)}>
                    <option value="">不关联客户</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>提醒标题 *</label>
                  <input value={form.title} onChange={e=>update('title',e.target.value)} placeholder="例：回访张先生" />
                </div>
                <div className="form-group">
                  <label>提醒内容</label>
                  <textarea value={form.content} onChange={e=>update('content',e.target.value)} rows={3} placeholder="备注信息..." />
                </div>
                <div className="form-group">
                  <label>提醒时间 *</label>
                  <input type="datetime-local" value={form.remind_at} onChange={e=>update('remind_at',e.target.value)} style={{ letterSpacing: '0.5px' }} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>取消</button>
              <button className="btn btn-primary" onClick={save}>💾 保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

