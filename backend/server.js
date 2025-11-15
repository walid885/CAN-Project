// backend/server.js
const express = require('express');
const mqtt = require('mqtt');
const { Client } = require('@elastic/elasticsearch');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const mqttClient = mqtt.connect('mqtt://mosquitto:1883');
const esClient = new Client({ node: 'http://elasticsearch:9200' });

const INDEX_NAME = 'can-frames';

async function initElasticsearch() {
  const exists = await esClient.indices.exists({ index: INDEX_NAME });
  if (!exists) {
    await esClient.indices.create({
      index: INDEX_NAME,
      body: {
        mappings: {
          properties: {
            node_id: { type: 'integer' },
            can_id: { type: 'keyword' },
            data: { type: 'integer' },
            dlc: { type: 'integer' },
            timestamp: { type: 'date' }
          }
        }
      }
    });
  }
}

mqttClient.on('connect', () => {
  console.log('MQTT connected');
  mqttClient.subscribe('can/frames');
});

mqttClient.on('message', async (topic, message) => {
  const frame = JSON.parse(message.toString());
  
  await esClient.index({
    index: INDEX_NAME,
    body: {
      ...frame,
      timestamp: new Date(frame.timestamp * 1000)
    }
  });
  
  io.emit('can_frame', frame);
});

app.get('/api/frames', async (req, res) => {
  const { from = 'now-1h', size = 1000 } = req.query;
  
  const result = await esClient.search({
    index: INDEX_NAME,
    body: {
      size,
      sort: [{ timestamp: 'desc' }],
      query: {
        range: {
          timestamp: { gte: from }
        }
      }
    }
  });
  
  res.json(result.hits.hits.map(hit => hit._source));
});

app.get('/api/stats', async (req, res) => {
  const result = await esClient.search({
    index: INDEX_NAME,
    body: {
      size: 0,
      aggs: {
        by_node: {
          terms: { field: 'node_id' }
        },
        by_can_id: {
          terms: { field: 'can_id' }
        }
      }
    }
  });
  
  res.json(result.aggregations);
});

io.on('connection', (socket) => {
  console.log('WebSocket client connected');
});

initElasticsearch().then(() => {
  server.listen(5000, () => console.log('Backend running on 5000'));
});