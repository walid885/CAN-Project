// frontend/src/App.jsx
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

const BACKEND_URL = 'http://localhost:5000';
const socket = io(BACKEND_URL);

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

const decodeSignal = (canId, data) => {
  const decoders = {
    '0x100': { name: 'Engine Speed', value: (data[0] << 8 | data[1]) * 0.25, unit: 'RPM' },
    '0x200': { name: 'Vehicle Speed', value: data[0], unit: 'km/h' },
    '0x300': { name: 'Engine Temp', value: data[0] - 40, unit: '°C' },
    '0x400': { name: 'Fuel Level', value: (data[0] / 255 * 100).toFixed(1), unit: '%' },
    '0x500': { name: 'Battery Voltage', value: (data[0] * 0.1).toFixed(2), unit: 'V' }
  };
  return decoders[canId] || { name: 'Unknown', value: data[0], unit: 'raw' };
};

export default function App() {
  const [frames, setFrames] = useState([]);
  const [stats, setStats] = useState({ by_node: { buckets: [] }, by_can_id: { buckets: [] } });
  const [signalData, setSignalData] = useState({
    rpm: [],
    speed: [],
    temp: [],
    fuel: [],
    voltage: []
  });
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState({ nodeId: 'all', canId: 'all' });
  const [frameRate, setFrameRate] = useState(0);
  const [showSendModal, setShowSendModal] = useState(false);
  const [customFrame, setCustomFrame] = useState({ 
    node_id: '1', 
    can_id: '0x100', 
    byte0: '00',
    byte1: '00', 
    byte2: '00', 
    byte3: '00',
    byte4: '00',
    byte5: '00',
    byte6: '00',
    byte7: '00'
  });
  const [visibleSignals, setVisibleSignals] = useState({
    rpm: true,
    speed: true,
    temp: true,
    fuel: true,
    voltage: true
  });
  const frameCountRef = useRef(0);

  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    
    socket.on('can_frame', (frame) => {
      frameCountRef.current++;
      setFrames(prev => [frame, ...prev.slice(0, 499)]);
      
      const decoded = decodeSignal(frame.can_id, frame.data);
      const timestamp = new Date(frame.timestamp * 1000).toLocaleTimeString();
      
      setSignalData(prev => {
        const newData = { ...prev };
        const maxPoints = 100;
        
        if (frame.can_id === '0x100') {
          newData.rpm = [...prev.rpm.slice(-maxPoints), { time: timestamp, value: parseFloat(decoded.value) }];
        } else if (frame.can_id === '0x200') {
          newData.speed = [...prev.speed.slice(-maxPoints), { time: timestamp, value: parseFloat(decoded.value) }];
        } else if (frame.can_id === '0x300') {
          newData.temp = [...prev.temp.slice(-maxPoints), { time: timestamp, value: parseFloat(decoded.value) }];
        } else if (frame.can_id === '0x400') {
          newData.fuel = [...prev.fuel.slice(-maxPoints), { time: timestamp, value: parseFloat(decoded.value) }];
        } else if (frame.can_id === '0x500') {
          newData.voltage = [...prev.voltage.slice(-maxPoints), { time: timestamp, value: parseFloat(decoded.value) }];
        }
        
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

  const sendFrame = () => {
    const dataArray = [
      customFrame.byte0, customFrame.byte1, customFrame.byte2, customFrame.byte3,
      customFrame.byte4, customFrame.byte5, customFrame.byte6, customFrame.byte7
    ].map(b => parseInt(b, 16));
    
    fetch(`${BACKEND_URL}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        node_id: parseInt(customFrame.node_id),
        can_id: customFrame.can_id,
        data: dataArray,
        dlc: 8
      })
    }).then(() => {
      setShowSendModal(false);
      alert('Frame sent successfully!');
    });
  };

  const saveFrames = () => {
    const csv = ['Node,CAN ID,DLC,Data,Timestamp',
      ...frames.map(f => `${f.node_id},${f.can_id},${f.dlc},${f.data.join(' ')},${f.timestamp}`)
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `can_frames_${Date.now()}.csv`;
    a.click();
  };

  const mergeSignalData = () => {
    const allTimes = [...new Set([
      ...signalData.rpm.map(d => d.time),
      ...signalData.speed.map(d => d.time),
      ...signalData.temp.map(d => d.time),
      ...signalData.fuel.map(d => d.time),
      ...signalData.voltage.map(d => d.time)
    ])].slice(-100);
    
    return allTimes.map(time => ({
      time,
      rpm: signalData.rpm.find(d => d.time === time)?.value || null,
      speed: signalData.speed.find(d => d.time === time)?.value || null,
      temp: signalData.temp.find(d => d.time === time)?.value || null,
      fuel: signalData.fuel.find(d => d.time === time)?.value || null,
      voltage: signalData.voltage.find(d => d.time === time)?.value || null
    }));
  };

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

  const chartData = mergeSignalData();

  return (
    <div style={{ padding: 20, maxWidth: '1800px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh' }}>
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 30,
        background: 'white',
        padding: 20,
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div>
          <h1 style={{ fontSize: 28, color: '#1e293b', marginBottom: 5 }}>CAN Bus Monitor</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>Real-time vehicle network analysis</p>
        </div>
        <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
          <div style={{ 
            background: connected ? '#10b981' : '#ef4444',
            width: 12,
            height: 12,
            borderRadius: '50%',
            boxShadow: `0 0 10px ${connected ? '#10b981' : '#ef4444'}`,
            animation: connected ? 'pulse 2s infinite' : 'none'
          }}/>
          <span style={{ fontSize: 16, color: '#475569', fontWeight: 600 }}>{frameRate} fps</span>
        </div>
      </header>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 15,
        marginBottom: 20
      }}>
        <StatCard title="Total Frames" value={frames.length} color="#3b82f6" icon="📊" />
        <StatCard 
  title="Node 1" 
  value={stats?.by_node?.buckets?.find(b => b.key === 1)?.doc_count || 0}
  color="#8b5cf6"
  icon="🔵"
  pulse
/>

<StatCard 
  title="Node 2" 
  value={stats?.by_node?.buckets?.find(b => b.key === 2)?.doc_count || 0}
  color="#ec4899"
  icon="🟣"
  pulse
/>
        <StatCard title="Frame Rate" value={`${frameRate} Hz`} color="#f59e0b" icon="⚡" />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setShowSendModal(true)} style={buttonStyle('#3b82f6')}>
          📤 Send Frame
        </button>
        <button onClick={saveFrames} style={buttonStyle('#10b981')}>
          💾 Save Frames
        </button>
        <button onClick={() => setFrames([])} style={buttonStyle('#ef4444')}>
          🗑️ Clear
        </button>
      </div>

      <div style={cardStyle}>
        <h3 style={titleStyle}>Real-Time Signal Monitor</h3>
        
        <div style={{ display: 'flex', gap: 15, marginBottom: 15, flexWrap: 'wrap' }}>
          {Object.entries(visibleSignals).map(([key, value]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={value}
                onChange={() => setVisibleSignals(prev => ({ ...prev, [key]: !prev[key] }))}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: 14, color: '#1e293b', fontWeight: 500, textTransform: 'capitalize' }}>
                {key === 'rpm' ? 'Engine RPM' : key === 'speed' ? 'Vehicle Speed' : key === 'temp' ? 'Temperature' : key === 'fuel' ? 'Fuel Level' : 'Battery Voltage'}
              </span>
            </label>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="time" stroke="#64748b" style={{ fontSize: 10 }} />
            <YAxis stroke="#64748b" />
            <Tooltip contentStyle={{ background: 'white', border: '1px solid #e2e8f0' }} />
            <Legend />
            {visibleSignals.rpm && <Line type="monotone" dataKey="rpm" stroke="#3b82f6" strokeWidth={2} dot={false} name="RPM" />}
            {visibleSignals.speed && <Line type="monotone" dataKey="speed" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Speed (km/h)" />}
            {visibleSignals.temp && <Line type="monotone" dataKey="temp" stroke="#ec4899" strokeWidth={2} dot={false} name="Temp (°C)" />}
            {visibleSignals.fuel && <Line type="monotone" dataKey="fuel" stroke="#f59e0b" strokeWidth={2} dot={false} name="Fuel (%)" />}
            {visibleSignals.voltage && <Line type="monotone" dataKey="voltage" stroke="#10b981" strokeWidth={2} dot={false} name="Voltage (V)" />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20, marginBottom: 20 }}>
        <div style={cardStyle}>
          <h3 style={titleStyle}>CAN ID Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={canIdPieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                dataKey="value"
              >
                {canIdPieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={cardStyle}>
          <h3 style={titleStyle}>CAN ID Frequency</h3>
          <ResponsiveContainer width="100%" height={300}>
          <BarChart data={stats?.by_can_id?.buckets || []}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="key" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={{ background: 'white', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="doc_count" fill="#3b82f6">
                {(stats.by_can_id.buckets || []).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 15, alignItems: 'center', flexWrap: 'wrap', marginBottom: 15 }}>
          <select 
            value={filter.nodeId}
            onChange={e => setFilter(f => ({ ...f, nodeId: e.target.value }))}
            style={selectStyle}
          >
            <option value="all">All Nodes</option>
            <option value="1">Node 1</option>
            <option value="2">Node 2</option>
          </select>
          
          <select 
            value={filter.canId}
            onChange={e => setFilter(f => ({ ...f, canId: e.target.value }))}
            style={selectStyle}
          >
            <option value="all">All CAN IDs</option>
            {uniqueCanIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>

          <button onClick={() => setFilter({ nodeId: 'all', canId: 'all' })} style={buttonStyle('#64748b')}>
            Reset
          </button>
          
          <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 14 }}>
            {filteredFrames.length} / {frames.length} frames
          </span>
        </div>

        <div style={{ maxHeight: 500, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 10 }}>
              <tr>
                <th style={thStyle}>Node</th>
                <th style={thStyle}>CAN ID</th>
                <th style={thStyle}>Signal</th>
                <th style={thStyle}>Value</th>
                <th style={thStyle}>DLC</th>
                <th style={thStyle}>Raw Data</th>
                <th style={thStyle}>Time</th>
              </tr>
            </thead>
            <tbody>
              {filteredFrames.map((f, i) => {
                const decoded = decodeSignal(f.can_id, f.data);
                return (
                  <tr key={i} style={{ 
                    borderBottom: '1px solid #e2e8f0',
                    background: i % 2 === 0 ? 'white' : '#f8fafc'
                  }}>
                    <td style={tdStyle}>
                      <span style={{ 
                        color: f.node_id === 1 ? '#8b5cf6' : '#ec4899',
                        fontWeight: 600
                      }}>
                        ● Node {f.node_id}
                      </span>
                    </td>
                    <td style={tdStyle}>{f.can_id}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{decoded.name}</td>
                    <td style={{ ...tdStyle, color: '#3b82f6', fontWeight: 600 }}>
                      {decoded.value} {decoded.unit}
                    </td>
                    <td style={tdStyle}>{f.dlc}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>
                      {f.data.map(d => d.toString(16).toUpperCase().padStart(2, '0')).join(' ')}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11 }}>
                      {new Date(f.timestamp * 1000).toLocaleTimeString()}.
                      {Math.floor((f.timestamp % 1) * 1000).toString().padStart(3, '0')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showSendModal && (
        <div style={modalOverlay}>
          <div style={modalContent}>
            <h3 style={{ marginBottom: 20, color: '#1e293b' }}>Send Custom CAN Frame</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 15 }}>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 5 }}>Node ID</label>
                <select 
                  value={customFrame.node_id}
                  onChange={e => setCustomFrame({...customFrame, node_id: e.target.value})}
                  style={inputStyle}
                >
                  <option value="1">Node 1</option>
                  <option value="2">Node 2</option>
                </select>
              </div>
              
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 5 }}>CAN ID</label>
                <select 
                  value={customFrame.can_id}
                  onChange={e => setCustomFrame({...customFrame, can_id: e.target.value})}
                  style={inputStyle}
                >
                  <option value="0x100">0x100 - Engine Speed</option>
                  <option value="0x200">0x200 - Vehicle Speed</option>
                  <option value="0x300">0x300 - Engine Temp</option>
                  <option value="0x400">0x400 - Fuel Level</option>
                  <option value="0x500">0x500 - Battery Voltage</option>
                </select>
              </div>
            </div>

            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 5 }}>Data Bytes (Hex)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 5, marginBottom: 15 }}>
              {[0,1,2,3,4,5,6,7].map(i => (
                <input 
                  key={i}
                  placeholder={`B${i}`}
                  maxLength={2}
                  value={customFrame[`byte${i}`]}
                  onChange={e => setCustomFrame({...customFrame, [`byte${i}`]: e.target.value.toUpperCase()})}
                  style={{ ...inputStyle, textAlign: 'center', fontFamily: 'monospace' }}
                />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={sendFrame} style={{...buttonStyle('#3b82f6'), flex: 1}}>Send Frame</button>
              <button onClick={() => setShowSendModal(false)} style={{...buttonStyle('#64748b'), flex: 1}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}

function StatCard({ title, value, color, icon, pulse }) {
  return (
    <div style={{
      background: 'white',
      padding: 20,
      borderRadius: 8,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${color}`,
      position: 'relative'
    }}>
      {pulse && (
        <div style={{
          position: 'absolute',
          top: 15,
          right: 15,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          animation: 'pulse 2s infinite'
        }}/>
      )}
      <div style={{ fontSize: 24, marginBottom: 5 }}>{icon}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 28, color: '#1e293b', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const cardStyle = {
  background: 'white',
  padding: 20,
  borderRadius: 8,
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
};

const titleStyle = {
  marginBottom: 15,
  color: '#1e293b',
  fontSize: 18,
  fontWeight: 600
};

const buttonStyle = (color) => ({
  background: color,
  color: 'white',
  border: 'none',
  padding: '10px 20px',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
  transition: 'all 0.2s'
});

const selectStyle = {
  background: 'white',
  color: '#1e293b',
  border: '1px solid #e2e8f0',
  padding: 8,
  borderRadius: 6,
  fontSize: 14
};

const inputStyle = {
  width: '100%',
  padding: 10,
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: 14
};

const modalOverlay = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};

const modalContent = {
  background: 'white',
  padding: 30,
  borderRadius: 8,
  minWidth: 500,
  boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
};

const thStyle = {
  padding: 12,
  textAlign: 'left',
  borderBottom: '2px solid #e2e8f0',
  fontWeight: 600,
  fontSize: 13,
  color: '#475569'
};

const tdStyle = {
  padding: 12,
  fontSize: 13,
  color: '#1e293b'
};