import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', name: '', store_name: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    setLoading(true); setError('');
    const url = mode === 'login' ? 'http://182.254.146.23:3001/api/auth/login' : 'http://182.254.146.23:3001/api/auth/register';
    const body = mode === 'login'
      ? { username: form.username, password: form.password }
      : { username: form.username, password: form.password, name: form.name, store_name: form.store_name };
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '操作失败'); return; }
      localStorage.setItem('crm_token', data.token);
      localStorage.setItem('crm_user', JSON.stringify(data.user));
      onLogin(data.user, data.token);
    } catch { setError('网络错误，请稍后重试'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
      <div style={{ width: 400, padding: 40, background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏢</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>房产中介AI助手</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>专业中介管理 · AI智能回访</p>
        </div>

        <div style={{ display: 'flex', marginBottom: 24, background: 'var(--bg-hover)', borderRadius: 8, padding: 4 }}>
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }}
              style={{ flex: 1, padding: '8px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                background: mode === m ? 'var(--accent)' : 'transparent',
                color: mode === m ? 'white' : 'var(--text-muted)' }}>
              {m === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'register' && (
            <>
              <div className="form-group" style={{ margin: 0 }}>
                <label>真实姓名</label>
                <input value={form.name} onChange={e => update('name', e.target.value)} placeholder="你的名字" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>门店名称</label>
                <input value={form.store_name} onChange={e => update('store_name', e.target.value)} placeholder="例：链家天河分部（同门店必须填一样）" />
              </div>
            </>
          )}
          <div className="form-group" style={{ margin: 0 }}>
            <label>用户名</label>
            <input value={form.username} onChange={e => update('username', e.target.value)} placeholder="用户名" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>密码</label>
            <input type="password" value={form.password} onChange={e => update('password', e.target.value)}
              placeholder="密码" onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>

          {error && <div style={{ color: '#f87171', fontSize: 13, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>{error}</div>}

          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading} style={{ marginTop: 8, padding: '12px', fontSize: 15 }}>
            {loading ? '⏳ 处理中...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </div>
      </div>
    </div>
  );
}
