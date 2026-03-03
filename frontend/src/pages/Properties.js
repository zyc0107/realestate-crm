import { apiFetch } from '../api';
import React, { useState, useEffect } from 'react';

const STATUS_LABELS = { available: '在售', sold: '已售', suspended: '暂停' };
const STATUS_COLORS = { available: '#10b981', sold: '#ef4444', suspended: '#f59e0b' };

export default function Properties({ user }) {
  const [properties, setProperties] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [showImport, setShowImport] = useState(false);

  // 新增筛选状态
  const [communityFilter, setCommunityFilter] = useState([]);
  const [unitFilter, setUnitFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [areaMin, setAreaMin] = useState('');
  const [areaMax, setAreaMax] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');

  const empty = { community_name:'',address:'',area:'',price:'',min_price:'',rooms:'',halls:'',baths:'',unit:'',room_number:'',unit_room:'',property_type:'住宅',decoration:'',build_year:'',urgent:false,floor:'',total_floors:'',
    orientation:'',amenities:'',photo_url:'',description:'',status:'available',
    owner_name:'',owner_phone:'',owner_wechat:'',notes:'',listing_type:'sale',rent:'',rental_period:'',payment_method:'',property_years:'' };
  const [form, setForm] = useState(empty);

  useEffect(() => { load(); }, [statusFilter]);

  const load = async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.append('status', statusFilter);
    const r = await apiFetch('/api/properties?' + params);
    setProperties(await r.json());
  };

  // 客户端筛选逻辑
  const filteredProperties = properties.filter(p => {
    // 小区筛选（多选）
    if (communityFilter.length > 0 && !communityFilter.includes(p.community_name)) {
      return false;
    }
    // 楼栋筛选
    if (unitFilter && p.unit_room && !p.unit_room.includes(unitFilter)) {
      return false;
    }
    // 室号筛选
    if (roomFilter && p.unit_room && !p.unit_room.includes(roomFilter)) {
      return false;
    }
    // 面积区间筛选
    if (areaMin && p.area && parseFloat(p.area) < parseFloat(areaMin)) {
      return false;
    }
    if (areaMax && p.area && parseFloat(p.area) > parseFloat(areaMax)) {
      return false;
    }
    // 价格区间筛选
    if (priceMin && p.price && parseFloat(p.price) < parseFloat(priceMin)) {
      return false;
    }
    if (priceMax && p.price && parseFloat(p.price) > parseFloat(priceMax)) {
      return false;
    }
    // 业主信息筛选
    if (ownerFilter) {
      const ownerInfo = `${p.owner_name || ''}${p.owner_phone || ''}${p.owner_wechat || ''}`.toLowerCase();
      if (!ownerInfo.includes(ownerFilter.toLowerCase())) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => {
    // 排序规则：按小区名称首字母 -> 楼栋号 -> 门牌号
    // 1. 按小区名称排序
    const communityCompare = (a.community_name || '').localeCompare(b.community_name || '', 'zh-CN');
    if (communityCompare !== 0) return communityCompare;

    // 2. 同一小区内，按楼栋号排序
    const extractUnit = (unit_room) => {
      if (!unit_room) return '';
      const match = unit_room.match(/^(.+?单元)/);
      return match ? match[1] : '';
    };
    const unitA = extractUnit(a.unit_room);
    const unitB = extractUnit(b.unit_room);

    // 提取数字进行比较
    const unitNumA = parseInt(unitA.match(/\d+/) || '0');
    const unitNumB = parseInt(unitB.match(/\d+/) || '0');
    if (unitNumA !== unitNumB) return unitNumA - unitNumB;

    // 3. 同一楼栋内，按门牌号排序
    const extractRoom = (unit_room) => {
      if (!unit_room) return '';
      const match = unit_room.match(/单元(.+)$/);
      return match ? match[1] : unit_room;
    };
    const roomA = extractRoom(a.unit_room);
    const roomB = extractRoom(b.unit_room);

    const roomNumA = parseInt(roomA.match(/\d+/) || '0');
    const roomNumB = parseInt(roomB.match(/\d+/) || '0');
    return roomNumA - roomNumB;
  });

  // 获取所有唯一的小区名称
  const uniqueCommunities = [...new Set(properties.map(p => p.community_name).filter(Boolean))].sort();

  const save = async () => {
    if (!form.community_name) {
      alert('请填写小区名称');
      return;
    }
    try {
      // 自动生成地址: 小区名称 + 单元 + 房号
      const generatedAddress = `${form.community_name}${form.unit || ''}${form.room_number || ''}`;
      // 自动生成unit_room: 单元 + 房号
      const generatedUnitRoom = `${form.unit || ''}${form.room_number || ''}`;

      const dataToSave = {
        ...form,
        address: generatedAddress,
        unit_room: generatedUnitRoom
      };

      const method = editItem ? 'PUT' : 'POST';
      const url = editItem ? `/api/properties/${editItem.id}` : '/api/properties';
      const res = await apiFetch(url, { method, body: JSON.stringify(dataToSave) });
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

  const viewDetail = (p) => {
    setSelectedProperty(p);
    setShowDetail(true);
  };

  const openEdit = (p) => {
    // 智能拆分unit_room为unit和room_number
    let unit = '';
    let room_number = '';
    if (p.unit_room) {
      // 尝试匹配"3单元1201"这样的格式
      const match = p.unit_room.match(/^(.+?单元)?(.*)$/);
      if (match) {
        unit = match[1] || '';
        room_number = match[2] || '';
      } else {
        // 如果匹配失败,保持原值
        unit = p.unit_room;
      }
    }
    setEditItem(p);
    setForm({ ...p, unit, room_number });
    setShowForm(true);
  };
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
      {/* 操作栏 */}
      <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' }}>
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

      {/* 高级筛选 */}
      <div style={{ marginBottom: 16, padding: 16, background: 'var(--bg-hover)', borderRadius: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>🔍 高级筛选</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {/* 小区筛选 */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>小区</label>
            <select
              multiple
              value={communityFilter}
              onChange={e => setCommunityFilter(Array.from(e.target.selectedOptions, option => option.value))}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', height: 36 }}
            >
              {uniqueCommunities.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>按住Ctrl多选</div>
          </div>

          {/* 楼栋筛选 */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>楼栋/楼号</label>
            <input
              value={unitFilter}
              onChange={e => setUnitFilter(e.target.value)}
              placeholder="如：3单元"
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
            />
          </div>

          {/* 室号筛选 */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>室号/门牌号</label>
            <input
              value={roomFilter}
              onChange={e => setRoomFilter(e.target.value)}
              placeholder="如：1201"
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
            />
          </div>

          {/* 面积区间 */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>面积（㎡）</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number"
                value={areaMin}
                onChange={e => setAreaMin(e.target.value)}
                placeholder="最小"
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
              />
              <span style={{ color: 'var(--text-muted)' }}>~</span>
              <input
                type="number"
                value={areaMax}
                onChange={e => setAreaMax(e.target.value)}
                placeholder="最大"
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* 价格区间 */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>价格（万元）</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number"
                value={priceMin}
                onChange={e => setPriceMin(e.target.value)}
                placeholder="最小"
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
              />
              <span style={{ color: 'var(--text-muted)' }}>~</span>
              <input
                type="number"
                value={priceMax}
                onChange={e => setPriceMax(e.target.value)}
                placeholder="最大"
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* 业主信息筛选 */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>业主信息</label>
            <input
              value={ownerFilter}
              onChange={e => setOwnerFilter(e.target.value)}
              placeholder="姓名/电话/微信"
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        {/* 清除筛选按钮 */}
        {(communityFilter.length > 0 || unitFilter || roomFilter || areaMin || areaMax || priceMin || priceMax || ownerFilter) && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setCommunityFilter([]);
              setUnitFilter('');
              setRoomFilter('');
              setAreaMin('');
              setAreaMax('');
              setPriceMin('');
              setPriceMax('');
              setOwnerFilter('');
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
              <input type="checkbox" checked={selectedIds.length === filteredProperties.length && filteredProperties.length > 0}
                onChange={toggleSelectAll} />
            </th>
            <th>小区名称</th>
            <th>楼栋/楼号</th>
            <th>室号/门牌号</th>
            <th>面积</th>
            <th>价格</th>
            <th>业主信息</th>
            {user?.role === 'admin' && (
              <>
                <th>所属门店</th>
                <th>经纪人</th>
              </>
            )}
            <th>状态</th>
            <th>操作</th>
          </tr></thead>
          <tbody>
            {filteredProperties.length === 0 && <tr><td colSpan={user?.role === 'admin' ? 11 : 9} style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>暂无符合条件的房源</td></tr>}
            {filteredProperties.map(p => {
              // 解析unit_room为楼栋和室号
              let unit = '';
              let room = '';
              if (p.unit_room) {
                const match = p.unit_room.match(/^(.+?单元)?(.*)$/);
                if (match) {
                  unit = match[1] || '';
                  room = match[2] || '';
                }
              }

              return (
              <tr key={p.id}>
                <td>
                  <input type="checkbox" checked={selectedIds.includes(p.id)}
                    onChange={() => toggleSelect(p.id)} />
                </td>
                <td>
                  <div style={{ fontWeight:600 }}>
                    {p.community_name || p.title || '-'}
                  </div>
                  <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                    {p.rooms && `${p.rooms}室${p.halls}厅${p.baths}卫`}
                    {p.urgent && <span style={{ marginLeft:6, color:'#ef4444', fontWeight:600 }}>🔥急售</span>}
                  </div>
                </td>
                <td style={{ fontSize:13 }}>
                  {unit || '-'}
                </td>
                <td style={{ fontSize:13 }}>
                  {room || '-'}
                </td>
                <td>
                  <div style={{ fontWeight:600 }}>{p.area || '-'}㎡</div>
                  {p.floor && <div style={{ fontSize:11, color:'var(--text-muted)' }}>{p.floor}/{p.total_floors}层</div>}
                </td>
                <td>
                  <div style={{ fontWeight:600, color:'var(--accent)' }}>¥{p.price || '-'}万</div>
                  {p.min_price && <div style={{ fontSize:12, color:'#f59e0b' }}>底价 ¥{p.min_price}万</div>}
                </td>
                <td>
                  {p.owner_name && <div style={{ fontWeight:500 }}>{p.owner_name}</div>}
                  {p.owner_phone && <div style={{ fontSize:12, color:'var(--text-muted)' }}>📞 {p.owner_phone}</div>}
                  {p.owner_wechat && <div style={{ fontSize:12, color:'var(--text-muted)' }}>💬 {p.owner_wechat}</div>}
                </td>
                {user?.role === 'admin' && (
                  <>
                    <td style={{ fontSize:13 }}>{p.store_name || '-'}</td>
                    <td style={{ fontSize:13 }}>
                      {p.agent_name ? `${p.agent_name}${p.agent_id ? ` (${p.agent_id})` : ''}` : '-'}
                    </td>
                  </>
                )}
                <td><span style={{ padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600,
                  background: STATUS_COLORS[p.status]+'22', color: STATUS_COLORS[p.status] }}>
                  {STATUS_LABELS[p.status]}
                </span></td>
                <td>
                  <button className="btn btn-sm" onClick={() => viewDetail(p)} style={{ marginRight:6, background: 'rgba(59,130,246,0.25)', borderColor: 'rgba(59,130,246,0.4)' }}>详情</button>
                  <button className="btn btn-sm" onClick={() => openEdit(p)} style={{ marginRight:6, background: 'rgba(245,158,11,0.25)', borderColor: 'rgba(245,158,11,0.4)' }}>编辑</button>
                  <button className="btn btn-sm btn-danger" onClick={() => del(p.id)}>删除</button>
                </td>
              </tr>
              );
            })}
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
            <div className="modal-body">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label>房源类型 *</label>
                <select value={form.listing_type} onChange={e=>update('listing_type',e.target.value)}>
                  <option value="sale">出售</option>
                  <option value="rent">出租</option>
                </select>
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label>小区名称 *</label>
                <input value={form.community_name} onChange={e=>update('community_name',e.target.value)} placeholder="例：碧桂园·天璟" />
              </div>
              <div className="form-group">
                <label>单元</label>
                <input value={form.unit} onChange={e=>update('unit',e.target.value)} placeholder="例：3单元" />
              </div>
              <div className="form-group">
                <label>房号</label>
                <input value={form.room_number} onChange={e=>update('room_number',e.target.value)} placeholder="例：1201" />
              </div>
              <div className="form-group">
                <label>总楼层</label>
                <input value={form.total_floors} onChange={e=>update('total_floors',e.target.value)} placeholder="25" />
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
              {form.listing_type === 'sale' ? (
                <>
                  <div className="form-group">
                    <label>挂牌价格（万元）</label>
                    <input type="number" value={form.price} onChange={e=>update('price',e.target.value)} placeholder="100" />
                  </div>
                  <div className="form-group">
                    <label>业主心理最低价（万元）</label>
                    <input type="number" value={form.min_price} onChange={e=>update('min_price',e.target.value)} placeholder="90" />
                  </div>
                  <div className="form-group">
                    <label>产权年限</label>
                    <input value={form.property_years} onChange={e=>update('property_years',e.target.value)} placeholder="70年" />
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label>租金（元/月）</label>
                    <input type="number" value={form.rent} onChange={e=>update('rent',e.target.value)} placeholder="3000" />
                  </div>
                  <div className="form-group">
                    <label>租期</label>
                    <select value={form.rental_period} onChange={e=>update('rental_period',e.target.value)}>
                      <option value="">请选择</option>
                      <option value="1个月">1个月</option>
                      <option value="3个月">3个月</option>
                      <option value="半年">半年</option>
                      <option value="1年">1年</option>
                      <option value="2年">2年</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>付款方式</label>
                    <select value={form.payment_method} onChange={e=>update('payment_method',e.target.value)}>
                      <option value="">请选择</option>
                      <option value="押一付一">押一付一</option>
                      <option value="押一付三">押一付三</option>
                      <option value="押一付六">押一付六</option>
                      <option value="半年付">半年付</option>
                      <option value="年付">年付</option>
                    </select>
                  </div>
                </>
              )}
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
                <label>🔥 急售/急租</label>
                <select value={form.urgent} onChange={e=>update('urgent',e.target.value)}>
                  <option value={0}>正常</option>
                  <option value={1}>急售/急租</option>
                </select>
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
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>取消</button>
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

      {showDetail && selectedProperty && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:700, maxHeight:'90vh', overflowY:'auto' }}>
            <div className="modal-header">
              <h2>🏠 房源详情</h2>
              <button onClick={() => setShowDetail(false)} style={{ background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--text-muted)' }}>✕</button>
            </div>

            {/* 基本信息 */}
            <div style={{ marginBottom:24, padding:16, background:'var(--bg-hover)', borderRadius:8 }}>
              <h3 style={{ fontSize:16, fontWeight:600, marginBottom:12 }}>基本信息</h3>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, fontSize:14 }}>
                <div><span style={{ color:'var(--text-muted)' }}>小区名称：</span>{selectedProperty.community_name}</div>
                <div><span style={{ color:'var(--text-muted)' }}>单元房号：</span>{selectedProperty.unit_room || '-'}</div>
                <div><span style={{ color:'var(--text-muted)' }}>房源类型：</span>{selectedProperty.property_type}</div>
                <div><span style={{ color:'var(--text-muted)' }}>建筑面积：</span>{selectedProperty.area}㎡</div>
                <div><span style={{ color:'var(--text-muted)' }}>户型：</span>{selectedProperty.rooms}室{selectedProperty.halls}厅{selectedProperty.baths}卫</div>
                <div><span style={{ color:'var(--text-muted)' }}>楼层：</span>{selectedProperty.floor || '-'}/{selectedProperty.total_floors || '-'}层</div>
                <div><span style={{ color:'var(--text-muted)' }}>朝向：</span>{selectedProperty.orientation || '-'}</div>
                <div><span style={{ color:'var(--text-muted)' }}>装修：</span>{selectedProperty.decoration || '-'}</div>
                <div><span style={{ color:'var(--text-muted)' }}>建成年份：</span>{selectedProperty.build_year || '-'}</div>
                <div><span style={{ color:'var(--text-muted)' }}>状态：</span>
                  <span style={{ padding:'2px 8px', borderRadius:12, fontSize:12, fontWeight:600,
                    background: STATUS_COLORS[selectedProperty.status]+'22', color: STATUS_COLORS[selectedProperty.status] }}>
                    {STATUS_LABELS[selectedProperty.status]}
                  </span>
                </div>
              </div>
              {selectedProperty.amenities && (
                <div style={{ marginTop:12 }}><span style={{ color:'var(--text-muted)' }}>配套设施：</span>{selectedProperty.amenities}</div>
              )}
            </div>

            {/* 价格信息 */}
            <div style={{ marginBottom:24, padding:16, background:'var(--bg-hover)', borderRadius:8 }}>
              <h3 style={{ fontSize:16, fontWeight:600, marginBottom:12 }}>价格信息</h3>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, fontSize:14 }}>
                <div><span style={{ color:'var(--text-muted)' }}>挂牌价格：</span><span style={{ fontWeight:600, color:'var(--accent)' }}>¥{selectedProperty.price}万</span></div>
                <div><span style={{ color:'var(--text-muted)' }}>业主最低价：</span><span style={{ fontWeight:600, color:'#f59e0b' }}>¥{selectedProperty.min_price || '-'}万</span></div>
              </div>
            </div>

            {/* 业主信息 */}
            <div style={{ marginBottom:24, padding:16, background:'var(--bg-hover)', borderRadius:8 }}>
              <h3 style={{ fontSize:16, fontWeight:600, marginBottom:12 }}>业主信息</h3>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, fontSize:14 }}>
                <div><span style={{ color:'var(--text-muted)' }}>业主姓名：</span>{selectedProperty.owner_name || '-'}</div>
                <div><span style={{ color:'var(--text-muted)' }}>业主电话：</span>{selectedProperty.owner_phone || '-'}</div>
                <div style={{ gridColumn:'1/-1' }}><span style={{ color:'var(--text-muted)' }}>业主微信：</span>{selectedProperty.owner_wechat || '-'}</div>
              </div>
            </div>

            {/* 备注信息 */}
            {selectedProperty.notes && (
              <div style={{ marginBottom:24, padding:16, background:'var(--bg-hover)', borderRadius:8 }}>
                <h3 style={{ fontSize:16, fontWeight:600, marginBottom:12 }}>备注信息</h3>
                <div style={{ fontSize:14, lineHeight:1.6, whiteSpace:'pre-wrap' }}>{selectedProperty.notes}</div>
              </div>
            )}

            <div style={{ marginTop:20, textAlign:'right' }}>
              <button className="btn btn-primary" onClick={() => setShowDetail(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
