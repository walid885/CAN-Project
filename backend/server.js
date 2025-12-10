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
const MQTT_PORT = process.env.MQTT_PORT || 1884;
const ES_HOST = process.env.ES_HOST || 'localhost:9200';

const mqttClient = mqtt.connect(`mqtt://${MQTT_BROKER}:${MQTT_PORT}`);
const esClient = new Client({ node: `http://${ES_HOST}` });

const INDEX_NAME = 'can-frames';
let frameBuffer = [];
let bufferSize = 0;
const MAX_BUFFER = 50;
const FLUSH_INTERVAL = 1000;

async function initElasticsearch() {
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
  }
}

async function flushBuffer() {
  if (frameBuffer.length === 0) return;
  
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
  
  frameBuffer = [];
  bufferSize = 0;
}

setInterval(flushBuffer, FLUSH_INTERVAL);

mqttClient.on('connect', () => {
  console.log('MQTT connected to', MQTT_BROKER);
  mqttClient.subscribe('can/frames', (err) => {
    if (err) console.error('MQTT subscribe error:', err);
    else console.log('Subscribed to can/frames');
  });
});

mqttClient.on('message', async (topic, message) => {
  try {
    const frame = JSON.parse(message.toString());
    
    // Add timestamp if not present
    const doc = {
      ...frame,
      timestamp: frame.timestamp || new Date().toISOString()
    };
    
    frameBuffer.push(doc);
    bufferSize++;
    
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
    elasticsearch: true,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/frames', async (req, res) => {
  try {
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
          },
          time_histogram: {
            date_histogram: {
              field: 'timestamp',
              fixed_interval: '1m'
            }
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
  
  mqttClient.publish('can/frames', JSON.stringify(frame));
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
  });
}).catch(err => {
  console.error('Startup error:', err);
  process.exit(1);
});