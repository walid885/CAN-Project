# CAN Bus Simulator System

Real-time CAN bus monitoring with MQTT, Elasticsearch, and Grafana.

## Architecture
```
STM32 Nodes (Python) → MQTT (Mosquitto) → Backend (Node.js) → Frontend (React)
                              ↓
                        Elasticsearch → Grafana
```

## Components

- **STM32 Simulator**: Python script emulating 2 CAN nodes
- **MQTT Broker**: Mosquitto for message routing
- **Backend**: Node.js server with WebSocket support
- **Frontend**: React dashboard with live charts
- **Database**: Elasticsearch for time-series storage
- **Visualization**: Grafana for advanced analytics

## Prerequisites
```bash
docker
docker-compose
node.js >= 18
python >= 3.8
```

## Installation
```bash
git clone <repo>
cd can-simulator
chmod +x run.sh
pip install paho-mqtt
```

## Quick Start
```bash
# Start all services
docker-compose up -d

# Install dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# Run simulators
python3 stm32_can_simulator.py 1 &
python3 stm32_can_simulator.py 2 &

# Start backend
cd backend && node server.js &

# Start frontend
cd frontend && npm run dev
```

## Ports

- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- Grafana: http://localhost:3000 (admin/admin)
- Elasticsearch: http://localhost:9200
- MQTT: tcp://localhost:1883

## API Endpoints
```
GET  /api/frames?from=now-1h&size=1000
GET  /api/stats
WS   /socket.io  (real-time frames)
```

## MQTT Topics
```
can/frames  - CAN frame publishing
```

## CAN Frame Format
```json
{
  "node_id": 1,
  "can_id": "0x100",
  "data": [0xAA, 0xBB, 0xCC],
  "dlc": 3,
  "timestamp": 1699876543.123
}
```

## Grafana Setup

1. Access http://localhost:3000
2. Add Elasticsearch datasource: http://elasticsearch:9200
3. Create dashboard with index pattern: `can-frames`
4. Add panels for CAN ID distribution, node activity, data analysis

## Development
```bash
# Run single node
python3 stm32_can_simulator.py <node_id>

# Backend dev mode
cd backend && nodemon server.js

# Frontend dev mode
cd frontend && npm run dev

# View logs
docker-compose logs -f
```

## Customization

### Modify CAN IDs
Edit `stm32_can_simulator.py:24`:
```python
can_id = random.choice([0x100, 0x200, 0x300, 0x400])
```

### Change frame frequency
```python
simulator.run(frequency=10)  # 10 Hz
```

### Add CAN filters
Edit `backend/server.js` MQTT handler

## Troubleshooting
```bash
# Reset Elasticsearch
curl -X DELETE http://localhost:9200/can-frames

# Check MQTT
mosquitto_sub -h localhost -t "can/#" -v

# Restart services
docker-compose restart
```

## Stack

- Python 3.8+ (paho-mqtt)
- Node.js 18+ (express, mqtt, socket.io)
- React 18 (recharts, socket.io-client)
- Elasticsearch 8.11
- Grafana Latest
- Mosquitto 2

## License

MIT



# Make executable
chmod +x start_all.sh stop_all.sh



# Fix Docker installation
sudo apt-get update
sudo apt-get install -y docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

# Logout and login again, then:
docker --version
docker-compose --version
