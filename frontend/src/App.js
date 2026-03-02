import React, { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Properties from './pages/Properties';
import Customers from './pages/Customers';
import Transactions from './pages/Transactions';
import AIAnalysis from './pages/AIAnalysis';
import Reminders from './pages/Reminders';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { apiFetch } from './api';
import './App.css';

const NAV_ITEMS = [
  { id: 'dashboard', label: '数据看板', icon: '📊' },
  { id: 'ai-analysis', label: 'AI智能分析', icon: '🤖' },
  { id: 'properties', label: '房源管理', icon: '🏠' },
  { id: 'customers', label: '客户管理', icon: '👥' },
  { id: 'transactions', label: '交易管理', icon: '💼' },
  { id: 'reminders', label: '回访提醒', icon: '🔔' },
  { id: 'settings', label: '系统设置', icon: '⚙️' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingReminders, setPendingReminders] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('crm_token');
    if (!token) { setLoading(false); return; }
    apiFetch('/api/auth/me').then(r => r?.json()).then(data => {
      if (data?.user) {
        setUser(data.user);
        setStore(data.store);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/reminders').then(r => r?.json()).then(data => setPendingReminders(Array.isArray(data) ? data.length : 0)).catch(() => {});
  }, [activePage, user]);

  const handleLogin = (u) => setUser(u);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    setUser(null);
  };

  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'var(--bg-primary)',color:'var(--text-muted)' }}>⏳ 加载中...</div>;
  if (!user) return <Login onLogin={handleLogin} />;

  const pages = {
    dashboard: <Dashboard onNavigate={setActivePage} />,
    properties: <Properties />,
    customers: <Customers />,
    transactions: <Transactions />,
    'ai-analysis': <AIAnalysis />,
    reminders: <Reminders />,
    settings: <Settings />,
  };

  return (
    <div className="app-layout">
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">🏢</span>
            {sidebarOpen && <span className="logo-text">房产中介AI助手</span>}
          </div>
          <button className="toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>{sidebarOpen ? '◀' : '▶'}</button>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <button key={item.id} className={`nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => setActivePage(item.id)} title={item.label}>
              <span className="nav-icon">{item.icon}</span>
              {sidebarOpen && <span className="nav-label">{item.label}
                {item.id === 'reminders' && pendingReminders > 0 && <span className="badge">{pendingReminders}</span>}
              </span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          {sidebarOpen && (
            <div style={{ padding: '8px 16px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                {user.role === 'admin' ? '👑 管理员' : '👤 ' + user.name}
              </div>
              <button onClick={handleLogout} style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                退出登录
              </button>
            </div>
          )}
        </div>
      </aside>
      <main className="main-content">
        <header className="top-bar">
          <h1 className="page-title">
            {NAV_ITEMS.find(n => n.id === activePage)?.icon}{' '}
            {NAV_ITEMS.find(n => n.id === activePage)?.label}
            {user.role === 'admin' && <span style={{ fontSize: 12, marginLeft: 10, color: 'var(--accent-light)', fontWeight: 400 }}>（管理员·全部门店）</span>}
          </h1>
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            {user.role !== 'admin' && store && (
              <div style={{ fontSize:13, color:'var(--text-muted)' }}>
                <span style={{ fontWeight:600, color:'var(--text-primary)' }}>{store.name}</span>
                <span style={{ margin:'0 8px' }}>·</span>
                <span>{user.name}</span>
              </div>
            )}
            {pendingReminders > 0 && (
              <div className="reminder-alert" onClick={() => setActivePage('reminders')}>🔔 {pendingReminders} 个待回访提醒</div>
            )}
          </div>
        </header>
        <div className="page-content">{pages[activePage]}</div>
      </main>
    </div>
  );
}
