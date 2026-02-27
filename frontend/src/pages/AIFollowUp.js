import { apiFetch } from '../api';
import React, { useState, useEffect } from 'react';

export default function AIFollowUp() {
  const [tab, setTab] = useState('analyze');
  const [customers, setCustomers] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [chatContent, setChatContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');
  // Appointment confirm modal
  const [appointmentModal, setAppointmentModal] = useState(null);
  const [appointmentTime, setAppointmentTime] = useState('');
  const [appointmentTitle, setAppointmentTitle] = useState('');
  // Manual reminder modal
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [reminderForm, setReminderForm] = useState({ customer_id:'', title:'', content:'', remind_at:'' });

  useEffect(() => {
    apiFetch('/api/customers').then(r=>r.json()).then(setCustomers);
    loadReminders();
  }, []);

  const loadReminders = async () => {
    const r = await apiFetch('/api/reminders');
    setReminders(await r.json());
  };

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
    loadReminders();
    alert('✅ 回访提醒已添加！');
  };

  const addManualReminder = async () => {
    if (!reminderForm.title || !reminderForm.remind_at) { alert('请填写标题和提醒时间'); return; }
    await apiFetch('/api/reminders', { method:'POST', body: JSON.stringify(reminderForm) });
    setShowAddReminder(false);
    setReminderForm({ customer_id:'', title:'', content:'', remind_at:'' });
    loadReminders();
  };

  const doneReminder = async (id) => {
    await apiFetch(`/api/reminders/${id}/done`, { method:'PUT' });
    loadReminders();
  };

  const LEVEL_COLORS = { '高':'#ef4444', '中':'#f59e0b', '低':'#6b7280' };

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {[['analyze','🤖 AI智能分析'],['reminders','🔔 回访提醒']].map(([key,label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`btn ${tab===key ? 'btn-primary' : ''}`}>{label}
            {key==='reminders' && reminders.length>0 && <span style={{ marginLeft:6, background:'#ef4444', color:'white', borderRadius:10, padding:'1px 7px', fontSize:11 }}>{reminders.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'analyze' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <div>
            <div className="card" style={{ marginBottom:16 }}>
              <h3 style={{ marginBottom:12 }}>📋 选择客户（可选）</h3>
              <select value={customerId} onChange={e=>setCustomerId(e.target.value)}
                style={{ width:'100%', padding:'10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card)', color:'var(--text-primary)' }}>
                <option value="">不关联客户（仅分析）</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
              </select>
              <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:8 }}>关联客户后，分析结果和回访提醒将自动保存到客户档案</p>
            </div>
            <div className="card">
              <h3 style={{ marginBottom:12 }}>💬 粘贴聊天记录</h3>
              <textarea value={chatContent} onChange={e=>setChatContent(e.target.value)} rows={10}
                style={{ width:'100%', padding:12, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', resize:'vertical', fontSize:13 }}
                placeholder={'将与客户的聊天记录粘贴在此处...\n\n例如：\n客户：你好，我想看看那套天河的房子\n中介：好的，那套是3室2厅，南北通透，89㎡，168万\n客户：价格能不能再谈一下，我预算150左右\n中介：业主态度比较坚定，我帮您问问...'} />
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
                <p>粘贴聊天记录后点击分析</p>
                <p style={{ fontSize:12 }}>AI将自动识别客户需求、意向程度，并给出专业回访建议</p>
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
        </div>
      )}

      {tab === 'reminders' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
            <button className="btn btn-primary" onClick={() => setShowAddReminder(true)}>+ 手动添加提醒</button>
          </div>
          {reminders.length === 0 ? (
            <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>
              <div style={{ fontSize:48 }}>🎉</div>
              <p style={{ marginTop:12 }}>暂无待回访提醒，全部跟进完毕！</p>
            </div>
          ) : reminders.map(r => (
            <div key={r.id} className="card" style={{ marginBottom:12, display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600 }}>{r.title}</div>
                {r.customer_name && <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:2 }}>👤 {r.customer_name}</div>}
                {r.content && <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>{r.content.substring(0,80)}</div>}
                <div style={{ fontSize:12, color:'var(--accent)', marginTop:4 }}>🕐 {new Date(r.remind_at).toLocaleString('zh-CN')}</div>
              </div>
              <button className="btn btn-sm" style={{ background:'#10b981', color:'white' }} onClick={() => doneReminder(r.id)}>✓ 完成</button>
            </div>
          ))}
        </div>
      )}

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

      {/* Manual Reminder Modal */}
      {showAddReminder && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:420 }}>
            <h2 style={{ marginBottom:16 }}>🔔 手动添加回访提醒</h2>
            <div className="form-group">
              <label>关联客户（可选）</label>
              <select value={reminderForm.customer_id} onChange={e=>setReminderForm(f=>({...f,customer_id:e.target.value}))}
                style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card)', color:'var(--text-primary)' }}>
                <option value="">不关联客户</option>
                {customers.map(c=><option key={c.id} value={c.id}>{c.name} {c.phone||''}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>提醒标题 *</label>
              <input value={reminderForm.title} onChange={e=>setReminderForm(f=>({...f,title:e.target.value}))} placeholder="例：回访张先生" />
            </div>
            <div className="form-group">
              <label>提醒时间 *</label>
              <input type="datetime-local" value={reminderForm.remind_at} onChange={e=>setReminderForm(f=>({...f,remind_at:e.target.value}))} />
            </div>
            <div className="form-group">
              <label>备注内容</label>
              <textarea value={reminderForm.content} onChange={e=>setReminderForm(f=>({...f,content:e.target.value}))} rows={2} placeholder="跟进内容或话术..." />
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
              <button className="btn" onClick={() => setShowAddReminder(false)}>取消</button>
              <button className="btn btn-primary" onClick={addManualReminder}>✅ 添加提醒</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
