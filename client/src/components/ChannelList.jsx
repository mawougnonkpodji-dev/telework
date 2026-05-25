import { useState, useEffect } from 'react';
import { Hash, Send } from 'lucide-react';

export default function ChannelList({ channels, currentUser, socket }) {
  const [activeChannel, setActiveChannel] = useState(1);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    if (channels.length > 0) {
      setMessages(channels[0].messages || []);
    }
  }, [channels]);

  const selectChannel = (id) => {
    setActiveChannel(id);
    const channel = channels.find(c => c.id === id);
    setMessages(channel?.messages || []);
  };

  const sendMessage = () => {
    if (!newMessage.trim()) return;
    
    socket?.emit('sendMessage', {
      channelId: activeChannel,
      user: currentUser,
      text: newMessage
    });
    
    setMessages(prev => [...prev, { user: currentUser, text: newMessage, time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }]);
    setNewMessage('');
  };

  return (
    <div>
      <div className="channel-list">
        {channels.map(channel => (
          <div
            key={channel.id}
            className={`channel-item ${activeChannel === channel.id ? 'active' : ''}`}
            onClick={() => selectChannel(channel.id)}
          >
            <Hash className="channel-hash" size={16} />
            <span className="channel-name">{channel.name}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {messages.map((msg, index) => (
            <div key={index} style={{ fontSize: '13px' }}>
              <span style={{ color: '#06b6d4', fontWeight: 600 }}>{msg.user}</span>
              <span style={{ color: 'var(--c-text4)', marginLeft: '8px', fontSize: '11px' }}>{msg.time}</span>
              <p style={{ color: 'var(--c-text2)', marginTop: '2px' }}>{msg.text}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="form-input"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder="Message..."
            onKeyPress={e => e.key === 'Enter' && sendMessage()}
            style={{ flex: 1, padding: '8px 12px' }}
          />
          <button
            onClick={sendMessage}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(6, 182, 212, 0.2)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <Send size={14} color="#06b6d4" />
          </button>
        </div>
      </div>
    </div>
  );
}