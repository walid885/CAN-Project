# start_all.sh
#!/bin/bash
set -e

echo "Starting Docker services..."
docker compose up -d

echo ""
echo "=== SERVICE PORTS ==="
echo "MQTT Broker:      localhost:1883"
echo "MQTT WebSocket:   localhost:9002"
echo "Elasticsearch:    localhost:9200"
echo "Grafana:          http://localhost:3001 (admin/admin)"
echo "Backend API:      http://localhost:5000"
echo "====================="
echo ""

echo "Waiting 20s for Mosquitto..."
sleep 20


echo "Node 1: PID $PID1"
echo "Node 2: PID $PID2"
echo "Press Ctrl+C to stop"

trap "kill $PID1 $PID2 2>/dev/null; docker compose down" EXIT
wait