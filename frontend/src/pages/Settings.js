import { apiFetch } from '../api';
import React, { useState, useEffect } from 'react';

export default function Settings() {
  const [form, setForm] = useState({
    deepseek_api_key: '',
    nickname: '',
  });
  const [userInfo, setUserInfo] = useState(null);
  const [savedInfo, setSavedInfo] = useState({});
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
    </div>
  );
}
