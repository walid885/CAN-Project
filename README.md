# CAN Bus Simulator & Monitor

Real-time CAN bus simulation and monitoring system with MQTT, Elasticsearch, and React visualization.

## Architecture
```
STM32 Nodes (Python) → MQTT Broker (Mosquitto) → Backend (Node.js) → Frontend (React)
                                ↓
                         Elasticsearch → Grafana
```

## Components

- **STM32 Simulator**: Python scripts simulating 2 CAN nodes with realistic automotive signals
- **MQTT Broker**: Mosquitto for message routing (port 1884)
- **Backend**: Node.js/Express with WebSocket support (port 5000)
- **Frontend**: React dashboard with live charts (port 5173)
- **Database**: Elasticsearch for time-series storage (port 9200)
- **Visualization**: Grafana for analytics (port 3001)

## Signals Monitored

- Engine Speed (0x100): 800-6000 RPM
- Vehicle Speed (0x200): 0-180 km/h
- Engine Temperature (0x300): 60-120°C
- Fuel Level (0x400): 0-100%
- Battery Voltage (0x500): 12-14.5V

## Prerequisites
```bash
docker >= 20.10
docker-compose >= 1.29
node.js >= 18
python >= 3.8
```

## Installation
```bash
git clone <repo>
cd CAN-Project
pip install paho-mqtt
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
chmod +x launch.sh
```

## Quick Start
```bash
./launch.sh
```

Access:
- Frontend: http://localhost:5173
- Grafana: http://localhost:3001 (admin/admin)
- Elasticsearch: http://localhost:9200
- Backend API: http://localhost:5000

## Manual Start
```bash
# Start Docker services
docker compose up -d

# Start simulators
python3 stm32_can_simulator.py 1 localhost 1884 1 &
python3 stm32_can_simulator.py 2 localhost 1884 1 &

# Start backend
cd backend && npm start &

# Start frontend
cd frontend && npm run dev
```

## Features

### Frontend
- Real-time signal visualization with selectable traces
- Custom CAN frame injection
- Frame filtering by node/CAN ID
- CSV export
- Live statistics dashboard

### Backend API
```
GET  /api/frames?from=now-1h&size=1000&node_id=1&can_id=0x100
GET  /api/stats
POST /api/simulate
DELETE /api/frames
GET  /health
```

### MQTT Topics
```
can/frames - CAN frame publishing
```

## CAN Frame Format
```json
{
  "node_id": 1,
  "can_id": "0x100",
  "data": [12, 192, 0, 0, 0, 0, 0, 0],
  "dlc": 8,
  "timestamp": 1699876543.123,
  "date": "16/11/2024"
}
```

## Configuration

### Simulator Frequency
```bash
python3 stm32_can_simulator.py <node_id> <broker> <port> <frequency>
# Example: 1 Hz = all 5 signals per second
```

### Ports
Edit `docker-compose.yml` to change:
- MQTT: 1884 → 1883
- Grafana: 3001 → 3000
- Backend: 5000

## Grafana Setup

1. Login: http://localhost:3001
2. Add datasource: Elasticsearch at http://elasticsearch:9200
3. Index pattern: `can-frames`
4. Create panels for signal analysis

## Troubleshooting
```bash
# Check services
docker ps
curl http://localhost:9200/_cluster/health
curl http://localhost:5000/health

# View logs
docker logs can_mosquitto
docker logs can_elasticsearch
docker logs can_backend

# Reset Elasticsearch
curl -X DELETE http://localhost:9200/can-frames

# Stop all
docker compose down
pkill -f stm32_can_simulator.py
```

## Project Structure
```
CAN-Project/
├── docker-compose.yml
├── launch.sh
├── start_all.sh
├── stop_all.sh
├── stm32_can_simulator.py
├── requirements.txt
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       └── App.jsx
├── mosquitto/
│   └── config/
│       └── mosquitto.conf
└── grafana/
    └── provisioning/
        └── datasources/
            └── elasticsearch.yml
```

## Stack

- Python 3.8+ (paho-mqtt)
- Node.js 18+ (express, mqtt, socket.io, @elastic/elasticsearch)
- React 18 (recharts, socket.io-client)
- Elasticsearch 8.11
- Grafana Latest
- Mosquitto 2

## License

