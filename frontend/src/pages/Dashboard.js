import { apiFetch } from '../api';
import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const STAGE_LABELS = {
  viewing: '带看', intent: '意向', signed: '签约', transfer: '过户', completed: '完成'
};

const STATUS_LABELS = {
  available: '在售', sold: '已售', suspended: '暂停'
};

export default function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [user, setUser] = useState(null);

  useEffect(() => {
    apiFetch('/api/stats').then(r => r.json()).then(setStats);
    apiFetch('/api/reminders').then(r => r.json()).then(setReminders);
    apiFetch('/api/auth/me').then(r => r.json()).then(data => setUser(data.user));
  }, []);

  const handleExport = async (format) => {
    const res = await apiFetch(`/api/export?format=${format}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ext = format === 'excel' ? 'xlsx' : 'csv';
    a.download = '房产CRM数据_' + new Date().toISOString().split('T')[0] + '.' + ext;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!stats) return <div className="loading">⏳ 加载数据中...</div>;

  const propertyStatusData = (stats.propertyByStatus || []).map(s => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: s.count
  }));

  const customerSourceData = (stats.customerBySource || []).map(s => ({
    name: s.source || '未知',
    value: s.count
  }));

  const gradeData = (stats.customerByGrade || []).map(g => ({
    name: `${g.grade}类客户`,
    value: g.count
  }));

  return (
    <div>
      {/* 导出按钮 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 10 }}>
        {user?.role === 'admin' ? (
          <>
            <button className="btn btn-primary" onClick={() => handleExport('excel')}>
              📥 导出Excel
            </button>
            <button className="btn btn-secondary" onClick={() => handleExport('csv')}>
              📥 导出CSV
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => handleExport('excel')}>
            📥 导出数据（Excel）
          </button>
        )}
      </div>
      {/* KPI Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">🏠</div>
          <div className="stat-value">{stats.totalProperties}</div>
          <div className="stat-label">总房源数</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-value">{stats.totalCustomers}</div>
          <div className="stat-label">总客户数</div>
        </div>
        <div className="stat-card" style={{'--accent': '#10b981'}}>
          <div className="stat-icon">💰</div>
          <div className="stat-value">{stats.monthDeals?.count || 0}</div>
          <div className="stat-label">本月成交数</div>
        </div>
        <div className="stat-card" style={{'--accent': '#f59e0b'}}>
          <div className="stat-icon">💵</div>
          <div className="stat-value">
            {stats.monthDeals?.commission
              ? `¥${(stats.monthDeals.commission / 10000).toFixed(1)}万`
              : '¥0'}
          </div>
          <div className="stat-label">本月佣金</div>
        </div>
        <div className="stat-card" style={{'--accent': '#8b5cf6'}}>
          <div className="stat-icon">📅</div>
          <div className="stat-value">{stats.quarterDeals?.count || 0}</div>
          <div className="stat-label">本季度成交</div>
        </div>
        <div className="stat-card" style={{'--accent': '#ef4444'}}>
          <div className="stat-icon">🔔</div>
          <div className="stat-value" style={{color: stats.pendingReminders > 0 ? '#fca5a5' : 'inherit'}}>
            {stats.pendingReminders || 0}
          </div>
          <div className="stat-label">待回访提醒</div>
        </div>
      </div>

      <div className="grid-2" style={{marginBottom: 20}}>
        {/* Monthly Trend */}
        <div className="card">
          <div className="card-title">📈 近6个月业绩趋势</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.monthlyTrend || []}>
              <XAxis dataKey="month" tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} />
              <YAxis tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8}}
                labelStyle={{color: '#f1f5f9'}}
              />
              <Bar dataKey="deals" name="成交数" fill="#3b82f6" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Property Status */}
        <div className="card">
          <div className="card-title">🏠 房源状态分布</div>
          {propertyStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={propertyStatusData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({name, value}) => `${name}: ${value}`}>
                  {propertyStatusData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8}} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="empty-state"><p>暂无房源数据</p></div>}
        </div>
      </div>

      <div className="grid-2">
        {/* Customer Source */}
        <div className="card">
          <div className="card-title">🎯 客户来源分析</div>
          {customerSourceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={customerSourceData} layout="vertical">
                <XAxis type="number" tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{fill: '#94a3b8', fontSize: 12}} axisLine={false} tickLine={false} width={60} />
                <Tooltip contentStyle={{background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8}} />
                <Bar dataKey="value" name="客户数" fill="#10b981" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="empty-state"><p>暂无数据</p></div>}
        </div>

        {/* Pending Reminders */}
        <div className="card">
          <div className="card-title">🔔 待回访客户</div>
          {reminders.length === 0 ? (
            <div className="empty-state"><p>暂无待回访</p></div>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
              {reminders.slice(0, 5).map(r => (
                <div key={r.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-hover)', borderRadius: 8}}>
                  <div>
                    <div style={{fontWeight: 500, fontSize: 14}}>{r.customer_name}</div>
                    <div style={{fontSize: 12, color: 'var(--text-muted)', marginTop: 2}}>{r.title}</div>
                  </div>
                  <div style={{fontSize: 12, color: 'var(--warning)'}}>
                    {new Date(r.remind_at).toLocaleDateString('zh-CN')}
                  </div>
                </div>
              ))}
              {reminders.length > 5 && (
                <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('ai-followup')}>
                  查看全部 {reminders.length} 条
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
