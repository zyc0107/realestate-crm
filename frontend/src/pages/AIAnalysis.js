import { apiFetch } from '../api';
import React, { useState, useEffect } from 'react';

export default function AIAnalysis() {
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [chatContent, setChatContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');
  // Appointment confirm modal
  const [appointmentModal, setAppointmentModal] = useState(null);
  const [appointmentTime, setAppointmentTime] = useState('');
  const [appointmentTitle, setAppointmentTitle] = useState('');

  useEffect(() => {
    apiFetch('/api/customers').then(r=>r.json()).then(setCustomers);
  }, []);

  const analyze = async () => {
    if (!chatContent.trim()) { setError('请粘贴聊天记录'); return; }
    setLoading(true); setError(''); setAnalysis(null);
    try {
      const r = await apiFetch('/api/ai/analyze-chat', {
        method: 'POST',
        body: JSON.stringify({ customer_id: customerId || null, chat_content: chatContent })
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error); return; }
      setAnalysis(data.analysis);
      // Check if appointment detected
      if (data.analysis?.detected_appointment?.found) {
        const appt = data.analysis.detected_appointment;
        setAppointmentTitle(`回访提醒：${customers.find(c=>c.id===customerId)?.name || '客户'}`);
        const suggestedTime = appt.suggested_datetime
          ? appt.suggested_datetime.substring(0,16)
          : new Date(Date.now() + 3*24*3600*1000).toISOString().substring(0,16);
        setAppointmentTime(suggestedTime);
        setAppointmentModal({ description: appt.date_description, follow_up_script: data.analysis.follow_up_script });
      }
    } catch(e) { setError('分析失败：' + e.message); }
    finally { setLoading(false); }
  };

  const confirmAppointment = async () => {
    await apiFetch('/api/reminders', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: customerId || null,
        title: appointmentTitle,
        content: appointmentModal.follow_up_script || '',
        remind_at: appointmentTime
      })
    });
    setAppointmentModal(null);
    alert('✅ 回访提醒已添加！');
  };

  const LEVEL_COLORS = { '高':'#ef4444', '中':'#f59e0b', '低':'#6b7280' };

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
      <div>
        <div className="card" style={{ marginBottom:16 }}>
          <h3 style={{ marginBottom:12 }}>📋 关联客户（可选）</h3>
          <select value={customerId} onChange={e=>setCustomerId(e.target.value)}
            style={{ width:'100%', padding:'10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card)', color:'var(--text-primary)' }}>
            <option value="">不关联客户（仅分析）</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
          </select>
          <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:8 }}>💡 关联客户后，分析结果和回访提醒将自动保存到客户档案</p>
        </div>

        <div className="card" style={{ marginBottom:16, padding:'12px 16px', background:'var(--bg-hover)', border:'1px solid var(--border)' }}>
          <div style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.6 }}>
            <b style={{ color:'var(--text-primary)' }}>💡 使用说明：</b>
            <p style={{ marginTop:4, marginBottom:0 }}>
              将您与客户的微信、电话等聊天记录粘贴到下方，AI将智能分析客户意向程度、关注点，并生成专业的跟进话术和回访建议。
            </p>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom:12 }}>💬 聊天记录分析</h3>
          <textarea value={chatContent} onChange={e=>setChatContent(e.target.value)} rows={10}
            style={{ width:'100%', padding:12, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', resize:'vertical', fontSize:13 }}
            placeholder={'粘贴您与客户的聊天记录...\n\n示例：\n客户：你好，我想看看那套天河的房子\n中介：好的，那套是3室2厅，南北通透，89㎡，168万\n客户：价格能不能再谈一下，我预算150左右\n中介：业主态度比较坚定，不过我可以帮您再沟通看看...'} />
          {error && <div style={{ color:'#f87171', fontSize:13, marginTop:8, padding:'8px 12px', background:'rgba(239,68,68,0.1)', borderRadius:8 }}>{error}</div>}
          <button className="btn btn-primary" onClick={analyze} disabled={loading} style={{ width:'100%', marginTop:12, padding:12 }}>
            {loading ? '⏳ AI分析中...' : '🚀 开始AI分析'}
          </button>
        </div>
      </div>

      <div className="card">
        {!analysis ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:300, color:'var(--text-muted)' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>✨</div>
            <p style={{ fontSize:15, fontWeight:600, color:'var(--text-primary)', marginBottom:8 }}>等待分析</p>
            <p style={{ fontSize:13, textAlign:'center', lineHeight:1.6 }}>
              粘贴聊天记录后点击"开始AI分析"<br/>
              AI将智能识别客户意向、需求和关注点<br/>
              并生成专业的跟进话术
            </p>
          </div>
        ) : (
          <div>
            <h3 style={{ marginBottom:16 }}>📊 分析结果</h3>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, padding:'12px', background:'var(--bg-hover)', borderRadius:10 }}>
              <span style={{ fontSize:13 }}>意向程度：</span>
              <span style={{ fontWeight:700, fontSize:18, color: LEVEL_COLORS[analysis.intention_level] }}>{analysis.intention_level}</span>
            </div>
            {analysis.intention_analysis && <div style={{ marginBottom:12 }}><b>意向分析：</b><p style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>{analysis.intention_analysis}</p></div>}
            {analysis.key_concerns?.length > 0 && <div style={{ marginBottom:12 }}><b>客户关注点：</b>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6 }}>
                {analysis.key_concerns.map((c,i) => <span key={i} style={{ padding:'3px 10px', background:'var(--accent)22', color:'var(--accent)', borderRadius:20, fontSize:12 }}>{c}</span>)}
              </div>
            </div>}
            {analysis.follow_up_script && <div style={{ marginBottom:12, padding:12, background:'var(--bg-hover)', borderRadius:8 }}><b>💬 建议话术：</b><p style={{ fontSize:13, marginTop:6, lineHeight:1.6 }}>{analysis.follow_up_script}</p></div>}
            {analysis.summary && <div><b>总结：</b><p style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>{analysis.summary}</p></div>}
            {analysis.detected_appointment?.found && (
              <div style={{ marginTop:12, padding:12, background:'rgba(16,185,129,0.1)', borderRadius:8, border:'1px solid #10b981' }}>
                <b style={{ color:'#10b981' }}>📅 检测到约访时间：</b>
                <p style={{ fontSize:13, marginTop:4 }}>"{analysis.detected_appointment.date_description}"</p>
                <button className="btn btn-primary" style={{ marginTop:8, fontSize:12 }}
                  onClick={() => { setAppointmentTime(analysis.detected_appointment.suggested_datetime?.substring(0,16) || ''); setAppointmentModal(analysis.detected_appointment); }}>
                  ➕ 添加到回访提醒
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Appointment Confirm Modal */}
      {appointmentModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:420 }}>
            <h2 style={{ marginBottom:16 }}>📅 确认添加回访提醒</h2>
            <p style={{ color:'var(--text-muted)', marginBottom:16 }}>AI检测到约访时间：<b style={{ color:'var(--text-primary)' }}>"{appointmentModal.date_description || appointmentModal.found}"</b></p>
            <div className="form-group">
              <label>提醒标题</label>
              <input value={appointmentTitle} onChange={e=>setAppointmentTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label>提醒时间</label>
              <input type="datetime-local" value={appointmentTime} onChange={e=>setAppointmentTime(e.target.value)} />
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
              <button className="btn" onClick={() => setAppointmentModal(null)}>取消</button>
              <button className="btn btn-primary" onClick={confirmAppointment}>✅ 确认添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

