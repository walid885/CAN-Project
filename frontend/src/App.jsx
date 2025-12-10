import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

const BACKEND_URL = 'http://localhost:5000';
const socket = io(BACKEND_URL);

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

export default function App() {
  const [frames, setFrames] = useState([]);
  const [stats, setStats] = useState({ by_car: { buckets: [] }, by_canId: { buckets: [] } });
  const [signalData, setSignalData] = useState({
    speed: [],
    temp: [],
    fuel: [],
    pressure: []
  });
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState({ car: 'all', canId: 'all' });
  const [frameRate, setFrameRate] = useState(0);
  const [showSendModal, setShowSendModal] = useState(false);
  const [customFrame, setCustomFrame] = useState({ 
    car: '1', 
    canId: '0x123',
    speed: '85',
    temp: '70',
    fuel: '45',
    pressure: '220'
  });
  const [visibleSignals, setVisibleSignals] = useState({
    speed: true,
    temp: true,
    fuel: true,
    pressure: true
  });
  const frameCountRef = useRef(0);

  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    
    socket.on('can_frame', (frame) => {
      frameCountRef.current++;
      setFrames(prev => [frame, ...prev.slice(0, 499)]);
      
      const timestamp = new Date(frame.timestamp).toLocaleTimeString();
      
      setSignalData(prev => {
        const newData = { ...prev };
        const maxPoints = 100;
        
        newData.speed = [...prev.speed.slice(-maxPoints), { time: timestamp, value: frame.speed }];
        newData.temp = [...prev.temp.slice(-maxPoints), { time: timestamp, value: frame.temp }];
        newData.fuel = [...prev.fuel.slice(-maxPoints), { time: timestamp, value: frame.fuel }];
        newData.pressure = [...prev.pressure.slice(-maxPoints), { time: timestamp, value: frame.pressure }];
        
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
    fetch(`${BACKEND_URL}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        car: parseInt(customFrame.car),
        canId: customFrame.canId,
        speed: parseInt(customFrame.speed),
        temp: parseInt(customFrame.temp),
        fuel: parseInt(customFrame.fuel),
        pressure: parseInt(customFrame.pressure)
      })
    }).then(() => {
      setShowSendModal(false);
      alert('Frame sent successfully!');
    });
  };

  const saveFrames = () => {
    const csv = ['ID,Car,CAN ID,Speed,Temp,Fuel,Pressure,Timestamp',
      ...frames.map(f => `${f.id},${f.car},${f.canId},${f.speed},${f.temp},${f.fuel},${f.pressure},${f.timestamp}`)
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
      ...signalData.speed.map(d => d.time),
      ...signalData.temp.map(d => d.time),
      ...signalData.fuel.map(d => d.time),
      ...signalData.pressure.map(d => d.time)
    ])].slice(-100);
    
    return allTimes.map(time => ({
      time,
      speed: signalData.speed.find(d => d.time === time)?.value || null,
      temp: signalData.temp.find(d => d.time === time)?.value || null,
      fuel: signalData.fuel.find(d => d.time === time)?.value || null,
      pressure: signalData.pressure.find(d => d.time === time)?.value || null
    }));
  };

  const filteredFrames = frames.filter(f => {
    if (filter.car !== 'all' && f.car !== parseInt(filter.car)) return false;
    if (filter.canId !== 'all' && f.canId !== filter.canId) return false;
    return true;
  });
  
  const uniqueCanIds = [...new Set(frames.map(f => f.canId))];
  
  const canIdPieData = stats?.by_canId?.buckets?.map(b => ({
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
          title="Car 1 (0x123)" 
          value={stats?.by_car?.buckets?.find(b => b.key === 1)?.doc_count || 0}
          color="#8b5cf6"
          icon="🚗"
          pulse
        />
        <StatCard 
          title="Car 2 (0x456)" 
          value={stats?.by_car?.buckets?.find(b => b.key === 2)?.doc_count || 0}
          color="#ec4899"
          icon="🚙"
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
                {key === 'speed' ? 'Speed (km/h)' : key === 'temp' ? 'Temperature (°C)' : key === 'fuel' ? 'Fuel (%)' : 'Pressure (kPa)'}
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
            {visibleSignals.speed && <Line type="monotone" dataKey="speed" stroke="#3b82f6" strokeWidth={2} dot={false} name="Speed (km/h)" />}
            {visibleSignals.temp && <Line type="monotone" dataKey="temp" stroke="#ec4899" strokeWidth={2} dot={false} name="Temp (°C)" />}
            {visibleSignals.fuel && <Line type="monotone" dataKey="fuel" stroke="#f59e0b" strokeWidth={2} dot={false} name="Fuel (%)" />}
            {visibleSignals.pressure && <Line type="monotone" dataKey="pressure" stroke="#10b981" strokeWidth={2} dot={false} name="Pressure (kPa)" />}
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
            <BarChart data={stats?.by_canId?.buckets || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="key" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={{ background: 'white', border: '1px solid #e2e8f0' }} />
              <Bar dataKey="doc_count" fill="#3b82f6">
                {(stats?.by_canId?.buckets || []).map((entry, index) => (
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
            value={filter.car}
            onChange={e => setFilter(f => ({ ...f, car: e.target.value }))}
            style={selectStyle}
          >
            <option value="all">All Cars</option>
            <option value="1">Car 1 (0x123)</option>
            <option value="2">Car 2 (0x456)</option>
          </select>
          
          <select 
            value={filter.canId}
            onChange={e => setFilter(f => ({ ...f, canId: e.target.value }))}
            style={selectStyle}
          >
            <option value="all">All CAN IDs</option>
            {uniqueCanIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>

          <button onClick={() => setFilter({ car: 'all', canId: 'all' })} style={buttonStyle('#64748b')}>
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
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Car</th>
                <th style={thStyle}>CAN ID</th>
                <th style={thStyle}>Speed</th>
                <th style={thStyle}>Temp</th>
                <th style={thStyle}>Fuel</th>
                <th style={thStyle}>Pressure</th>
                <th style={thStyle}>Time</th>
              </tr>
            </thead>
            <tbody>
              {filteredFrames.map((f, i) => (
                <tr key={i} style={{ 
                  borderBottom: '1px solid #e2e8f0',
                  background: i % 2 === 0 ? 'white' : '#f8fafc'
                }}>
                  <td style={tdStyle}>{f.id}</td>
                  <td style={tdStyle}>
                    <span style={{ 
                      color: f.car === 1 ? '#8b5cf6' : '#ec4899',
                      fontWeight: 600
                    }}>
                      {f.car === 1 ? '🚗' : '🚙'} Car {f.car}
                    </span>
                  </td>
                  <td style={tdStyle}>{f.canId}</td>
                  <td style={{ ...tdStyle, color: '#3b82f6', fontWeight: 600 }}>
                    {f.speed} km/h
                  </td>
                  <td style={{ ...tdStyle, color: '#ec4899', fontWeight: 600 }}>
                    {f.temp} °C
                  </td>
                  <td style={{ ...tdStyle, color: '#f59e0b', fontWeight: 600 }}>
                    {f.fuel} %
                  </td>
                  <td style={{ ...tdStyle, color: '#10b981', fontWeight: 600 }}>
                    {f.pressure} kPa
                  </td>
                  <td style={{ ...tdStyle, fontSize: 11 }}>
                    {new Date(f.timestamp).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
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
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 5 }}>Car</label>
                <select 
                  value={customFrame.car}
                  onChange={e => setCustomFrame({...customFrame, car: e.target.value})}
                  style={inputStyle}
                >
                  <option value="1">Car 1</option>
                  <option value="2">Car 2</option>
                </select>
              </div>
              
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 5 }}>CAN ID</label>
                <select 
                  value={customFrame.canId}
                  onChange={e => setCustomFrame({...customFrame, canId: e.target.value})}
                  style={inputStyle}
                >
                  <option value="0x123">0x123 - Car 1</option>
                  <option value="0x456">0x456 - Car 2</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 15 }}>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 5 }}>Speed (km/h)</label>
                <input 
                  type="number"
                  value={customFrame.speed}
                  onChange={e => setCustomFrame({...customFrame, speed: e.target.value})}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 5 }}>Temperature (°C)</label>
                <input 
                  type="number"
                  value={customFrame.temp}
                  onChange={e => setCustomFrame({...customFrame, temp: e.target.value})}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 5 }}>Fuel (%)</label>
                <input 
                  type="number"
                  value={customFrame.fuel}
                  onChange={e => setCustomFrame({...customFrame, fuel: e.target.value})}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 5 }}>Pressure (kPa)</label>
                <input 
                  type="number"
                  value={customFrame.pressure}
                  onChange={e => setCustomFrame({...customFrame, pressure: e.target.value})}
                  style={inputStyle}
                />
              </div>
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