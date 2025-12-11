// backend/server.js
const express = require('express');
const mqtt = require('mqtt');
const { Client } = require('@elastic/elasticsearch');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: '*',
    methods: ['GET', 'POST']
  } 
});

app.use(cors());
app.use(express.json());

const MQTT_BROKER = process.env.MQTT_BROKER || 'localhost';
const MQTT_PORT = process.env.MQTT_PORT || 1883; 
const ES_HOST = process.env.ES_HOST || '';

// Only initialize ES if host is provided
let esClient = null;
let esEnabled = false;

if (ES_HOST && ES_HOST !== 'false' && ES_HOST !== '') {
  esClient = new Client({ node: `http://${ES_HOST}` });
  esEnabled = true;
  console.log('Elasticsearch enabled:', ES_HOST);
} else {
  console.log('Elasticsearch disabled - running in-memory only');
}

const mqttClient = mqtt.connect(`mqtt://${MQTT_BROKER}:${MQTT_PORT}`);

const INDEX_NAME = 'can-frames';
let frameBuffer = [];
let bufferSize = 0;
const MAX_BUFFER = 50;
const FLUSH_INTERVAL = 1000;

// In-memory storage when ES is disabled
let inMemoryFrames = [];
const MAX_MEMORY_FRAMES = 10000;

async function initElasticsearch() {
  if (!esEnabled) return;
  
  try {
    const exists = await esClient.indices.exists({ index: INDEX_NAME });
    if (!exists) {
      await esClient.indices.create({
        index: INDEX_NAME,
        body: {
          mappings: {
            properties: {
              id: { type: 'long' },
              car: { type: 'integer' },
              canId: { type: 'keyword' },
              speed: { type: 'integer' },
              temp: { type: 'integer' },
              fuel: { type: 'integer' },
              pressure: { type: 'integer' },
              timestamp: { type: 'date' }
            }
          }
        }
      });
      console.log('Elasticsearch index created');
    }
  } catch (err) {
    console.error('Elasticsearch init error:', err.message);
    esEnabled = false;
  }
}

async function flushBuffer() {
  if (frameBuffer.length === 0) return;
  
  if (esEnabled && esClient) {
    const body = frameBuffer.flatMap(doc => [
      { index: { _index: INDEX_NAME } },
      doc
    ]);
    
    try {
      await esClient.bulk({ body, refresh: false });
      console.log(`Flushed ${frameBuffer.length} frames to ES`);
    } catch (err) {
      console.error('Bulk insert error:', err.message);
    }
  }
  
  frameBuffer = [];
  bufferSize = 0;
}

setInterval(flushBuffer, FLUSH_INTERVAL);

mqttClient.on('connect', () => {
  console.log('MQTT connected to', MQTT_BROKER);
  
  // FIXED: Subscribe to the correct topic that your phone gateway uses
  mqttClient.subscribe('vehicule/can', (err) => {
    if (err) {
      console.error('MQTT subscribe error:', err);
    } else {
      console.log('✓ Subscribed to vehicule/can');
    }
  });
});

mqttClient.on('message', async (topic, message) => {
  try {
    const frame = JSON.parse(message.toString());
    
    console.log('📡 Received frame:', frame);
    
    // Add timestamp if not present
    const doc = {
      ...frame,
      timestamp: frame.timestamp || new Date().toISOString()
    };
    
    // Store in buffer for ES
    frameBuffer.push(doc);
    bufferSize++;
    
    // Store in memory if ES disabled
    if (!esEnabled) {
      inMemoryFrames.unshift(doc);
      if (inMemoryFrames.length > MAX_MEMORY_FRAMES) {
        inMemoryFrames = inMemoryFrames.slice(0, MAX_MEMORY_FRAMES);
      }
    }
    
    if (bufferSize >= MAX_BUFFER) {
      await flushBuffer();
    }
    
    // Emit to WebSocket clients
    io.emit('can_frame', doc);
  } catch (err) {
    console.error('Message processing error:', err.message);
  }
});

mqttClient.on('error', (err) => {
  console.error('MQTT error:', err.message);
});

app.get('/health', (req, res) => {
  res.json({
    mqtt: mqttClient.connected,
    elasticsearch: esEnabled,
    inMemoryFrames: inMemoryFrames.length,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/frames', async (req, res) => {
  try {
    if (!esEnabled) {
      // Return from in-memory storage
      const { size = 1000, car, canId } = req.query;
      let filtered = inMemoryFrames;
      
      if (car) filtered = filtered.filter(f => f.car === parseInt(car));
      if (canId) filtered = filtered.filter(f => f.canId === canId);
      
      res.json(filtered.slice(0, parseInt(size)));
      return;
    }
    
    const { from = 'now-1h', size = 1000, car, canId } = req.query;
    
    const must = [
      { range: { timestamp: { gte: from } } }
    ];
    
    if (car) must.push({ term: { car: parseInt(car) } });
    if (canId) must.push({ term: { canId } });
    
    const result = await esClient.search({
      index: INDEX_NAME,
      body: {
        size: parseInt(size),
        sort: [{ timestamp: 'desc' }],
        query: { bool: { must } }
      }
    });
    
    res.json(result.hits.hits.map(hit => hit._source));
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    if (!esEnabled) {
      // Calculate stats from in-memory data
      const carCounts = {};
      const canIdCounts = {};
      let totalSpeed = 0, totalTemp = 0, totalFuel = 0, count = 0;
      
      inMemoryFrames.forEach(f => {
        carCounts[f.car] = (carCounts[f.car] || 0) + 1;
        canIdCounts[f.canId] = (canIdCounts[f.canId] || 0) + 1;
        if (f.speed) { totalSpeed += f.speed; count++; }
        if (f.temp) totalTemp += f.temp;
        if (f.fuel) totalFuel += f.fuel;
      });
      
      res.json({
        by_car: {
          buckets: Object.entries(carCounts).map(([key, doc_count]) => ({
            key: parseInt(key),
            doc_count
          }))
        },
        by_canId: {
          buckets: Object.entries(canIdCounts).map(([key, doc_count]) => ({
            key,
            doc_count
          }))
        },
        total_frames: { value: inMemoryFrames.length },
        avg_speed: { value: count > 0 ? totalSpeed / count : 0 },
        avg_temp: { value: count > 0 ? totalTemp / count : 0 },
        avg_fuel: { value: count > 0 ? totalFuel / count : 0 }
      });
      return;
    }
    
    const result = await esClient.search({
      index: INDEX_NAME,
      body: {
        size: 0,
        aggs: {
          by_car: {
            terms: { field: 'car', size: 10 }
          },
          by_canId: {
            terms: { field: 'canId', size: 20 }
          },
          total_frames: {
            value_count: { field: 'timestamp' }
          },
          avg_speed: {
            avg: { field: 'speed' }
          },
          avg_temp: {
            avg: { field: 'temp' }
          },
          avg_fuel: {
            avg: { field: 'fuel' }
          }
        }
      }
    });
    
    res.json(result.aggregations);
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/frames', async (req, res) => {
  try {
    if (!esEnabled) {
      inMemoryFrames = [];
      res.json({ deleted: true });
      return;
    }
    
    await esClient.deleteByQuery({
      index: INDEX_NAME,
      body: {
        query: { match_all: {} }
      }
    });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/simulate', (req, res) => {
  const { car = 1, canId = '0x123', speed = 85, temp = 70, fuel = 45, pressure = 220 } = req.body;
  
  const frame = {
    id: Date.now(),
    car,
    canId,
    speed,
    temp,
    fuel,
    pressure,
    timestamp: new Date().toISOString()
  };
  
  // Get sum of frames by CAN ID
app.get('/api/sum-by-id', async (req, res) => {
  try {
    if (!esEnabled) {
      const sums = { '0x123': 0, '0x124': 0 };
      inMemoryFrames.forEach(f => {
        if (f.canId === '0x123' || f.canId === '0x124') {
          sums[f.canId]++;
        }
      });
      res.json(sums);
      return;
    }
    
    const result = await esClient.search({
      index: INDEX_NAME,
      body: {
        size: 0,
        query: {
          terms: { canId: ['0x123', '0x456'] }
        },
        aggs: {
          by_id: {
            terms: { field: 'canId', size: 10 }
          }
        }
      }
    });
    
    const sums = { '0x123': 0, '0x456': 0 };
    result.aggregations.by_id.buckets.forEach(b => {
      sums[b.key] = b.doc_count;
    });
    
    res.json(sums);
  } catch (err) {
    console.error('Sum error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get latest frame
app.get('/api/latest', async (req, res) => {
  try {
    if (!esEnabled) {
      res.json(inMemoryFrames[0] || null);
      return;
    }
    
    const result = await esClient.search({
      index: INDEX_NAME,
      body: {
        size: 1,
        sort: [{ timestamp: 'desc' }]
      }
    });
    
    res.json(result.hits.hits[0]?._source || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

  // Publish to the correct topic
  mqttClient.publish('vehicule/can', JSON.stringify(frame));
  res.json({ sent: frame });
});

io.on('connection', (socket) => {
  console.log('WebSocket client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('WebSocket client disconnected:', socket.id);
  });
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, flushing buffer...');
  await flushBuffer();
  mqttClient.end();
  process.exit(0);
});

initElasticsearch().then(() => {
  server.listen(5000, '0.0.0.0', () => {
    console.log('Backend running on 0.0.0.0:5000');
    console.log('MQTT Broker:', MQTT_BROKER);
    console.log('Elasticsearch:', esEnabled ? 'enabled' : 'disabled (in-memory mode)');
  });
}).catch(err => {
  console.error('Startup error:', err);
  process.exit(1);
});