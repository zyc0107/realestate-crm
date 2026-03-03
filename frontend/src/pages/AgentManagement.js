import { apiFetch } from '../api';
import React, { useState, useEffect } from 'react';

export default function AgentManagement() {
  const [agents, setAgents] = useState([]);
  const [stores, setStores] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    username: '', password: '', name: '', nickname: '', store_id: ''
  });

  useEffect(() => {
    load();
    loadStores();
  }, []);

  const load = async () => {
    setLoading(true);
    const res = await apiFetch('/api/agents');
    setAgents(await res.json());
    setLoading(false);
  };

  const loadStores = async () => {
    const res = await apiFetch('/api/stores');
    setStores(await res.json());
  };

  const openCreate = () => {
    setEditItem(null);
    setForm({ username: '', password: '', name: '', nickname: '', store_id: '' });
    setShowModal(true);
  };

  const openEdit = (agent) => {
    setEditItem(agent);
    setForm({
      username: agent.username,
      password: '',
      name: agent.name,
      nickname: agent.nickname || '',
      store_id: agent.store_id || ''
    });
    setShowModal(true);
  };

  const openDetail = async (agent) => {
    const res = await apiFetch(`/api/agents/${agent.id}/stats`);
    const stats = await res.json();
    setSelectedAgent({ ...agent, stats });
    setShowDetail(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.username || !form.name) {
      alert('请填写用户名和姓名');
      return;
    }
    if (!editItem && !form.password) {
      alert('请填写密码');
      return;
    }

    try {
      const method = editItem ? 'PUT' : 'POST';
      const url = editItem ? `/api/agents/${editItem.id}` : '/api/agents';
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(form)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '保存失败');
      }
      alert('✅ 保存成功！');
      setShowModal(false);
      load();
    } catch (e) {
      alert('❌ ' + e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确认删除该经纪人？删除后无法恢复！')) return;
    try {
      const res = await apiFetch(`/api/agents/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '删除失败');
      }
      alert('✅ 删除成功！');
      load();
    } catch (e) {
      alert('❌ ' + e.message);
    }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>👨‍💼 中介管理</h2>
        <button className="btn btn-primary" onClick={openCreate}>+ 添加经纪人</button>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : agents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👨‍💼</div>
            <p>暂无经纪人</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>用户名</th>
                  <th>经纪人编号</th>
                  <th>昵称</th>
                  <th>所属门店</th>
                  <th>房源数</th>
                  <th>客户数</th>
                  <th>成交数</th>
                  <th>累计佣金</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {agents.map(agent => (
                  <tr key={agent.id}>
                    <td style={{ fontWeight: 600 }}>{agent.name}</td>
                    <td>{agent.username}</td>
                    <td>{agent.agent_id || '-'}</td>
                    <td>{agent.nickname || '-'}</td>
                    <td>{agent.store_name || '-'}</td>
                    <td>{agent.property_count || 0}</td>
                    <td>{agent.customer_count || 0}</td>
                    <td style={{ color: 'var(--success)' }}>{agent.deal_count || 0}</td>
                    <td style={{ color: 'var(--warning)', fontWeight: 600 }}>
                      ¥{agent.total_commission ? agent.total_commission.toFixed(2) : '0'}万
                    </td>
                    <td>
                      <button className="btn btn-sm" onClick={() => openDetail(agent)} style={{ marginRight: 6 }}>详情</button>
                      <button className="btn btn-sm" onClick={() => openEdit(agent)} style={{ marginRight: 6 }}>编辑</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(agent.id)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <span className="modal-title">{editItem ? '✏️ 编辑经纪人' : '👨‍💼 添加经纪人'}</span>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSave}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>用户名 *</label>
                    <input
                      value={form.username}
                      onChange={e => set('username', e.target.value)}
                      placeholder="登录用户名"
                      disabled={!!editItem}
                      style={editItem ? { background: 'var(--bg-hover)', cursor: 'not-allowed' } : {}}
                    />
                  </div>
                  <div className="form-group">
                    <label>{editItem ? '新密码（留空不修改）' : '密码 *'}</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={e => set('password', e.target.value)}
                      placeholder={editItem ? '留空则不修改密码' : '设置密码'}
                    />
                  </div>
                  <div className="form-group">
                    <label>姓名 *</label>
                    <input
                      value={form.name}
                      onChange={e => set('name', e.target.value)}
                      placeholder="真实姓名"
                    />
                  </div>
                  {editItem && (
                    <div className="form-group">
                      <label>经纪人编号</label>
                      <input
                        value={editItem.agent_id || ''}
                        disabled
                        style={{ background: 'var(--bg-hover)', cursor: 'not-allowed' }}
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>
                        经纪人编号为12位随机字符（大写字母+数字），创建后不可修改
                      </span>
                    </div>
                  )}
                  <div className="form-group">
                    <label>昵称</label>
                    <input
                      value={form.nickname}
                      onChange={e => set('nickname', e.target.value)}
                      placeholder="昵称"
                    />
                  </div>
                  <div className="form-group">
                    <label>所属门店</label>
                    <select value={form.store_id} onChange={e => set('store_id', e.target.value)}>
                      <option value="">未分配</option>
                      {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>取消</button>
                  <button type="submit" className="btn btn-primary">💾 保存</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && selectedAgent && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <span className="modal-title">👨‍💼 经纪人详情 - {selectedAgent.name}</span>
              <button className="modal-close" onClick={() => setShowDetail(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div className="form-group">
                  <label>姓名</label>
                  <div style={{ padding: '9px 12px', background: 'var(--bg-hover)', borderRadius: 8 }}>
                    {selectedAgent.name}
                  </div>
                </div>
                <div className="form-group">
                  <label>用户名</label>
                  <div style={{ padding: '9px 12px', background: 'var(--bg-hover)', borderRadius: 8 }}>
                    {selectedAgent.username}
                  </div>
                </div>
                <div className="form-group">
                  <label>经纪人编号</label>
                  <div style={{ padding: '9px 12px', background: 'var(--bg-hover)', borderRadius: 8 }}>
                    {selectedAgent.agent_id || '-'}
                  </div>
                </div>
                <div className="form-group">
                  <label>昵称</label>
                  <div style={{ padding: '9px 12px', background: 'var(--bg-hover)', borderRadius: 8 }}>
                    {selectedAgent.nickname || '-'}
                  </div>
                </div>
                <div className="form-group">
                  <label>所属门店</label>
                  <div style={{ padding: '9px 12px', background: 'var(--bg-hover)', borderRadius: 8 }}>
                    {selectedAgent.store_name || '-'}
                  </div>
                </div>
                <div className="form-group">
                  <label>创建时间</label>
                  <div style={{ padding: '9px 12px', background: 'var(--bg-hover)', borderRadius: 8 }}>
                    {new Date(selectedAgent.created_at).toLocaleDateString('zh-CN')}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 16, marginBottom: 12 }}>📊 业绩统计</h3>
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                  <div className="stat-card">
                    <div className="stat-icon">🏠</div>
                    <div className="stat-value">{selectedAgent.stats?.property_count || 0}</div>
                    <div className="stat-label">房源数</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">👥</div>
                    <div className="stat-value">{selectedAgent.stats?.customer_count || 0}</div>
                    <div className="stat-label">客户数</div>
                  </div>
                  <div className="stat-card" style={{ '--accent': '#10b981' }}>
                    <div className="stat-icon">💰</div>
                    <div className="stat-value">{selectedAgent.stats?.deal_count || 0}</div>
                    <div className="stat-label">成交数</div>
                  </div>
                  <div className="stat-card" style={{ '--accent': '#f59e0b' }}>
                    <div className="stat-icon">💵</div>
                    <div className="stat-value">
                      ¥{selectedAgent.stats?.total_commission ? selectedAgent.stats.total_commission.toFixed(1) : '0'}万
                    </div>
                    <div className="stat-label">累计佣金</div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowDetail(false)}>关闭</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
