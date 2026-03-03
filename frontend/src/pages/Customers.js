import { apiFetch } from '../api';
import React, { useState, useEffect } from 'react';

const GRADE_COLORS = { A:'#ef4444', B:'#f59e0b', C:'#3b82f6', D:'#6b7280' };
const TYPE_LABELS = { buyer:'买家', seller:'卖家' };
const TYPE_COLORS = { buyer:'#3b82f6', seller:'#10b981' };

export default function Customers({ user }) {
  const [customers, setCustomers] = useState([]);
  const [tab, setTab] = useState('all'); // all | buyer | seller
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showImport, setShowImport] = useState(false);

  // 新增筛选状态
  const [nameFilter, setNameFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

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

  // 客户端筛选逻辑
  const filteredCustomers = customers.filter(c => {
    // 姓名筛选
    if (nameFilter && !c.name.toLowerCase().includes(nameFilter.toLowerCase())) {
      return false;
    }
    // 类型筛选
    if (typeFilter && c.customer_type !== typeFilter) {
      return false;
    }
    // 预算区间筛选（仅对买方有效）
    if (c.customer_type === 'buyer') {
      if (budgetMin && c.budget_max && parseFloat(c.budget_max) < parseFloat(budgetMin)) {
        return false;
      }
      if (budgetMax && c.budget_min && parseFloat(c.budget_min) > parseFloat(budgetMax)) {
        return false;
      }
    }
    // 等级筛选
    if (gradeFilter && c.grade !== gradeFilter) {
      return false;
    }
    // 来源筛选
    if (sourceFilter && c.source !== sourceFilter) {
      return false;
    }
    return true;
  });

  // 获取所有唯一的来源
  const uniqueSources = [...new Set(customers.map(c => c.source).filter(Boolean))].sort();

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
  const openDetail = async (c) => {
    const res = await apiFetch(`/api/customers/${c.id}`);
    const data = await res.json();
    setSelectedCustomer(data);
    setAiAnalysisResult(null);
    setShowDetail(true);
  };

  const analyzeCustomer = async () => {
    if (!selectedCustomer) return;
    setAiAnalyzing(true);
    try {
      const res = await apiFetch(`/api/customers/${selectedCustomer.id}/ai-analysis`, {
        method: 'POST'
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'AI分析失败');
      }
      const data = await res.json();
      setAiAnalysisResult(data);
    } catch (e) {
      alert('❌ ' + e.message);
    } finally {
      setAiAnalyzing(false);
    }
  };
  const deleteCustomer = async (id) => {
    if (!window.confirm('确认删除该客户？删除后无法恢复。')) return;
    try {
      const res = await apiFetch(`/api/customers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      alert('✅ 删除成功！');
      load();
    } catch (e) {
      alert('❌ ' + e.message);
    }
  };
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.length === customers.length ? [] : customers.map(c => c.id));
  };

  const batchDelete = async () => {
    if (selectedIds.length === 0) {
      alert('请先选择要删除的客户');
      return;
    }
    if (!window.confirm(`确认删除选中的 ${selectedIds.length} 条客户？删除后无法恢复。`)) return;

    const res = await apiFetch('/api/customers/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids: selectedIds })
    });
    const result = await res.json();
    alert(result.message);
    setSelectedIds([]);
    load();
  };

  const downloadTemplate = async () => {
    const res = await apiFetch('/api/import/template/customers');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '客户导入模板.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const XLSX = await import('xlsx');
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);

        const importData = rows.map(row => ({
          name: row['客户姓名'] || '',
          phone: row['手机号'] || '',
          wechat: row['微信'] || '',
          customer_type: row['客户类型'] || 'buyer',
          budget_min: row['预算最低(万)'] || '',
          budget_max: row['预算最高(万)'] || '',
          preferred_areas: row['意向区域'] || '',
          requirements: row['需求描述'] || '',
          source: row['来源'] || '',
          grade: row['等级'] || 'C',
          notes: row['备注'] || ''
        }));

        const res = await apiFetch('/api/import/customers', {
          method: 'POST',
          body: JSON.stringify({ data: importData })
        });
        const result = await res.json();

        let msg = result.message;
        if (result.errors && result.errors.length > 0) {
          msg += '\n\n错误详情：\n' + result.errors.join('\n');
        }
        alert(msg);
        setShowImport(false);
        load();
      } catch (err) {
        alert('导入失败：' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

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

      <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        <input className="search-input" placeholder="🔍 搜索姓名、电话..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex:1, minWidth:200 }} />
        <button className="btn btn-primary" onClick={() => { setEditItem(null); setForm(empty); setShowForm(true); }}>+ 添加客户</button>
        <button className="btn btn-secondary" onClick={() => setShowImport(true)}>📥 批量导入</button>
        {selectedIds.length > 0 && (
          <button className="btn btn-danger" onClick={batchDelete}>🗑️ 批量删除 ({selectedIds.length})</button>
        )}
      </div>

      {/* 高级筛选 */}
      <div style={{ marginBottom: 16, padding: 16, background: 'var(--bg-hover)', borderRadius: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>🔍 高级筛选</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {/* 姓名筛选 */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>客户姓名</label>
            <input
              value={nameFilter}
              onChange={e => setNameFilter(e.target.value)}
              placeholder="输入姓名"
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
            />
          </div>

          {/* 类型筛选 */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>客户类型</label>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
            >
              <option value="">全部</option>
              <option value="buyer">买方</option>
              <option value="seller">卖方</option>
            </select>
          </div>

          {/* 预算区间 */}
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>预算（万元）</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number"
                value={budgetMin}
                onChange={e => setBudgetMin(e.target.value)}
                placeholder="最小"
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
              />
              <span style={{ color: 'var(--text-muted)' }}>~</span>
              <input
                type="number"
                value={budgetMax}
                onChange={e => setBudgetMax(e.target.value)}
                placeholder="最大"
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* 等级筛选 */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>客户等级</label>
            <select
              value={gradeFilter}
              onChange={e => setGradeFilter(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
            >
              <option value="">全部</option>
              <option value="A">A类</option>
              <option value="B">B类</option>
              <option value="C">C类</option>
            </select>
          </div>

          {/* 来源筛选 */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>客户来源</label>
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
            >
              <option value="">全部</option>
              {uniqueSources.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 清除筛选按钮 */}
        {(nameFilter || typeFilter || budgetMin || budgetMax || gradeFilter || sourceFilter) && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setNameFilter('');
              setTypeFilter('');
              setBudgetMin('');
              setBudgetMax('');
              setGradeFilter('');
              setSourceFilter('');
            }}
            style={{ marginTop: 12 }}
          >
            🔄 清除所有筛选
          </button>
        )}
      </div>

      <div className="table-container">
        <table className="table">
          <thead><tr>
            <th style={{ width:40 }}>
              <input type="checkbox" checked={selectedIds.length === filteredCustomers.length && filteredCustomers.length > 0}
                onChange={toggleSelectAll} />
            </th>
            <th>客户姓名</th>
            <th>类型</th>
            <th>预算/价格</th>
            <th>等级</th>
            <th>意向区域</th>
            <th>来源</th>
            <th>关联房源</th>
            {user?.role === 'admin' && (
              <>
                <th>所属门店</th>
                <th>所属经纪人</th>
              </>
            )}
            <th>最后回访</th>
            <th>操作</th>
          </tr></thead>
          <tbody>
            {filteredCustomers.length === 0 && <tr><td colSpan={user?.role === 'admin' ? 12 : 10} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>暂无符合条件的客户</td></tr>}
            {filteredCustomers.map(c => (
              <tr key={c.id}>
                <td>
                  <input type="checkbox" checked={selectedIds.includes(c.id)}
                    onChange={() => toggleSelect(c.id)} />
                </td>
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
                    : (c.property_min_price && c.property_price)
                      ? `${c.property_min_price}~${c.property_price}万`
                      : '-'
                  }
                </td>
                <td><span style={{ fontWeight:700, color: GRADE_COLORS[c.grade] }}>{c.grade}类</span></td>
                <td style={{ fontSize:13 }}>{c.preferred_areas || '-'}</td>
                <td style={{ fontSize:13 }}>{c.source || '-'}</td>
                <td style={{ fontSize:12, color:'var(--text-muted)' }}>
                  {c.customer_type === 'seller' && c.property_community
                    ? `${c.property_community} ${c.property_unit_room || ''}`
                    : '-'
                  }
                </td>
                {user?.role === 'admin' && (
                  <>
                    <td style={{ fontSize:13 }}>{c.store_name || '-'}</td>
                    <td style={{ fontSize:13 }}>
                      {c.agent_name ? `${c.agent_name}${c.agent_id ? ` (${c.agent_id})` : ''}` : '-'}
                    </td>
                  </>
                )}
                <td style={{ fontSize:12, color:'var(--text-muted)' }}>
                  {c.last_follow_up_at ? new Date(c.last_follow_up_at).toLocaleDateString('zh-CN') : '暂无'}
                </td>
                <td>
                  <button className="btn btn-sm" onClick={() => openDetail(c)} style={{ marginRight:6, background: 'rgba(59,130,246,0.25)', borderColor: 'rgba(59,130,246,0.4)' }}>详情</button>
                  <button className="btn btn-sm" onClick={() => openEdit(c)} style={{ marginRight:6, background: 'rgba(245,158,11,0.25)', borderColor: 'rgba(245,158,11,0.4)' }}>编辑</button>
                  <button className="btn btn-sm btn-danger" onClick={() => deleteCustomer(c.id)}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:640, maxHeight:'90vh', overflowY:'auto' }}>
            <div className="modal-header">
              <h2>{editItem ? '✏️ 编辑客户' : '👤 添加客户'}</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--text-muted)' }}>✕</button>
            </div>
            <div className="modal-body">
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
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>取消</button>
              <button className="btn btn-primary" onClick={save}>💾 保存</button>
            </div>
          </div>
        </div>
      )}

      {showDetail && selectedCustomer && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:700, maxHeight:'90vh', overflowY:'auto' }}>
            <div className="modal-header">
              <h2>👤 客户详情 - {selectedCustomer.name}</h2>
              <button onClick={() => setShowDetail(false)} style={{ background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--text-muted)' }}>✕</button>
            </div>

            {/* 基本信息 */}
            <div style={{ marginBottom:24, padding:16, background:'var(--bg-hover)', borderRadius:8 }}>
              <h3 style={{ fontSize:16, fontWeight:600, marginBottom:12 }}>基本信息</h3>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, fontSize:14 }}>
                <div><span style={{ color:'var(--text-muted)' }}>姓名：</span>{selectedCustomer.name}</div>
                <div><span style={{ color:'var(--text-muted)' }}>类型：</span>{TYPE_LABELS[selectedCustomer.customer_type]}</div>
                <div><span style={{ color:'var(--text-muted)' }}>电话：</span>{selectedCustomer.phone || '-'}</div>
                <div><span style={{ color:'var(--text-muted)' }}>微信：</span>{selectedCustomer.wechat || '-'}</div>
                <div><span style={{ color:'var(--text-muted)' }}>等级：</span><span style={{ fontWeight:700, color:GRADE_COLORS[selectedCustomer.grade] }}>{selectedCustomer.grade}类</span></div>
                <div><span style={{ color:'var(--text-muted)' }}>来源：</span>{selectedCustomer.source || '-'}</div>
                {selectedCustomer.customer_type === 'buyer' && (
                  <>
                    <div><span style={{ color:'var(--text-muted)' }}>预算：</span>{selectedCustomer.budget_min||'?'}~{selectedCustomer.budget_max||'?'}万</div>
                    <div><span style={{ color:'var(--text-muted)' }}>意向区域：</span>{selectedCustomer.preferred_areas || '-'}</div>
                  </>
                )}
              </div>
              {selectedCustomer.requirements && (
                <div style={{ marginTop:12 }}><span style={{ color:'var(--text-muted)' }}>需求：</span>{selectedCustomer.requirements}</div>
              )}
              {selectedCustomer.notes && (
                <div style={{ marginTop:12 }}><span style={{ color:'var(--text-muted)' }}>备注：</span>{selectedCustomer.notes}</div>
              )}
            </div>

            {/* 回访记录 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>📝 回访记录 ({selectedCustomer.followUps?.length || 0})</h3>
                {selectedCustomer.followUps && selectedCustomer.followUps.length > 0 && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={analyzeCustomer}
                    disabled={aiAnalyzing}
                  >
                    {aiAnalyzing ? '🤖 分析中...' : '🤖 AI综合分析'}
                  </button>
                )}
              </div>

              {/* AI综合分析结果 */}
              {aiAnalysisResult && (
                <div style={{ marginBottom: 16, padding: 16, background: 'rgba(59,130,246,0.1)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.3)' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginBottom: 12 }}>🤖 AI综合分析结果</div>

                  {aiAnalysisResult.overall_intention && (
                    <div style={{ marginBottom: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>整体意向程度：</span>
                      <span style={{ fontWeight: 600, fontSize: 14, marginLeft: 8 }}>{aiAnalysisResult.overall_intention}</span>
                    </div>
                  )}

                  {aiAnalysisResult.deal_probability && (
                    <div style={{ marginBottom: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>成交概率：</span>
                      <span style={{ fontWeight: 600, fontSize: 14, marginLeft: 8, color: 'var(--success)' }}>
                        {aiAnalysisResult.deal_probability}%
                      </span>
                    </div>
                  )}

                  {aiAnalysisResult.key_concerns && aiAnalysisResult.key_concerns.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 6 }}>主要关注点：</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {aiAnalysisResult.key_concerns.map((concern, idx) => (
                          <span key={idx} style={{ padding: '4px 10px', background: 'var(--bg-hover)', borderRadius: 12, fontSize: 12 }}>
                            {concern}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiAnalysisResult.summary && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 6 }}>综合评估：</div>
                      <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{aiAnalysisResult.summary}</div>
                    </div>
                  )}

                  {aiAnalysisResult.next_steps && aiAnalysisResult.next_steps.length > 0 && (
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 6 }}>建议下一步行动：</div>
                      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.8 }}>
                        {aiAnalysisResult.next_steps.map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {(!selectedCustomer.followUps || selectedCustomer.followUps.length === 0) ? (
                <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)', background:'var(--bg-hover)', borderRadius:8 }}>
                  暂无回访记录
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {selectedCustomer.followUps.map(f => (
                    <div key={f.id} style={{ padding:16, background:'var(--bg-hover)', borderRadius:8, borderLeft:'3px solid var(--accent)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                        <div style={{ fontSize:13, color:'var(--text-muted)' }}>
                          {new Date(f.created_at).toLocaleString('zh-CN')}
                        </div>
                        {f.method && (
                          <span style={{ fontSize:12, padding:'2px 8px', background:'var(--accent)', color:'white', borderRadius:12 }}>
                            {f.method}
                          </span>
                        )}
                      </div>
                      {f.content && (
                        <div style={{ fontSize:14, lineHeight:1.6, marginBottom:8, whiteSpace:'pre-wrap' }}>
                          {f.content}
                        </div>
                      )}
                      {f.ai_analysis && (() => {
                        try {
                          const analysis = JSON.parse(f.ai_analysis);
                          return (
                            <div style={{ marginTop:12, padding:12, background:'rgba(59,130,246,0.1)', borderRadius:6 }}>
                              <div style={{ fontSize:12, fontWeight:600, color:'var(--accent)', marginBottom:6 }}>🤖 AI分析</div>
                              {analysis.intention_level && (
                                <div style={{ fontSize:13, marginBottom:4 }}>
                                  <span style={{ color:'var(--text-muted)' }}>意向程度：</span>
                                  <span style={{ fontWeight:600 }}>{analysis.intention_level}</span>
                                </div>
                              )}
                              {analysis.summary && (
                                <div style={{ fontSize:13, color:'var(--text-muted)' }}>{analysis.summary}</div>
                              )}
                            </div>
                          );
                        } catch { return null; }
                      })()}
                      {f.result && (
                        <div style={{ fontSize:13, marginTop:8, color:'var(--text-muted)' }}>
                          <span style={{ fontWeight:600 }}>结果：</span>{f.result}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 待办提醒 */}
            {selectedCustomer.reminders && selectedCustomer.reminders.length > 0 && (
              <div style={{ marginTop:24 }}>
                <h3 style={{ fontSize:16, fontWeight:600, marginBottom:12 }}>🔔 待办提醒 ({selectedCustomer.reminders.length})</h3>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {selectedCustomer.reminders.map(r => (
                    <div key={r.id} style={{ padding:12, background:'rgba(251,191,36,0.1)', borderRadius:8, borderLeft:'3px solid #f59e0b' }}>
                      <div style={{ fontWeight:600, marginBottom:4 }}>{r.title}</div>
                      <div style={{ fontSize:13, color:'var(--text-muted)' }}>
                        ⏰ {new Date(r.remind_at).toLocaleString('zh-CN')}
                      </div>
                      {r.content && <div style={{ fontSize:13, marginTop:4 }}>{r.content}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop:20, textAlign:'right' }}>
              <button className="btn btn-primary" onClick={() => setShowDetail(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:500 }}>
            <div className="modal-header">
              <h2>📥 批量导入客户</h2>
              <button onClick={() => setShowImport(false)} style={{ background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ padding:'20px 0' }}>
              <div style={{ marginBottom:20, padding:16, background:'#f0f9ff', borderRadius:8, border:'1px solid #bae6fd' }}>
                <div style={{ fontWeight:600, marginBottom:8, color:'#0369a1' }}>📋 导入步骤：</div>
                <ol style={{ margin:0, paddingLeft:20, color:'#0c4a6e', lineHeight:1.8 }}>
                  <li>下载导入模板</li>
                  <li>按照模板格式填写客户数据</li>
                  <li>上传填好的Excel文件</li>
                </ol>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <button className="btn btn-secondary" onClick={downloadTemplate} style={{ width:'100%' }}>
                  📄 下载导入模板
                </button>
                <label className="btn btn-primary" style={{ width:'100%', textAlign:'center', cursor:'pointer' }}>
                  📤 选择Excel文件上传
                  <input type="file" accept=".xlsx,.xls" onChange={handleImport} style={{ display:'none' }} />
                </label>
              </div>
              <div style={{ marginTop:16, fontSize:12, color:'var(--text-muted)' }}>
                💡 提示：系统会自动检测手机号重复，重复的客户将不会导入
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
