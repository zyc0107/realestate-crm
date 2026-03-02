import { apiFetch } from '../api';
import React, { useState, useEffect } from 'react';

export default function Settings() {
  const [form, setForm] = useState({
    deepseek_api_key: '',
    nickname: '',
  });
  const [userInfo, setUserInfo] = useState(null);
  const [savedInfo, setSavedInfo] = useState({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [nicknameError, setNicknameError] = useState('');

  useEffect(() => {
    // Fetch user info
    apiFetch('/api/auth/me').then(r => r.json()).then(data => {
      setUserInfo(data);
      setForm(f => ({ ...f, nickname: data.user.nickname || '' }));
    });
    // Fetch settings
    apiFetch('/api/settings').then(r => r.json()).then(data => {
      setSavedInfo(data);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaveMsg(''); setNicknameError('');
    let hasChanges = false;

    // Save API key if provided
    if (form.deepseek_api_key) {
      hasChanges = true;
      await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deepseek_api_key: form.deepseek_api_key })
      });
      setForm(f => ({ ...f, deepseek_api_key: '' }));
      apiFetch('/api/settings').then(r => r.json()).then(setSavedInfo);
    }

    // Save nickname if changed
    const currentNickname = userInfo?.user?.nickname || '';
    const newNickname = form.nickname || '';
    if (newNickname !== currentNickname) {
      hasChanges = true;
      try {
        const res = await apiFetch('/api/user/update-nickname', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nickname: newNickname })
        });
        const data = await res.json();
        if (!res.ok) {
          setNicknameError(data.error || '保存失败');
          setSaving(false);
          return;
        }
        // Refresh user info
        const meRes = await apiFetch('/api/auth/me');
        const meData = await meRes.json();
        setUserInfo(meData);
        setForm(f => ({ ...f, nickname: meData.user.nickname || '' }));
      } catch (e) {
        setNicknameError('保存失败，请重试：' + e.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    if (hasChanges) {
      setSaveMsg('✅ 保存成功！');
      setTimeout(() => setSaveMsg(''), 3000);
    } else {
      setSaveMsg('没有需要保存的更改');
      setTimeout(() => setSaveMsg(''), 2000);
    }
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    const keyToTest = form.deepseek_api_key || undefined;
    try {
      const res = await apiFetch('/api/settings/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: keyToTest })
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, message: '网络错误，请检查后端是否运行' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ maxWidth: 640 }}>

      {/* API Key 设置 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">🤖 DeepSeek API 配置</div>

        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--bg-hover)', borderRadius: 8, fontSize: 13 }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>当前状态</div>
          {savedInfo.deepseek_api_key_preview ? (
            <div style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 8 }}>
              ✅ API Key 已配置：<code style={{ color: 'var(--accent-light)' }}>{savedInfo.deepseek_api_key_preview}</code>
            </div>
          ) : (
            <div style={{ color: 'var(--warning)' }}>
              ⚠️ 未配置 API Key，AI 分析功能不可用
            </div>
          )}
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>DeepSeek API Key</label>
          <input
            type="password"
            value={form.deepseek_api_key}
            onChange={e => setForm(f => ({ ...f, deepseek_api_key: e.target.value }))}
            placeholder={savedInfo.deepseek_api_key_preview ? '输入新 Key 以更新（留空则保持不变）' : 'sk-xxxxxxxxxxxxxxxx'}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            在 <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-light)' }}>platform.deepseek.com</a> 获取 API Key
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>
            {testing ? '⏳ 测试中...' : '🔌 测试连接'}
          </button>
        </div>

        {testResult && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: testResult.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${testResult.success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: testResult.success ? '#6ee7b7' : '#fca5a5'
          }}>
            {testResult.success ? '✅' : '❌'} {testResult.message}
          </div>
        )}
      </div>

      {/* 基本信息 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">🏢 基本信息</div>
        {userInfo ? (
          <div className="form-grid">
            <div className="form-group">
              <label>门店名称</label>
              <input
                value={userInfo.store?.name || '未分配门店'}
                readOnly
                style={{ background: 'var(--bg-hover)', cursor: 'not-allowed', color: 'var(--text-muted)' }}
              />
            </div>
            <div className="form-group">
              <label>经纪人姓名</label>
              <input
                value={userInfo.user.name}
                readOnly
                style={{ background: 'var(--bg-hover)', cursor: 'not-allowed', color: 'var(--text-muted)' }}
              />
            </div>
            <div className="form-group">
              <label>经纪人编号</label>
              <input
                value={userInfo.user.agent_id || '未设置'}
                readOnly
                style={{ background: 'var(--bg-hover)', cursor: 'not-allowed', color: 'var(--text-muted)' }}
              />
            </div>
            <div className="form-group">
              <label>昵称</label>
              <input
                value={form.nickname}
                onChange={e => { setForm(f => ({ ...f, nickname: e.target.value })); setNicknameError(''); }}
                placeholder="设置一个昵称"
              />
              {nicknameError && <span style={{ fontSize: 12, color: '#f87171', marginTop: 4 }}>{nicknameError}</span>}
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>昵称用于在系统中显示，可随时修改</span>
            </div>
          </div>
        ) : (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>加载中...</div>
        )}
      </div>

      {/* 保存按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '⏳ 保存中...' : '💾 保存设置'}
        </button>
        {saveMsg && <span style={{ color: 'var(--success)', fontSize: 14 }}>{saveMsg}</span>}
      </div>

      {/* 使用说明 */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-title">📖 关于 API Key 的说明</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 8 }}>
            <strong style={{ color: 'var(--text-primary)' }}>你自己用：</strong>
            在此页面填入你的 DeepSeek API Key，所有 AI 分析功能就会使用你的 Key，费用由你的账户承担。
          </p>
          <p style={{ marginBottom: 8 }}>
            <strong style={{ color: 'var(--text-primary)' }}>朋友/同事用：</strong>
            如果你将系统部署给他人使用，他们可以在自己的设备上进入「系统设置」填入各自的 DeepSeek API Key，费用由各自账户承担，互不影响。
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>DeepSeek 费用：</strong>
            DeepSeek 按 token 计费，分析一次聊天记录大约消耗 0.001~0.005 元，非常便宜。充值 ¥10 可以分析几千次对话。
          </p>
        </div>
      </div>
    </div>
  );
}
