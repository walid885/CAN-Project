// frontend/src/App.jsx
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const socket = io('http://localhost:5000');

export default function App() {
  const [frames, setFrames] = useState([]);
  const [stats, setStats] = useState({ by_node: [], by_can_id: [] });
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    socket.on('can_frame', (frame) => {
      setFrames(prev => [frame, ...prev.slice(0, 99)]);
      setChartData(prev => [...prev.slice(-50), {
        time: new Date(frame.timestamp * 1000).toLocaleTimeString(),
        value: frame.data[0] || 0
      }]);
    });

    fetch('http://localhost:5000/api/stats')
      .then(r => r.json())
      .then(setStats);

    return () => socket.off('can_frame');
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: 'monospace' }}>
      <h1>CAN Simulator Monitor</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div>
          <h3>Frames by Node</h3>
          {stats.by_node.buckets?.map(b => (
            <div key={b.key}>Node {b.key}: {b.doc_count}</div>
          ))}
        </div>
        <div>
          <h3>Frames by CAN ID</h3>
          {stats.by_can_id.buckets?.map(b => (
            <div key={b.key}>{b.key}: {b.doc_count}</div>
          ))}
        </div>
      </div>

      <LineChart width={800} height={300} data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="value" stroke="#8884d8" />
      </LineChart>

      <h3>Live CAN Frames</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Node</th>
            <th>CAN ID</th>
            <th>Data</th>
            <th>DLC</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {frames.map((f, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #ccc' }}>
              <td>{f.node_id}</td>
              <td>{f.can_id}</td>
              <td>{f.data.map(d => d.toString(16).padStart(2, '0')).join(' ')}</td>
              <td>{f.dlc}</td>
              <td>{new Date(f.timestamp * 1000).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}