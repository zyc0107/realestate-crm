import { apiFetch } from '../api';
import React, { useState, useEffect } from 'react';

function TransactionForm({ initial = {}, onSave, onClose }) {
  const [form, setForm] = useState({
    transaction_type: 'sale', seller_id: '', customer_id: '', property_id: '',
    deal_price: '', commission_rate: '2.0',
    rent: '', rental_period: '', deposit: '',
    notes: '', ...initial
  });
  const [sellers, setSellers] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [allProperties, setAllProperties] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    // Load sellers (customer_type='seller')
    apiFetch('/api/customers?customer_type=seller').then(r => r.json()).then(setSellers);
    // Load buyers (customer_type='buyer')
    apiFetch('/api/customers?customer_type=buyer').then(r => r.json()).then(setBuyers);
    // Load all available properties
    apiFetch('/api/properties?status=available').then(r => r.json()).then(setAllProperties);
  }, []);

  // When seller is selected, filter properties by seller
  useEffect(() => {
    if (form.seller_id) {
      const filtered = allProperties.filter(p => {
        const seller = sellers.find(s => s.id === form.seller_id);
        return seller && p.id === seller.linked_property_id;
      });
      setProperties(filtered);
      // Reset property_id if current selection is not in filtered list
      if (form.property_id && !filtered.find(p => p.id === form.property_id)) {
        set('property_id', '');
      }
    } else {
      setProperties(allProperties);
    }
  }, [form.seller_id, sellers, allProperties]);

  const commission = form.transaction_type === 'sale' && form.deal_price && form.commission_rate
    ? (parseFloat(form.deal_price) * parseFloat(form.commission_rate) / 100).toFixed(2)
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const method = form.id ? 'PUT' : 'POST';
    const url = form.id ? `/api/transactions/${form.id}` : '/api/transactions';
    const res = await apiFetch(url, { method, body: JSON.stringify(form) });
    onSave(await res.json());
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label>交易类型 *</label>
          <select value={form.transaction_type} onChange={e => set('transaction_type', e.target.value)}>
            <option value="sale">出售</option>
            <option value="rent">出租</option>
          </select>
        </div>
        <div className="form-group">
          <label>{form.transaction_type === 'sale' ? '卖方' : '房东'} *</label>
          <select required value={form.seller_id} onChange={e => set('seller_id', e.target.value)}>
            <option value="">选择{form.transaction_type === 'sale' ? '卖方' : '房东'}</option>
            {sellers.map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>房源 *</label>
          <select required value={form.property_id} onChange={e => set('property_id', e.target.value)} disabled={!form.seller_id}>
            <option value="">选择房源</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.community_name || p.title}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>{form.transaction_type === 'sale' ? '买方' : '租客'} *</label>
          <select required value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
            <option value="">选择{form.transaction_type === 'sale' ? '买方' : '租客'}</option>
            {buyers.map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
          </select>
        </div>

        {form.transaction_type === 'sale' ? (
          <>
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
          </>
        ) : (
          <>
            <div className="form-group">
              <label>月租金（元）</label>
              <input type="number" step="0.01" value={form.rent} onChange={e => set('rent', e.target.value)} placeholder="3000" />
            </div>
            <div className="form-group">
              <label>租期</label>
              <input value={form.rental_period} onChange={e => set('rental_period', e.target.value)} placeholder="1年" />
            </div>
            <div className="form-group">
              <label>押金（元）</label>
              <input type="number" step="0.01" value={form.deposit} onChange={e => set('deposit', e.target.value)} placeholder="3000" />
            </div>
          </>
        )}

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

  const downloadContract = async (id) => {
    try {
      const res = await apiFetch(`/api/transactions/${id}/contract`);
      if (!res.ok) {
        const error = await res.json();
        alert('下载失败: ' + (error.error || '未知错误'));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contract_${id}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('下载失败: ' + error.message);
    }
  };

  const totalCommission = transactions
    .filter(t => t.deal_price && t.deal_price > 0)
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
          <div className="stat-value">{transactions.filter(t => t.deal_price && t.deal_price > 0).length}</div>
          <div className="stat-label">已成交</div>
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
                    <th>卖方</th>
                    <th>买方</th>
                    <th>房源</th>
                    <th>成交价</th>
                    <th>佣金</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(t => {
                    return (
                      <tr key={t.id}>
                        <td style={{fontWeight: 500, color: 'var(--text-primary)'}}>{t.seller_name || '-'}</td>
                        <td style={{fontWeight: 500, color: 'var(--text-primary)'}}>{t.customer_name || '-'}</td>
                        <td>
                          <div style={{fontSize: 13}}>{t.property_title}</div>
                          <div style={{fontSize: 11, color: 'var(--text-muted)'}}>{t.property_address}</div>
                        </td>
                        <td style={{color: 'var(--warning)', fontWeight: 600}}>{t.deal_price ? `${t.deal_price}万` : '-'}</td>
                        <td style={{color: 'var(--success)'}}>{t.commission_amount ? `${t.commission_amount.toFixed(2)}万` : '-'}</td>
                        <td style={{color: 'var(--text-muted)', fontSize: 12}}>{new Date(t.created_at).toLocaleDateString('zh-CN')}</td>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(t)} style={{marginRight: 6}}>更新</button>
                          <button className="btn btn-primary btn-sm" onClick={() => downloadContract(t.id)}>📄 合同</button>
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
