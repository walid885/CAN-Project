# start_all.sh
#!/bin/bash
set -e

echo "Starting Docker services..."
docker compose up -d

echo ""
echo "=== SERVICE PORTS ==="
echo "MQTT Broker:      localhost:1884"
echo "MQTT WebSocket:   localhost:9002"
echo "Elasticsearch:    localhost:9200"
echo "Grafana:          http://localhost:3001 (admin/admin)"
echo "Backend API:      http://localhost:5000"
echo "====================="
echo ""

echo "Waiting 20s for Mosquitto..."
sleep 20

echo "Starting STM32 simulators..."
python3 stm32_can_simulator.py 1 localhost 1884 10 &
PID1=$!
python3 stm32_can_simulator.py 2 localhost 1884 10 &
PID2=$!

echo "Node 1: PID $PID1"
echo "Node 2: PID $PID2"
echo "Press Ctrl+C to stop"

trap "kill $PID1 $PID2 2>/dev/null; docker compose down" EXIT
wait