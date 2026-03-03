import { apiFetch } from '../api';
import React, { useState, useEffect } from 'react';

export default function AIAssistant() {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const res = await apiFetch('/api/customers');
      const data = await res.json();
      setCustomers(data);
    } catch (err) {
      console.error('加载客户失败:', err);
    }
  };

  const analyzeCustomerProfile = async () => {
    if (!selectedCustomer) {
      alert('请先选择客户');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/ai/customer-profile', {
        method: 'POST',
        body: JSON.stringify({ customer_id: selectedCustomer.id })
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message || 'AI分析失败');
    } finally {
      setLoading(false);
    }
  };

  const recommendProperties = async () => {
    if (!selectedCustomer) {
      alert('请先选择客户');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/ai/recommend-properties', {
        method: 'POST',
        body: JSON.stringify({ customer_id: selectedCustomer.id })
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message || '房源推荐失败');
    } finally {
      setLoading(false);
    }
  };

  const getFollowUpStrategy = async () => {
    if (!selectedCustomer) {
      alert('请先选择客户');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/ai/follow-up-strategy', {
        method: 'POST',
        body: JSON.stringify({ customer_id: selectedCustomer.id })
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message || '回访策略生成失败');
    } finally {
      setLoading(false);
    }
  };

  const predictDealProbability = async () => {
    if (!selectedCustomer) {
      alert('请先选择客户');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/ai/deal-probability', {
        method: 'POST',
        body: JSON.stringify({ customer_id: selectedCustomer.id })
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message || '成交概率预测失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = () => {
    setResult(null);
    switch (activeTab) {
      case 'profile':
        analyzeCustomerProfile();
        break;
      case 'recommend':
        recommendProperties();
        break;
      case 'followup':
        getFollowUpStrategy();
        break;
      case 'probability':
        predictDealProbability();
        break;
      default:
        break;
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>🤖 AI智能助手</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          使用AI分析客户特征、推荐房源、制定回访策略、预测成交概率
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
        {/* 客户选择下拉框 */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>选择客户</h3>
          <select
            value={selectedCustomer?.id || ''}
            onChange={e => {
              const customer = customers.find(c => c.id === e.target.value);
              setSelectedCustomer(customer || null);
              setResult(null);
            }}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: 14
            }}
          >
            <option value="">请选择客户</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.customer_type === 'buyer' ? '买家' : '卖家'} · {c.grade}类 {c.phone ? `(${c.phone})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* AI分析 */}
        <div>
          {/* Tab切换 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[
              { id: 'profile', label: '📊 客户画像' },
              { id: 'recommend', label: '🏠 房源推荐' },
              { id: 'followup', label: '📞 回访策略' },
              { id: 'probability', label: '💰 成交概率' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setResult(null); }}
                className="btn"
                style={{
                  flex: 1,
                  background: activeTab === tab.id ? 'var(--accent)' : 'var(--bg-card)',
                  color: activeTab === tab.id ? 'white' : 'var(--text-primary)',
                  border: '1px solid',
                  borderColor: activeTab === tab.id ? 'var(--accent)' : 'var(--border)'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 分析按钮 */}
          <div style={{ marginBottom: 16 }}>
            <button
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={!selectedCustomer || loading}
              style={{ width: '100%', padding: '12px 24px', fontSize: 16 }}
            >
              {loading ? '🔄 AI分析中...' : '✨ 开始AI分析'}
            </button>
          </div>

          {/* 错误提示 */}
          {error && (
            <div style={{ padding: 16, background: '#fee', borderRadius: 8, marginBottom: 16, color: '#c00' }}>
              ❌ {error}
            </div>
          )}

          {/* 分析结果 */}
          {result && (
            <div className="card" style={{ padding: 24 }}>
              {activeTab === 'profile' && result.profile && (
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>📊 客户画像分析</h3>
                  <div style={{ marginBottom: 16, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 8 }}>成交概率</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent)' }}>
                      {result.profile.deal_probability}%
                    </div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(59,130,246,0.1)', borderRadius: 8 }}>
                    <strong>总结：</strong>{result.profile.summary}
                  </div>
                </div>
              )}
              {activeTab === 'recommend' && result.recommendations && (
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>🏠 智能房源推荐</h3>
                  {result.recommendations.length > 0 ? (
                    result.recommendations.map((rec, i) => (
                      <div key={i} style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 8 }}>
                          {rec.property?.community_name} - 匹配度 {rec.match_score}%
                        </div>
                        <div style={{ fontSize: 13 }}>{rec.suggested_pitch}</div>
                      </div>
                    ))
                  ) : (
                    <div>暂无推荐房源</div>
                  )}
                </div>
              )}
              {activeTab === 'followup' && result.strategy && (
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>📞 智能回访策略</h3>
                  <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 12 }}>
                    <div><strong>紧急程度：</strong>{result.strategy.urgency}</div>
                    {result.strategy.opening_script && (
                      <div style={{ marginTop: 12 }}>
                        <strong>开场白：</strong>
                        <div style={{ marginTop: 4 }}>{result.strategy.opening_script}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {activeTab === 'probability' && result.prediction && (
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>💰 成交概率预测</h3>
                  <div style={{ marginBottom: 16, padding: 20, background: 'var(--bg-secondary)', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 48, fontWeight: 700, color: 'var(--accent)' }}>
                      {result.prediction.overall_probability}%
                    </div>
                    <div style={{ fontSize: 16 }}>{result.prediction.probability_level}</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(59,130,246,0.1)', borderRadius: 8 }}>
                    <strong>总结：</strong>{result.prediction.summary}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 空状态 */}
          {!result && !loading && !error && (
            <div className="card" style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
              <div style={{ fontSize: 16, color: 'var(--text-muted)' }}>
                {selectedCustomer ? '点击上方按钮开始AI分析' : '请先选择一个客户'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
