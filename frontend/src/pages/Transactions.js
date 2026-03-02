import { apiFetch } from '../api';
import React, { useState, useEffect } from 'react';

const STAGES = [
  { value: 'viewing', label: '带看', cls: 'tag-blue' },
  { value: 'intent', label: '意向', cls: 'tag-yellow' },
  { value: 'signed', label: '签约', cls: 'tag-green' },
  { value: 'transfer', label: '过户', cls: 'tag-blue' },
  { value: 'completed', label: '完成', cls: 'tag-green' },
];

function StageProgress({ stage }) {
  const idx = STAGES.findIndex(s => s.value === stage);
  return (
    <div className="stage-bar">
      {STAGES.map((s, i) => (
        <React.Fragment key={s.value}>
          <div
            className={`stage-dot ${i < idx ? 'done' : i === idx ? 'active' : ''}`}
            title={s.label}
          />
          {i < STAGES.length - 1 && (
            <div style={{flex: 1, height: 2, background: i < idx ? 'var(--success)' : 'var(--border)', transition: 'background 0.3s'}} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function TransactionForm({ initial = {}, onSave, onClose }) {
  const [form, setForm] = useState({
    customer_id: '', property_id: '', stage: 'viewing',
    deal_price: '', commission_rate: '2.0', notes: '', ...initial
  });
  const [customers, setCustomers] = useState([]);
  const [properties, setProperties] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    apiFetch('/api/customers').then(r => r.json()).then(setCustomers);
    apiFetch('/api/properties?status=available').then(r => r.json()).then(setProperties);
  }, []);

  const commission = form.deal_price && form.commission_rate
    ? (parseFloat(form.deal_price) * parseFloat(form.commission_rate) / 100).toFixed(2)
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const method = form.id ? 'PUT' : 'POST';
    const url = form.id ? `/api/transactions/${form.id}` : '/api/transactions';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    onSave(await res.json());
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-group">
          <label>客户 *</label>
          <select required value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
            <option value="">选择客户</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>房源 *</label>
          <select required value={form.property_id} onChange={e => set('property_id', e.target.value)}>
            <option value="">选择房源</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>当前阶段</label>
          <select value={form.stage} onChange={e => set('stage', e.target.value)}>
            {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>成交价格（万元）</label>
          <input type="number" step="0.01" value={form.deal_price} onChange={e => set('deal_price', e.target.value)} placeholder="100" />
        </div>
        <div className="form-group">
          <label>佣金比例（%）</label>
          <input type="number" step="0.1" value={form.commission_rate} onChange={e => set('commission_rate', e.target.value)} />
        </div>
        <div className="form-group">
          <label>预估佣金</label>
          <div style={{padding: '9px 12px', background: 'var(--bg-hover)', borderRadius: 8, color: commission ? 'var(--success)' : 'var(--text-muted)'}}>
            {commission ? `¥ ${commission} 万元` : '请填写成交价和佣金比例'}
          </div>
        </div>
        <div className="form-group full">
          <label>备注</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="交易相关备注..." rows={3} />
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
        <button type="submit" className="btn btn-primary">💾 保存</button>
      </div>
    </form>
  );
}

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    apiFetch('/api/transactions').then(r => r.json()).then(d => { setTransactions(d); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const handleSave = () => { setShowModal(false); load(); };
  const openEdit = (t) => { setEditItem(t); setShowModal(true); };

  const totalCommission = transactions
    .filter(t => t.stage === 'completed')
    .reduce((sum, t) => sum + (t.commission_amount || 0), 0);

  return (
    <div>
      <div className="stats-grid" style={{marginBottom: 20, gridTemplateColumns: 'repeat(3, 1fr)'}}>
        <div className="stat-card">
          <div className="stat-icon">📋</div>
          <div className="stat-value">{transactions.length}</div>
          <div className="stat-label">总交易数</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-value">{transactions.filter(t => t.stage === 'completed').length}</div>
          <div className="stat-label">已完成</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-value">{totalCommission > 0 ? `${totalCommission.toFixed(1)}万` : '¥0'}</div>
          <div className="stat-label">累计佣金</div>
        </div>
      </div>

      <div className="toolbar">
        <button className="btn btn-primary" style={{marginLeft: 'auto'}} onClick={() => { setEditItem(null); setShowModal(true); }}>
          + 创建交易
        </button>
      </div>

      <div className="card">
        {loading ? <div className="loading">加载中...</div> :
          transactions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">💼</div>
              <p>暂无交易记录</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>客户</th>
                    <th>房源</th>
                    <th>阶段</th>
                    <th>进度</th>
                    <th>成交价</th>
                    <th>佣金</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(t => {
                    const stage = STAGES.find(s => s.value === t.stage);
                    return (
                      <tr key={t.id}>
                        <td style={{fontWeight: 500, color: 'var(--text-primary)'}}>{t.customer_name}</td>
                        <td>
                          <div style={{fontSize: 13}}>{t.property_title}</div>
                          <div style={{fontSize: 11, color: 'var(--text-muted)'}}>{t.property_address}</div>
                        </td>
                        <td>{stage ? <span className={`tag ${stage.cls}`}>{stage.label}</span> : '-'}</td>
                        <td style={{minWidth: 120}}><StageProgress stage={t.stage} /></td>
                        <td style={{color: 'var(--warning)', fontWeight: 600}}>{t.deal_price ? `${t.deal_price}万` : '-'}</td>
                        <td style={{color: 'var(--success)'}}>{t.commission_amount ? `${t.commission_amount.toFixed(2)}万` : '-'}</td>
                        <td style={{color: 'var(--text-muted)', fontSize: 12}}>{new Date(t.created_at).toLocaleDateString('zh-CN')}</td>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(t)}>更新</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editItem ? '✏️ 更新交易' : '💼 创建交易'}</span>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <TransactionForm initial={editItem || {}} onSave={handleSave} onClose={() => setShowModal(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
