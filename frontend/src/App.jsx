// frontend/src/App.jsx
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

const BACKEND_URL = 'http://localhost:5000';
const socket = io(BACKEND_URL);

const COLORS = ['#00ff00', '#00ffff', '#ff00ff', '#ffff00', '#ff6600'];

export default function App() {
  const [frames, setFrames] = useState([]);
  const [stats, setStats] = useState({ by_node: { buckets: [] }, by_can_id: { buckets: [] } });
  const [chartData, setChartData] = useState([]);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState({ nodeId: 'all', canId: 'all' });
  const [frameRate, setFrameRate] = useState(0);
  const frameCountRef = useRef(0);

  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    
    socket.on('can_frame', (frame) => {
      frameCountRef.current++;
      setFrames(prev => [frame, ...prev.slice(0, 499)]);
      
      setChartData(prev => {
        const newData = [...prev.slice(-99), {
          time: new Date(frame.timestamp * 1000).toLocaleTimeString(),
          node1: frame.node_id === 1 ? (frame.data[0] || 0) : null,
          node2: frame.node_id === 2 ? (frame.data[0] || 0) : null,
          timestamp: frame.timestamp
        }];
        return newData;
      });
    });

    const statsInterval = setInterval(() => {
      fetch(`${BACKEND_URL}/api/stats`)
        .then(r => r.json())
        .then(setStats)
        .catch(console.error);
    }, 5000);

    const rateInterval = setInterval(() => {
      setFrameRate(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('can_frame');
      clearInterval(statsInterval);
      clearInterval(rateInterval);
    };
  }, []);

  const filteredFrames = frames.filter(f => {
    if (filter.nodeId !== 'all' && f.node_id !== parseInt(filter.nodeId)) return false;
    if (filter.canId !== 'all' && f.can_id !== filter.canId) return false;
    return true;
  });

  const uniqueCanIds = [...new Set(frames.map(f => f.can_id))];
  
  const canIdPieData = stats.by_can_id.buckets?.map(b => ({
    name: b.key,
    value: b.doc_count
  })) || [];

  return (
    <div style={{ padding: 20, maxWidth: '1800px', margin: '0 auto' }}>
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 30,
        borderBottom: '2px solid #00ff00',
        paddingBottom: 10
      }}>
        <h1 style={{ fontSize: 32, letterSpacing: 2 }}>◉ CAN BUS MONITOR</h1>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ 
            background: connected ? '#00ff00' : '#ff0000',
            width: 16,
            height: 16,
            borderRadius: '50%',
            boxShadow: `0 0 15px ${connected ? '#00ff00' : '#ff0000'}`,
            animation: connected ? 'pulse 2s infinite' : 'none'
          }}/>
          <span style={{ fontSize: 18, fontWeight: 'bold' }}>{frameRate} fps</span>
        </div>
      </header>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: 20,
        marginBottom: 30
      }}>
        <StatCard title="TOTAL FRAMES" value={frames.length} color="#00ff00" />
        <StatCard 
          title="NODE 1" 
          value={stats.by_node.buckets?.find(b => b.key === 1)?.doc_count || 0}
          color="#00ffff"
          pulse
        />
        <StatCard 
          title="NODE 2" 
          value={stats.by_node.buckets?.find(b => b.key === 2)?.doc_count || 0}
          color="#ff00ff"
          pulse
        />
        <StatCard title="FRAME RATE" value={`${frameRate} Hz`} color="#ffff00" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 30 }}>
        <div>
          <h3 style={{ marginBottom: 15 }}>REAL-TIME DATA STREAM</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="time" stroke="#00ff00" style={{ fontSize: 10 }} />
              <YAxis stroke="#00ff00" />
              <Tooltip 
                contentStyle={{ background: '#0a0a0a', border: '1px solid #00ff00', fontSize: 12 }}
                labelStyle={{ color: '#00ff00' }}
              />
              <Legend />
              <Line type="monotone" dataKey="node1" stroke="#00ffff" strokeWidth={2} dot={false} name="Node 1" />
              <Line type="monotone" dataKey="node2" stroke="#ff00ff" strokeWidth={2} dot={false} name="Node 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h3 style={{ marginBottom: 15 }}>CAN ID DISTRIBUTION</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={canIdPieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {canIdPieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ background: '#0a0a0a', border: '1px solid #00ff00' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ marginBottom: 30 }}>
        <h3 style={{ marginBottom: 15 }}>CAN ID FREQUENCY</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={stats.by_can_id.buckets || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
            <XAxis dataKey="key" stroke="#00ff00" />
            <YAxis stroke="#00ff00" />
            <Tooltip 
              contentStyle={{ background: '#0a0a0a', border: '1px solid #00ff00' }}
            />
            <Bar dataKey="doc_count" fill="#00ff00">
              {(stats.by_can_id.buckets || []).map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ 
        background: '#0f0f0f', 
        padding: 15, 
        borderRadius: 5,
        marginBottom: 20,
        border: '1px solid #00ff00'
      }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 'bold' }}>NODE:</span>
            <select 
              value={filter.nodeId}
              onChange={e => setFilter(f => ({ ...f, nodeId: e.target.value }))}
              style={{ 
                background: '#0a0a0a',
                color: '#00ff00',
                border: '1px solid #00ff00',
                padding: 8,
                borderRadius: 3,
                fontSize: 14
              }}
            >
              <option value="all">ALL</option>
              <option value="1">NODE 1</option>
              <option value="2">NODE 2</option>
            </select>
          </label>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 'bold' }}>CAN ID:</span>
            <select 
              value={filter.canId}
              onChange={e => setFilter(f => ({ ...f, canId: e.target.value }))}
              style={{ 
                background: '#0a0a0a',
                color: '#00ff00',
                border: '1px solid #00ff00',
                padding: 8,
                borderRadius: 3,
                fontSize: 14
              }}
            >
              <option value="all">ALL</option>
              {uniqueCanIds.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>

          <button
            onClick={() => setFilter({ nodeId: 'all', canId: 'all' })}
            style={{
              background: '#0a0a0a',
              color: '#00ff00',
              border: '1px solid #00ff00',
              padding: '8px 20px',
              cursor: 'pointer',
              borderRadius: 3,
              fontSize: 14,
              fontWeight: 'bold',
              transition: 'all 0.3s'
            }}
            onMouseEnter={e => e.target.style.background = '#00ff00'}
            onMouseLeave={e => e.target.style.background = '#0a0a0a'}
          >
            RESET FILTER
          </button>
          
          <div style={{ marginLeft: 'auto', fontSize: 14 }}>
            Showing {filteredFrames.length} of {frames.length} frames
          </div>
        </div>
      </div>

      <div style={{ 
        background: '#0f0f0f',
        border: '1px solid #1a1a1a',
        borderRadius: 5,
        overflow: 'hidden'
      }}>
        <h3 style={{ padding: 15, borderBottom: '1px solid #00ff00', background: '#0a0a0a' }}>
          LIVE FRAMES
        </h3>
        <div style={{ maxHeight: 500, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 10 }}>
              <tr>
                <th style={thStyle}>NODE</th>
                <th style={thStyle}>CAN ID</th>
                <th style={thStyle}>DLC</th>
                <th style={thStyle}>DATA (HEX)</th>
                <th style={thStyle}>TIMESTAMP</th>
              </tr>
            </thead>
            <tbody>
              {filteredFrames.map((f, i) => (
                <tr 
                  key={i} 
                  style={{ 
                    borderBottom: '1px solid #1a1a1a',
                    background: i % 2 === 0 ? '#0a0a0a' : '#0f0f0f',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#0a0a0a' : '#0f0f0f'}
                >
                  <td style={tdStyle}>
                    <span style={{ 
                      color: f.node_id === 1 ? '#00ffff' : '#ff00ff',
                      fontWeight: 'bold',
                      fontSize: 16
                    }}>
                      ● {f.node_id}
                    </span>
                  </td>
                  <td style={tdStyle}>{f.can_id}</td>
                  <td style={tdStyle}>{f.dlc}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>
                    {f.data.map(d => d.toString(16).toUpperCase().padStart(2, '0')).join(' ')}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 11 }}>
                    {new Date(f.timestamp * 1000).toLocaleTimeString()}.
                    {Math.floor((f.timestamp % 1) * 1000).toString().padStart(3, '0')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}

function StatCard({ title, value, color, pulse }) {
  return (
    <div style={{
      background: '#0f0f0f',
      padding: 20,
      borderRadius: 5,
      border: `2px solid ${color}`,
      boxShadow: `0 0 15px ${color}40`,
      position: 'relative',
      overflow: 'hidden'
    }}>
      {pulse && (
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: color,
          animation: 'pulse 2s infinite',
          boxShadow: `0 0 10px ${color}`
        }}/>
      )}
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 36, color, fontWeight: 'bold' }}>{value}</div>
    </div>
  );
}

const thStyle = {
  padding: '12px 15px',
  textAlign: 'left',
  borderBottom: '2px solid #00ff00',
  fontWeight: 'bold',
  fontSize: 14
};

const tdStyle = {
  padding: '10px 15px',
  textAlign: 'left'
};