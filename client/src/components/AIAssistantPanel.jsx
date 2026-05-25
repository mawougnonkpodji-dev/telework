import { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { io } from 'socket.io-client';
import { Brain, Send, Lightbulb, Sparkles, MessageSquare, Hash, ChevronRight, ChevronLeft, X, Minus } from 'lucide-react';

export default function AIAssistantPanel({ channels: initialChannels, currentUser }) {
  const [channels, setChannels] = useState(initialChannels || []);
  const [activeChannel, setActiveChannel] = useState(1);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [activity, setActivity] = useState([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io('http://localhost:3001');
    
    socketRef.current.on('newMessage', ({ user, text, time }) => {
      setMessages(prev => [...prev, { user, text, time }]);
    });

    socketRef.current.on('connect', () => {
      socketRef.current.emit('joinChannel', activeChannel);
    });

    return () => socketRef.current?.disconnect();
  }, []);

  useEffect(() => {
    if (channels.length > 0) {
      fetchMessages(activeChannel);
    }
  }, [activeChannel, channels]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = (channelId) => {
    fetch(`http://localhost:3001/api/channels/${channelId}/messages`)
      .then(res => res.json())
      .then(data => setMessages(data))
      .catch(() => []);
  };

  const sendMessage = () => {
    if (!newMessage.trim()) return;
    
    fetch(`http://localhost:3001/api/channels/${activeChannel}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: currentUser, text: newMessage })
    });

    socketRef.current?.emit('sendMessage', {
      channelId: activeChannel,
      user: currentUser,
      text: newMessage
    });

    setMessages(prev => [...prev, { user: currentUser, text: newMessage, time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }]);
    setNewMessage('');
  };

  if (isMinimized) {
    return (
      <div 
        onClick={() => setIsMinimized(false)}
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          width: '70px',
          height: '70px',
          borderRadius: '50%',
          backgroundColor: '#eab308',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 0 25px rgba(234, 179, 8, 0.8)',
          zIndex: 9999
        }}
      >
        <Brain size={30} color="#000" />
      </div>
    );
  }

  if (!isExpanded) {
    return (
      <div className="ai-panel-collapsed">
        <button className="ai-expand-btn" onClick={() => setIsExpanded(true)}>
          <ChevronLeft size={16} />
        </button>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .ai-panel {
          position: fixed;
          right: 0;
          top: 0;
          bottom: 0;
          width: 320px;
          background: rgba(2, 6, 23, 0.95);
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          flex-direction: column;
          z-index: 60;
        }
        
        .ai-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        
        .ai-title {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #fbbf24;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 1px;
        }
        
        .ai-header-actions {
          display: flex;
          gap: 8px;
        }
        
        .ai-minimize-btn, .ai-expand-btn {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        
        .ai-minimize-btn:hover, .ai-expand-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }
        
        .ai-chart {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        
        .ai-chart-label {
          font-size: 11px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 12px;
        }
        
        .ai-chart-area {
          height: 60px;
        }
        
        .ai-chat {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        
        .ai-chat-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        
        .ai-status {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #22c55e;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        .ai-status-text {
          font-size: 12px;
          color: #22c55e;
          font-weight: 500;
        }
        
        .ai-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .ai-message {
          font-size: 13px;
          line-height: 1.5;
          padding: 10px 14px;
          border-radius: 12px;
          max-width: 85%;
        }
        
        .ai-message.user {
          background: rgba(6, 182, 212, 0.15);
          color: #e2e8f0;
          align-self: flex-end;
          border-bottom-right-radius: 4px;
        }
        
        .ai-message.ai {
          background: rgba(251, 191, 36, 0.1);
          color: #e2e8f0;
          align-self: flex-start;
          border-bottom-left-radius: 4px;
        }
        
        .ai-input-area {
          padding: 16px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.04);
        }
        
        .ai-input-wrapper {
          display: flex;
          gap: 8px;
        }
        
        .ai-input {
          flex: 1;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: white;
          font-size: 13px;
          outline: none;
          transition: all 0.2s;
        }
        
        .ai-input:focus {
          border-color: rgba(251, 191, 36, 0.5);
          box-shadow: 0 0 10px rgba(251, 191, 36, 0.1);
        }
        
        .ai-input::placeholder {
          color: #475569;
        }
        
        .ai-send {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: rgba(251, 191, 36, 0.15);
          border: 1px solid rgba(251, 191, 36, 0.3);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        
        .ai-send:hover {
          background: rgba(251, 191, 36, 0.25);
          box-shadow: 0 0 15px rgba(251, 191, 36, 0.2);
        }
        
        .ai-actions {
          padding: 16px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        
        .ai-actions-label {
          font-size: 11px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 12px;
        }
        
        .ai-action-btn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          background: rgba(251, 191, 36, 0.08);
          border: 1px solid rgba(251, 191, 36, 0.2);
          border-radius: 8px;
          color: #fbbf24;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 8px;
        }
        
        .ai-action-btn:hover {
          background: rgba(251, 191, 36, 0.15);
          border-color: rgba(251, 191, 36, 0.4);
          box-shadow: 0 0 15px rgba(251, 191, 36, 0.15);
        }
        
        .ai-panel-collapsed {
          position: fixed;
          right: 0;
          top: 0;
          bottom: 0;
          width: 48px;
          background: rgba(2, 6, 23, 0.95);
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 60;
        }
        
        .ai-bubble {
          position: fixed !important;
          left: 80px !important;
          bottom: 20px !important;
          top: auto !important;
          right: auto !important;
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: #fbbf24;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #000000;
          cursor: pointer;
          box-shadow: 0 0 35px rgba(251, 191, 36, 0.8), 0 0 70px rgba(251, 191, 36, 0.4);
          z-index: 45;
        }
        
        .ai-bubble-pulse {
          position: absolute;
          inset: -10px;
          border-radius: 50%;
          background: transparent;
          box-shadow: 0 0 30px rgba(251, 191, 36, 0.6);
          animation: bubblePulse 1.5s infinite;
        }
        
        @keyframes bubblePulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.5; }
        }
      `}</style>
      <aside className="ai-panel">
        <div className="ai-header">
          <div className="ai-title">
            <Brain size={18} color="#fbbf24" />
            <span>INTELLIGENCE IA</span>
          </div>
          <div className="ai-header-actions">
            <button className="ai-minimize-btn" onClick={() => setIsMinimized(true)} title="Minimiser">
              <Minus size={14} />
            </button>
            <button className="ai-minimize-btn" onClick={() => setIsExpanded(false)} title="Réduire">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="ai-chart">
          <p className="ai-chart-label">Activité</p>
          <div className="ai-chart-area">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activity}>
                <defs>
                  <linearGradient id="colorAi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" hide />
                <YAxis hide />
                <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '11px' }} />
                <Area type="monotone" dataKey="score" stroke="#fbbf24" strokeWidth={2} fillOpacity={1} fill="url(#colorAi)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', padding: '12px 20px' }}>
          <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
            <MessageSquare size={12} style={{ marginRight: '6px', display: 'inline' }} />
            Canaux
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {channels.map(channel => (
              <div
                key={channel.id}
                onClick={() => { setActiveChannel(channel.id); socketRef.current?.emit('joinChannel', channel.id); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: activeChannel === channel.id ? 'rgba(6, 182, 212, 0.1)' : 'transparent',
                  color: activeChannel === channel.id ? '#06b6d4' : '#64748b',
                  fontSize: '13px',
                  transition: 'all 0.2s'
                }}
              >
                <Hash size={14} />
                {channel.name}
              </div>
            ))}
          </div>
        </div>

        <div className="ai-chat" style={{ flex: 1 }}>
          <div className="ai-chat-header">
            <div className="ai-status" />
            <span className="ai-status-text">En direct</span>
          </div>

          <div className="ai-messages">
            {messages.map((msg, index) => (
              <div key={index} className={`ai-message ${msg.user === currentUser ? 'user' : 'ai'}`}>
                <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>
                  {msg.user} • {msg.time}
                </div>
                {msg.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="ai-input-area">
            <div className="ai-input-wrapper">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Écrire un message..."
                className="ai-input"
              />
              <button className="ai-send" onClick={sendMessage}>
                <Send size={16} color="#fbbf24" />
              </button>
            </div>
          </div>
        </div>

        <div className="ai-actions">
          <p className="ai-actions-label">Actions rapides</p>
          <button className="ai-action-btn">
            <Lightbulb size={16} color="#fbbf24" />
            Conseil IA
          </button>
          <button className="ai-action-btn">
            <Sparkles size={16} color="#fbbf24" />
            Analyser Sprint
          </button>
        </div>
      </aside>
    </>
  );
}