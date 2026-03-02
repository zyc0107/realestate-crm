import { apiFetch } from '../api';
import React, { useState, useEffect } from 'react';

const STATUS_LABELS = { available: '在售', sold: '已售', suspended: '暂停' };
const STATUS_COLORS = { available: '#10b981', sold: '#ef4444', suspended: '#f59e0b' };

export default function Properties() {
  const [properties, setProperties] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const empty = { community_name:'',address:'',area:'',price:'',min_price:'',rooms:'',halls:'',baths:'',unit_room:'',property_type:'住宅',decoration:'',build_year:'',urgent:false,floor:'',total_floors:'',
    orientation:'',amenities:'',photo_url:'',description:'',status:'available',
    owner_name:'',owner_phone:'',owner_wechat:'',notes:'' };
  const [form, setForm] = useState(empty);

  useEffect(() => { load(); }, [search, statusFilter]);

  const load = async () => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (statusFilter) params.append('status', statusFilter);
    const r = await apiFetch('/api/properties?' + params);
    setProperties(await r.json());
  };

  const save = async () => {
    if (!form.community_name || !form.address) {
      alert('请填写小区名称和详细地址');
      return;
    }
    try {
      const method = editItem ? 'PUT' : 'POST';
      const url = editItem ? `/api/properties/${editItem.id}` : '/api/properties';
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

  const del = async (id) => {
    if (!window.confirm('确认删除？')) return;
    await apiFetch(`/api/properties/${id}`, { method: 'DELETE' });
    load();
  };

  const openEdit = (p) => { setEditItem(p); setForm(p); setShowForm(true); };
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.length === properties.length ? [] : properties.map(p => p.id));
  };

  const batchDelete = async () => {
    if (selectedIds.length === 0) {
      alert('请先选择要删除的房源');
      return;
    }
    if (!window.confirm(`确认删除选中的 ${selectedIds.length} 条房源？`)) return;

    const res = await apiFetch('/api/properties/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids: selectedIds })
    });
    const result = await res.json();
    alert(result.message);
    setSelectedIds([]);
    load();
  };

  const downloadTemplate = async () => {
    const res = await apiFetch('/api/import/template/properties');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '房源导入模板.xlsx';
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
          community_name: row['小区名称'] || '',
          address: row['详细地址'] || '',
          area: row['面积(㎡)'] || '',
          price: row['挂牌价(万)'] || '',
          min_price: row['最低价(万)'] || '',
          unit_type: row['户型'] || '',
          rooms: row['室'] || '',
          halls: row['厅'] || '',
          baths: row['卫'] || '',
          floor: row['楼层'] || '',
          total_floors: row['总楼层'] || '',
          orientation: row['朝向'] || '',
          amenities: row['配套设施'] || '',
          status: row['状态'] || 'available',
          owner_name: row['业主姓名'] || '',
          owner_phone: row['业主电话'] || '',
          owner_wechat: row['业主微信'] || '',
          notes: row['备注'] || ''
        }));

        const res = await apiFetch('/api/import/properties', {
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
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <input className="search-input" placeholder="🔍 搜索小区名称、地址..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex:1, minWidth:200 }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card)', color:'var(--text-primary)' }}>
          <option value="">全部状态</option>
          <option value="available">在售</option>
          <option value="sold">已售</option>
          <option value="suspended">暂停</option>
        </select>
        <button className="btn btn-primary" onClick={() => { setEditItem(null); setForm(empty); setShowForm(true); }}>+ 录入房源</button>
        <button className="btn btn-secondary" onClick={() => setShowImport(true)}>📥 批量导入</button>
        {selectedIds.length > 0 && (
          <button className="btn btn-danger" onClick={batchDelete}>🗑️ 批量删除 ({selectedIds.length})</button>
        )}
      </div>

      <div className="table-container">
        <table className="table">
          <thead><tr>
            <th style={{ width:40 }}>
              <input type="checkbox" checked={selectedIds.length === properties.length && properties.length > 0}
                onChange={toggleSelectAll} />
            </th>
            <th>房源信息</th><th>价格</th><th>业主信息</th><th>状态</th><th>操作</th>
          </tr></thead>
          <tbody>
            {properties.length === 0 && <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>暂无房源，点击「录入房源」添加</td></tr>}
            {properties.map(p => (
              <tr key={p.id}>
                <td>
                  <input type="checkbox" checked={selectedIds.includes(p.id)}
                    onChange={() => toggleSelect(p.id)} />
                </td>
                <td>
                  <div style={{ fontWeight:600 }}>{p.community_name || p.title}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)' }}>{p.address}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                    {p.area}㎡ {p.rooms && `${p.rooms}室${p.halls}厅${p.baths}卫`} {p.floor && `${p.floor}/${p.total_floors}层`}
                    {p.urgent && <span style={{ marginLeft:6, color:'#ef4444', fontWeight:600 }}>🔥急售</span>}
                  </div>
                </td>
                <td>
                  <div style={{ fontWeight:600, color:'var(--accent)' }}>¥{p.price}万</div>
                  {p.min_price && <div style={{ fontSize:12, color:'#f59e0b' }}>底价 ¥{p.min_price}万</div>}
                </td>
                <td>
                  {p.owner_name && <div style={{ fontWeight:500 }}>{p.owner_name}</div>}
                  {p.owner_phone && <div style={{ fontSize:12, color:'var(--text-muted)' }}>📞 {p.owner_phone}</div>}
                  {p.owner_wechat && <div style={{ fontSize:12, color:'var(--text-muted)' }}>💬 {p.owner_wechat}</div>}
                </td>
                <td><span style={{ padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600,
                  background: STATUS_COLORS[p.status]+'22', color: STATUS_COLORS[p.status] }}>
                  {STATUS_LABELS[p.status]}
                </span></td>
                <td>
                  <button className="btn btn-sm" onClick={() => openEdit(p)} style={{ marginRight:6 }}>编辑</button>
                  <button className="btn btn-sm btn-danger" onClick={() => del(p.id)}>删除</button>
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
              <h2>{editItem ? '✏️ 编辑房源' : '🏠 录入新房源'}</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label>小区名称 *</label>
                <input value={form.community_name} onChange={e=>update('community_name',e.target.value)} placeholder="例：碧桂园·天璟" />
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label>详细地址 *</label>
                <input value={form.address} onChange={e=>update('address',e.target.value)} placeholder="楼栋号、单元号、房号" />
              </div>
              <div className="form-group">
                <label>单元/房号</label>
                <input value={form.unit_room} onChange={e=>update('unit_room',e.target.value)} placeholder="例：3单元1201" />
              </div>
              <div className="form-group">
                <label>房源类型</label>
                <select value={form.property_type} onChange={e=>update('property_type',e.target.value)}>
                  {['住宅','商铺','写字楼','别墅','公寓'].map(v=><option key={v}>{v}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>室</label>
                <input type="number" value={form.rooms} onChange={e=>update('rooms',e.target.value)} placeholder="3" />
              </div>
              <div className="form-group">
                <label>厅</label>
                <input type="number" value={form.halls} onChange={e=>update('halls',e.target.value)} placeholder="2" />
              </div>
              <div className="form-group">
                <label>卫</label>
                <input type="number" value={form.baths} onChange={e=>update('baths',e.target.value)} placeholder="2" />
              </div>
              <div className="form-group">
                <label>建筑面积（㎡）</label>
                <input type="number" value={form.area} onChange={e=>update('area',e.target.value)} placeholder="89" />
              </div>
              <div className="form-group">
                <label>挂牌价格（万元）</label>
                <input type="number" value={form.price} onChange={e=>update('price',e.target.value)} placeholder="100" />
              </div>
              <div className="form-group">
                <label>业主心理最低价（万元）</label>
                <input type="number" value={form.min_price} onChange={e=>update('min_price',e.target.value)} placeholder="90" />
              </div>
              <div className="form-group">
                <label>装修状态</label>
                <select value={form.decoration} onChange={e=>update('decoration',e.target.value)}>
                  <option value="">请选择</option>
                  {['毛坯','简装','精装','豪装'].map(v=><option key={v}>{v}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>建成年份</label>
                <input type="number" value={form.build_year} onChange={e=>update('build_year',e.target.value)} placeholder="2018" />
              </div>
              <div className="form-group">
                <label>所在楼层</label>
                <input value={form.floor} onChange={e=>update('floor',e.target.value)} placeholder="8" />
              </div>
              <div className="form-group">
                <label>总楼层</label>
                <input value={form.total_floors} onChange={e=>update('total_floors',e.target.value)} placeholder="25" />
              </div>
              <div className="form-group">
                <label>朝向</label>
                <select value={form.orientation} onChange={e=>update('orientation',e.target.value)}>
                  <option value="">请选择</option>
                  {['南北通透','纯南向','东南向','西南向','东向','西向','北向'].map(v=><option key={v}>{v}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>状态</label>
                <select value={form.status} onChange={e=>update('status',e.target.value)}>
                  <option value="available">在售</option>
                  <option value="suspended">暂停</option>
                  <option value="sold">已售</option>
                </select>
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                  <input type="checkbox" checked={form.urgent} onChange={e=>update('urgent',e.target.checked)} />
                  <span>🔥 急售/急租</span>
                </label>
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label>配套设施</label>
                <input value={form.amenities} onChange={e=>update('amenities',e.target.value)} placeholder="地铁/学区/停车位" />
              </div>

              <div style={{ gridColumn:'1/-1', borderTop:'1px solid var(--border)', paddingTop:14, marginTop:4 }}>
                <div style={{ fontWeight:600, marginBottom:12, color:'var(--text-primary)' }}>👤 业主信息（录入后自动创建卖家客户）</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div className="form-group">
                    <label>业主姓名</label>
                    <input value={form.owner_name} onChange={e=>update('owner_name',e.target.value)} placeholder="业主姓名" />
                  </div>
                  <div className="form-group">
                    <label>业主电话</label>
                    <input value={form.owner_phone} onChange={e=>update('owner_phone',e.target.value)} placeholder="手机号" />
                  </div>
                  <div className="form-group" style={{ gridColumn:'1/-1' }}>
                    <label>业主微信</label>
                    <input value={form.owner_wechat} onChange={e=>update('owner_wechat',e.target.value)} placeholder="微信号" />
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label>备注</label>
                <textarea value={form.notes} onChange={e=>update('notes',e.target.value)} placeholder="其他备注信息..." rows={2} />
              </div>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
              <button className="btn" onClick={() => setShowForm(false)}>取消</button>
              <button className="btn btn-primary" onClick={save}>💾 保存</button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:500 }}>
            <div className="modal-header">
              <h2>📥 批量导入房源</h2>
              <button onClick={() => setShowImport(false)} style={{ background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ padding:'20px 0' }}>
              <div style={{ marginBottom:20, padding:16, background:'#f0f9ff', borderRadius:8, border:'1px solid #bae6fd' }}>
                <div style={{ fontWeight:600, marginBottom:8, color:'#0369a1' }}>📋 导入步骤：</div>
                <ol style={{ margin:0, paddingLeft:20, color:'#0c4a6e', lineHeight:1.8 }}>
                  <li>下载导入模板</li>
                  <li>按照模板格式填写房源数据</li>
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
                💡 提示：请确保Excel文件格式正确，必填字段为「详细地址」
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
